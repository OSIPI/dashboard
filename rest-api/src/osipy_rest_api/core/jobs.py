"""Background fit execution.

The JobRunner protocol is the seam where a real queue / batch worker would
later attach. InProcessJobRunner runs each fit as an asyncio task that offloads
the CPU-bound osipy call with asyncio.to_thread, one at a time.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections.abc import Callable
from typing import Protocol
from uuid import uuid4

from osipy_rest_api.core.domain import FitConfig, FitResult, Job, JobStatus
from osipy_rest_api.core.errors import CapacityError, NotFoundError
from osipy_rest_api.core.ivim import run_fit
from osipy_rest_api.core.storage import Storage

logger = logging.getLogger(__name__)


class JobRunner(Protocol):
    async def submit(self, dataset_id: str, config: FitConfig) -> str: ...
    async def cancel(self, job_id: str) -> Job: ...
    async def wait(self, job_id: str) -> None: ...


class FitCancelled(Exception):
    """Raised at an OSIPY progress boundary after a client cancellation."""


class InProcessJobRunner:
    def __init__(
        self,
        storage: Storage,
        fit_fn: Callable[..., FitResult] = run_fit,
        max_jobs: int = 5,
    ) -> None:
        self._storage = storage
        self._fit_fn = fit_fn
        self._tasks: dict[str, asyncio.Task] = {}
        self._cancel_events: dict[str, threading.Event] = {}
        self._semaphore = asyncio.Semaphore(1)
        self._max_jobs = max_jobs
        self._submit_lock = asyncio.Lock()

    async def submit(self, dataset_id: str, config: FitConfig) -> str:
        async with self._submit_lock:
            # Deletion/TTL can remove records before their worker tasks finish.
            if len(self._tasks) >= self._max_jobs:
                raise CapacityError("fit queue limit reached; wait for a fit to finish")
            job = Job(id=uuid4().hex, dataset_id=dataset_id, config=config)
            await self._storage.put_job(job)
            task = asyncio.create_task(self._run(job.id))
            self._tasks[job.id] = task
            self._cancel_events[job.id] = threading.Event()
            task.add_done_callback(lambda done, job_id=job.id: self._cleanup(job_id))
            return job.id

    def _cleanup(self, job_id: str) -> None:
        self._tasks.pop(job_id, None)
        self._cancel_events.pop(job_id, None)

    async def cancel(self, job_id: str) -> Job:
        job = await self._storage.get_job(job_id)
        if job is None:
            raise NotFoundError(f"job {job_id} not found")
        if job.status in {JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED}:
            return job
        event = self._cancel_events.get(job_id)
        if event is not None:
            event.set()
        if job.status is JobStatus.PENDING:
            await self._update(job_id, status=JobStatus.CANCELLED, finished_at=time.time())
        else:
            await self._update(job_id, status=JobStatus.CANCELLING)
        return (await self._storage.get_job(job_id)) or job

    async def wait(self, job_id: str) -> None:
        task = self._tasks.get(job_id)
        if task is not None:
            await asyncio.shield(task)

    async def _update(self, job_id: str, **fields: object) -> bool:
        try:
            await self._storage.update_job(job_id, **fields)
            return True
        except NotFoundError:
            logger.info(
                "job %s vanished mid-flight (deleted or evicted); abandoning", job_id
            )
            return False

    async def _run(self, job_id: str) -> None:
        try:
            async with self._semaphore:
                cancelled = self._cancel_events.get(job_id)
                if cancelled is not None and cancelled.is_set():
                    return
                if not await self._update(job_id, status=JobStatus.RUNNING):
                    return
                job = await self._storage.get_job(job_id)
                if job is None:
                    return
                dataset = await self._storage.get_dataset(job.dataset_id)
                if dataset is None:
                    await self._update(
                        job_id,
                        status=JobStatus.FAILED,
                        error="dataset no longer available",
                        finished_at=time.time(),
                    )
                    return

                loop = asyncio.get_running_loop()

                def progress_cb(value: float) -> None:
                    if cancelled is not None and cancelled.is_set():
                        raise FitCancelled()
                    loop.call_soon_threadsafe(
                        lambda: loop.create_task(
                            self._update(job_id, progress=float(value))
                        )
                    )

                result = await asyncio.to_thread(
                    self._fit_fn, dataset, job.config, progress_cb
                )
                if cancelled is not None and cancelled.is_set():
                    raise FitCancelled()
        except FitCancelled:
            await self._update(
                job_id, status=JobStatus.CANCELLED, error=None, finished_at=time.time()
            )
            return
        except Exception as exc:  # noqa: BLE001 — surfaced to the client as job state
            logger.exception("fit job %s failed", job_id)
            await self._update(
                job_id,
                status=JobStatus.FAILED,
                error=str(exc),
                finished_at=time.time(),
            )
            return

        try:
            job = await self._storage.get_job(job_id)
            if job is None or job.status is JobStatus.CANCELLED:
                return
            await self._update(
                job_id,
                status=JobStatus.SUCCEEDED,
                progress=1.0,
                result=result,
                finished_at=time.time(),
            )
        except CapacityError as exc:
            await self._update(
                job_id,
                status=JobStatus.FAILED,
                error=str(exc),
                finished_at=time.time(),
            )
