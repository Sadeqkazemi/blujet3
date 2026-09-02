from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """INTERNAL_TOKEN must match backend's ML_SERVICE_INTERNAL_TOKEN — every
    request is rejected without it (see main.py's auth dependency)."""

    internal_token: str
    log_level: str = "info"
    sentry_dsn: str | None = None


settings = Settings()
