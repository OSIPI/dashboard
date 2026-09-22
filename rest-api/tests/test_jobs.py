import asyncio
import gc
import time
import weakref
from types import SimpleNamespace

import numpy as np
import pytest

from osipy_rest_api.core.domain import Dataset, FitConfig, FitResult, Job, JobStatus
from osipy_rest_api.core.errors import CapacityError
from osipy_rest_api.core.jobs import InProcessJobRunner
from osipy_rest_api.core.storage import InMemoryStorage


def _dataset(id_="d"):
    data = np.zeros((2, 2, 1, 4), dtype=np.float64)
    return Dataset(id=id_, data=data, affine=np.eye(4),
                   b_values=np.arange(4.0), created_at=0.0)


@pytest.fixture
def storage():
    return InMemoryStorage(max_datasets=10, max_total_bytes=10**9, ttl_seconds=3600)


async def test_successful_job_lifecycle(storage):
    await storage.put_dataset(_dataset())

    def fake_fit(dataset, config, progress_cb):
        if progress_cb:
            progress_cb(0.5)
        return FitResult(maps={}, r_squared=None, summary={"ok": True})

    runner = InProcessJobRunner(storage, fit_fn=fake_fit)
    job_id = await runner.submit("d", FitConfig())
    await runner.wait(job_id)

    job = await storage.get_job(job_id)
    assert job.status is JobStatus.SUCCEEDED
    assert job.progress == 1.0
    assert job.result.summary == {"ok": True}
    assert job.finished_at is not None
    assert job_id not in runner._tasks


async def test_failed_fit_marks_job_failed(storage):
    await storage.put_dataset(_dataset())

    def boom(dataset, config, progress_cb):
        raise RuntimeError("fit exploded")

    runner = InProcessJobRunner(storage, fit_fn=boom)
    job_id = await runner.submit("d", FitConfig())
    await runner.wait(job_id)

    job = await storage.get_job(job_id)
    assert job.status is JobStatus.FAILED
    assert "fit exploded" in job.error


async def test_job_deleted_mid_fit_is_abandoned_cleanly(storage):
    """A dataset deleted while its fit runs cascades the job away; the runner
    must swallow the resulting NotFoundError instead of raising into the task.
    """
    await storage.put_dataset(_dataset())
    loop = asyncio.get_running_loop()
    started = asyncio.Event()
    release = False

    def slow_fit(dataset, config, progress_cb):
        loop.call_soon_threadsafe(started.set)
        # block the worker thread until the test deletes the dataset
        while not release:
            time.sleep(0.01)
        return FitResult(maps={}, r_squared=None, summary={})

    runner = InProcessJobRunner(storage, fit_fn=slow_fit)
    job_id = await runner.submit("d", FitConfig())
    await asyncio.wait_for(started.wait(), timeout=2)
    # job is RUNNING now; delete the dataset -> cascades the job record
    await storage.delete_dataset("d")
    release = True
    # must not raise; the task completes and the guard no-ops
    await runner.wait(job_id)
    assert await storage.get_job(job_id) is None


async def test_missing_dataset_fails_job(storage):
    def never_called(*a, **k):
        raise AssertionError("should not run")

    runner = InProcessJobRunner(storage, fit_fn=never_called)
    job_id = await runner.submit("absent", FitConfig())
    await runner.wait(job_id)

    job = await storage.get_job(job_id)
    assert job.status is JobStatus.FAILED
    assert "no longer available" in job.error


async def test_progress_callback_updates_job(storage):
    """Exercise the thread->loop progress bridge: the fit thread calls
    progress_cb, which schedules an update_job on the event loop, and that
    write must land on the job record while the fit is still running.
    """
    await storage.put_dataset(_dataset())
    observed = []

    def fit_with_progress(dataset, config, progress_cb):
        for p in (0.3, 0.6, 0.9):
            progress_cb(p)
            time.sleep(0.02)  # let the loop drain scheduled update_job tasks
        return FitResult(maps={}, r_squared=None, summary={})

    runner = InProcessJobRunner(storage, fit_fn=fit_with_progress)
    job_id = await runner.submit("d", FitConfig())
    # Sample progress mid-run: look for an intermediate value in (0, 1).
    for _ in range(50):
        await asyncio.sleep(0.01)
        p = (await storage.get_job(job_id)).progress
        if 0.0 < p < 1.0:
            observed.append(p)
            break
    await runner.wait(job_id)
    assert observed, "progress bridge never wrote an intermediate value to the job"
    assert (await storage.get_job(job_id)).progress == 1.0


