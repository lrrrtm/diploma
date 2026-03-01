import asyncio
from contextlib import suppress
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.jobs.teacher_sync import run_teacher_sync_forever
from app.routers import auth, sessions, tablets, teachers, schedule

import app.models  # noqa: F401 — registers all models with Base metadata


@asynccontextmanager
async def lifespan(_: FastAPI):
    sync_task = None
    if settings.TRAFFIC_TEACHER_SYNC_ENABLED:
        sync_task = asyncio.create_task(run_teacher_sync_forever(), name="traffic-teacher-sync")
    yield
    if sync_task is not None:
        sync_task.cancel()
        with suppress(asyncio.CancelledError):
            await sync_task


app = FastAPI(title="Traffic — Attendance Mini-App", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(tablets.router, prefix="/api/tablets", tags=["tablets"])
app.include_router(teachers.router, prefix="/api/teachers", tags=["teachers"])
app.include_router(schedule.router, prefix="/api/schedule", tags=["schedule"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
