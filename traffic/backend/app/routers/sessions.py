import hashlib
import hmac
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from app.config import settings

router = APIRouter()
bearer = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# In-memory session store
# ---------------------------------------------------------------------------
_sessions: dict[str, dict] = {}


def _get_active_session() -> Optional[dict]:
    """Return the active session, auto-closing it if it has expired."""
    max_age = settings.SESSION_MAX_MINUTES * 60
    for s in _sessions.values():
        if not s["is_active"]:
            continue
        age = time.time() - s["started_at"]
        if age > max_age:
            s["is_active"] = False
            continue
        return s
    return None


def _require_teacher(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> str:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials, settings.TEACHER_SECRET, algorithms=[settings.ALGORITHM]
        )
        if payload.get("role") != "teacher":
            raise HTTPException(status_code=403, detail="Forbidden")
        return payload["sub"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Rotating QR token helpers (HMAC-SHA256, changes every QR_ROTATE_SECONDS)
# ---------------------------------------------------------------------------

def _rotating_token(session_id: str) -> str:
    window = int(time.time()) // settings.QR_ROTATE_SECONDS
    key = settings.TEACHER_SECRET.encode()
    msg = f"{session_id}|{window}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:16]


def _verify_rotating_token(session_id: str, token: str) -> bool:
    """Accept current and previous window to tolerate clock drift / slow scans."""
    window = int(time.time()) // settings.QR_ROTATE_SECONDS
    for w in [window, window - 1]:
        key = settings.TEACHER_SECRET.encode()
        msg = f"{session_id}|{w}".encode()
        expected = hmac.new(key, msg, hashlib.sha256).hexdigest()[:16]
        if hmac.compare_digest(expected, token):
            return True
    return False


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    discipline: str


class AttendRequest(BaseModel):
    qr_token: str
    student_external_id: str
    student_name: str
    student_email: str = ""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/")
def create_session(
    data: CreateSessionRequest,
    teacher: str = Depends(_require_teacher),
):
    """Start a new attendance session (closes any existing active session)."""
    for s in _sessions.values():
        s["is_active"] = False

    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "id": session_id,
        "discipline": data.discipline,
        "teacher": teacher,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "started_at": time.time(),
        "is_active": True,
        "attendees": [],
    }
    return _sessions[session_id]


@router.post("/close-current")
def close_current_session():
    """Emergency: close whatever session is currently active. No auth required
    (this endpoint is called from the public display screen)."""
    session = _get_active_session()
    if not session:
        return {"status": "no_active_session"}
    session["is_active"] = False
    return {"status": "closed"}


@router.get("/current")
def get_current_session():
    """Public: returns the active session with a fresh rotating QR token."""
    session = _get_active_session()
    if not session:
        return {"active": False}
    now = time.time()
    window_start = int(now) // settings.QR_ROTATE_SECONDS * settings.QR_ROTATE_SECONDS
    next_rotation_at = int((window_start + settings.QR_ROTATE_SECONDS) * 1000)  # ms
    return {
        "active": True,
        "session_id": session["id"],
        "discipline": session["discipline"],
        "qr_token": _rotating_token(session["id"]),
        "rotate_seconds": settings.QR_ROTATE_SECONDS,
        "next_rotation_at": next_rotation_at,
    }


@router.get("/{session_id}/attendees")
def get_attendees(session_id: str, teacher: str = Depends(_require_teacher)):
    """Returns the attendee list; teacher auth required."""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session["attendees"]


@router.post("/{session_id}/attend")
def mark_attendance(session_id: str, data: AttendRequest):
    """Student marks their attendance using the current rotating QR token."""
    session = _sessions.get(session_id)
    if not session or not session["is_active"]:
        raise HTTPException(status_code=404, detail="Занятие не найдено или уже завершено")

    if not _verify_rotating_token(session_id, data.qr_token):
        raise HTTPException(status_code=400, detail="QR-код устарел — попробуй ещё раз")

    already = any(
        a["student_external_id"] == data.student_external_id
        for a in session["attendees"]
    )
    if already:
        return {"status": "already_marked", "message": "Ты уже отмечен на этом занятии"}

    session["attendees"].append(
        {
            "student_external_id": data.student_external_id,
            "student_name": data.student_name,
            "student_email": data.student_email,
            "marked_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {"status": "ok", "message": "Посещаемость отмечена"}


@router.delete("/{session_id}")
def close_session(session_id: str, teacher: str = Depends(_require_teacher)):
    """End the session."""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session["is_active"] = False
    return {"status": "closed"}
