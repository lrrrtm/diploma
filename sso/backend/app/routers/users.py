import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session as DBSession, joinedload

from app.audit import log_audit, request_context, service_actor, token_actor
from app.config import settings
from app.database import get_db
from app.models.telegram_link import TelegramLink
from app.models.user import User
from app.routers.auth import decode_token
from app.service_auth import caller_allowed_apps, resolve_service_caller

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def _require_sso_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if not credentials:
        log_audit("sso.users.auth_denied", reason="missing_bearer", **request_context(request))
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if payload.get("app") != "sso" or payload.get("role") != "admin":
        log_audit(
            "sso.users.auth_denied",
            reason="not_sso_admin",
            **token_actor(payload),
            **request_context(request),
        )
        raise HTTPException(status_code=403, detail="Требуются права SSO-администратора")
    return payload


def _require_sso_admin_or_service(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_service_secret: str | None = Header(default=None),
) -> dict:
    """
    Allows either:
    - SSO admin via Bearer JWT
    - App backend via X-Service-Secret header
    Returns caller context with kind and scope.
    """
    service_caller = resolve_service_caller(x_service_secret)
    if service_caller:
        return {"kind": "service", "service_app": service_caller}
    if credentials:
        payload = decode_token(credentials.credentials)
        if payload.get("app") == "sso" and payload.get("role") == "admin":
            return {"kind": "admin", **payload}
        log_audit(
            "sso.users.auth_denied",
            reason="bearer_not_allowed",
            **token_actor(payload),
            **request_context(request),
        )
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    log_audit(
        "sso.users.auth_denied",
        reason="missing_auth",
        **request_context(request),
    )
    raise HTTPException(status_code=403, detail="Доступ запрещён")


def _caller_actor(caller: dict) -> dict:
    if caller.get("kind") == "service":
        return service_actor(caller.get("service_app"))
    return token_actor(caller)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateUserRequest(BaseModel):
    username: str
    password: str
    full_name: str
    app: str          # 'services' | 'traffic' | 'sso'
    role: str         # 'admin' | 'staff' | 'executor' | 'teacher'
    entity_id: str | None = None
    ruz_teacher_id: int | None = None


class UpdateUserRequest(BaseModel):
    full_name: str | None = None
    password: str | None = None
    is_active: bool | None = None


class LinkTelegramRequest(BaseModel):
    telegram_id: int
    telegram_username: str | None = None
    chat_id: int | None = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/check-username")
