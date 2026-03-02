from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext

from app.audit import configure_audit_logging
from app.database import SessionLocal
from app.config import settings
from app.routers import auth, integrations, provision, users

import app.models  # noqa: F401 — registers all models with Base metadata

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _cors_allow_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if raw:
        origins = [item.strip() for item in raw.split(",") if item.strip()]
        if origins:
            return origins
    return [
        "http://localhost:3010",
        "http://localhost:3011",
        "http://localhost:3012",
        "http://localhost:3013",
        "https://poly.hex8d.space",
        "https://services.poly.hex8d.space",
        "https://traffic.poly.hex8d.space",
        "https://sso.poly.hex8d.space",
    ]


def _bootstrap_admin():
    """Create the SSO super-admin account if it doesn't exist yet."""
    from app.models.user import User
    db = SessionLocal()
    try:
        exists = db.query(User).filter(User.app == "sso", User.role == "admin").first()
        if not exists:
            admin = User(
                username=settings.SSO_ADMIN_USERNAME,
                password_hash=pwd_context.hash(settings.SSO_ADMIN_PASSWORD),
                full_name="SSO Администратор",
                app="sso",
                role="admin",
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    _bootstrap_admin()
    yield


app = FastAPI(title="Polytechnik SSO", lifespan=lifespan)
configure_audit_logging()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(provision.router, prefix="/api/provision", tags=["provision"])
app.include_router(integrations.router, prefix="/api/integrations", tags=["integrations"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
