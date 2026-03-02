import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.audit import log_audit, request_context, service_actor
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.service_auth import resolve_service_caller

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _require_service_caller(
    request: Request,
    x_service_secret: str | None = Header(default=None),
) -> str:
    caller = resolve_service_caller(x_service_secret)
    if not caller:
        log_audit(
            "sso.provision.denied",
            reason="invalid_service_secret",
            **request_context(request),
        )
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    return caller


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
    request: Request,
    caller: str = Depends(_require_service_caller),
    db: DBSession = Depends(get_db),
):
    if caller != "services":
        log_audit(
            "sso.provision.denied",
            reason="caller_not_allowed",
            target_app="services",
            target_role="staff",
            **service_actor(caller),
            **request_context(request),
        )
        raise HTTPException(status_code=403, detail="Недостаточно прав для provisioning staff")
    try:
        user = _upsert_user(db=db, app="services", role="staff", data=data)
    except HTTPException as exc:
        log_audit(
            "sso.provision.denied",
            reason="upsert_failed",
            detail=str(exc.detail),
            target_app="services",
            target_role="staff",
            entity_id=data.entity_id,
            ruz_teacher_id=data.ruz_teacher_id,
            **service_actor(caller),
            **request_context(request),
        )
        raise
    log_audit(
        "sso.provision.succeeded",
        target_app="services",
        target_role="staff",
        provisioned_user_id=user.id,
        provisioned_username=user.username,
        entity_id=user.entity_id,
        ruz_teacher_id=user.ruz_teacher_id,
        **service_actor(caller),
        **request_context(request),
    )
    return _serialize(user)


@router.post("/services/executor")
def provision_services_executor(
    data: ProvisionRequest,
    request: Request,
    caller: str = Depends(_require_service_caller),
    db: DBSession = Depends(get_db),
):
    if caller != "services":
        log_audit(
            "sso.provision.denied",
            reason="caller_not_allowed",
            target_app="services",
            target_role="executor",
            **service_actor(caller),
            **request_context(request),
        )
        raise HTTPException(status_code=403, detail="Недостаточно прав для provisioning executor")
    try:
        user = _upsert_user(db=db, app="services", role="executor", data=data)
    except HTTPException as exc:
        log_audit(
            "sso.provision.denied",
            reason="upsert_failed",
            detail=str(exc.detail),
            target_app="services",
            target_role="executor",
            entity_id=data.entity_id,
            ruz_teacher_id=data.ruz_teacher_id,
            **service_actor(caller),
            **request_context(request),
        )
        raise
    log_audit(
        "sso.provision.succeeded",
        target_app="services",
        target_role="executor",
        provisioned_user_id=user.id,
        provisioned_username=user.username,
        entity_id=user.entity_id,
        ruz_teacher_id=user.ruz_teacher_id,
        **service_actor(caller),
        **request_context(request),
    )
    return _serialize(user)


@router.post("/traffic/teacher")
def provision_traffic_teacher(
    data: ProvisionRequest,
    request: Request,
    caller: str = Depends(_require_service_caller),
    db: DBSession = Depends(get_db),
):
    if caller != "traffic":
        log_audit(
            "sso.provision.denied",
            reason="caller_not_allowed",
            target_app="traffic",
            target_role="teacher",
            **service_actor(caller),
            **request_context(request),
        )
        raise HTTPException(status_code=403, detail="Недостаточно прав для provisioning teacher")
    try:
        user = _upsert_user(db=db, app="traffic", role="teacher", data=data)
    except HTTPException as exc:
        log_audit(
            "sso.provision.denied",
            reason="upsert_failed",
            detail=str(exc.detail),
            target_app="traffic",
            target_role="teacher",
            entity_id=data.entity_id,
            ruz_teacher_id=data.ruz_teacher_id,
            **service_actor(caller),
            **request_context(request),
        )
        raise
    log_audit(
        "sso.provision.succeeded",
        target_app="traffic",
        target_role="teacher",
        provisioned_user_id=user.id,
        provisioned_username=user.username,
        entity_id=user.entity_id,
        ruz_teacher_id=user.ruz_teacher_id,
        **service_actor(caller),
        **request_context(request),
    )
    return _serialize(user)
