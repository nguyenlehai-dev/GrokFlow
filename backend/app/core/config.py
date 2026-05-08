from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "GrokFlow"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True

    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"

    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRES_MINUTES: int = 1440

    API_KEY_PREFIX: str = "uxpm_live"
    ENCRYPTION_KEY: str

    STORAGE_DRIVER: str = "local"
    LOCAL_STORAGE_PATH: str = "./storage"

    CHROME_BINARY_PATH: str = ""
    PROFILE_BASE_PATH: str = "./browser_profiles"

    MAX_CONCURRENT_JOBS_PER_USER: int = 2
    MAX_CONCURRENT_JOBS_PER_PROFILE: int = 1
    DEFAULT_DAILY_LIMIT: int = 100
    JOB_TIMEOUT_SECONDS: int = 600

    CORS_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
