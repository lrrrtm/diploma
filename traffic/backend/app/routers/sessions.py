import hashlib
import hmac
import secrets
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
from app.dependencies import require_teacher
from app.models.attendance import Attendance
from app.models.session import Session
from app.models.tablet import Tablet
from app.models.teacher import Teacher

router = APIRouter()


# ---------------------------------------------------------------------------
# QR token helpers — HMAC-SHA256, per-session secret, rotates every N seconds
# The same logic runs on the frontend (Web Crypto API) so no backend polling
# is needed for QR updates.
# ---------------------------------------------------------------------------

def _verify_qr_token(session: Session, token: str) -> bool:
    """Accept current and previous time window to handle slow scans."""
    window = int(time.time()) // session.rotate_seconds
    for w in [window, window - 1]:
        msg = f"{session.id}|{w}".encode()
        key = session.qr_secret.encode()
        expected = hmac.new(key, msg, hashlib.sha256).hexdigest()[:16]
        if hmac.compare_digest(expected, token):
            return True
    return False


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    tablet_id: str
    discipline: str
    schedule_snapshot: str | None = None  # JSON string


class AttendRequest(BaseModel):
    qr_token: str
    launch_token: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/")
def create_session(
    data: CreateSessionRequest,
    teacher: Teacher = Depends(require_teacher),
    db: DBSession = Depends(get_db),
):
    tablet = db.get(Tablet, data.tablet_id)
    if not tablet or not tablet.is_registered:
        raise HTTPException(status_code=404, detail="Планшет не найден или не зарегистрирован")

    # Close any existing active session for this tablet
    db.query(Session).filter(
        Session.tablet_id == data.tablet_id,
        Session.is_active == True,  # noqa: E712
    ).update({"is_active": False, "ended_at": datetime.now(timezone.utc)})

    session = Session(
        id=str(uuid.uuid4()),
        tablet_id=data.tablet_id,
        teacher_id=teacher.id,
        teacher_name=teacher.full_name,
        discipline=data.discipline,
        qr_secret=secrets.token_hex(32),
        rotate_seconds=settings.QR_ROTATE_SECONDS,
        schedule_snapshot=data.schedule_snapshot,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _serialize_session(session)


@router.get("/current")
def get_current_session(
    device_id: str,
    tablet_secret: str | None = None,
    db: DBSession = Depends(get_db),
):
    """Called by display page to get current session state.
    qr_secret is only returned when tablet_secret matches the tablet's init_secret."""
    tablet = db.get(Tablet, device_id)
    if not tablet:
        return {"active": False}

    session = (
        db.query(Session)
        .filter(Session.tablet_id == device_id, Session.is_active == True)  # noqa: E712
        .first()
    )
    if not session:
        return {"active": False}

    # Auto-expire sessions older than SESSION_MAX_MINUTES
    age_seconds = (datetime.now(timezone.utc) - session.started_at.replace(tzinfo=timezone.utc)).total_seconds()
    if age_seconds > settings.SESSION_MAX_MINUTES * 60:
        session.is_active = False
        session.ended_at = datetime.now(timezone.utc)
        db.commit()
        return {"active": False}

    attendance_count = db.query(Attendance).filter(Attendance.session_id == session.id).count()

    # Only authenticated display pages receive qr_secret
    authenticated = (
        tablet_secret is not None
        and hmac.compare_digest(tablet_secret, tablet.init_secret)
    )

    result: dict = {
        "active": True,
        "session_id": session.id,
        "discipline": session.discipline,
        "teacher_name": session.teacher_name,
        "rotate_seconds": session.rotate_seconds,
        "attendance_count": attendance_count,
    }
    if authenticated:
        result["qr_secret"] = session.qr_secret
    return result


@router.get("/")
def list_sessions(
    tablet_id: str | None = None,
    teacher: Teacher = Depends(require_teacher),
    db: DBSession = Depends(get_db),
):
    """Returns all sessions for this teacher, optionally filtered by tablet."""
    q = db.query(Session).filter(Session.teacher_id == teacher.id)
    if tablet_id:
        q = q.filter(Session.tablet_id == tablet_id)
    sessions = q.order_by(Session.started_at.desc()).all()
    return [_serialize_session(s) for s in sessions]


@router.get("/{session_id}")
def get_session(
    session_id: str,
    teacher: Teacher = Depends(require_teacher),
    db: DBSession = Depends(get_db),
):
    session = db.get(Session, session_id)
    if not session or session.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    return _serialize_session(session)


@router.get("/{session_id}/attendees")
def get_attendees(
    session_id: str,
    teacher: Teacher = Depends(require_teacher),
    db: DBSession = Depends(get_db),
):
    session = db.get(Session, session_id)
    if not session or session.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    rows = (
        db.query(Attendance)
        .filter(Attendance.session_id == session_id)
        .order_by(Attendance.marked_at)
        .all()
    )
    return [_serialize_attendance(a) for a in rows]


@router.post("/{session_id}/attend")
def mark_attendance(session_id: str, data: AttendRequest, db: DBSession = Depends(get_db)):
    session = db.get(Session, session_id)
    if not session or not session.is_active:
        raise HTTPException(status_code=404, detail="Занятие не найдено или уже завершено")

    if not _verify_qr_token(session, data.qr_token):
        raise HTTPException(status_code=400, detail="QR-код устарел — попробуй ещё раз")

    # Verify student identity via launch token from main app
    try:
        payload = jwt.decode(
            data.launch_token, settings.LAUNCH_TOKEN_SECRET, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Не удалось подтвердить личность студента — открой приложение заново")

    student_external_id = str(payload["student_id"])
    student_name = payload.get("student_name", "")
    student_email = payload.get("student_email", "")

    existing = (
        db.query(Attendance)
        .filter(
            Attendance.session_id == session_id,
            Attendance.student_external_id == student_external_id,
        )
        .first()
    )
    if existing:
        return {"status": "already_marked", "message": "Ты уже отмечен на этом занятии"}

    record = Attendance(
        id=str(uuid.uuid4()),
        session_id=session_id,
        student_external_id=student_external_id,
        student_name=student_name,
        student_email=student_email,
    )
    db.add(record)
    db.commit()
    return {"status": "ok", "message": "Посещаемость отмечена"}


@router.delete("/{session_id}")
def close_session(
    session_id: str,
    teacher: Teacher = Depends(require_teacher),
    db: DBSession = Depends(get_db),
):
    session = db.get(Session, session_id)
    if not session or session.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    session.is_active = False
    session.ended_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "closed"}


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def _serialize_session(s: Session) -> dict:
    return {
        "id": s.id,
        "tablet_id": s.tablet_id,
        "teacher_id": s.teacher_id,
        "teacher_name": s.teacher_name,
        "discipline": s.discipline,
        "rotate_seconds": s.rotate_seconds,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
        "is_active": s.is_active,
    }


def _serialize_attendance(a: Attendance) -> dict:
    return {
        "id": a.id,
        "student_external_id": a.student_external_id,
        "student_name": a.student_name,
        "student_email": a.student_email,
        "marked_at": a.marked_at.isoformat() if a.marked_at else None,
    }
