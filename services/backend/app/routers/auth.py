from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from jose import jwt
from passlib.context import CryptContext

from app.config import settings
from app.database import get_db
from app.models import Department
from app.models.executor import Executor
from app.schemas.auth import LoginRequest, TokenResponse

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _create_token(payload: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {**payload, "exp": expire}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    # Admin login
    if data.login == "admin" and data.password == settings.ADMIN_PASSWORD:
        token = _create_token({"role": "admin"})
        return TokenResponse(access_token=token, role="admin")

    # Department (staff) login
    department = db.query(Department).filter(Department.login == data.login).first()
    if department and department.password_hash and pwd_context.verify(data.password, department.password_hash):
        token = _create_token({
            "role": "staff",
            "department_id": department.id,
            "department_name": department.name,
        })
        return TokenResponse(
            access_token=token,
            role="staff",
            department_id=department.id,
            department_name=department.name,
        )

    # Executor login
    executor = db.query(Executor).filter(Executor.login == data.login).first()
    if executor and pwd_context.verify(data.password, executor.password_hash):
        token = _create_token({
            "role": "executor",
            "executor_id": executor.id,
            "department_id": executor.department_id,
            "executor_name": executor.name,
        })
        return TokenResponse(
            access_token=token,
            role="executor",
            executor_id=executor.id,
            department_id=executor.department_id,
            executor_name=executor.name,
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверный логин или пароль",
    )
