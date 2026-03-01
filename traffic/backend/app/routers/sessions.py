import hashlib
import hmac
import secrets
import time
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
from app.dependencies import require_teacher
from app.models.attendance import Attendance
from app.models.session import Session
from app.models.tablet import Tablet
from app.models.teacher import Teacher
from app.realtime import hub
from poly_shared.auth.launch_token import verify_launch_token
from poly_shared.clients.schedule_client import ScheduleClient
from poly_shared.errors import TokenValidationError, UpstreamRejected, UpstreamUnavailable

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


def _normalize_date(value: str) -> str:
    return value.replace(".", "-")


def _normalize_name(value: str) -> str:
    return " ".join(value.strip().lower().replace("ё", "е").split())


def _lesson_teacher_ids(lesson: dict) -> set[int]:
    result: set[int] = set()
    for teacher in lesson.get("teachers") or []:
        if not isinstance(teacher, dict):
            continue
        for key in ("id", "teacher_id", "ruz_teacher_id", "oid"):
            raw = teacher.get(key)
            if isinstance(raw, int):
                result.add(raw)
                continue
            if isinstance(raw, str) and raw.isdigit():
                result.add(int(raw))
    return result


def _lesson_teacher_names(lesson: dict) -> set[str]:
    result: set[str] = set()
    for teacher in lesson.get("teachers") or []:
        if not isinstance(teacher, dict):
            continue
        for key in ("full_name", "name"):
            raw = teacher.get(key)
            if isinstance(raw, str):
                normalized = _normalize_name(raw)
                if normalized:
                    result.add(normalized)
    return result


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/")
async def create_session(
    data: CreateSessionRequest,
    teacher: Teacher = Depends(require_teacher),
    db: DBSession = Depends(get_db),
):
    tablet = db.get(Tablet, data.tablet_id)
    if not tablet or not tablet.is_registered:
        raise HTTPException(status_code=404, detail="Киоск не найден или не зарегистрирован")

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
    await hub.publish_tablet(data.tablet_id)
    return _serialize_session(session)


@router.get("/start-options")
def get_session_start_options(
    pin: str,
    teacher: Teacher = Depends(require_teacher),
    db: DBSession = Depends(get_db),
):
    tablet = db.query(Tablet).filter(Tablet.display_pin == pin).first()
    if not tablet:
        raise HTTPException(status_code=404, detail="Киоск с таким кодом не найден")
    if not tablet.is_registered or tablet.building_id is None or tablet.room_id is None:
        raise HTTPException(status_code=400, detail="Киоск ещё не зарегистрирован")
    if teacher.ruz_teacher_id is None:
        raise HTTPException(status_code=400, detail="У преподавателя не задан RUZ ID")

    schedule_client = ScheduleClient(base_url=settings.SCHEDULE_API_URL)
    today_key = date.today().isoformat()

    try:
        scheduler = schedule_client.get_room_scheduler(
            building_id=tablet.building_id,
            room_id=tablet.room_id,
            date=today_key,
        )
    except UpstreamUnavailable:
        raise HTTPException(status_code=502, detail="Сервис расписания недоступен")
    except UpstreamRejected:
        raise HTTPException(status_code=502, detail="Не удалось получить расписание аудитории")

    candidate_teacher_ids: set[int] = {teacher.ruz_teacher_id}
    teacher_full_name = _normalize_name(teacher.full_name)
    try:
        teachers_payload = schedule_client.get_teachers()
        teachers_raw = teachers_payload.get("teachers", []) if isinstance(teachers_payload, dict) else []
        if isinstance(teachers_raw, list):
            for item in teachers_raw:
                if not isinstance(item, dict):
                    continue
                schedule_id = item.get("id")
                schedule_oid = item.get("oid")
                if schedule_id == teacher.ruz_teacher_id or schedule_oid == teacher.ruz_teacher_id:
                    if isinstance(schedule_id, int):
                        candidate_teacher_ids.add(schedule_id)
                    if isinstance(schedule_oid, int):
                        candidate_teacher_ids.add(schedule_oid)
                    break
    except (UpstreamUnavailable, UpstreamRejected):
        # Fallbacks (ID and full name) still work even if teacher dictionary is unavailable.
        pass

    days = scheduler.get("days", []) if isinstance(scheduler, dict) else []
    if not isinstance(days, list):
        days = []

    weekday = date.today().isoweekday()
    day_payload: dict | None = None
    normalized_today = _normalize_date(today_key)
    for item in days:
        if not isinstance(item, dict):
            continue
        if item.get("weekday") == weekday:
            day_payload = item
            break
        raw_date = item.get("date")
        if isinstance(raw_date, str) and _normalize_date(raw_date) == normalized_today:
            day_payload = item
            break

    lessons_raw = day_payload.get("lessons", []) if isinstance(day_payload, dict) else []
    if not isinstance(lessons_raw, list):
        lessons_raw = []

    eligible_lessons: list[dict] = []
    for lesson in lessons_raw:
        if not isinstance(lesson, dict):
            continue
        teacher_ids = _lesson_teacher_ids(lesson)
        matched = bool(candidate_teacher_ids.intersection(teacher_ids))
        if not matched and teacher_full_name:
            lesson_teacher_names = _lesson_teacher_names(lesson)
            matched = teacher_full_name in lesson_teacher_names
        if not matched:
            continue
        type_obj = lesson.get("typeObj") or {}
        eligible_lessons.append(
            {
                "subject": lesson.get("subject", ""),
                "time_start": lesson.get("time_start", ""),
                "time_end": lesson.get("time_end", ""),
                "type_abbr": type_obj.get("abbr", "") if isinstance(type_obj, dict) else "",
            }
        )

    return {
        "tablet": {
            "tablet_id": tablet.id,
            "building_name": tablet.building_name,
            "room_name": tablet.room_name,
        },
        "lessons": eligible_lessons,
    }


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
        and hmac.compare_digest(tablet_secret, tablet.display_pin)
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
async def mark_attendance(session_id: str, data: AttendRequest, db: DBSession = Depends(get_db)):
    session = db.get(Session, session_id)
    if not session or not session.is_active:
        raise HTTPException(status_code=404, detail="Занятие не найдено или уже завершено")

    if not _verify_qr_token(session, data.qr_token):
        raise HTTPException(status_code=400, detail="QR-код устарел — попробуй ещё раз")

    # Verify student identity via launch token from main app
    try:
        identity = verify_launch_token(
            token=data.launch_token,
            secret=settings.LAUNCH_TOKEN_SECRET,
            algorithms=[settings.ALGORITHM],
        )
    except TokenValidationError:
        raise HTTPException(status_code=401, detail="Не удалось подтвердить личность студента — открой приложение заново")

    student_external_id = identity["student_external_id"]
    student_name = identity["student_name"]
    student_email = identity["student_email"]

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
    await hub.publish_tablet(session.tablet_id)
    return {"status": "ok", "message": "Посещаемость отмечена"}


@router.delete("/{session_id}")
async def close_session(
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
    await hub.publish_tablet(session.tablet_id)
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
