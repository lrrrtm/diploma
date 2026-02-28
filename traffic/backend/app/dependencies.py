from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
from app.models.teacher import Teacher

bearer = HTTPBearer(auto_error=False)


def _decode_sso(credentials: HTTPAuthorizationCredentials | None) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials, settings.SSO_JWT_SECRET, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Недействительный или просроченный токен")
    if payload.get("app") != "traffic":
        raise HTTPException(status_code=403, detail="Токен не предназначен для этого приложения")
    return payload


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    payload = _decode_sso(credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Требуются права администратора")
    return payload


def require_teacher(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: DBSession = Depends(get_db),
) -> Teacher:
    payload = _decode_sso(credentials)
    if payload.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Требуются права преподавателя")
    teacher = db.get(Teacher, payload.get("entity_id"))
    if not teacher:
        raise HTTPException(status_code=401, detail="Аккаунт преподавателя не найден")
    return teacher
