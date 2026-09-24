from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from osipy_rest_api.config import Settings, get_settings
from osipy_rest_api.deps import get_job_runner, get_storage
from osipy_rest_api.main import build_app
from tests.fixtures.synthetic import (  # noqa: F401 — re-exported for tests
    DEFAULT_B_VALUES,
    bval_bytes,
    make_ivim_volume,
    nifti_bytes,
)


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def settings() -> Settings:
    return Settings(
        cors_origins=["http://testserver"],
        max_datasets=3,
        max_total_bytes=50_000_000,
        data_ttl_seconds=3600,
    )


@pytest.fixture
def app(settings):
    return build_app(settings)


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://testserver") as c,
        app.router.lifespan_context(app),
    ):
        yield c


@pytest.fixture
def storage(app):
    return get_storage()


@pytest.fixture
def runner(app):
    return get_job_runner()
