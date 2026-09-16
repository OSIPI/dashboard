import asyncio
import gzip
import io
import zipfile

import nibabel as nib

from tests.fixtures.synthetic import bval_bytes, make_ivim_volume, nifti_bytes


async def _succeeded_job(client):
    data, bvals = make_ivim_volume(shape=(4, 4, 2), noise_sigma=0.0)
    dataset_id = (await client.post(
        "/datasets",
        files={
            "nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip"),
            "bval": ("dwi.bval", bval_bytes(bvals), "text/plain"),
        },
    )).json()["dataset_id"]
    job_id = (await client.post(f"/datasets/{dataset_id}/fits", json={})).json()["job_id"]
    async with asyncio.timeout(30):
        while True:
            body = (await client.get(f"/fits/{job_id}")).json()
            if body["status"] == "succeeded":
                return dataset_id, job_id
            assert body["status"] != "failed", body
            await asyncio.sleep(0.05)


async def test_download_single_map_before_completion_is_409(client, storage):
    import numpy as np

    from osipy_rest_api.core.domain import Dataset, FitConfig, Job, JobStatus

    ds = Dataset(id="d1", data=np.zeros((2, 2, 1, 4)), affine=np.eye(4),
                 b_values=np.arange(4.0), created_at=0.0)
    await storage.put_dataset(ds)
    await storage.put_job(Job(id="j1", dataset_id="d1", config=FitConfig(),
                              status=JobStatus.RUNNING))
    resp = await client.get("/fits/j1/maps/d")
    assert resp.status_code == 409
    assert resp.json()["detail"]


async def test_download_single_map_after_completion(client):
    _, job_id = await _succeeded_job(client)
    resp = await client.get(f"/fits/{job_id}/maps/d")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/gzip"
    assert 'filename="D.nii.gz"' in resp.headers["content-disposition"]
    img = nib.Nifti1Image.from_bytes(gzip.decompress(resp.content))
    assert img.ndim == 3


async def test_unknown_map_name_is_404(client):
    _, job_id = await _succeeded_job(client)
    assert (await client.get(f"/fits/{job_id}/maps/bogus")).status_code == 404


async def test_download_all_maps_zip(client):
    _, job_id = await _succeeded_job(client)
    resp = await client.get(f"/fits/{job_id}/maps")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    archive = zipfile.ZipFile(io.BytesIO(resp.content))
    assert set(archive.namelist()) == {"D.nii.gz", "D_star.nii.gz", "f.nii.gz", "S0.nii.gz"}


async def test_voxel_detail_happy_path(client):
    _, job_id = await _succeeded_job(client)
    resp = await client.get(f"/fits/{job_id}/voxel", params={"x": 1, "y": 1, "z": 0})
    assert resp.status_code == 200
    body = resp.json()
    assert body["voxel"] == [1, 1, 0]
    assert len(body["signal"]) == 8
    assert len(body["fitted_curve"]) == 8
    assert set(body["params"]) == {"d", "d_star", "f", "s0"}


async def test_voxel_out_of_bounds_is_422(client):
    _, job_id = await _succeeded_job(client)
    resp = await client.get(f"/fits/{job_id}/voxel", params={"x": 99, "y": 0, "z": 0})
    assert resp.status_code == 422


async def test_voxel_before_completion_is_409(client, storage):
    import numpy as np

    from osipy_rest_api.core.domain import Dataset, FitConfig, Job, JobStatus

    ds = Dataset(id="d1", data=np.zeros((2, 2, 1, 4)), affine=np.eye(4),
                 b_values=np.arange(4.0), created_at=0.0)
    await storage.put_dataset(ds)
    await storage.put_job(Job(id="j1", dataset_id="d1", config=FitConfig(),
                              status=JobStatus.RUNNING))
    resp = await client.get("/fits/j1/voxel", params={"x": 0, "y": 0, "z": 0})
    assert resp.status_code == 409


async def test_maps_unknown_job_is_404(client):
    assert (await client.get("/fits/nope/maps/d")).status_code == 404
