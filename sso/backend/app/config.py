from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ALGORITHM: str = "HS256"

    DATABASE_URL: str = "mysql+pymysql://sso:sso@db:3306/sso"

    # Secret used to sign all SSO session tokens (shared with services and traffic)
    SSO_JWT_SECRET: str = "change-me-sso-jwt-secret"

    # Secret used by app backends to call SSO user-management API
    SSO_SERVICE_SECRET: str = "change-me-sso-service-secret"

    # Initial SSO super-admin credentials (bootstrapped on first startup)
    SSO_ADMIN_USERNAME: str = "admin"
    SSO_ADMIN_PASSWORD: str = "change-me-admin-password"

    # Token expiry
    SESSION_TOKEN_EXPIRE_HOURS: int = 24

    # RUZ API base URL used by teacher sync-job
    RUZ_BASE_URL: str = "https://ruz.spbstu.ru/api/v1/ruz"

    # Automatic teacher sync-job settings
    TEACHER_SYNC_ENABLED: bool = True
    TEACHER_SYNC_INTERVAL_SECONDS: int = 3600
    TEACHER_SYNC_STARTUP_DELAY_SECONDS: int = 15


settings = Settings()
