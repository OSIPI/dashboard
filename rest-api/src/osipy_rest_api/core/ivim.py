"""All osipy IVIM calls live here. The only module (with nifti_io) that may
import osipy."""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from osipy import fit_ivim
from osipy.ivim.fitting.estimators import FittingMethod, IVIMFitParams
from osipy.ivim.models.biexponential import IVIMBiexponentialModel, IVIMParams

from osipy_rest_api.core.domain import Dataset, FitConfig, FitResult
from osipy_rest_api.core.errors import InvalidInputError

_METHODS = {"segmented", "full", "bayesian"}
_MAP_KEYS = ("d", "d_star", "f", "s0")


def validate_fit_config(config: FitConfig, dataset: Dataset) -> None:
    if config.method not in _METHODS:
        raise InvalidInputError(
            f"unknown fitting method {config.method!r}; "
            f"choose one of {sorted(_METHODS)}"
        )
    b = np.asarray(dataset.b_values, dtype=float)
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
    if not 0.0 < config.mask.percentile < 100.0:
        raise InvalidInputError("mask percentile must be between 0 and 100 (exclusive)")


def _auto_mask(dataset: Dataset, percentile: float) -> np.ndarray:
    b = np.asarray(dataset.b_values, dtype=float)
    b0 = dataset.data[..., int(b.argmin())]
    positive = b0[b0 > 0]
    threshold = float(np.percentile(positive, percentile)) if positive.size else 0.0
    # `>=` (not `>`): the percentile is a *lower* cutoff, so voxels sitting
    # exactly at it are foreground. With a strict `>` a uniform-intensity
    # volume (every b0 voxel identical, as in noiseless synthetic data) has
    # its percentile equal to that value and the mask collapses to empty.
    return b0 >= threshold


def build_summary(result: object) -> dict:
    stats = getattr(result, "fitting_stats", {}) or {}
    maps = {
        "d": result.d_map,  # type: ignore[attr-defined]
        "d_star": result.d_star_map,  # type: ignore[attr-defined]
        "f": result.f_map,  # type: ignore[attr-defined]
        "s0": result.s0_map,  # type: ignore[attr-defined]
    }
    return {
        "fit_success_rate": stats.get("fit_success_rate"),
        "n_voxels_fitted": stats.get("n_voxels_fitted"),
        "n_voxels_total": stats.get("n_voxels_total"),
        "maps": {
            key: {
                **pm.statistics(),
                "valid_fraction": pm.valid_fraction,
                "units": pm.units,
            }
            for key, pm in maps.items()
        },
    }


def run_fit(
    dataset: Dataset,
    config: FitConfig,
    progress_callback: Callable[[float], None] | None = None,
) -> FitResult:
    mask = _auto_mask(dataset, config.mask.percentile)
    params = IVIMFitParams(
        method=FittingMethod(config.method),
        b_threshold=config.b_threshold,
    )
    result = fit_ivim(
        signal=dataset.data,
        b_values=np.asarray(dataset.b_values, dtype=float),
        mask=mask,
        params=params,
        progress_callback=progress_callback,
    )
    for parameter_map in (result.d_map, result.d_star_map, result.f_map, result.s0_map):
        parameter_map.affine = np.asarray(dataset.affine, dtype=float).copy()
    return FitResult(
        maps={
            "d": result.d_map,
            "d_star": result.d_star_map,
            "f": result.f_map,
            "s0": result.s0_map,
        },
        r_squared=result.r_squared,
        summary=build_summary(result),
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
    params = {
        key: float(fit_result.maps[key].values[x, y, z])  # type: ignore[attr-defined]
        for key in _MAP_KEYS
    }
    curve = IVIMBiexponentialModel().predict(
        b,
        IVIMParams(
            s0=params["s0"], d=params["d"], d_star=params["d_star"], f=params["f"]
        ),
    )
    r2 = fit_result.r_squared
    return {
        "voxel": [x, y, z],
        "b_values": b.tolist(),
        "signal": dataset.data[x, y, z, :].tolist(),
        "params": params,
        "fitted_curve": np.asarray(curve, dtype=float).tolist(),
        "r_squared": None if r2 is None else float(r2[x, y, z]),
    }
