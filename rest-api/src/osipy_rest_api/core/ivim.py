"""All osipy IVIM calls live here. The only module (with nifti_io) that may
import osipy."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

import numpy as np
import osipy
from osipy import fit_ivim
from osipy.ivim import get_ivim_model, list_ivim_fitters, list_models
from osipy.ivim.fitting.estimators import IVIMFitParams

from osipy_rest_api.core.domain import Dataset, FitConfig, FitResult
from osipy_rest_api.core.errors import InvalidInputError

_STATUS_CODES = {
    "0": "not_selected",
    "1": "post_fit_quality_passed_convergence_unavailable",
    "2": "unavailable_or_failed_quality_checks",
}
_POST_FIT_R_SQUARED_THRESHOLD = 0.5
_CONVERGENCE_STATUS = {
    "status": "unavailable",
    "reason": (
        "OSIPY 0.1.4 batch fitting does not expose per-voxel convergence diagnostics."
    ),
}
_LM_EFFECTIVE_DEFAULTS = {
    "optimizer": "osipy.common.fitting.least_squares.LevenbergMarquardtFitter",
    "max_iterations": 100,
    "tolerance": 1e-6,
}
_BAYESIAN_EFFECTIVE_DEFAULTS = {
    "stage_1": _LM_EFFECTIVE_DEFAULTS,
    "stage_2": {
        "optimizer": "osipy.common.fitting.bayesian.BayesianFitter",
        "iterations": 100,
        "tolerance": 1e-6,
    },
    "noise_std": "estimated_from_baseline",
    "prior_scale": 1.5,
    "compute_uncertainty": True,
}


def supported_models() -> tuple[str, ...]:
    """Models registered in the installed OSIPY."""
    return tuple(list_models())


def supported_fitter_strategies() -> tuple[str, ...]:
    """Fitting methods registered in the installed OSIPY."""
    return tuple(list_ivim_fitters())


def _map_key(osipy_name: str) -> str:
    """API key for an OSIPY parameter name, e.g. ``D*`` -> ``d_star``."""
    return osipy_name.lower().replace("*", "_star")


def effective_fitter_defaults() -> dict[str, dict]:
    """Defaults actually used by OSIPY 0.1.4's public IVIM fitting path."""
    return {
        "levenberg_marquardt": _LM_EFFECTIVE_DEFAULTS.copy(),
        "bayesian": {
            **_BAYESIAN_EFFECTIVE_DEFAULTS,
            "stage_1": _LM_EFFECTIVE_DEFAULTS.copy(),
            "stage_2": _BAYESIAN_EFFECTIVE_DEFAULTS["stage_2"].copy(),
        },
    }


def _effective_b_threshold(config: FitConfig) -> float:
    # OSIPY's public full fitter copies params and forces its BoundIVIMModel
    # threshold to zero. Do the same at this boundary so provenance and curves
    # reflect the actual fit, not an ignored request field.
    return 0.0 if config.method == "full" else config.b_threshold


def _effective_model_cutoff(config: FitConfig) -> float | None:
    return _effective_b_threshold(config) if config.model == "simplified" else None


def _effective_fitter_settings(method: str) -> dict:
    defaults = effective_fitter_defaults()
    return defaults["bayesian"] if method == "bayesian" else defaults["levenberg_marquardt"]


def _status_policy(r_squared_available: bool) -> dict:
    """Describe the API's post-fit status, without overstating OSIPY diagnostics."""
    r_squared = {
        "status": "enforced" if r_squared_available else "unavailable",
        "threshold": _POST_FIT_R_SQUARED_THRESHOLD if r_squared_available else None,
        "comparison": ">" if r_squared_available else None,
        "source": (
            "OSIPY FittingResult.is_valid R-squared convention, applied by the API; "
            "not OSIPY batch convergence"
        ),
    }
    return {
        "status_1": (
            "finite, physical-domain estimate that passes the API R-squared policy; "
            "convergence status is unavailable"
        ),
        "r_squared": r_squared,
        "convergence": _CONVERGENCE_STATUS.copy(),
    }


