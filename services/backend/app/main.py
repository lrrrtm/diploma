import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, departments, services, applications, executors

# Import all models so they are registered with Base
import app.models  # noqa: F401


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    yield


app = FastAPI(
    title="University Communication Module",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(departments.router, prefix="/api/departments", tags=["departments"])
app.include_router(services.router, prefix="/api/services", tags=["services"])
app.include_router(applications.router, prefix="/api/applications", tags=["applications"])
app.include_router(executors.router, prefix="/api/executors", tags=["executors"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
