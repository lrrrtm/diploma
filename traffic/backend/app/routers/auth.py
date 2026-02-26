from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


def _create_teacher_token(username: str) -> str:
    payload = {
        "sub": username,
        "role": "teacher",
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }
    return jwt.encode(payload, settings.TEACHER_SECRET, algorithm=settings.ALGORITHM)


class TeacherLoginRequest(BaseModel):
    username: str
    password: str


class LaunchTokenRequest(BaseModel):
    token: str


@router.post("/teacher-login")
def teacher_login(data: TeacherLoginRequest):
    """Stub: any credentials are accepted."""
    if not data.username:
        raise HTTPException(status_code=400, detail="Введите логин")
    token = _create_teacher_token(data.username)
    return {"access_token": token, "teacher_name": data.username}


@router.post("/verify-launch")
def verify_launch(body: LaunchTokenRequest):
    """Verify a launch token issued by the superapp and return student identity."""
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
