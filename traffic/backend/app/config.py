from urllib.parse import quote_plus

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ALGORITHM: str = "HS256"

    DATABASE_URL: str | None = None
    MYSQL_HOST: str = "db"
    MYSQL_PORT: int = 3306
    MYSQL_DATABASE: str = "traffic"
    MYSQL_USER: str = "traffic"
    MYSQL_PASSWORD: str = "traffic"

    # Shared secret for verifying launch tokens from main app
    LAUNCH_TOKEN_SECRET: str = "change-me-launch-secret"

    # Secret used to verify SSO tokens (shared with the SSO service)
    SSO_JWT_SECRET: str = "change-me-sso-jwt-secret"

    # Secret used by traffic backend to authenticate to SSO API.
    TRAFFIC_SSO_SERVICE_SECRET: str = "change-me-traffic-sso-secret"

    # Secret used by SSO integrations router to call traffic internal admin endpoints.
    TRAFFIC_INTERNAL_SERVICE_SECRET: str = "change-me-traffic-internal-secret"

    # Internal URL of the SSO backend reachable from this container
    SSO_API_URL: str = "http://sso-backend:8000"
    # Internal URL of centralized schedule backend
    SCHEDULE_API_URL: str = "http://schedule-backend:8000"

    # Automatic teacher sync (RUZ -> traffic teachers -> SSO provisioning)
    TRAFFIC_TEACHER_SYNC_ENABLED: bool = False
    TRAFFIC_TEACHER_SYNC_INTERVAL_SECONDS: int = 3600
    TRAFFIC_TEACHER_SYNC_STARTUP_DELAY_SECONDS: int = 30
    # Lifetime of JWT issued by traffic backend for Telegram mini-app login
    SESSION_TOKEN_EXPIRE_HOURS: int = 24

    # How often the student QR token rotates (seconds)
    QR_ROTATE_SECONDS: int = 5

    # Sessions auto-expire after this many minutes
    SESSION_MAX_MINUTES: int = 90

    # Telegram bot token used to verify Mini App initData
    TELEGRAM_BOT_TOKEN: str = ""
    # Public bot username (without @), used to generate deep links
    TELEGRAM_BOT_USERNAME: str = ""
    # Maximum accepted age for Telegram initData auth_date
    TELEGRAM_AUTH_MAX_AGE_SECONDS: int = 300

    @model_validator(mode="after")
    def build_database_url(self) -> "Settings":
        if self.DATABASE_URL:
            return self
        username = quote_plus(self.MYSQL_USER)
        password = quote_plus(self.MYSQL_PASSWORD)
        self.DATABASE_URL = (
            f"mysql+pymysql://{username}:{password}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
        )
        return self


settings = Settings()
