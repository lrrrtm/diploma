from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+pymysql://appuser:apppassword@db:3306/university_comm"
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    UPLOAD_DIR: str = "/app/uploads"
    ADMIN_PASSWORD: str = "admin"

    # Shared secret for verifying launch tokens from superapp
    LAUNCH_TOKEN_SECRET: str = "change-me-launch-secret"

    class Config:
        env_file = ".env"


settings = Settings()
