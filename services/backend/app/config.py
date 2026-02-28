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

    # Shared secret for verifying launch tokens from main app
    LAUNCH_TOKEN_SECRET: str = "change-me-launch-secret"

    # Secret used to verify SSO tokens (shared with the SSO service)
    SSO_JWT_SECRET: str = "change-me-sso-jwt-secret"

    # Secret used to authenticate inter-service calls to the SSO API
    SSO_SERVICE_SECRET: str = "change-me-sso-service-secret"

    # Internal URL of the SSO backend reachable from this container
    SSO_API_URL: str = "http://sso-backend:8000"

    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
        )

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
