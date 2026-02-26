from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, miniapps

app = FastAPI(title="UniComm Super-App API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(miniapps.router, prefix="/api/miniapps", tags=["miniapps"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