def validate_fit_config(config: FitConfig, dataset: Dataset) -> None:
    if config.model not in supported_models():
        raise InvalidInputError(
            f"unsupported IVIM model {config.model!r}; choose one of {list(supported_models())}"
        )
    strategies = supported_fitter_strategies()
    if config.method not in strategies:
        raise InvalidInputError(
            f"unknown fitting method {config.method!r}; "
            f"choose one of {list(strategies)}"
        )
    b = np.asarray(dataset.b_values, dtype=float)
    # Full biexponential fitting does not use a threshold. Simplified IVIM uses
    # it as the model cutoff, while segmented/Bayesian strategies use it to
    # separate low and high b-value groups.
    if config.method in {"segmented", "bayesian"} or (
        config.model == "simplified" and config.method != "full"
    ):
        lo, hi = float(b.min()), float(b.max())
        if not lo <= config.b_threshold <= hi:
            raise InvalidInputError(
                f"b_threshold {config.b_threshold} is outside the acquired "
                f"b-value range [{lo}, {hi}]"
            )
        if not (np.any(b < config.b_threshold) and np.any(b >= config.b_threshold)):
            raise InvalidInputError(
                "b_threshold must split the b-values into a low and a high group; "
                f"none fall on one side of {config.b_threshold}"
            )
    scope = config.selection.scope
    voxels = config.selection.voxels
    if scope not in {"dataset", "voxel", "roi"}:
        raise InvalidInputError("scope must be dataset, voxel, or roi")
    if scope == "dataset" and voxels:
        raise InvalidInputError("dataset scope must not include voxels")
    if scope == "voxel" and len(voxels) != 1:
        raise InvalidInputError("voxel scope requires exactly one [x, y, z] coordinate")
    if scope == "roi" and not voxels:
        raise InvalidInputError("roi scope requires one or more [x, y, z] coordinates")
    if len(set(voxels)) != len(voxels):
        raise InvalidInputError("selected voxel coordinates must be unique")
    nx, ny, nz = dataset.shape[:3]
    for voxel in voxels:
        in_bounds = len(voxel) == 3 and all(
            0 <= coordinate < limit for coordinate, limit in zip(voxel, (nx, ny, nz), strict=True)
        )
        if not in_bounds:
            raise InvalidInputError(f"voxel {voxel} is outside the volume {(nx, ny, nz)}")


def _selection_mask(dataset: Dataset, config: FitConfig) -> np.ndarray:
    mask = np.zeros(dataset.shape[:3], dtype=bool)
    if config.selection.scope == "dataset":
        mask.fill(True)
    else:
        for x, y, z in config.selection.voxels:
            mask[x, y, z] = True
    return mask


def build_summary(
    maps: dict[str, object],
    quality_mask: np.ndarray,
    selection_mask: np.ndarray,
    r_squared_available: bool,
) -> dict:
    selected = int(selection_mask.sum())
    valid = int(quality_mask.sum())

    def map_summary(parameter_map: object) -> dict:
        values = np.asarray(parameter_map.values, dtype=float)  # type: ignore[attr-defined]
        usable = values[quality_mask & np.isfinite(values)]
        if usable.size:
            statistics = {
                "min": float(np.min(usable)),
                "max": float(np.max(usable)),
                "mean": float(np.mean(usable)),
                "median": float(np.median(usable)),
                "std": float(np.std(usable)),
            }
        else:
            statistics = {key: None for key in ("min", "max", "mean", "median", "std")}
        return {
            **statistics,
            "valid_fraction": None if not selected else valid / selected,
            "units": getattr(parameter_map, "units", None),
        }

    return {
        "fit_success_rate": None if not selected else valid / selected,
        "n_voxels_selected": selected,
        "n_voxels_valid": valid,
        "status_counts": {
            "0": int((~selection_mask).sum()),
            "1": valid,
            "2": selected - valid,
        },
        "r_squared": _status_policy(r_squared_available)["r_squared"],
        "convergence": _CONVERGENCE_STATUS.copy(),
        "maps": {key: map_summary(pm) for key, pm in maps.items()},
    }


