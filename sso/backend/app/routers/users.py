import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession, joinedload

from app.config import settings
from app.database import get_db
from app.models.telegram_link import TelegramLink
from app.models.user import User
from app.routers.auth import decode_token

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def _require_sso_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if payload.get("app") != "sso" or payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Требуются права SSO-администратора")
    return payload


def _require_sso_admin_or_service(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_service_secret: str | None = Header(default=None),
) -> str:
    """
    Allows either:
    - SSO admin via Bearer JWT
    - App backend via X-Service-Secret header
    Returns 'admin' or 'service' to indicate caller type.
    """
    if x_service_secret and x_service_secret == settings.SSO_SERVICE_SECRET:
        return "service"
    if credentials:
        payload = decode_token(credentials.credentials)
        if payload.get("app") == "sso" and payload.get("role") == "admin":
            return "admin"
    raise HTTPException(status_code=403, detail="Доступ запрещён")


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
    _: str = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    exists = db.query(User).filter(User.username == username).first()
    return {"available": not exists}


@router.get("/")
def list_users(
    app_filter: str | None = None,
    caller: str = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    if caller == "service" and not app_filter:
        raise HTTPException(status_code=400, detail="Для service-запроса требуется app_filter")
    q = db.query(User).options(joinedload(User.telegram_link))
    if app_filter:
        q = q.filter(User.app == app_filter)
    users = q.order_by(User.app, User.role, User.created_at).all()
    return [_serialize(u) for u in users]


@router.get("/by-telegram/{telegram_id}")
def get_user_by_telegram(
    telegram_id: int,
    app_filter: str | None = None,
    caller: str = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    if caller == "service" and not app_filter:
        raise HTTPException(status_code=400, detail="Для service-запроса требуется app_filter")

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
    caller: str = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    if caller == "service" and not app_filter:
        raise HTTPException(status_code=400, detail="Для service-запроса требуется app_filter")

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
    caller: str = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    # SSO admin can only create app-level admins directly.
    # App backends (service caller) can create any role.
    if caller == "admin" and data.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="SSO-администратор может создавать только администраторов приложений. "
                   "Остальные пользователи создаются через интерфейс самого приложения.",
        )

    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Пользователь с таким логином уже существует")
    if data.ruz_teacher_id is not None:
        exists_by_ruz_id = db.query(User).filter(User.ruz_teacher_id == data.ruz_teacher_id).first()
        if exists_by_ruz_id:
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
    return _serialize(user)


@router.post("/{user_id}/telegram-link")
def link_telegram(
    user_id: str,
    data: LinkTelegramRequest,
    _: str = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    existing_for_telegram = (
        db.query(TelegramLink)
        .filter(TelegramLink.telegram_id == data.telegram_id)
        .first()
    )
    if existing_for_telegram and existing_for_telegram.user_id != user_id:
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
    return _serialize(user)


@router.patch("/{user_id}")
def update_user(
    user_id: str,
    data: UpdateUserRequest,
    _: dict = Depends(_require_sso_admin),
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
    return _serialize(user)


@router.delete("/{user_id}")
def delete_user(
    user_id: str,
    caller: str = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    db.delete(user)
    db.commit()
    return {"status": "deleted"}


@router.delete("/by-entity/{entity_id}")
def delete_user_by_entity(
    entity_id: str,
    app: str,
    _: str = Depends(_require_sso_admin_or_service),
    db: DBSession = Depends(get_db),
):
    """Called by app backends when they delete an entity (teacher, executor, department)."""
    user = db.query(User).filter(User.entity_id == entity_id, User.app == app).first()
    if not user:
        return {"status": "not_found"}
    db.delete(user)
    db.commit()
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
