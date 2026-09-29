"""Capability discovery for the dashboard's IVIM controls."""

from __future__ import annotations

import math

import osipy
from fastapi import APIRouter, Depends
from osipy.ivim import get_ivim_model
from osipy.ivim.models.registry import IVIM_MODEL_REGISTRY

from osipy_rest_api import __version__
from osipy_rest_api.core.ivim import effective_fitter_defaults, supported_fitter_strategies
from osipy_rest_api.models.schemas import Catalog, CatalogModel, CatalogParameter, FitRequest
from osipy_rest_api.security import require_session_token

router = APIRouter(tags=["catalog"], dependencies=[Depends(require_session_token)])

_STATUS_CODES = {
    "0": "not_selected",
    "1": "post_fit_quality_passed_convergence_unavailable",
    "2": "unavailable_or_failed_quality_checks",
}


def _catalog() -> Catalog:
    models = []
    strategies = list(supported_fitter_strategies())
    for identifier in ("biexponential", "simplified"):
        if identifier not in IVIM_MODEL_REGISTRY or not strategies:
            continue
        model = get_ivim_model(identifier)
        bounds = model.get_bounds()
        models.append(
            CatalogModel(
                id=identifier,
                label=f"IVIM {identifier}",
                parameters=[
                    CatalogParameter(
                        name=name,
                        unit=model.parameter_units[name] or "fraction",
                        bounds=[value if math.isfinite(value) else None for value in bounds[name]],
                    )
                    for name in model.parameters
                ],
                fitter_strategies=strategies,
                reference=model.reference,
            )
        )
    return Catalog(
        api_version=__version__,
        osipy_version=osipy.__version__,
        models=models,
        defaults=FitRequest(),
        effective_fitter_defaults=effective_fitter_defaults(),
        status_codes=_STATUS_CODES,
    )


@router.get("/catalog", response_model=Catalog)
@router.get("/models", response_model=Catalog, include_in_schema=False)
async def catalog() -> Catalog:
    """Return only models/strategies verified by this installed OSIPY build."""
    return _catalog()
