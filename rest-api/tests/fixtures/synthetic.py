"""Synthetic IVIM data generators for tests.

The bi-exponential IVIM signal model:
    S(b) = S0 * (f * exp(-b * D*) + (1 - f) * exp(-b * D))
"""

from __future__ import annotations

import gzip as _gzip
import io

import nibabel as nib
import numpy as np

DEFAULT_B_VALUES = np.array([0.0, 10.0, 20.0, 50.0, 100.0, 200.0, 400.0, 800.0])
IDENTITY_AFFINE = np.eye(4)


def make_ivim_volume(
    shape: tuple[int, int, int] = (4, 4, 2),
    b_values: np.ndarray = DEFAULT_B_VALUES,
    d: float = 1.2e-3,
    d_star: float = 20e-3,
    f: float = 0.15,
    s0: float = 100.0,
    noise_sigma: float = 0.0,
    seed: int = 0,
) -> tuple[np.ndarray, np.ndarray]:
    b = np.asarray(b_values, dtype=float)
    curve = s0 * (f * np.exp(-b * d_star) + (1.0 - f) * np.exp(-b * d))
    data = np.broadcast_to(curve, (*shape, b.size)).astype(float).copy()
    if noise_sigma > 0.0:
        rng = np.random.default_rng(seed)
        data = data + rng.normal(0.0, noise_sigma, size=data.shape)
    return data, b


def nifti_bytes(
    data: np.ndarray,
    affine: np.ndarray | None = None,
    gzip: bool = True,
) -> bytes:
    img = nib.Nifti1Image(np.asarray(data, dtype=np.float32),
                          IDENTITY_AFFINE if affine is None else affine)
    raw = img.to_bytes()
    if gzip:
        buf = io.BytesIO()
        with _gzip.GzipFile(fileobj=buf, mode="wb") as gz:
            gz.write(raw)
        return buf.getvalue()
    return raw


def bval_bytes(b_values: np.ndarray) -> bytes:
    nums = " ".join(
        str(int(v)) if float(v).is_integer() else repr(float(v))
        for v in np.asarray(b_values)
    )
    return (nums + "\n").encode()
