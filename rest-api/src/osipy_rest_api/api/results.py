"""Download parameter maps and inspect individual voxels."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from osipy_rest_api.core.domain import JobStatus
from osipy_rest_api.core.errors import JobStateError, NotFoundError
from osipy_rest_api.core.ivim import voxel_detail
from osipy_rest_api.core.nifti_io import (
    MAP_FILENAMES,
    QUALITY_MAP_FILENAMES,
    array_to_nifti_bytes,
    maps_to_zip_bytes,
    parameter_map_to_nifti_bytes,
)
from osipy_rest_api.core.storage import Storage
from osipy_rest_api.deps import get_storage
from osipy_rest_api.models.schemas import VoxelView
from osipy_rest_api.security import require_session_token


async def _succeeded_job(job_id: str, storage: Storage):
    job = await storage.get_job(job_id)
    if job is None:
        raise NotFoundError(f"job {job_id} not found")
    if job.status is not JobStatus.SUCCEEDED:
        raise JobStateError(
            f"job {job_id} is {job.status.value}; results are not ready"
        )
    return job


router = APIRouter(tags=["results"], dependencies=[Depends(require_session_token)])


@router.get("/fits/{job_id}/maps/{name}")
async def download_map(
    job_id: str,
    name: str,
    storage: Annotated[Storage, Depends(get_storage)],
) -> Response:
    job = await _succeeded_job(job_id, storage)
    filenames = {**MAP_FILENAMES, **QUALITY_MAP_FILENAMES}
    quality_names = set(QUALITY_MAP_FILENAMES)
    if (
        name not in filenames
        or (name not in job.result.maps and name not in quality_names)
        or (name == "r_squared" and job.result.r_squared is None)
    ):
        raise NotFoundError(
            f"unknown map {name!r}; choose one of {sorted(filenames)}"
        )
    if name in job.result.maps:
        body = parameter_map_to_nifti_bytes(job.result.maps[name])
    else:
        affine = job.result.maps[next(iter(job.result.maps))].affine
        values = {
            "valid": job.result.quality_mask.astype("uint8"),
            "status": job.result.status_map,
            "r_squared": job.result.r_squared,
        }[name]
        body = array_to_nifti_bytes(values, affine)
    return Response(
        content=body,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{filenames[name]}"'},
    )


@router.get("/fits/{job_id}/maps")
async def download_all_maps(
    job_id: str,
    storage: Annotated[Storage, Depends(get_storage)],
) -> Response:
    job = await _succeeded_job(job_id, storage)
    return Response(
        content=maps_to_zip_bytes(job.result.maps),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{job_id}_ivim_maps.zip"'
        },
    )


@router.get("/fits/{job_id}/voxel", response_model=VoxelView)
async def get_voxel(
    job_id: str,
    x: Annotated[int, Query()],
    y: Annotated[int, Query()],
    z: Annotated[int, Query()],
    storage: Annotated[Storage, Depends(get_storage)],
) -> VoxelView:
    job = await _succeeded_job(job_id, storage)
    dataset = await storage.get_dataset(job.dataset_id)
    if dataset is None:
        raise NotFoundError("source dataset no longer available; re-run the fit")
    return VoxelView(**voxel_detail(dataset, job.result, x, y, z))
