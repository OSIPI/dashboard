"""Local OSIPY fitting; no network, application launching, or user-supplied paths."""

from __future__ import annotations

import hashlib
import json
import math
import os
import struct
import time
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("OSIPY_FORCE_CPU", "1")
os.environ.setdefault("OSIPY_NUM_THREADS", "1")

import numpy as np
import osipy
from osipy.ivim import get_ivim_model, list_ivim_models
from osipy.ivim.models.binding import BoundIVIMModel
from osipy.common.fitting.least_squares import LevenbergMarquardtFitter

MAX_BYTES = 512 * 1024 * 1024
DTYPES = {
    "int8": "i1",
    "uint8": "u1",
    "int16": "<i2",
    "uint16": "<u2",
    "int32": "<i4",
    "uint32": "<u4",
    "float32": "<f4",
    "float64": "<f8",
}
STATUS = {
    0: "Not selected",
    1: "Valid",
    2: "Invalid/nonpositive baseline",
    3: "Not converged",
    4: "Non-finite result",
    5: "IVIM domain constraint",
    6: "Parameter bound hit",
    7: "R² below threshold",
    8: "Fitting error",
    9: "RMSE above threshold",
}


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def model_catalog():
    # Expose the verified model/fitter pair; don't advertise registry entries we haven't integrated.
    if "biexponential" not in list_ivim_models():
        raise RuntimeError("Installed OSIPY does not provide the biexponential model")
    model = get_ivim_model("biexponential")
    return {
        "osipyVersion": osipy.__version__,
        "models": [
            {
                "id": "biexponential",
                "label": "IVIM biexponential · OSIPY Levenberg–Marquardt",
                "parameters": [
                    {
                        "name": p,
                        "unit": model.parameter_units[p] or "fraction",
                        "bounds": [
                            v if math.isfinite(v) else None
                            for v in model.get_bounds()[p]
                        ],
                    }
                    for p in model.parameters
                ],
                "initialization": "OSIPY data-dependent segmented initialization; optional per-parameter overrides.",
            }
        ],
        "defaults": {
            "model": "biexponential",
            "iterations": 200,
            "tolerance": 1e-6,
            "threshold": 200,
            "minimumBaseline": 0,
            "minimumR2": 0.5,
            "maximumRmse": None,
            "bounds": {},
            "initial": {},
        },
        "statusCodes": STATUS,
    }


def finite(value, name, low=-math.inf, high=math.inf):
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or not low <= value <= high
    ):
        raise ValueError(f"Invalid {name}")
    return value


