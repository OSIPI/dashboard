"""Pydantic request/response models and their mapping to domain objects."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from osipy_rest_api.core.domain import Dataset, FitConfig, Job, JobStatus, MaskSpec


class MaskSpecIn(BaseModel):
    type: Literal["auto"] = "auto"
    percentile: float = Field(5.0, gt=0, lt=100)


class FitRequest(BaseModel):
    method: Literal["segmented", "full", "bayesian"] = "segmented"
    b_threshold: float = 200.0
    mask: MaskSpecIn = MaskSpecIn()

    def to_domain(self) -> FitConfig:
        return FitConfig(
            method=self.method,
            b_threshold=self.b_threshold,
            mask=MaskSpec(type=self.mask.type, percentile=self.mask.percentile),
        )

    @classmethod
    def from_domain(cls, config: FitConfig) -> FitRequest:
        return cls(
            method=config.method,
            b_threshold=config.b_threshold,
            mask=MaskSpecIn(type=config.mask.type, percentile=config.mask.percentile),
        )


class DatasetMeta(BaseModel):
    dataset_id: str
    shape: list[int]
    b_values: list[float]
    created_at: float

    @classmethod
    def from_domain(cls, ds: Dataset) -> DatasetMeta:
        return cls(
            dataset_id=ds.id,
            shape=[int(n) for n in ds.shape],
            b_values=[float(v) for v in ds.b_values],
            created_at=ds.created_at,
        )


class FitCreated(BaseModel):
    job_id: str
    status: str


class JobView(BaseModel):
    job_id: str
    dataset_id: str
    status: str
    progress: float
    config: FitRequest | None = None
    summary: dict | None = None
    error: str | None = None

    @classmethod
    def from_domain(cls, job: Job) -> JobView:
        summary = None
        if job.status is JobStatus.SUCCEEDED and job.result is not None:
            summary = job.result.summary
        return cls(
            job_id=job.id,
            dataset_id=job.dataset_id,
            status=job.status.value,
            progress=job.progress,
            config=FitRequest.from_domain(job.config),
            summary=summary,
            error=job.error,
        )


class VoxelView(BaseModel):
    voxel: list[int]
    b_values: list[float]
    signal: list[float]
    params: dict[str, float]
    fitted_curve: list[float]
    r_squared: float | None


class Health(BaseModel):
    status: str = "ok"


class Root(BaseModel):
    name: str
    version: str
    docs: str
