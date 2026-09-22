import numpy as np
import pytest
from pydantic import ValidationError

from osipy_rest_api.config import Settings, get_settings
from osipy_rest_api.core.domain import Dataset, FitConfig, Job, JobStatus, MaskSpec
from osipy_rest_api.core.errors import CapacityError, NotFoundError


def test_settings_defaults():
    s = Settings()
    assert s.cors_origins == ["http://localhost:60010"]
    assert s.max_datasets == 5
    assert s.data_ttl_seconds == 3600


def test_settings_env_override(monkeypatch):
    monkeypatch.setenv("OSIPY_API_MAX_DATASETS", "9")
    assert Settings().max_datasets == 9


@pytest.mark.parametrize(
    "name", ["max_jobs", "max_datasets", "max_upload_bytes", "max_total_bytes"]
)
def test_capacity_settings_must_be_positive(name):
    with pytest.raises(ValidationError):
        Settings(**{name: 0})


def test_get_settings_is_cached():
    assert get_settings() is get_settings()


def test_fit_config_defaults():
    c = FitConfig()
    assert c.method == "segmented"
    assert c.b_threshold == 200.0
    assert c.mask == MaskSpec(type="auto", percentile=5.0)


def test_dataset_shape_and_nbytes():
    data = np.zeros((4, 4, 2, 8), dtype=np.float64)
    ds = Dataset(id="x", data=data, affine=np.eye(4),
                 b_values=np.arange(8.0), created_at=0.0)
    assert ds.shape == (4, 4, 2, 8)
    assert ds.nbytes == data.nbytes


def test_job_defaults():
    job = Job(id="j", dataset_id="d", config=FitConfig())
    assert job.status is JobStatus.PENDING
    assert job.progress == 0.0
    assert job.result is None


def test_errors_carry_status_codes():
    assert NotFoundError("nope").status_code == 404
    assert CapacityError("full").status_code == 429
