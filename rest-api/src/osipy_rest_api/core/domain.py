"""In-memory domain objects. Must not import osipy or nibabel."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum

import numpy as np


class JobStatus(str, Enum):  # noqa: UP042 - explicit (str, Enum) for pydantic/JSON compatibility
    PENDING = "pending"
    RUNNING = "running"
    CANCELLING = "cancelling"
    CANCELLED = "cancelled"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass
class SelectionSpec:
    """An explicit native-grid selection; no implicit tissue mask is applied."""

    scope: str = "dataset"
    voxels: tuple[tuple[int, int, int], ...] = ()


@dataclass
class FitConfig:
    model: str = "biexponential"
    method: str = "segmented"
    b_threshold: float = 200.0
    selection: SelectionSpec = field(default_factory=SelectionSpec)


@dataclass
class Dataset:
    id: str
    data: np.ndarray
    affine: np.ndarray
    b_values: np.ndarray
    created_at: float

    @property
    def shape(self) -> tuple[int, ...]:
        return tuple(self.data.shape)

    @property
    def nbytes(self) -> int:
        return int(self.data.nbytes)


@dataclass
class FitResult:
    maps: dict[str, object]  # osipy ParameterMap instances
    r_squared: np.ndarray | None
    summary: dict
    quality_mask: np.ndarray = field(default_factory=lambda: np.empty(0, dtype=bool))
    selection_mask: np.ndarray = field(default_factory=lambda: np.empty(0, dtype=bool))
    status_map: np.ndarray = field(default_factory=lambda: np.empty(0, dtype=np.uint8))
    model_cutoff: float | None = None
    provenance: dict = field(default_factory=dict)

    @property
    def nbytes(self) -> int:
        map_bytes = sum(
            int(array.nbytes)
            for parameter_map in self.maps.values()
            for name in ("values", "affine", "quality_mask", "uncertainty", "failure_reasons")
            if isinstance(array := getattr(parameter_map, name, None), np.ndarray)
        )
        return map_bytes + sum(
            int(array.nbytes)
            for array in (self.r_squared, self.quality_mask, self.selection_mask, self.status_map)
            if array is not None
        )


@dataclass
class Job:
    id: str
    dataset_id: str
    config: FitConfig
    status: JobStatus = JobStatus.PENDING
    progress: float = 0.0
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    result: FitResult | None = None
    error: str | None = None
