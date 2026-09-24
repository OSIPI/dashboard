"""End-to-end flow through the HTTP surface.

Upload a synthetic 4D NIfTI, start a segmented IVIM fit, poll it to
``succeeded``, download the D map (a 3D NIfTI), inspect a voxel, delete the
dataset, and confirm the map endpoint then reports 404 (deleting a dataset
cascades to its jobs).
"""

import asyncio
import gzip

import nibabel as nib
import numpy as np

from tests.fixtures.synthetic import bval_bytes, make_ivim_volume, nifti_bytes


async def test_upload_fit_poll_download_voxel(client):
    data, bvals = make_ivim_volume(shape=(6, 6, 3), noise_sigma=0.5, seed=1)
    affine = np.array([[0, -2, 0, 10], [3, 0, 0, -20], [0, 0, 4, 7], [0, 0, 0, 1]])

    upload = await client.post(
        "/datasets",
        files={
            "nifti": ("dwi.nii.gz", nifti_bytes(data, affine=affine), "application/gzip"),
            "bval": ("dwi.bval", bval_bytes(bvals), "text/plain"),
        },
    )
    assert upload.status_code == 201
    dataset_id = upload.json()["dataset_id"]

    start = await client.post(
        f"/datasets/{dataset_id}/fits",
        json={"method": "segmented", "b_threshold": 200.0},
    )
    assert start.status_code == 202
    job_id = start.json()["job_id"]

    async with asyncio.timeout(60):
        while True:
            body = (await client.get(f"/fits/{job_id}")).json()
            assert body["status"] != "failed", body
            if body["status"] == "succeeded":
                break
            await asyncio.sleep(0.05)

    assert body["summary"]["fit_success_rate"] is not None

    d_map = await client.get(f"/fits/{job_id}/maps/d")
    assert d_map.status_code == 200
    img = nib.Nifti1Image.from_bytes(gzip.decompress(d_map.content))
    assert img.shape == (6, 6, 3)
    np.testing.assert_array_equal(img.affine, affine)

    voxel = await client.get(f"/fits/{job_id}/voxel", params={"x": 3, "y": 3, "z": 1})
    assert voxel.status_code == 200
    assert len(voxel.json()["fitted_curve"]) == len(bvals)

    assert (await client.delete(f"/datasets/{dataset_id}")).status_code == 204
    assert (await client.get(f"/fits/{job_id}/maps/d")).status_code == 404
