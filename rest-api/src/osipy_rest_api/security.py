"""Local-session HTTP protections for the dashboard-facing API."""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from osipy_rest_api.config import Settings
from osipy_rest_api.deps import get_settings_dep


def _allowed_hosts(settings: Settings) -> set[str]:
    hosts = {f"localhost:{settings.port}", f"127.0.0.1:{settings.port}"}
    hosts.add(f"[::1]:{settings.port}")
    if settings.port in {80, 443}:
        hosts.update({"localhost", "127.0.0.1", "[::1]"})
    return hosts


class LocalOnlyMiddleware(BaseHTTPMiddleware):
    """Reject DNS-rebinding and cross-origin requests before they reach routes."""

    def __init__(self, app, *, settings: Settings) -> None:
        super().__init__(app)
        self._settings = settings
        self._hosts = _allowed_hosts(settings)
        self._origins = set(settings.cors_origins)

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.headers.get("host", "") not in self._hosts:
            return JSONResponse(status_code=403, content={"detail": "Host is not allowed"})
        origin = request.headers.get("origin")
        if origin is not None and origin not in self._origins:
            return JSONResponse(status_code=403, content={"detail": "Origin is not allowed"})
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        if origin in self._origins:
            # Required for a dashboard served from a public HTTPS origin to
            # access this loopback service through Private Network Access.
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response


def require_session_token(
    request: Request, settings: Annotated[Settings, Depends(get_settings_dep)]
) -> None:
    expected = f"Bearer {settings.session_token}"
    supplied = request.headers.get("authorization", "")
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid local session token",
            headers={"WWW-Authenticate": "Bearer"},
        )
