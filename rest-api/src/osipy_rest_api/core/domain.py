"""In-memory domain objects. Must not import osipy or nibabel."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum

import numpy as np


class JobStatus(str, Enum):  # noqa: UP042 - explicit (str, Enum) for pydantic/JSON compatibility
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass
class MaskSpec:
    type: str = "auto"
    percentile: float = 5.0


@dataclass
class FitConfig:
    method: str = "segmented"
    b_threshold: float = 200.0
    mask: MaskSpec = field(default_factory=MaskSpec)


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

    @property
    def nbytes(self) -> int:
        map_bytes = sum(
            int(array.nbytes)
            for parameter_map in self.maps.values()
            for name in ("values", "affine", "quality_mask", "uncertainty", "failure_reasons")
            if isinstance(array := getattr(parameter_map, name, None), np.ndarray)
        )
        return map_bytes + (0 if self.r_squared is None else int(self.r_squared.nbytes))


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
