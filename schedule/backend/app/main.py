from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import schedule

app = FastAPI(title="Polytech Schedule API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(schedule.router, prefix="/api/schedule", tags=["schedule"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
