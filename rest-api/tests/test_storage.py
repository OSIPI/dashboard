import numpy as np
import pytest

from osipy_rest_api.core.domain import Dataset, FitConfig, Job
from osipy_rest_api.core.errors import CapacityError, NotFoundError
from osipy_rest_api.core.storage import InMemoryStorage


def _dataset(id_: str, created_at: float = 1000.0, voxels: int = 8) -> Dataset:
    data = np.zeros((voxels, 1, 1, 4), dtype=np.float64)
    return Dataset(id=id_, data=data, affine=np.eye(4),
                   b_values=np.arange(4.0), created_at=created_at)


@pytest.fixture
def storage() -> InMemoryStorage:
    return InMemoryStorage(max_datasets=3, max_total_bytes=10_000, ttl_seconds=3600)


async def test_put_and_get_dataset(storage):
    ds = _dataset("a")
    await storage.put_dataset(ds)
    assert await storage.get_dataset("a") is ds
    assert await storage.get_dataset("missing") is None


async def test_dataset_count_cap(storage):
    for i in range(3):
        await storage.put_dataset(_dataset(str(i)))
    with pytest.raises(CapacityError):
        await storage.put_dataset(_dataset("overflow"))


async def test_dataset_byte_cap():
    s = InMemoryStorage(max_datasets=100, max_total_bytes=500, ttl_seconds=3600)
    await s.put_dataset(_dataset("a", voxels=8))   # 8*4*8 = 256 bytes
    with pytest.raises(CapacityError):
        await s.put_dataset(_dataset("b", voxels=16))  # +512 -> over 500


async def test_delete_dataset_cascades_to_jobs(storage):
    await storage.put_dataset(_dataset("a"))
    await storage.put_job(Job(id="j1", dataset_id="a", config=FitConfig()))
    await storage.put_job(Job(id="j2", dataset_id="other", config=FitConfig()))
    assert await storage.delete_dataset("a") is True
    assert await storage.get_job("j1") is None
    assert await storage.get_job("j2") is not None


async def test_update_job_in_place_and_unknown(storage):
    await storage.put_job(Job(id="j", dataset_id="d", config=FitConfig()))
    await storage.update_job("j", progress=0.5, error="boom")
    job = await storage.get_job("j")
    assert job.progress == 0.5
    assert job.error == "boom"
    with pytest.raises(NotFoundError):
        await storage.update_job("nope", progress=1.0)


async def test_sweep_evicts_expired(storage):
    await storage.put_dataset(_dataset("old", created_at=0.0))
    await storage.put_job(Job(id="j", dataset_id="old", config=FitConfig(),
                              created_at=0.0))
    await storage.put_dataset(_dataset("fresh", created_at=10_000.0))
    removed = await storage.sweep(now=10_000.0)
    assert removed == 2  # old dataset + its job
    assert await storage.get_dataset("old") is None
    assert await storage.get_dataset("fresh") is not None


async def test_clear(storage):
    await storage.put_dataset(_dataset("a"))
    await storage.clear()
    assert await storage.list_datasets() == []
