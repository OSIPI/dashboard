"""Focused dashboard contract, local HTTP guards, and cancellation tests."""

from __future__ import annotations

import asyncio
import time

import numpy as np

from osipy_rest_api.core.domain import Dataset, FitConfig, JobStatus
from osipy_rest_api.core.jobs import InProcessJobRunner
from osipy_rest_api.core.storage import InMemoryStorage
from tests.fixtures.synthetic import bval_bytes, make_ivim_volume, nifti_bytes


async def _upload(client):
    data, bvals = make_ivim_volume(shape=(3, 3, 2), noise_sigma=0.0)
    response = await client.post(
        "/datasets",
        files={
            "nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip"),
            "bval": ("dwi.bval", bval_bytes(bvals), "text/plain"),
        },
    )
    assert response.status_code == 201
    return response.json()["dataset_id"]


async def test_catalog_allows_unauthenticated_local_access_and_retains_guards(client):
    blocked_host = await client.get("/catalog", headers={"Host": "example.test:8000"})
    assert blocked_host.status_code == 403
    blocked_origin = await client.get(
        "/catalog", headers={"Origin": "https://attacker.example"}
    )
    assert blocked_origin.status_code == 403
    catalog = await client.get("/catalog")
    assert catalog.status_code == 200
    body = catalog.json()
    assert {model["id"] for model in body["models"]} == {"biexponential", "simplified"}
    assert set(body["models"][0]["fitter_strategies"]) == {"segmented", "full", "bayesian"}
    assert "max_iterations" not in body["defaults"]
    assert "tolerance" not in body["defaults"]
    assert body["effective_fitter_defaults"]["levenberg_marquardt"] == {
        "optimizer": "osipy.common.fitting.least_squares.LevenbergMarquardtFitter",
        "max_iterations": 100,
        "tolerance": 1e-6,
    }
    cors = await client.options(
        "/catalog",
        headers={
            "Origin": "http://localhost:60010",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert cors.status_code == 200
    assert cors.headers["access-control-allow-private-network"] == "true"


async def test_roi_scope_has_no_implicit_auto_mask_and_exports_quality_maps(client):
    # A single explicit voxel is selected even where an intensity auto-mask could
    # have excluded it. This is a real fit, not a mocked map contract.
    dataset_id = await _upload(client)
    started = await client.post(
        f"/datasets/{dataset_id}/fits",
        json={"scope": "voxel", "voxels": [[0, 0, 0]], "model": "simplified"},
    )
    assert started.status_code == 202
    job_id = started.json()["job_id"]
    async with asyncio.timeout(30):
        while (job := (await client.get(f"/fits/{job_id}")).json())["status"] not in {
            "succeeded",
            "failed",
        }:
            await asyncio.sleep(0.05)
    assert job["status"] == "succeeded", job
    assert job["summary"]["n_voxels_selected"] == 1
    assert job["summary"]["convergence"]["status"] == "unavailable"
    assert job["provenance"]["model"] == "simplified"
    assert job["provenance"]["status_policy"]["convergence"]["status"] == "unavailable"
    assert job["provenance"]["model_cutoff"] == 200.0
    assert (await client.get(f"/fits/{job_id}/maps/valid")).status_code == 200
    assert (await client.get(f"/fits/{job_id}/maps/status")).status_code == 200
    assert (await client.get(f"/fits/{job_id}/maps/d_star")).status_code == 404
    unselected = await client.get(f"/fits/{job_id}/voxel", params={"x": 1, "y": 1, "z": 1})
    assert unselected.status_code == 200
    assert unselected.json()["available"] is False
    assert unselected.json()["reason"] == "not_selected"
    assert unselected.json()["params"] is None
    assert unselected.json()["fitted_curve"] is None


async def test_running_job_cancels_at_progress_boundary():
    storage = InMemoryStorage(max_datasets=2, max_total_bytes=10**7, ttl_seconds=60)
    dataset = Dataset(
        id="dataset",
        data=np.ones((1, 1, 1, 4)),
        affine=np.eye(4),
        b_values=np.array([0.0, 100.0, 200.0, 800.0]),
        created_at=time.time(),
    )
    await storage.put_dataset(dataset)
    started = asyncio.Event()
    loop = asyncio.get_running_loop()

    def slow_fit(_dataset, _config, progress):
        loop.call_soon_threadsafe(started.set)
        while True:
            time.sleep(0.01)
            progress(0.2)

    runner = InProcessJobRunner(storage, fit_fn=slow_fit)
    job_id = await runner.submit("dataset", FitConfig())
    await asyncio.wait_for(started.wait(), timeout=2)
    cancelled = await runner.cancel(job_id)
    assert cancelled.status is JobStatus.CANCELLING
    await asyncio.wait_for(runner.wait(job_id), timeout=2)
    assert (await storage.get_job(job_id)).status is JobStatus.CANCELLED
