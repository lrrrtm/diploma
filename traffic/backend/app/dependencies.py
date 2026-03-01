from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
from app.models.teacher import Teacher
from poly_shared.clients.sso_client import SSOClient
from poly_shared.auth.sso_token import decode_sso_token
from poly_shared.errors import TokenValidationError, UpstreamRejected, UpstreamUnavailable

bearer = HTTPBearer(auto_error=False)


def _decode_sso(credentials: HTTPAuthorizationCredentials | None) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_sso_token(
            token=credentials.credentials,
            secret=settings.SSO_JWT_SECRET,
            algorithm=settings.ALGORITHM,
            expected_app=None,
        )
    except TokenValidationError:
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


def require_admin_or_service(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_service_secret: str | None = Header(default=None),
) -> dict:
    if x_service_secret and x_service_secret == settings.SSO_SERVICE_SECRET:
        return {"caller": "service"}
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

    auth_source = payload.get("auth_source")
    if auth_source not in {"telegram", "sso"}:
        raise HTTPException(status_code=401, detail="Сессия устарела. Войдите заново")

    # Tokens issued via Telegram login must be revalidated against current SSO telegram link.
    if auth_source == "telegram":
        telegram_id = payload.get("telegram_id")
        token_user_id = payload.get("sub")
        token_entity_id = payload.get("entity_id")
        if not isinstance(telegram_id, int):
            raise HTTPException(status_code=401, detail="Недействительный Telegram токен")

        client = SSOClient(
            base_url=settings.SSO_API_URL,
            service_secret=settings.SSO_SERVICE_SECRET,
        )
        try:
            current_user = client.get_user_by_telegram(telegram_id=telegram_id, app_filter="traffic")
        except UpstreamUnavailable:
            raise HTTPException(status_code=502, detail="SSO недоступен")
        except UpstreamRejected as exc:
            raise HTTPException(status_code=400, detail=exc.detail or "Ошибка проверки Telegram-привязки")

        if current_user is None:
            raise HTTPException(status_code=401, detail="Telegram аккаунт больше не привязан")
        if current_user.get("id") != token_user_id or current_user.get("entity_id") != token_entity_id:
            raise HTTPException(status_code=401, detail="Telegram аккаунт привязан к другому преподавателю")
        if not current_user.get("is_active", False):
            raise HTTPException(status_code=403, detail="Аккаунт преподавателя отключён")

    teacher = db.get(Teacher, payload.get("entity_id"))
    if not teacher:
        raise HTTPException(status_code=401, detail="Аккаунт преподавателя не найден")
    return teacher
