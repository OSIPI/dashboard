"""Application factory and ASGI entry point."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from osipy_rest_api import __version__
from osipy_rest_api.api import catalog, datasets, fits, meta, results
from osipy_rest_api.config import Settings, get_settings
from osipy_rest_api.core.errors import ApiError
from osipy_rest_api.core.jobs import InProcessJobRunner
from osipy_rest_api.core.storage import InMemoryStorage
from osipy_rest_api.deps import get_settings_dep, set_container
from osipy_rest_api.security import LocalOnlyMiddleware

logger = logging.getLogger(__name__)


def build_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    storage = InMemoryStorage(
        max_datasets=settings.max_datasets,
        max_jobs=settings.max_jobs,
        max_total_bytes=settings.max_total_bytes,
        ttl_seconds=settings.data_ttl_seconds,
    )
    runner = InProcessJobRunner(storage, max_jobs=settings.max_jobs)
    set_container(storage, runner)

    sweep_interval = max(1, min(settings.data_ttl_seconds // 4, 300))

    @contextlib.asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        async def sweeper() -> None:
            while True:
                await asyncio.sleep(sweep_interval)
                removed = await storage.sweep()
                if removed:
                    logger.info("evicted %d expired datasets/jobs", removed)

        task = asyncio.create_task(sweeper())
        try:
            yield
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            await storage.clear()

    app = FastAPI(title="osipy REST API", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=False,
        max_age=600,
    )
    # Add after CORS so this guard is outermost, including for preflight requests.
    app.add_middleware(LocalOnlyMiddleware, settings=settings)

    @app.exception_handler(ApiError)
    async def _api_error_handler(_, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.include_router(meta.router)
    app.include_router(catalog.router)
    app.include_router(datasets.router)
    app.include_router(fits.router)
    app.include_router(results.router)
    app.dependency_overrides[get_settings_dep] = lambda: settings
    return app


app = build_app()


def main() -> None:
    """Run the API using the validated loopback-only settings.

    This is intentionally the supported process entry point rather than an
    unrestricted ``uvicorn --host`` invocation.
    """
    import uvicorn

    settings = get_settings()
    logger.warning("Local API session token (keep private): %s", settings.session_token)
    uvicorn.run(build_app(settings), host=settings.host, port=settings.port)
