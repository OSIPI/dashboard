"""FastAPI dependency providers. The container is set once by the app factory."""

from __future__ import annotations

from osipy_rest_api.config import Settings, get_settings
from osipy_rest_api.core.jobs import JobRunner
from osipy_rest_api.core.storage import Storage

_storage: Storage | None = None
_runner: JobRunner | None = None


def set_container(storage: Storage, runner: JobRunner) -> None:
    global _storage, _runner
    _storage = storage
    _runner = runner


def get_storage() -> Storage:
    if _storage is None:
        raise RuntimeError("storage not initialised; call set_container in the app factory")
    return _storage


def get_job_runner() -> JobRunner:
    if _runner is None:
        raise RuntimeError("job runner not initialised; call set_container in the app factory")
    return _runner


def get_settings_dep() -> Settings:
    return get_settings()
