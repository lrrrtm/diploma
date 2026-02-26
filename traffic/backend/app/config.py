from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ALGORITHM: str = "HS256"

    # Shared secret for verifying launch tokens from superapp
    LAUNCH_TOKEN_SECRET: str = "change-me-launch-secret"

    # Secret used to sign teacher JWTs and for HMAC-based rotating QR tokens
    TEACHER_SECRET: str = "change-me-teacher-secret"

    # How often the student QR token rotates (seconds)
    QR_ROTATE_SECONDS: int = 5

    # Sessions auto-expire after this many minutes of inactivity
    SESSION_MAX_MINUTES: int = 90


settings = Settings()
