"""Application settings, environment-overridable with the OSIPY_API_ prefix."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OSIPY_API_", env_file=".env")

    cors_origins: list[str] = ["http://localhost:60010"]
    data_ttl_seconds: int = 3600
    max_datasets: int = 5
    max_upload_bytes: int = 536_870_912
    max_total_bytes: int = 2_147_483_648
    host: str = "127.0.0.1"
    port: int = 8000


@lru_cache
def get_settings() -> Settings:
    return Settings()
