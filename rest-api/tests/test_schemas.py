import numpy as np

from osipy_rest_api.core.domain import Dataset, FitConfig, Job, JobStatus
from osipy_rest_api.models.schemas import (
    DatasetMeta,
    FitRequest,
    JobView,
)


def test_fit_request_defaults_and_to_domain():
    req = FitRequest()
    cfg = req.to_domain()
    assert isinstance(cfg, FitConfig)
    assert cfg.method == "segmented"
    assert cfg.mask.percentile == 5.0


def test_fit_request_rejects_bad_percentile():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        FitRequest(mask={"type": "auto", "percentile": 150})


def test_dataset_meta_from_domain():
    ds = Dataset(id="abc", data=np.zeros((4, 4, 2, 8)), affine=np.eye(4),
                 b_values=np.array([0.0, 100.0, 800.0]), created_at=12.0)
    meta = DatasetMeta.from_domain(ds)
    assert meta.dataset_id == "abc"
    assert meta.shape == [4, 4, 2, 8]
    assert meta.b_values == [0.0, 100.0, 800.0]


def test_job_view_from_domain_succeeded():
    job = Job(id="j", dataset_id="d", config=FitConfig(),
              status=JobStatus.SUCCEEDED, progress=1.0)
    job.result = type("R", (), {"summary": {"fit_success_rate": 0.9}})()
    view = JobView.from_domain(job)
    assert view.status == "succeeded"
    assert view.summary == {"fit_success_rate": 0.9}


def test_job_view_from_domain_failed_has_error():
    job = Job(id="j", dataset_id="d", config=FitConfig(),
              status=JobStatus.FAILED, error="boom")
    view = JobView.from_domain(job)
    assert view.error == "boom"
    assert view.summary is None
