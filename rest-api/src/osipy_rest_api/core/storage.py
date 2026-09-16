"""In-memory storage for datasets and jobs.

The Storage protocol is the seam where disk-backed persistence would later
attach. InMemoryStorage keeps everything in two dicts guarded by one lock,
enforces capacity caps, and evicts on a TTL.
"""

from __future__ import annotations

import asyncio
import time
from typing import Protocol

from osipy_rest_api.core.domain import Dataset, Job
from osipy_rest_api.core.errors import CapacityError, NotFoundError


class Storage(Protocol):
    async def put_dataset(self, ds: Dataset) -> None: ...
    async def get_dataset(self, dataset_id: str) -> Dataset | None: ...
    async def delete_dataset(self, dataset_id: str) -> bool: ...
    async def list_datasets(self) -> list[Dataset]: ...
    async def total_bytes(self) -> int: ...
    async def put_job(self, job: Job) -> None: ...
    async def get_job(self, job_id: str) -> Job | None: ...
    async def update_job(self, job_id: str, **fields: object) -> None: ...
    async def list_jobs(self) -> list[Job]: ...
    async def clear(self) -> None: ...
    async def sweep(self, now: float | None = None) -> int: ...


class InMemoryStorage:
    def __init__(
        self, max_datasets: int, max_total_bytes: int, ttl_seconds: int
    ) -> None:
        self._max_datasets = max_datasets
        self._max_total_bytes = max_total_bytes
        self._ttl = ttl_seconds
        self._datasets: dict[str, Dataset] = {}
        self._jobs: dict[str, Job] = {}
        self._lock = asyncio.Lock()

    async def put_dataset(self, ds: Dataset) -> None:
        async with self._lock:
            if len(self._datasets) >= self._max_datasets:
                raise CapacityError(
                    f"dataset limit reached ({self._max_datasets}); "
                    "delete an existing dataset first"
                )
            current = sum(d.nbytes for d in self._datasets.values())
            if current + ds.nbytes > self._max_total_bytes:
                raise CapacityError(
                    "in-memory data limit reached; delete an existing dataset first"
                )
            self._datasets[ds.id] = ds

    async def get_dataset(self, dataset_id: str) -> Dataset | None:
        return self._datasets.get(dataset_id)

    async def delete_dataset(self, dataset_id: str) -> bool:
        async with self._lock:
            existed = self._datasets.pop(dataset_id, None) is not None
            for jid in [j.id for j in self._jobs.values() if j.dataset_id == dataset_id]:
                self._jobs.pop(jid, None)
            return existed

    async def list_datasets(self) -> list[Dataset]:
        return list(self._datasets.values())

    async def total_bytes(self) -> int:
        return sum(d.nbytes for d in self._datasets.values())

    async def put_job(self, job: Job) -> None:
        async with self._lock:
            self._jobs[job.id] = job

    async def get_job(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    async def update_job(self, job_id: str, **fields: object) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise NotFoundError(f"job {job_id} not found")
            for key, value in fields.items():
                setattr(job, key, value)

    async def list_jobs(self) -> list[Job]:
        return list(self._jobs.values())

    async def clear(self) -> None:
        async with self._lock:
            self._datasets.clear()
            self._jobs.clear()

    async def sweep(self, now: float | None = None) -> int:
        now = time.time() if now is None else now
        cutoff = now - self._ttl
        async with self._lock:
            stale_ds = [d.id for d in self._datasets.values() if d.created_at < cutoff]
            removed = 0
            for did in stale_ds:
                self._datasets.pop(did, None)
                removed += 1
            stale_jobs = [
                j.id
                for j in self._jobs.values()
                if j.created_at < cutoff or j.dataset_id in stale_ds
            ]
            for jid in stale_jobs:
                if self._jobs.pop(jid, None) is not None:
                    removed += 1
            return removed
