from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext

from app.database import SessionLocal
from app.config import settings
from app.routers import auth, integrations, provision, users

import app.models  # noqa: F401 — registers all models with Base metadata

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
