"""In-memory NIfTI and b-value parsing and serialization.

One of only two modules permitted to import nibabel. No temp files: everything
goes through io.BytesIO so sensitive image data never touches disk.
"""

from __future__ import annotations

import gzip
import io
import math
import zipfile
import zlib

import nibabel as nib
import numpy as np

from osipy_rest_api.core.errors import InvalidInputError, PayloadTooLargeError

MAP_FILENAMES = {
    "d": "D.nii.gz",
    "d_star": "D_star.nii.gz",
    "f": "f.nii.gz",
    "s0": "S0.nii.gz",
}

_GZIP_MAGIC = b"\x1f\x8b"
_GZIP_CHUNK_BYTES = 64 * 1024


def _decompress_gzip(raw: bytes, filename: str, max_bytes: int) -> bytes:
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
            chunks: list[bytes] = []
            size = 0
            while chunk := stream.read(min(_GZIP_CHUNK_BYTES, max_bytes - size + 1)):
                size += len(chunk)
                if size > max_bytes:
                    raise PayloadTooLargeError(
                        f"decompressed {filename} exceeds the {max_bytes}-byte limit"
                    )
                chunks.append(chunk)
    except PayloadTooLargeError:
        raise
    except (EOFError, OSError, zlib.error) as exc:
        raise InvalidInputError(f"could not decompress {filename}: {exc}") from exc
    return b"".join(chunks)


def parse_nifti_bytes(
    raw: bytes, filename: str = "upload.nii.gz", max_bytes: int = 536_870_912
) -> tuple[np.ndarray, np.ndarray]:
    if len(raw) > max_bytes:
        raise PayloadTooLargeError(f"upload is {len(raw)} bytes; limit is {max_bytes}")
    payload = (
        _decompress_gzip(raw, filename, max_bytes)
        if raw[:2] == _GZIP_MAGIC
        else raw
    )
    try:
        img = nib.Nifti1Image.from_bytes(payload)
    except Exception as exc:  # nibabel raises a variety of types
        raise InvalidInputError(
            f"could not read {filename} as a NIfTI image: {exc}"
        ) from exc
    if img.ndim != 4:
        raise InvalidInputError(
            f"expected a 4D DWI volume, got {img.ndim}D with shape {img.shape}"
        )
    if math.prod(img.shape) * np.dtype(np.float64).itemsize > max_bytes:
        raise PayloadTooLargeError(
            f"decoded {filename} exceeds the {max_bytes}-byte in-memory limit"
        )
    try:
        data = np.asarray(img.get_fdata(), dtype=np.float64)
    except (OSError, ValueError, TypeError) as exc:
        raise InvalidInputError(f"could not read voxel data from {filename}: {exc}") from exc
    return data, np.asarray(img.affine, dtype=np.float64)


def parse_bval_bytes(raw: bytes) -> np.ndarray:
    text = raw.decode("utf-8", errors="replace").strip()
    if not text:
        raise InvalidInputError("b-value file is empty")
    try:
        values = [float(tok) for tok in text.split()]
    except ValueError as exc:
        raise InvalidInputError(f"b-value file has a non-numeric entry: {exc}") from exc
    if not values:
        raise InvalidInputError("b-value file contains no numbers")
    return np.asarray(values, dtype=float)


def parameter_map_to_nifti_bytes(param_map: object) -> bytes:
    values = np.asarray(param_map.values, dtype=np.float32)  # type: ignore[attr-defined]
    affine = np.asarray(param_map.affine, dtype=np.float64)  # type: ignore[attr-defined]
    img = nib.Nifti1Image(values, affine)
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(img.to_bytes())
    return buf.getvalue()


def maps_to_zip_bytes(maps: dict[str, object]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for key, filename in MAP_FILENAMES.items():
            if key in maps:
                archive.writestr(filename, parameter_map_to_nifti_bytes(maps[key]))
    return buf.getvalue()