def unpack_dataset(body: bytes, directory: Path):
    if len(body) < 4:
        raise ValueError("Missing dataset header")
    size = struct.unpack_from("<I", body)[0]
    if size > 65536 or size + 4 > len(body):
        raise ValueError("Invalid dataset header size")
    meta = json.loads(body[4 : 4 + size])
    dims = meta.get("dimensions")
    if (
        not isinstance(dims, list)
        or len(dims) != 4
        or any(type(v) is not int or v <= 0 for v in dims)
    ):
        raise ValueError("Invalid dimensions")
    if meta.get("dtype") not in DTYPES:
        raise ValueError("Unsupported scalar type")
    dtype = np.dtype(DTYPES[meta["dtype"]])
    count = math.prod(dims)
    if math.prod(dims[:3]) > 5_000_000:
        raise ValueError("Analysis grid exceeds five million spatial voxels")
    expected = count * dtype.itemsize
    payload = memoryview(body)[4 + size :]
    if expected > MAX_BYTES or len(payload) != expected:
        raise ValueError("Dataset payload size mismatch or limit exceeded")
    b = np.asarray(meta.get("bValues"), dtype=float)
    affine = np.asarray(meta.get("affine"), dtype=float)
    if b.shape != (dims[3],) or not np.isfinite(b).all() or np.any(b < 0):
        raise ValueError("Invalid b-values")
    if (
        affine.shape != (4, 4)
        or not np.isfinite(affine).all()
        or not np.allclose(affine[3], [0, 0, 0, 1])
        or abs(np.linalg.det(affine[:3, :3])) < 1e-10
    ):
        raise ValueError("Invalid affine")
    slope = finite(meta.get("slope"), "scaling")
    intercept = finite(meta.get("intercept"), "intercept")
    if slope == 0 or meta.get("spatialUnit") != "mm":
        raise ValueError("Expected explicit nonzero scaling and millimetre geometry")
    source_hash = meta.get("sha256", "")
    if (
        not isinstance(source_hash, str)
        or len(source_hash) != 64
        or any(c not in "0123456789abcdef" for c in source_hash)
    ):
        raise ValueError("Invalid source identity")
    data = np.frombuffer(payload, dtype=dtype)
    for offset in range(0, count, 65536):
        with np.errstate(over="ignore", invalid="ignore"):
            scaled = data[offset : offset + 65536].astype(float) * slope + intercept
        if not np.isfinite(scaled).all():
            raise ValueError("Dataset contains non-finite scaled samples")
    clean = {
        k: meta[k]
        for k in (
            "dimensions",
            "dtype",
            "bValues",
            "affine",
            "slope",
            "intercept",
            "spatialUnit",
            "sha256",
        )
    }
    clean["payloadSha256"] = hashlib.sha256(payload).hexdigest()
    clean["name"] = str(meta.get("name", "Dataset"))[:256]
    clean["byteLength"] = expected
    directory.mkdir(mode=0o700)
    (directory / "samples.bin").write_bytes(payload)
    (directory / "dataset.json").write_text(json.dumps(clean))
    return clean


def validate_config(config, meta):
    if not isinstance(config, dict) or config.get("model") != "biexponential":
        raise ValueError("Unsupported model")
    b = np.asarray(meta["bValues"])
    if len(np.unique(b)) < 4 or not np.any(b == 0):
        raise ValueError(
            "Fitting requires at least four distinct b-values and a b=0 baseline"
        )
    iterations = finite(config.get("iterations"), "iterations", 2, 2000)
    if type(iterations) is not int:
        raise ValueError("Iterations must be an integer")
    result = {
        "model": "biexponential",
        "iterations": iterations,
        "tolerance": finite(config.get("tolerance"), "tolerance", 1e-12, 0.1),
        "threshold": finite(config.get("threshold"), "b threshold", 0, float(max(b))),
        "minimumBaseline": finite(
            config.get("minimumBaseline"), "baseline threshold", 0, 1e20
        ),
        "minimumR2": finite(config.get("minimumR2"), "R² threshold", -100, 1),
        "maximumRmse": None,
        "bounds": {},
        "initial": {},
    }
    if config.get("maximumRmse") is not None:
        result["maximumRmse"] = finite(config["maximumRmse"], "RMSE threshold", 0, 1e20)
    defaults = get_ivim_model("biexponential").get_bounds()
    overrides = config.get("bounds", {})
    initial = config.get("initial", {})
    if (
        not isinstance(overrides, dict)
        or not isinstance(initial, dict)
        or set(overrides) - set(defaults)
        or set(initial) - set(defaults)
    ):
        raise ValueError("Unknown parameter settings")
    for key, bounds in defaults.items():
        pair = overrides.get(key, [v if math.isfinite(v) else None for v in bounds])
        if not isinstance(pair, (tuple, list)) or len(pair) != 2:
            raise ValueError("Bounds require lower and upper values")
        lower = (
            bounds[0] if pair[0] is None else finite(pair[0], key + " lower bound", 0)
        )
        upper = (
            bounds[1] if pair[1] is None else finite(pair[1], key + " upper bound", 0)
        )
        if lower >= upper or (key == "f" and upper > 1):
            raise ValueError("Bounds are unordered or outside the parameter domain")
        result["bounds"][key] = [lower, upper if math.isfinite(upper) else None]
        if key in initial and initial[key] is not None:
            result["initial"][key] = finite(
                initial[key], key + " initial value", lower, upper
            )
    return result


