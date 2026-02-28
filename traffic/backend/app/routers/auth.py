from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
from app.models.teacher import Teacher

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AdminLoginRequest(BaseModel):
    username: str
    password: str


class TeacherLoginRequest(BaseModel):
    username: str
    password: str


class LaunchTokenRequest(BaseModel):
    token: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_admin_token() -> str:
    payload = {
        "sub": "admin",
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }
    return jwt.encode(payload, settings.ADMIN_SECRET, algorithm=settings.ALGORITHM)


def _make_teacher_token(teacher: Teacher) -> str:
    payload = {
        "sub": teacher.id,
        "role": "teacher",
        "teacher_name": teacher.full_name,
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }
    return jwt.encode(payload, settings.TEACHER_SECRET, algorithm=settings.ALGORITHM)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/admin/login")
def admin_login(data: AdminLoginRequest):
    if data.username != "admin" or data.password != settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return {"access_token": _make_admin_token(), "role": "admin"}


@router.post("/teacher/login")
def teacher_login(data: TeacherLoginRequest, db: DBSession = Depends(get_db)):
    teacher = db.query(Teacher).filter(Teacher.username == data.username).first()
    if not teacher or not pwd_context.verify(data.password, teacher.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return {
        "access_token": _make_teacher_token(teacher),
        "role": "teacher",
        "teacher_id": teacher.id,
        "teacher_name": teacher.full_name,
    }


@router.post("/verify-launch")
def verify_launch(body: LaunchTokenRequest):
    try:
        payload = jwt.decode(
            body.token, settings.LAUNCH_TOKEN_SECRET, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired launch token")
    return {
        "student_external_id": str(payload["student_id"]),
        "student_name": payload["student_name"],
        "student_email": payload.get("student_email", ""),
    }
