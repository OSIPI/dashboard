"""Start IVIM fits and poll their status."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from osipy_rest_api.core.errors import NotFoundError
from osipy_rest_api.core.ivim import validate_fit_config
from osipy_rest_api.core.jobs import JobRunner
from osipy_rest_api.core.storage import Storage
from osipy_rest_api.deps import get_job_runner, get_storage
from osipy_rest_api.models.schemas import FitCreated, FitRequest, JobView

router = APIRouter(tags=["fits"])


@router.post(
    "/datasets/{dataset_id}/fits",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=FitCreated,
)
async def create_fit(
    dataset_id: str,
    storage: Annotated[Storage, Depends(get_storage)],
    runner: Annotated[JobRunner, Depends(get_job_runner)],
    body: FitRequest | None = None,
) -> FitCreated:
    ds = await storage.get_dataset(dataset_id)
    if ds is None:
        raise NotFoundError(f"dataset {dataset_id} not found")
    config = (body or FitRequest()).to_domain()
    validate_fit_config(config, ds)
    job_id = await runner.submit(dataset_id, config)
    return FitCreated(job_id=job_id, status="pending")


@router.get("/fits/{job_id}", response_model=JobView)
async def get_fit(
    job_id: str, storage: Annotated[Storage, Depends(get_storage)]
) -> JobView:
    job = await storage.get_job(job_id)
    if job is None:
        raise NotFoundError(f"job {job_id} not found")
    return JobView.from_domain(job)
