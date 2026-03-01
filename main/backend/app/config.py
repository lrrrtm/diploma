from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # JWT
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # CAS
    CAS_SERVER: str = "https://cas.spbstu.ru"
    # Full URL of our /api/auth/callback endpoint — must match what CAS has registered.
    # Set to your ngrok URL during development, production URL on the server.
    CAS_SERVICE_URL: str = "http://localhost:8001/api/auth/callback"

    # Where to redirect the browser after successful auth (frontend origin)
    FRONTEND_URL: str = "http://localhost:5174"

    # URL of the services mini-app (used in miniapps registry)
    SERVICES_URL: str = "http://localhost"

    # URL of the traffic (attendance) mini-app
    TRAFFIC_URL: str = "http://localhost:3012"

    # Internal URL of centralized schedule backend
    SCHEDULE_API_URL: str = "http://schedule-backend:8000"

    # Shared secret for signing launch tokens (must match services backend)
    LAUNCH_TOKEN_SECRET: str = "change-me-launch-secret"


settings = Settings()
