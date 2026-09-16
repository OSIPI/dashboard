import json

import numpy as np
from httpx import ASGITransport, AsyncClient

from osipy_rest_api.config import Settings
from osipy_rest_api.main import build_app
from tests.fixtures.synthetic import bval_bytes, make_ivim_volume, nifti_bytes


def _files(shape=(4, 4, 2), b=None):
    data, bvals = make_ivim_volume(shape=shape, b_values=b) if b is not None \
        else make_ivim_volume(shape=shape)
    return data, bvals


async def _upload(client, data, bvals, use_form=False):
    files = {"nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip")}
    if use_form:
        return await client.post("/datasets", files=files,
                                 data={"b_values": json.dumps([float(v) for v in bvals])})
    files["bval"] = ("dwi.bval", bval_bytes(bvals), "text/plain")
    return await client.post("/datasets", files=files)


async def test_upload_with_bval_file(client):
    data, bvals = _files()
    resp = await _upload(client, data, bvals)
    assert resp.status_code == 201
    body = resp.json()
    assert body["shape"] == [4, 4, 2, 8]
    assert body["b_values"][0] == 0.0
    assert "dataset_id" in body


async def test_upload_with_bvalues_form_field(client):
    data, bvals = _files()
    resp = await _upload(client, data, bvals, use_form=True)
    assert resp.status_code == 201


async def test_upload_dimension_mismatch(client):
    data, _ = _files()
    resp = await _upload(client, data, np.array([0.0, 100.0, 800.0]))  # 3 != 8
    assert resp.status_code == 422


async def test_upload_too_few_b_values(client):
    data, bvals = make_ivim_volume(shape=(4, 4, 2),
                                   b_values=np.array([0.0, 200.0, 800.0]))
    resp = await _upload(client, data, bvals)
    assert resp.status_code == 422


async def test_upload_missing_b_value_source(client):
    data, _ = _files()
    resp = await client.post(
        "/datasets",
        files={"nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip")},
    )
    assert resp.status_code == 422


async def test_upload_capacity_limit(client):
    # settings fixture sets max_datasets=3
    for _ in range(3):
        data, bvals = _files()
        assert (await _upload(client, data, bvals)).status_code == 201
    data, bvals = _files()
    assert (await _upload(client, data, bvals)).status_code == 429


async def test_get_and_delete_dataset(client):
    data, bvals = _files()
    dataset_id = (await _upload(client, data, bvals)).json()["dataset_id"]

    assert (await client.get(f"/datasets/{dataset_id}")).status_code == 200
    assert (await client.delete(f"/datasets/{dataset_id}")).status_code == 204
    assert (await client.get(f"/datasets/{dataset_id}")).status_code == 404


async def test_get_unknown_dataset(client):
    assert (await client.get("/datasets/nope")).status_code == 404


async def test_upload_too_large_is_413():
    # Build a dedicated app with a tiny upload cap so the NIfTI payload
    # (a few KB) is guaranteed to exceed it. FIX B makes the injected
    # Settings reach the datasets handler.
    app = build_app(Settings(
        cors_origins=["http://testserver"],
        max_datasets=3,
        max_total_bytes=50_000_000,
        data_ttl_seconds=3600,
        max_upload_bytes=100,
    ))
    data, bvals = make_ivim_volume(shape=(4, 4, 2))
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://testserver") as c,
        app.router.lifespan_context(app),
    ):
        resp = await c.post(
            "/datasets",
            files={
                "nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip"),
                "bval": ("dwi.bval", bval_bytes(bvals), "text/plain"),
            },
        )
    assert resp.status_code == 413
