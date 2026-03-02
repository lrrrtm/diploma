from urllib.parse import quote_plus

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    MYSQL_USER: str = "appuser"
    MYSQL_PASSWORD: str = "apppassword"
    MYSQL_HOST: str = "db"
    MYSQL_PORT: int = 3306
    MYSQL_DATABASE: str = "university_comm"

    ALGORITHM: str = "HS256"
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_FILE_BYTES: int = 10 * 1024 * 1024
    ALLOWED_UPLOAD_EXTENSIONS: str = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"

    # Shared secret for verifying launch tokens from main app
    LAUNCH_TOKEN_SECRET: str = "change-me-launch-secret"
    # Secret used to sign student session tokens after launch verification.
    # Falls back to LAUNCH_TOKEN_SECRET when empty.
    STUDENT_SESSION_SECRET: str = ""
    STUDENT_SESSION_TTL_MINUTES: int = 720

    # Secret used to verify SSO tokens (shared with the SSO service)
    SSO_JWT_SECRET: str = "change-me-sso-jwt-secret"

    # Secret used by services backend to authenticate to SSO API.
    SERVICES_SSO_SERVICE_SECRET: str = "change-me-services-sso-secret"

    # Internal URL of the SSO backend reachable from this container
    SSO_API_URL: str = "http://sso-backend:8000"

    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        username = quote_plus(self.MYSQL_USER)
        password = quote_plus(self.MYSQL_PASSWORD)
        return (
            f"mysql+pymysql://{username}:{password}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
        )

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
