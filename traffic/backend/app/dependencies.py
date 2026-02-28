from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
from app.models.teacher import Teacher

bearer = HTTPBearer(auto_error=False)


def _decode(credentials: HTTPAuthorizationCredentials | None, secret: str, required_role: str) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, secret, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("role") != required_role:
        raise HTTPException(status_code=403, detail="Forbidden")
    return payload


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    return _decode(credentials, settings.ADMIN_SECRET, "admin")


def require_teacher(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: DBSession = Depends(get_db),
) -> Teacher:
    payload = _decode(credentials, settings.TEACHER_SECRET, "teacher")
    teacher = db.get(Teacher, payload["sub"])
    if not teacher:
        raise HTTPException(status_code=401, detail="Teacher account not found")
    return teacher
