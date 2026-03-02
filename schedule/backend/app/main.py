import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import schedule

app = FastAPI(title="Polytech Schedule API")


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(schedule.router, prefix="/api/schedule", tags=["schedule"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
