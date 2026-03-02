from urllib.parse import quote_plus

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ALGORITHM: str = "HS256"

    DATABASE_URL: str | None = None
    MYSQL_HOST: str = "sso-db"
    MYSQL_PORT: int = 3306
    MYSQL_DATABASE: str = "sso"
    MYSQL_USER: str = "sso"
    MYSQL_PASSWORD: str = "sso"

    # Secret used to sign all SSO session tokens (shared with services and traffic)
    SSO_JWT_SECRET: str = "change-me-sso-jwt-secret"

    # Service secrets for inter-service calls to SSO API (scoped by caller app).
    SERVICES_SSO_SERVICE_SECRET: str = "change-me-services-sso-secret"
    TRAFFIC_SSO_SERVICE_SECRET: str = "change-me-traffic-sso-secret"
    BOT_SSO_SERVICE_SECRET: str = "change-me-bot-sso-secret"

    # Secret used by SSO integrations router to call traffic internal endpoints.
    TRAFFIC_INTERNAL_SERVICE_SECRET: str = "change-me-traffic-internal-secret"

    # Initial SSO super-admin credentials (bootstrapped on first startup)
    SSO_ADMIN_USERNAME: str = "admin"
    SSO_ADMIN_PASSWORD: str = "change-me-admin-password"

    # Token expiry
    SESSION_TOKEN_EXPIRE_HOURS: int = 24
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    SSO_REFRESH_TOKEN_SECRET: str = "change-me-sso-refresh-secret"

    # Internal URL of traffic backend for integrations (teacher sync control)
    TRAFFIC_API_URL: str = "http://traffic-backend:8000"

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
