from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    RUZ_BASE_URL: str = "https://ruz.spbstu.ru/api/v1/ruz"
    REQUEST_TIMEOUT_SECONDS: int = 15


settings = Settings()
