from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
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
    app: str
    role: str
    full_name: str
    entity_id: str | None
    redirect_to: str | None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_token(user: User) -> str:
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


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SSO_JWT_SECRET, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Недействительный или просроченный токен")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest, db: DBSession = Depends(get_db)):
    user = db.query(User).filter(
        User.username == data.username,
        User.is_active == True,  # noqa: E712
    ).first()

    if not user or not pwd_context.verify(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    # If logging into a specific app, ensure the user belongs to it
    if data.app != "sso" and user.app != data.app and not (user.app == "sso" and user.role == "admin"):
        raise HTTPException(status_code=403, detail="У вас нет доступа к этому приложению")

    token = _make_token(user)
    return LoginResponse(
        access_token=token,
        app=user.app,
        role=user.role,
        full_name=user.full_name,
        entity_id=user.entity_id,
        redirect_to=data.redirect_to,
    )


@router.get("/me")
def me(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    return payload
