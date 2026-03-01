import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
from app.models.teacher import Teacher
from poly_shared.auth.launch_token import verify_launch_token
from poly_shared.clients.sso_client import SSOClient
from poly_shared.errors import TokenValidationError, UpstreamRejected, UpstreamUnavailable

router = APIRouter()


class LaunchTokenRequest(BaseModel):
    token: str


class TelegramLoginRequest(BaseModel):
    init_data: str


class TelegramLoginResponse(BaseModel):
    access_token: str
    app: str
    role: str
    full_name: str
    entity_id: str | None


def _verify_telegram_init_data(init_data: str) -> dict:
    if not settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="TELEGRAM_BOT_TOKEN не настроен")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    provided_hash = pairs.pop("hash", None)
    if not provided_hash:
        raise HTTPException(status_code=401, detail="Неверные данные Telegram Mini App")

    data_check_string = "\n".join(f"{key}={pairs[key]}" for key in sorted(pairs.keys()))
    secret_key = hmac.new(
        b"WebAppData",
        settings.TELEGRAM_BOT_TOKEN.encode(),
        hashlib.sha256,
    ).digest()
    expected_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_hash, provided_hash):
        raise HTTPException(status_code=401, detail="Неверная подпись Telegram Mini App")

    auth_date_raw = pairs.get("auth_date")
    if not auth_date_raw:
        raise HTTPException(status_code=401, detail="Не передан auth_date")
    try:
        auth_date = int(auth_date_raw)
    except ValueError:
        raise HTTPException(status_code=401, detail="Некорректный auth_date")

    now = int(datetime.now(timezone.utc).timestamp())
    if now - auth_date > settings.TELEGRAM_AUTH_MAX_AGE_SECONDS:
        raise HTTPException(status_code=401, detail="Данные Telegram Mini App устарели")

    user_raw = pairs.get("user")
    if not user_raw:
        raise HTTPException(status_code=401, detail="Не передан user")
    try:
        user = json.loads(user_raw)
    except ValueError:
        raise HTTPException(status_code=401, detail="Некорректный user в Telegram Mini App")

    telegram_id = user.get("id")
    if not isinstance(telegram_id, int):
        raise HTTPException(status_code=401, detail="Некорректный Telegram ID")

    return {"telegram_id": telegram_id}


def _fetch_sso_user_by_telegram(telegram_id: int) -> dict:
    client = SSOClient(
        base_url=settings.SSO_API_URL,
        service_secret=settings.SSO_SERVICE_SECRET,
    )
    try:
        user = client.get_user_by_telegram(telegram_id=telegram_id, app_filter="traffic")
    except UpstreamUnavailable:
        raise HTTPException(status_code=502, detail="SSO недоступен")
    except UpstreamRejected as exc:
        raise HTTPException(status_code=400, detail=exc.detail or "Ошибка SSO")
    if user is None:
        raise HTTPException(status_code=401, detail="Telegram аккаунт не привязан к преподавателю")
    return user


def _issue_teacher_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "full_name": user["full_name"],
        "app": user["app"],
        "role": user["role"],
        "entity_id": user.get("entity_id"),
        "auth_source": "telegram",
        "telegram_id": user.get("telegram_id"),
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.SESSION_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, settings.SSO_JWT_SECRET, algorithm=settings.ALGORITHM)


@router.post("/verify-launch")
def verify_launch(body: LaunchTokenRequest):
    try:
        return verify_launch_token(
            token=body.token,
            secret=settings.LAUNCH_TOKEN_SECRET,
            algorithms=[settings.ALGORITHM],
        )
    except TokenValidationError:
        raise HTTPException(status_code=401, detail="Invalid or expired launch token")


@router.post("/telegram-login", response_model=TelegramLoginResponse)
def telegram_login(body: TelegramLoginRequest, db: DBSession = Depends(get_db)):
    verified = _verify_telegram_init_data(body.init_data)
    sso_user = _fetch_sso_user_by_telegram(verified["telegram_id"])

    if not sso_user.get("is_active", False):
        raise HTTPException(status_code=403, detail="Аккаунт преподавателя отключён")
    if sso_user.get("app") != "traffic" or sso_user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Telegram аккаунт привязан не к преподавателю traffic")

    entity_id = sso_user.get("entity_id")
    if not isinstance(entity_id, str):
        raise HTTPException(status_code=403, detail="Для преподавателя не задан entity_id")
    if not db.get(Teacher, entity_id):
        raise HTTPException(status_code=401, detail="Аккаунт преподавателя не найден в traffic")

    token = _issue_teacher_token(sso_user)
    return TelegramLoginResponse(
        access_token=token,
        app=sso_user["app"],
        role=sso_user["role"],
        full_name=sso_user["full_name"],
        entity_id=entity_id,
    )
