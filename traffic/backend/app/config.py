from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ALGORITHM: str = "HS256"

    DATABASE_URL: str = "mysql+pymysql://traffic:traffic@db:3306/traffic"

    # Shared secret for verifying launch tokens from main app
    LAUNCH_TOKEN_SECRET: str = "change-me-launch-secret"

    # Secret used to sign teacher JWTs
    TEACHER_SECRET: str = "change-me-teacher-secret"

    # Secret used to sign admin JWTs
    ADMIN_SECRET: str = "change-me-admin-secret"

    # Admin password (username is always "admin")
    ADMIN_PASSWORD: str = "change-me-admin-password"

    # How often the student QR token rotates (seconds)
    QR_ROTATE_SECONDS: int = 5

    # Sessions auto-expire after this many minutes
    SESSION_MAX_MINUTES: int = 90

    # RUZ API base URL
    RUZ_BASE_URL: str = "https://ruz.spbstu.ru/api/v1/ruz"


settings = Settings()
