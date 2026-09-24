"""Liveness and root metadata routes."""

from __future__ import annotations

from fastapi import APIRouter

from osipy_rest_api import __version__
from osipy_rest_api.models.schemas import Health, Root

router = APIRouter(tags=["meta"])


@router.get("/", response_model=Root)
def root() -> Root:
    return Root(name="osipy-rest-api", version=__version__, docs="/docs")


@router.get("/health", response_model=Health)
def health() -> Health:
    return Health()
