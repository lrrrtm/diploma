import asyncio
from contextlib import suppress
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from sqlalchemy import inspect, text

from app.database import engine, Base, SessionLocal
from app.config import settings
from app.jobs.teacher_sync import run_teacher_sync_forever
from app.routers import auth, users

import app.models  # noqa: F401 — registers all models with Base

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


def _ensure_schema_extensions():
    """Apply lightweight schema updates when running without migrations."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    with engine.begin() as conn:
        if "ruz_teacher_id" not in user_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN ruz_teacher_id INT NULL"))

        refreshed_inspector = inspect(engine)
        user_indexes = {index["name"] for index in refreshed_inspector.get_indexes("users")}
        if "ix_users_ruz_teacher_id" not in user_indexes:
            conn.execute(text("CREATE UNIQUE INDEX ix_users_ruz_teacher_id ON users (ruz_teacher_id)"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_schema_extensions()
    _bootstrap_admin()
    sync_task = None
    if settings.TEACHER_SYNC_ENABLED:
        sync_task = asyncio.create_task(run_teacher_sync_forever(), name="teacher-sync-job")
    yield
    if sync_task is not None:
        sync_task.cancel()
        with suppress(asyncio.CancelledError):
            await sync_task


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


@app.get("/api/health")
def health():
    return {"status": "ok"}
