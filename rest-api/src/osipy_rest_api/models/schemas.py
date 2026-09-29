"""Pydantic request/response models and their mapping to domain objects."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from osipy_rest_api.core.domain import Dataset, FitConfig, Job, JobStatus, SelectionSpec


class FitRequest(BaseModel):
    """Explicit analysis request on native voxel coordinates.

    `voxels` is required for voxel/ROI scope and deliberately replaces the
    prototype's automatic intensity mask.
    """

    model_config = ConfigDict(extra="forbid")

    model: Literal["biexponential", "simplified"] = "biexponential"
    method: Literal["segmented", "full", "bayesian"] = "segmented"
    b_threshold: float = Field(200.0, ge=0)
    scope: Literal["dataset", "voxel", "roi"] = "dataset"
    voxels: list[tuple[int, int, int]] = Field(default_factory=list)

    def to_domain(self) -> FitConfig:
        return FitConfig(
            model=self.model,
            method=self.method,
            b_threshold=self.b_threshold,
            selection=SelectionSpec(scope=self.scope, voxels=tuple(self.voxels)),
        )

    @classmethod
    def from_domain(cls, config: FitConfig) -> FitRequest:
        return cls(
            model=config.model,
            method=config.method,
            b_threshold=config.b_threshold,
            scope=config.selection.scope,
            voxels=list(config.selection.voxels),
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
    provenance: dict | None = None
    error: str | None = None

    @classmethod
    def from_domain(cls, job: Job) -> JobView:
        summary = None
        provenance = None
        if job.status is JobStatus.SUCCEEDED and job.result is not None:
            summary = job.result.summary
            provenance = getattr(job.result, "provenance", None)
        return cls(
            job_id=job.id,
            dataset_id=job.dataset_id,
            status=job.status.value,
            progress=job.progress,
            config=FitRequest.from_domain(job.config),
            summary=summary,
            provenance=provenance,
            error=job.error,
        )


class VoxelView(BaseModel):
    voxel: list[int]
    b_values: list[float]
    signal: list[float]
    available: bool
    reason: Literal["not_selected", "invalid_estimate"] | None
    params: dict[str, float] | None
    fitted_curve: list[float] | None
    r_squared: float | None


class Health(BaseModel):
    status: str = "ok"


class Root(BaseModel):
    name: str
    version: str
    docs: str


class CatalogParameter(BaseModel):
    name: str
    unit: str
    bounds: list[float | None]


class CatalogModel(BaseModel):
    id: str
    label: str
    parameters: list[CatalogParameter]
    fitter_strategies: list[str]
    reference: str


class Catalog(BaseModel):
    api_version: str
    osipy_version: str
    models: list[CatalogModel]
    defaults: FitRequest
    effective_fitter_defaults: dict[str, dict]
    status_codes: dict[str, str]
