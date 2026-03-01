import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
from app.models.user import User

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _require_service_secret(x_service_secret: str | None = Header(default=None)) -> None:
    if not x_service_secret or x_service_secret != settings.SSO_SERVICE_SECRET:
        raise HTTPException(status_code=403, detail="Доступ запрещён")


class ProvisionRequest(BaseModel):
    username: str
    password: str
    full_name: str
    entity_id: str
    ruz_teacher_id: int | None = None


def _serialize(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "app": user.app,
        "role": user.role,
        "entity_id": user.entity_id,
        "ruz_teacher_id": user.ruz_teacher_id,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _upsert_user(
    *,
    db: DBSession,
    app: str,
    role: str,
    data: ProvisionRequest,
) -> User:
    if not data.entity_id:
        raise HTTPException(status_code=400, detail="entity_id обязателен")

    by_entity = (
        db.query(User)
        .filter(
            User.app == app,
            User.role == role,
            User.entity_id == data.entity_id,
        )
        .first()
    )
    by_ruz = None
    if data.ruz_teacher_id is not None:
        by_ruz = (
            db.query(User)
            .filter(
                User.app == app,
                User.role == role,
                User.ruz_teacher_id == data.ruz_teacher_id,
            )
            .first()
        )

    if by_entity and by_ruz and by_entity.id != by_ruz.id:
        raise HTTPException(
            status_code=409,
            detail="Конфликт данных: entity_id и ruz_teacher_id указывают на разных пользователей",
        )

    target = by_entity or by_ruz
    same_username = db.query(User).filter(User.username == data.username).first()

    if same_username and (target is None or same_username.id != target.id):
        raise HTTPException(status_code=400, detail="Пользователь с таким логином уже существует")

    if target is None:
        target = User(
            id=str(uuid.uuid4()),
            username=data.username,
            password_hash=pwd_context.hash(data.password),
            full_name=data.full_name,
            app=app,
            role=role,
            entity_id=data.entity_id,
            ruz_teacher_id=data.ruz_teacher_id,
            is_active=True,
        )
        db.add(target)
    else:
        target.username = data.username
        target.password_hash = pwd_context.hash(data.password)
        target.full_name = data.full_name
        target.entity_id = data.entity_id
        target.ruz_teacher_id = data.ruz_teacher_id
        target.is_active = True

    db.commit()
    db.refresh(target)
    return target


@router.post("/services/staff")
def provision_services_staff(
    data: ProvisionRequest,
    _: None = Depends(_require_service_secret),
    db: DBSession = Depends(get_db),
):
    user = _upsert_user(db=db, app="services", role="staff", data=data)
    return _serialize(user)


@router.post("/services/executor")
def provision_services_executor(
    data: ProvisionRequest,
    _: None = Depends(_require_service_secret),
    db: DBSession = Depends(get_db),
):
    user = _upsert_user(db=db, app="services", role="executor", data=data)
    return _serialize(user)


@router.post("/traffic/teacher")
def provision_traffic_teacher(
    data: ProvisionRequest,
    _: None = Depends(_require_service_secret),
    db: DBSession = Depends(get_db),
):
    user = _upsert_user(db=db, app="traffic", role="teacher", data=data)
    return _serialize(user)
