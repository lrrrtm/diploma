from datetime import datetime, timedelta, timezone
import hashlib
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.audit import log_audit, request_context
from app.config import settings
from app.database import get_db
from app.models.refresh_session import RefreshSession
from app.models.user import User

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str
    # The app the user is logging into (for labelling in UI, embedded in token)
    app: str = "sso"
    # Where to redirect after successful login (handled client-side)
    redirect_to: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    app: str
    role: str
    full_name: str
    entity_id: str | None
    redirect_to: str | None


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    app: str
    role: str
    full_name: str
    entity_id: str | None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _make_access_token(user: User) -> str:
    payload = {
        "sub": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "app": user.app,
        "role": user.role,
        "entity_id": user.entity_id,
        "auth_source": "sso",
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.SESSION_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, settings.SSO_JWT_SECRET, algorithm=settings.ALGORITHM)


def _make_refresh_token(user: User, session_id: str) -> str:
    payload = {
        "sub": user.id,
        "app": user.app,
        "role": user.role,
        "token_type": "refresh",
        "jti": session_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, settings.SSO_REFRESH_TOKEN_SECRET, algorithm=settings.ALGORITHM)


def _decode_refresh_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SSO_REFRESH_TOKEN_SECRET, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Недействительный или просроченный refresh токен")
    if payload.get("token_type") != "refresh":
        raise HTTPException(status_code=401, detail="Недопустимый тип refresh токена")
    if not isinstance(payload.get("jti"), str) or not isinstance(payload.get("sub"), str):
        raise HTTPException(status_code=401, detail="Некорректный refresh токен")
    return payload


def _issue_refresh_session(db: DBSession, user: User) -> tuple[str, str]:
    session_id = str(uuid.uuid4())
    refresh_token = _make_refresh_token(user, session_id)
    session = RefreshSession(
        id=session_id,
        user_id=user.id,
        token_hash=_hash_token(refresh_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        revoked=False,
    )
    db.add(session)
    return refresh_token, session_id


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SSO_JWT_SECRET, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Недействительный или просроченный токен")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/login", response_model=LoginResponse)
def login(
    data: LoginRequest,
    request: Request,
    db: DBSession = Depends(get_db),
):
    user = db.query(User).filter(
        User.username == data.username,
        User.is_active == True,  # noqa: E712
    ).first()

    if not user or not pwd_context.verify(data.password, user.password_hash):
        log_audit(
            "sso.auth.login_failed",
            username=data.username,
            requested_app=data.app,
            reason="invalid_credentials",
            **request_context(request),
        )
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    # If logging into a specific app, ensure the user belongs to it
    if data.app != "sso" and user.app != data.app and not (user.app == "sso" and user.role == "admin"):
        log_audit(
            "sso.auth.login_failed",
            user_id=user.id,
            username=user.username,
            requested_app=data.app,
            user_app=user.app,
            role=user.role,
            reason="forbidden_app",
            **request_context(request),
        )
        raise HTTPException(status_code=403, detail="У вас нет доступа к этому приложению")

    access_token = _make_access_token(user)
    refresh_token, _ = _issue_refresh_session(db, user)
    db.commit()
    log_audit(
        "sso.auth.login_succeeded",
        user_id=user.id,
        username=user.username,
        role=user.role,
        user_app=user.app,
        requested_app=data.app,
        **request_context(request),
    )

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        app=user.app,
        role=user.role,
        full_name=user.full_name,
        entity_id=user.entity_id,
        redirect_to=data.redirect_to,
    )


@router.post("/refresh", response_model=RefreshResponse)
def refresh_tokens(
    data: RefreshRequest,
    request: Request,
    db: DBSession = Depends(get_db),
):
    try:
        payload = _decode_refresh_token(data.refresh_token)
    except HTTPException as exc:
        log_audit(
            "sso.auth.refresh_failed",
            reason="invalid_refresh_token",
            detail=str(exc.detail),
            **request_context(request),
        )
        raise

    session_id = payload["jti"]
    user_id = payload["sub"]

    refresh_session = db.get(RefreshSession, session_id)
    if not refresh_session:
        log_audit(
            "sso.auth.refresh_failed",
            user_id=user_id,
            session_id=session_id,
            reason="session_not_found",
            **request_context(request),
        )
        raise HTTPException(status_code=401, detail="Refresh сессия не найдена")
    if refresh_session.user_id != user_id:
        log_audit(
            "sso.auth.refresh_failed",
            user_id=user_id,
            session_id=session_id,
            reason="session_user_mismatch",
            **request_context(request),
        )
        raise HTTPException(status_code=401, detail="Refresh токен не соответствует пользователю")
    if refresh_session.revoked:
        log_audit(
            "sso.auth.refresh_failed",
            user_id=user_id,
            session_id=session_id,
            reason="session_revoked",
            **request_context(request),
        )
        raise HTTPException(status_code=401, detail="Refresh токен уже отозван")
    if refresh_session.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        log_audit(
            "sso.auth.refresh_failed",
            user_id=user_id,
            session_id=session_id,
            reason="session_expired",
            **request_context(request),
        )
        raise HTTPException(status_code=401, detail="Refresh токен истёк")
    if refresh_session.token_hash != _hash_token(data.refresh_token):
        log_audit(
            "sso.auth.refresh_failed",
            user_id=user_id,
            session_id=session_id,
            reason="token_hash_mismatch",
            **request_context(request),
        )
        raise HTTPException(status_code=401, detail="Refresh токен недействителен")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        log_audit(
            "sso.auth.refresh_failed",
            user_id=user_id,
            session_id=session_id,
            reason="user_unavailable",
            **request_context(request),
        )
        raise HTTPException(status_code=401, detail="Пользователь недоступен")

    refresh_session.revoked = True
    refresh_token, _ = _issue_refresh_session(db, user)
    access_token = _make_access_token(user)
    db.commit()
    log_audit(
        "sso.auth.refresh_succeeded",
        user_id=user.id,
        username=user.username,
        role=user.role,
        user_app=user.app,
        session_id=session_id,
        **request_context(request),
    )

    return RefreshResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        app=user.app,
        role=user.role,
        full_name=user.full_name,
        entity_id=user.entity_id,
    )


@router.post("/logout")
def logout(
    data: RefreshRequest,
    request: Request,
    db: DBSession = Depends(get_db),
):
    try:
        payload = _decode_refresh_token(data.refresh_token)
    except HTTPException:
        log_audit(
            "sso.auth.logout_ignored",
            reason="invalid_refresh_token",
            **request_context(request),
        )
        return {"status": "ok"}

    session_id = payload.get("jti")
    if isinstance(session_id, str):
        refresh_session = db.get(RefreshSession, session_id)
        if refresh_session and not refresh_session.revoked:
            refresh_session.revoked = True
            db.commit()
            log_audit(
                "sso.auth.logout_succeeded",
                user_id=refresh_session.user_id,
                session_id=session_id,
                **request_context(request),
            )
        else:
            log_audit(
                "sso.auth.logout_ignored",
                user_id=payload.get("sub"),
                session_id=session_id,
                reason="session_not_found_or_revoked",
                **request_context(request),
            )

    return {"status": "ok"}


@router.get("/me")
def me(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    return payload