class InitializedIVIM(BoundIVIMModel):
    def __init__(self, model, b_values, threshold, initial):
        super().__init__(model, b_values, b_threshold=threshold)
        self.initial = initial

    def get_initial_guess_batch(self, observed_batch, xp):
        result = super().get_initial_guess_batch(observed_batch, xp)
        for name, value in self.initial.items():
            result[self.parameters.index(name), :] = value
        return result


def run_fit(
    dataset_dir, output_dir, config, scope, indices, progress=lambda value: None
):
    started = time.monotonic()
    started_at = utcnow()
    meta = json.loads((Path(dataset_dir) / "dataset.json").read_text())
    config = validate_config(config, meta)
    dims = meta["dimensions"]
    n = math.prod(dims[:3])
    chosen = (
        np.arange(n, dtype=np.int64)
        if scope == "dataset"
        else np.asarray(indices, dtype=np.int64)
    )
    source = np.memmap(
        Path(dataset_dir) / "samples.bin",
        dtype=DTYPES[meta["dtype"]],
        mode="r",
        shape=(dims[3], n),
    )
    model = get_ivim_model(config["model"])
    b = np.asarray(meta["bValues"], dtype=float)
    bound = InitializedIVIM(model, b, config["threshold"], config["initial"])
    fitter = LevenbergMarquardtFitter(
        max_iterations=config["iterations"], tolerance=config["tolerance"]
    )
    bounds = {
        k: (lo, hi if hi is not None else math.inf)
        for k, (lo, hi) in config["bounds"].items()
    }
    names = model.parameters + ["RMSE", "R2", "AdjustedR2", "Valid", "Status"]
    maps = {name: np.full(n, np.nan, dtype=np.float32) for name in names}
    maps["Status"][:] = 0
    maps["Valid"][:] = 0
    errors = []
    for offset in range(0, len(chosen), 128):
        ix = chosen[offset : offset + 128]
        observed = (
            np.asarray(source[:, ix], dtype=float) * meta["slope"] + meta["intercept"]
        )
        acceptable = np.isfinite(observed).all(axis=0) & (
            observed[np.flatnonzero(b == 0)[0]] > config["minimumBaseline"]
        )
        maps["Status"][ix] = 2
        valid_ix = ix[acceptable]
        if len(valid_ix):
            values = observed[:, acceptable]
            try:
                fitted, r2, converged = fitter.fit_batch(bound, values, bounds)
                predictions = bound.predict_array_batch(fitted, np)
                rmse = np.sqrt(np.mean((values - predictions) ** 2, axis=0))
                status = np.ones(len(valid_ix), dtype=np.float32)
                for row, name in enumerate(model.parameters):
                    maps[name][valid_ix] = fitted[row]
                p = {name: fitted[i] for i, name in enumerate(model.parameters)}
                domain = (
                    (p["S0"] > 0)
                    & (p["D"] > 0)
                    & (p["D*"] > p["D"])
                    & (p["f"] >= 0)
                    & (p["f"] <= 1)
                )
                hit = np.zeros(len(valid_ix), dtype=bool)
                for row, name in enumerate(model.parameters):
                    lo, hi = bounds[name]
                    epsilon = (
                        max(abs(lo), abs(hi) if math.isfinite(hi) else 1, 1e-12) * 1e-5
                    )
                    hit |= np.abs(fitted[row] - lo) <= epsilon
                    if math.isfinite(hi):
                        hit |= np.abs(fitted[row] - hi) <= epsilon
                if config["maximumRmse"] is not None:
                    status[rmse > config["maximumRmse"]] = 9
                status[r2 < config["minimumR2"]] = 7
                status[hit] = 6
                status[~domain] = 5
                finite_maps = np.stack(
                    [np.isfinite(maps[name][valid_ix]) for name in model.parameters]
                ).all(axis=0)
                status[
                    ~np.isfinite(fitted).all(axis=0)
                    | ~np.isfinite(rmse)
                    | ~np.isfinite(r2)
                    | ~finite_maps
                ] = 4
                status[~converged] = 3
                maps["RMSE"][valid_ix] = rmse
                maps["R2"][valid_ix] = r2
                if len(b) > len(model.parameters):
                    maps["AdjustedR2"][valid_ix] = 1 - (1 - r2) * (len(b) - 1) / (
                        len(b) - len(model.parameters)
                    )
                maps["Status"][valid_ix] = status
                maps["Valid"][valid_ix] = status == 1
            except Exception as error:
                maps["Status"][valid_ix] = 8
                if len(errors) < 10:
                    errors.append(type(error).__name__ + ": " + str(error)[:240])
        progress(min(1.0, (offset + len(ix)) / len(chosen)))
    output = Path(output_dir)
    output.mkdir(exist_ok=True, mode=0o700)
    np.savez(output / "maps.npz", **maps)
    mask = np.zeros(n, dtype=np.uint8)
    mask[chosen] = 1
    np.save(output / "selection.npy", mask)
    units = {
        **model.parameter_units,
        "RMSE": "a.u.",
        "R2": "dimensionless",
        "AdjustedR2": "dimensionless",
        "Valid": "binary",
        "Status": "code",
    }
    descriptors = []
    for name in names:
        values = maps[name][
            np.isfinite(maps[name])
            & ((maps["Valid"] == 1) if name not in ("Valid", "Status") else True)
        ]
        low, high = (
            (float(values.min()), float(values.max())) if len(values) else (0.0, 1.0)
        )
        if low == high:
            high = low + max(abs(low) * 0.01, 1e-6)
        descriptors.append(
            {"name": name, "unit": units[name] or "fraction", "min": low, "max": high}
        )
    report = {
        "schema": 1,
        "dataset": meta,
        "model": "biexponential",
        "fitter": "osipy.common.fitting.least_squares.LevenbergMarquardtFitter",
        "osipyVersion": osipy.__version__,
        "config": config,
        "scope": scope,
        "selectedVoxels": len(chosen),
        "validVoxels": int(np.sum(maps["Valid"])),
        "statusCounts": {
            str(code): int(np.sum(maps["Status"] == code)) for code in STATUS
        },
        "statusCodes": STATUS,
        "startedAt": started_at,
        "completedAt": utcnow(),
        "durationSeconds": time.monotonic() - started,
        "maps": descriptors,
        "modelReference": model.reference,
        "samplePolicy": "All acquired repetitions retained; no averaging. Initial S0 uses the first b=0 sample.",
        "qualityPolicy": "Convergence, finite values, physical domain, bound hits and configured R2/RMSE thresholds. Status is a quality flag, not a clinical assessment.",
        "errors": errors,
    }
    (output / "report.json").write_text(json.dumps(report, allow_nan=False))
    return report


def result_bytes(output_dir):
    root = Path(output_dir)
    report = json.loads((root / "report.json").read_text())
    with np.load(root / "maps.npz") as maps:
        arrays = [
            np.asarray(maps[m["name"]], dtype="<f4").tobytes() for m in report["maps"]
        ]
    header = json.dumps(report, allow_nan=False).encode()
    return struct.pack("<I", len(header)) + header + b"".join(arrays)


def job_process(dataset_dir, output_dir, config, scope, indices, queue):
    try:
        report = run_fit(
            dataset_dir,
            output_dir,
            config,
            scope,
            indices,
            lambda p: queue.put({"progress": p}),
        )
        queue.put(
            {
                "state": "completed",
                "progress": 1,
                "summary": {
                    k: report[k]
                    for k in ("validVoxels", "selectedVoxels", "durationSeconds")
                },
            }
        )
    except Exception as error:
        queue.put(
            {"state": "failed", "error": type(error).__name__ + ": " + str(error)[:500]}
        )