async def test_job_capacity_is_bounded():
    storage = InMemoryStorage(
        max_datasets=10, max_total_bytes=10**9, ttl_seconds=3600, max_jobs=1
    )
    await storage.put_job(Job(id="one", dataset_id="d", config=FitConfig()))

    with pytest.raises(CapacityError):
        await storage.put_job(Job(id="two", dataset_id="d", config=FitConfig()))


async def test_result_capacity_counts_fit_maps():
    dataset = _dataset()
    storage = InMemoryStorage(
        max_datasets=10, max_total_bytes=dataset.nbytes + 1, ttl_seconds=3600
    )
    await storage.put_dataset(dataset)
    await storage.put_job(Job(id="one", dataset_id="d", config=FitConfig()))
    result = FitResult(
        maps={"d": SimpleNamespace(values=np.ones((2, 2, 1), dtype=np.float64))},
        r_squared=None,
        summary={},
    )

    with pytest.raises(CapacityError):
        await storage.update_job("one", result=result)

    assert await storage.total_bytes() == dataset.nbytes
    assert (await storage.get_job("one")).result is None


async def test_deleted_queued_dataset_is_not_retained_by_runner(storage):
    active, queued = _dataset("active"), _dataset("queued")
    await storage.put_dataset(active)
    await storage.put_dataset(queued)
    loop = asyncio.get_running_loop()
    started = asyncio.Event()
    released = False
    calls = []

    def slow_fit(dataset, config, progress_cb):
        calls.append(dataset.id)
        if dataset.id == "active":
            loop.call_soon_threadsafe(started.set)
            while not released:
                time.sleep(0.01)
        return FitResult(maps={}, r_squared=None, summary={})

    runner = InProcessJobRunner(storage, fit_fn=slow_fit)
    active_job = await runner.submit("active", FitConfig())
    await asyncio.wait_for(started.wait(), timeout=2)
    queued_job = await runner.submit("queued", FitConfig())
    await asyncio.sleep(0)
    queued_ref = weakref.ref(queued)
    try:
        assert (await storage.get_job(queued_job)).status is JobStatus.PENDING
        await storage.delete_dataset("queued")
        del queued
        gc.collect()
        assert queued_ref() is None
    finally:
        released = True
        await runner.wait(active_job)
        await runner.wait(queued_job)
    assert calls == ["active"]


async def test_deleted_jobs_cannot_bypass_runner_capacity(storage):
    runner = InProcessJobRunner(storage, max_jobs=1)
    await runner._semaphore.acquire()
    try:
        await storage.put_dataset(_dataset())
        job_id = await runner.submit("d", FitConfig())
        await storage.delete_dataset("d")
        with pytest.raises(CapacityError):
            await runner.submit("d", FitConfig())
    finally:
        runner._semaphore.release()
        await runner.wait(job_id)


async def test_result_capacity_failure_is_reported_as_failed_job():
    dataset = _dataset()
    storage = InMemoryStorage(1, dataset.nbytes, 3600)
    await storage.put_dataset(dataset)
    runner = InProcessJobRunner(storage, fit_fn=lambda *args: FitResult(
        maps={}, r_squared=np.ones((2, 2, 1)), summary={}
    ))
    job_id = await runner.submit("d", FitConfig())
    await runner.wait(job_id)
    job = await storage.get_job(job_id)
    assert job.status is JobStatus.FAILED
    assert job.result is None
    assert "limit" in job.error


def test_result_size_includes_quality_and_uncertainty_arrays():
    arrays = {
        "values": np.ones((2, 2, 1)),
        "affine": np.eye(4),
        "quality_mask": np.ones((2, 2, 1), dtype=bool),
        "uncertainty": np.ones((2, 2, 1)),
        "failure_reasons": np.full((2, 2, 1), "", dtype=object),
    }
    r_squared = np.ones((2, 2, 1))
    result = FitResult(maps={"d": SimpleNamespace(**arrays)}, r_squared=r_squared, summary={})
    assert result.nbytes == sum(a.nbytes for a in arrays.values()) + r_squared.nbytes