def run_fit(
    dataset: Dataset,
    config: FitConfig,
    progress_callback: Callable[[float], None] | None = None,
) -> FitResult:
    selection_mask = _selection_mask(dataset, config)
    effective_threshold = _effective_b_threshold(config)
    model_cutoff = _effective_model_cutoff(config)
    params = IVIMFitParams(
        method=config.method,
        b_threshold=effective_threshold,
        signal_model=config.model,
    )
    result = fit_ivim(
        signal=dataset.data,
        b_values=np.asarray(dataset.b_values, dtype=float),
        mask=selection_mask,
        params=params,
        progress_callback=progress_callback,
    )
    maps = {
        _map_key(name): getattr(result, f"{_map_key(name)}_map")
        for name in get_ivim_model(config.model).parameters
    }
    # OSIPY's batch quality mask only identifies voxels that were submitted to
    # its fitter. It is neither an R-squared filter nor a convergence signal.
    quality_mask = np.asarray(
        result.quality_mask if result.quality_mask is not None else selection_mask, dtype=bool
    ) & selection_mask
    # Never surface non-finite values.
    for parameter_map in maps.values():
        values = np.asarray(parameter_map.values, dtype=float).copy()
        quality_mask &= np.isfinite(values)
        parameter_map.values = values  # type: ignore[attr-defined]
    r_squared = (
        None if result.r_squared is None else np.asarray(result.r_squared, dtype=float).copy()
    )
    if r_squared is not None:
        quality_mask &= np.isfinite(r_squared) & (r_squared > _POST_FIT_R_SQUARED_THRESHOLD)
        # Keep selected low-R² values as a diagnostic map; parameter maps remain
        # masked wherever the estimate is not valid under the API policy.
        r_squared[~selection_mask] = np.nan
    else:
        # Without a fit-quality statistic, do not certify any parameter map.
        quality_mask[:] = False
    for parameter_map in maps.values():
        values = parameter_map.values  # type: ignore[attr-defined]
        values[~quality_mask] = np.nan
    status_map = np.zeros(dataset.shape[:3], dtype=np.uint8)
    status_map[selection_mask] = 2
    status_map[quality_mask] = 1
    for parameter_map in maps.values():
        parameter_map.affine = np.asarray(dataset.affine, dtype=float).copy()
    summary = build_summary(maps, quality_mask, selection_mask, r_squared is not None)
    return FitResult(
        maps=maps,
        r_squared=r_squared,
        quality_mask=quality_mask,
        selection_mask=selection_mask,
        status_map=status_map,
        model_cutoff=model_cutoff,
        summary=summary,
        provenance={
            "created_at": datetime.now(UTC).isoformat(),
            "osipy_version": osipy.__version__,
            "model": config.model,
            "fitter_strategy": config.method,
            "fitter": "osipy.fit_ivim",
            "effective_fitter_settings": _effective_fitter_settings(config.method),
            "effective_b_threshold": effective_threshold,
            "model_cutoff": model_cutoff,
            "scope": config.selection.scope,
            "selected_voxels": int(selection_mask.sum()),
            "maps": list(maps),
            "quality_policy": (
                "Only selected, OSIPY-fit-attempted, finite, physical-domain estimates "
                "that pass the API R-squared policy are exposed; unavailable estimates are NaN."
            ),
            "status_policy": _status_policy(r_squared is not None),
            "status_codes": _STATUS_CODES,
        },
    )


def voxel_detail(
    dataset: Dataset, fit_result: FitResult, x: int, y: int, z: int
) -> dict:
    nx, ny, nz = dataset.shape[:3]
    if not (0 <= x < nx and 0 <= y < ny and 0 <= z < nz):
        raise InvalidInputError(
            f"voxel ({x}, {y}, {z}) is outside the volume {(nx, ny, nz)}"
        )
    b = np.asarray(dataset.b_values, dtype=float)
    detail = {
        "voxel": [x, y, z],
        "b_values": b.tolist(),
        "signal": dataset.data[x, y, z, :].tolist(),
    }
    if not fit_result.selection_mask[x, y, z]:
        return {
            **detail,
            "available": False,
            "reason": "not_selected",
            "params": None,
            "fitted_curve": None,
            "r_squared": None,
        }
    if not fit_result.quality_mask[x, y, z]:
        return {
            **detail,
            "available": False,
            "reason": "invalid_estimate",
            "params": None,
            "fitted_curve": None,
            "r_squared": None,
        }
    params = {
        key: float(fit_result.maps[key].values[x, y, z])  # type: ignore[attr-defined]
        for key in fit_result.maps
    }
    model = get_ivim_model(
        fit_result.provenance["model"],
        **({} if fit_result.model_cutoff is None else {"b_threshold": fit_result.model_cutoff}),
    )
    curve = model.predict(b, np.asarray([params[_map_key(n)] for n in model.parameters]))
    r2 = fit_result.r_squared
    return {
        **detail,
        "available": True,
        "reason": None,
        "params": params,
        "fitted_curve": np.asarray(curve, dtype=float).tolist(),
        "r_squared": (
            None if r2 is None or not np.isfinite(r2[x, y, z]) else float(r2[x, y, z])
        ),
    }
