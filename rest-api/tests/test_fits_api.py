import asyncio

from tests.fixtures.synthetic import bval_bytes, make_ivim_volume, nifti_bytes


async def _make_dataset(client, noise=0.0):
    data, bvals = make_ivim_volume(shape=(4, 4, 2), noise_sigma=noise)
    resp = await client.post(
        "/datasets",
        files={
            "nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip"),
            "bval": ("dwi.bval", bval_bytes(bvals), "text/plain"),
        },
    )
    return resp.json()["dataset_id"]


async def _poll(client, job_id, timeout=30.0):
    async with asyncio.timeout(timeout):
        while True:
            body = (await client.get(f"/fits/{job_id}")).json()
            if body["status"] in ("succeeded", "failed"):
                return body
            await asyncio.sleep(0.05)


async def test_start_fit_returns_202_and_job_id(client):
    dataset_id = await _make_dataset(client)
    resp = await client.post(f"/datasets/{dataset_id}/fits", json={"method": "segmented"})
    assert resp.status_code == 202
    assert resp.json()["status"] == "pending"
    assert "job_id" in resp.json()


async def test_start_fit_unknown_dataset(client):
    resp = await client.post("/datasets/nope/fits", json={})
    assert resp.status_code == 404


async def test_start_fit_bad_config(client):
    dataset_id = await _make_dataset(client)
    resp = await client.post(
        f"/datasets/{dataset_id}/fits", json={"b_threshold": 99999}
    )
    assert resp.status_code == 422


async def test_start_fit_rejects_non_effective_optimizer_control(client):
    dataset_id = await _make_dataset(client)
    resp = await client.post(
        f"/datasets/{dataset_id}/fits", json={"max_iterations": 5}
    )
    assert resp.status_code == 422


async def test_fit_runs_to_succeeded_with_summary(client):
    dataset_id = await _make_dataset(client, noise=0.0)
    job_id = (await client.post(f"/datasets/{dataset_id}/fits", json={})).json()["job_id"]
    body = await _poll(client, job_id)
    assert body["status"] == "succeeded"
    assert body["progress"] == 1.0
    assert set(body["summary"]["maps"]) == {"d", "d_star", "f", "s0"}


async def test_delete_completed_fit_reclaims_its_retained_job_record(client):
    dataset_id = await _make_dataset(client, noise=0.0)
    job_id = (await client.post(f"/datasets/{dataset_id}/fits", json={})).json()["job_id"]
    assert (await _poll(client, job_id))["status"] == "succeeded"

    assert (await client.delete(f"/fits/{job_id}/retained")).status_code == 204
    assert (await client.get(f"/fits/{job_id}")).status_code == 404


async def test_cancel_after_fit_completes_preserves_result_for_map_download(client):
    dataset_id = await _make_dataset(client, noise=0.0)
    job_id = (await client.post(f"/datasets/{dataset_id}/fits", json={})).json()["job_id"]
    assert (await _poll(client, job_id))["status"] == "succeeded"

    response = await client.delete(f"/fits/{job_id}")
    assert response.status_code == 200
    assert response.json()["status"] == "succeeded"
    assert (await client.get(f"/fits/{job_id}/maps/d")).status_code == 200


async def test_get_unknown_job(client):
    assert (await client.get("/fits/deadbeef")).status_code == 404
