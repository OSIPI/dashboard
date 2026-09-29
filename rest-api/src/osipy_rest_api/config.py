"""Application settings, environment-overridable with the OSIPY_API_ prefix."""

from __future__ import annotations

import secrets
from functools import lru_cache

from pydantic import Field, PositiveInt, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OSIPY_API_", env_file=".env")

    cors_origins: list[str] = [
        "http://localhost:60010",
        "http://127.0.0.1:60010",
        "http://localhost:60014",
        "http://127.0.0.1:60014",
        "https://osipi.github.io",
    ]
    data_ttl_seconds: int = 3600
    max_datasets: PositiveInt = 5
    max_jobs: PositiveInt = 5
    max_upload_bytes: PositiveInt = 536_870_912
    max_total_bytes: PositiveInt = 2_147_483_648
    host: str = "127.0.0.1"
    port: int = 8000
    session_token: str = Field(default_factory=lambda: secrets.token_urlsafe(32))

    @field_validator("host")
    @classmethod
    def _loopback_host_only(cls, value: str) -> str:
        if value not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("host must be a loopback address")
        return value

    @field_validator("session_token")
    @classmethod
    def _token_is_safe(cls, value: str) -> str:
        if len(value) < 11:
            raise ValueError("session_token must contain at least 11 characters")
        return value

    @field_validator("cors_origins")
    @classmethod
    def _explicit_cors_origins(cls, value: list[str]) -> list[str]:
        if not value or "*" in value:
            raise ValueError("cors_origins must contain explicit origins, never '*'")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