def check_username(
    username: str,
    _: dict = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    exists = db.query(User).filter(User.username == username).first()
    return {"available": not exists}


@router.get("/")
def list_users(
    app_filter: str | None = None,
    role_filter: str | None = None,
    search: str | None = None,
    entity_ids: str | None = None,
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=500),
    request: Request | None = None,
    caller: dict = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    if caller["kind"] == "service" and not app_filter:
        log_audit(
            "sso.users.list_denied",
            reason="service_missing_app_filter",
            **service_actor(caller.get("service_app")),
            **request_context(request),
        )
        raise HTTPException(status_code=400, detail="Для service-запроса требуется app_filter")
    if caller["kind"] == "service":
        allowed_apps = caller_allowed_apps(caller["service_app"])
        if app_filter not in allowed_apps:
            log_audit(
                "sso.users.list_denied",
                reason="service_app_filter_forbidden",
                app_filter=app_filter,
                **service_actor(caller.get("service_app")),
                **request_context(request),
            )
            raise HTTPException(status_code=403, detail="Недостаточно прав для указанного app_filter")

    q = db.query(User).options(joinedload(User.telegram_link))

    if app_filter:
        q = q.filter(User.app == app_filter)
    if role_filter:
        q = q.filter(User.role == role_filter)
    if entity_ids:
        values = [value.strip() for value in entity_ids.split(",") if value.strip()]
        if values:
            q = q.filter(User.entity_id.in_(values))
    normalized_search = search.strip().lower() if isinstance(search, str) else ""
    if normalized_search:
        pattern = f"%{normalized_search}%"
        q = q.filter(
            or_(
                func.lower(User.full_name).like(pattern),
                func.lower(User.username).like(pattern),
            )
        )

    q = q.order_by(User.app, User.role, User.created_at, User.id)

    use_pagination = page is not None or page_size is not None
    if not use_pagination:
        users = q.all()
        return [_serialize(u) for u in users]

    resolved_page = page or 1
    resolved_page_size = page_size or 20
    total = q.count()
    users = (
        q.offset((resolved_page - 1) * resolved_page_size)
        .limit(resolved_page_size)
        .all()
    )
    return {
        "items": [_serialize(u) for u in users],
        "total": total,
        "page": resolved_page,
        "page_size": resolved_page_size,
        "total_pages": max(1, (total + resolved_page_size - 1) // resolved_page_size),
    }


@router.get("/by-telegram/{telegram_id}")
def get_user_by_telegram(
    telegram_id: int,
    app_filter: str | None = None,
    request: Request | None = None,
    caller: dict = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    if caller["kind"] == "service" and not app_filter:
        log_audit(
            "sso.users.by_telegram_denied",
            reason="service_missing_app_filter",
            telegram_id=telegram_id,
            **service_actor(caller.get("service_app")),
            **request_context(request),
        )
        raise HTTPException(status_code=400, detail="Для service-запроса требуется app_filter")
    if caller["kind"] == "service":
        allowed_apps = caller_allowed_apps(caller["service_app"])
        if app_filter not in allowed_apps:
            log_audit(
                "sso.users.by_telegram_denied",
                reason="service_app_filter_forbidden",
                telegram_id=telegram_id,
                app_filter=app_filter,
                **service_actor(caller.get("service_app")),
                **request_context(request),
            )
            raise HTTPException(status_code=403, detail="Недостаточно прав для указанного app_filter")

    query = (
        db.query(User)
        .join(TelegramLink, TelegramLink.user_id == User.id)
        .filter(TelegramLink.telegram_id == telegram_id)
    )
    if app_filter:
        query = query.filter(User.app == app_filter)
    user = query.first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь с таким Telegram ID не найден")
    return _serialize(user)


@router.get("/by-ruz-teacher/{ruz_teacher_id}")
def get_user_by_ruz_teacher(
    ruz_teacher_id: int,
    app_filter: str | None = None,
    request: Request | None = None,
    caller: dict = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    if caller["kind"] == "service" and not app_filter:
        log_audit(
            "sso.users.by_ruz_denied",
            reason="service_missing_app_filter",
            ruz_teacher_id=ruz_teacher_id,
            **service_actor(caller.get("service_app")),
            **request_context(request),
        )
        raise HTTPException(status_code=400, detail="Для service-запроса требуется app_filter")
    if caller["kind"] == "service":
        allowed_apps = caller_allowed_apps(caller["service_app"])
        if app_filter not in allowed_apps:
            log_audit(
                "sso.users.by_ruz_denied",
                reason="service_app_filter_forbidden",
                ruz_teacher_id=ruz_teacher_id,
                app_filter=app_filter,
                **service_actor(caller.get("service_app")),
                **request_context(request),
            )
            raise HTTPException(status_code=403, detail="Недостаточно прав для указанного app_filter")

    query = db.query(User).filter(User.ruz_teacher_id == ruz_teacher_id)
    if app_filter:
        query = query.filter(User.app == app_filter)
    user = query.first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь с таким RUZ teacher id не найден")
    return _serialize(user)


@router.post("/", status_code=201)
def create_user(
    data: CreateUserRequest,
    request: Request,
    caller: dict = Depends(_require_sso_admin),
    db: DBSession = Depends(get_db),
):
    if data.role != "admin":
        log_audit(
            "sso.users.create_denied",
            reason="role_not_admin",
            requested_role=data.role,
            requested_app=data.app,
            **token_actor(caller),
            **request_context(request),
        )
        raise HTTPException(
            status_code=403,
            detail="SSO-администратор может создавать только администраторов приложений. "
                   "Остальные пользователи создаются через provisioning endpoints.",
        )

    if db.query(User).filter(User.username == data.username).first():
        log_audit(
            "sso.users.create_denied",
            reason="duplicate_username",
            username=data.username,
            requested_app=data.app,
            requested_role=data.role,
            **token_actor(caller),
            **request_context(request),
        )
        raise HTTPException(status_code=400, detail="Пользователь с таким логином уже существует")
    if data.ruz_teacher_id is not None:
        exists_by_ruz_id = db.query(User).filter(User.ruz_teacher_id == data.ruz_teacher_id).first()
        if exists_by_ruz_id:
            log_audit(
                "sso.users.create_denied",
                reason="duplicate_ruz_teacher_id",
                username=data.username,
                ruz_teacher_id=data.ruz_teacher_id,
                **token_actor(caller),
                **request_context(request),
            )
            raise HTTPException(status_code=400, detail="Пользователь с таким RUZ teacher id уже существует")

    user = User(
        id=str(uuid.uuid4()),
        username=data.username,
        password_hash=pwd_context.hash(data.password),
        full_name=data.full_name,
        app=data.app,
        role=data.role,
        entity_id=data.entity_id,
        ruz_teacher_id=data.ruz_teacher_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_audit(
        "sso.users.create_succeeded",
        created_user_id=user.id,
        created_username=user.username,
        created_app=user.app,
        created_role=user.role,
        **token_actor(caller),
        **request_context(request),
    )
    return _serialize(user)


@router.post("/{user_id}/telegram-link")
def link_telegram(
    user_id: str,
    data: LinkTelegramRequest,
    request: Request,
    caller: dict = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if caller["kind"] == "service":
        if caller["service_app"] not in {"traffic", "bot"}:
            log_audit(
                "sso.users.telegram_link_denied",
                reason="service_not_allowed",
                target_user_id=user_id,
                **service_actor(caller.get("service_app")),
                **request_context(request),
            )
            raise HTTPException(status_code=403, detail="Недостаточно прав для Telegram linking")
        if user.app != "traffic":
            log_audit(
                "sso.users.telegram_link_denied",
                reason="target_user_not_traffic",
                target_user_id=user_id,
                target_user_app=user.app,
                **service_actor(caller.get("service_app")),
                **request_context(request),
            )
            raise HTTPException(status_code=403, detail="Можно привязывать Telegram только к traffic-пользователям")

    existing_for_telegram = (
        db.query(TelegramLink)
        .filter(TelegramLink.telegram_id == data.telegram_id)
        .first()
    )
    if existing_for_telegram and existing_for_telegram.user_id != user_id:
        log_audit(
            "sso.users.telegram_link_denied",
            reason="telegram_already_linked",
            target_user_id=user_id,
            telegram_id=data.telegram_id,
            linked_user_id=existing_for_telegram.user_id,
            **_caller_actor(caller),
            **request_context(request),
        )
        raise HTTPException(status_code=400, detail="Этот Telegram уже привязан к другому пользователю")

    link = db.query(TelegramLink).filter(TelegramLink.user_id == user_id).first()
    if link is None:
        link = TelegramLink(user_id=user_id, telegram_id=data.telegram_id)
        db.add(link)

    link.telegram_id = data.telegram_id
    link.telegram_username = data.telegram_username
    link.chat_id = data.chat_id

    db.commit()
    db.refresh(user)
    log_audit(
        "sso.users.telegram_link_succeeded",
        target_user_id=user.id,
        target_user_app=user.app,
        telegram_id=data.telegram_id,
        **_caller_actor(caller),
        **request_context(request),
    )
    return _serialize(user)


@router.delete("/{user_id}/telegram-link")
def unlink_telegram(
    user_id: str,
    request: Request,
    caller: dict = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if caller["kind"] == "service":
        if caller["service_app"] not in {"traffic", "bot"}:
            log_audit(
                "sso.users.telegram_unlink_denied",
                reason="service_not_allowed",
                target_user_id=user_id,
                **service_actor(caller.get("service_app")),
                **request_context(request),
            )
            raise HTTPException(status_code=403, detail="Недостаточно прав для Telegram unlink")
        if user.app != "traffic":
            log_audit(
                "sso.users.telegram_unlink_denied",
                reason="target_user_not_traffic",
                target_user_id=user_id,
                target_user_app=user.app,
                **service_actor(caller.get("service_app")),
                **request_context(request),
            )
            raise HTTPException(status_code=403, detail="Можно отвязывать Telegram только у traffic-пользователей")

    link = db.query(TelegramLink).filter(TelegramLink.user_id == user_id).first()
    if link is not None:
        db.delete(link)
        db.commit()
        db.refresh(user)
        log_audit(
            "sso.users.telegram_unlink_succeeded",
            target_user_id=user.id,
            target_user_app=user.app,
            **_caller_actor(caller),
            **request_context(request),
        )
    else:
        log_audit(
            "sso.users.telegram_unlink_ignored",
            reason="not_linked",
            target_user_id=user.id,
            target_user_app=user.app,
            **_caller_actor(caller),
            **request_context(request),
        )

    return _serialize(user)


@router.patch("/{user_id}")
def update_user(
    user_id: str,
    data: UpdateUserRequest,
    request: Request,
    caller: dict = Depends(_require_sso_admin),
    db: DBSession = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.password is not None:
        user.password_hash = pwd_context.hash(data.password)
    if data.is_active is not None:
        user.is_active = data.is_active
    db.commit()
    db.refresh(user)
    log_audit(
        "sso.users.update_succeeded",
        target_user_id=user.id,
        target_username=user.username,
        changed_full_name=data.full_name is not None,
        changed_password=data.password is not None,
        changed_is_active=data.is_active is not None,
        **token_actor(caller),
        **request_context(request),
    )
    return _serialize(user)


@router.delete("/{user_id}")
def delete_user(
    user_id: str,
    request: Request,
    caller: dict = Depends(_require_sso_admin),
    db: DBSession = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    deleted = {"id": user.id, "username": user.username, "app": user.app, "role": user.role}
    db.delete(user)
    db.commit()
    log_audit(
        "sso.users.delete_succeeded",
        deleted_user_id=deleted["id"],
        deleted_username=deleted["username"],
        deleted_app=deleted["app"],
        deleted_role=deleted["role"],
        **token_actor(caller),
        **request_context(request),
    )
    return {"status": "deleted"}


@router.delete("/by-entity/{entity_id}")
def delete_user_by_entity(
    entity_id: str,
    app: str,
    request: Request,
    caller: dict = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    """Called by app backends when they delete an entity (teacher, executor, department)."""
    if caller["kind"] == "service":
        if caller["service_app"] not in {"services", "traffic"}:
            log_audit(
                "sso.users.delete_by_entity_denied",
                reason="service_not_allowed",
                target_entity_id=entity_id,
                target_app=app,
                **service_actor(caller.get("service_app")),
                **request_context(request),
            )
            raise HTTPException(status_code=403, detail="Недостаточно прав для удаления по entity")
        allowed_apps = caller_allowed_apps(caller["service_app"])
        if app not in allowed_apps:
            log_audit(
                "sso.users.delete_by_entity_denied",
                reason="target_app_forbidden",
                target_entity_id=entity_id,
                target_app=app,
                **service_actor(caller.get("service_app")),
                **request_context(request),
            )
            raise HTTPException(status_code=403, detail="Нельзя удалять пользователей другого приложения")

    user = db.query(User).filter(User.entity_id == entity_id, User.app == app).first()
    if not user:
        log_audit(
            "sso.users.delete_by_entity_ignored",
            reason="not_found",
            target_entity_id=entity_id,
            target_app=app,
            **_caller_actor(caller),
            **request_context(request),
        )
        return {"status": "not_found"}
    deleted = {"id": user.id, "username": user.username, "role": user.role}
    db.delete(user)
    db.commit()
    log_audit(
        "sso.users.delete_by_entity_succeeded",
        deleted_user_id=deleted["id"],
        deleted_username=deleted["username"],
        deleted_role=deleted["role"],
        target_entity_id=entity_id,
        target_app=app,
        **_caller_actor(caller),
        **request_context(request),
    )
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Serializer
# ---------------------------------------------------------------------------

def _serialize(u: User) -> dict:
    telegram_id = u.telegram_link.telegram_id if u.telegram_link else None
    telegram_username = u.telegram_link.telegram_username if u.telegram_link else None
    return {
        "id": u.id,
        "username": u.username,
        "full_name": u.full_name,
        "app": u.app,
        "role": u.role,
        "entity_id": u.entity_id,
        "ruz_teacher_id": u.ruz_teacher_id,
        "telegram_id": telegram_id,
        "telegram_username": telegram_username,
        "telegram_linked": telegram_id is not None,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }
