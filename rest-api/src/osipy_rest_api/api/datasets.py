"""Dataset upload, retrieval, and deletion."""

from __future__ import annotations

import json
import time
from typing import Annotated
from uuid import uuid4

import numpy as np
from fastapi import APIRouter, Depends, File, Form, UploadFile, status

from osipy_rest_api.config import Settings
from osipy_rest_api.core.domain import Dataset
from osipy_rest_api.core.errors import InvalidInputError, NotFoundError, PayloadTooLargeError
from osipy_rest_api.core.nifti_io import parse_bval_bytes, parse_nifti_bytes
from osipy_rest_api.core.storage import Storage
from osipy_rest_api.deps import get_settings_dep, get_storage
from osipy_rest_api.models.schemas import DatasetMeta

router = APIRouter(tags=["datasets"])


def _b_values_from_form(raw: str) -> np.ndarray:
    try:
        parsed = json.loads(raw)
        values = [float(v) for v in parsed]
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise InvalidInputError(
            f"b_values must be a JSON array of numbers: {exc}"
        ) from exc
    return np.asarray(values, dtype=float)


@router.post("/datasets", status_code=status.HTTP_201_CREATED, response_model=DatasetMeta)
async def create_dataset(
    nifti: Annotated[UploadFile, File(...)],
    storage: Annotated[Storage, Depends(get_storage)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
    bval: Annotated[UploadFile | None, File()] = None,
    b_values: Annotated[str | None, Form()] = None,
) -> DatasetMeta:
    raw = await nifti.read()
    if len(raw) > settings.max_upload_bytes:
        raise PayloadTooLargeError(
            f"upload is {len(raw)} bytes; limit is {settings.max_upload_bytes}"
        )
    data, affine = parse_nifti_bytes(raw, nifti.filename or "upload.nii.gz")

    if bval is not None:
        bvals = parse_bval_bytes(await bval.read())
    elif b_values is not None:
        bvals = _b_values_from_form(b_values)
    else:
        raise InvalidInputError("provide a .bval file or a b_values JSON array")

    if data.ndim != 4:
        raise InvalidInputError(f"expected a 4D volume, got {data.ndim}D")
    if bvals.shape[0] != data.shape[3]:
        raise InvalidInputError(
            f"b-value count ({bvals.shape[0]}) does not match the number of "
            f"volumes ({data.shape[3]})"
        )
    if bvals.shape[0] < 4:
        raise InvalidInputError("IVIM fitting needs at least 4 b-values")
    if float(np.min(bvals)) >= 1.0:
        raise InvalidInputError("at least one b-value must be approximately 0")

    ds = Dataset(
        id=uuid4().hex,
        data=data,
        affine=affine,
        b_values=bvals,
        created_at=time.time(),
    )
    await storage.put_dataset(ds)
    return DatasetMeta.from_domain(ds)


@router.get("/datasets/{dataset_id}", response_model=DatasetMeta)
async def get_dataset(
    dataset_id: str, storage: Annotated[Storage, Depends(get_storage)]
) -> DatasetMeta:
    ds = await storage.get_dataset(dataset_id)
    if ds is None:
        raise NotFoundError(f"dataset {dataset_id} not found")
    return DatasetMeta.from_domain(ds)


@router.delete("/datasets/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    dataset_id: str, storage: Annotated[Storage, Depends(get_storage)]
) -> None:
    if not await storage.delete_dataset(dataset_id):
        raise NotFoundError(f"dataset {dataset_id} not found")
