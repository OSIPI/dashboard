import numpy as np

from tests.fixtures.synthetic import (
    DEFAULT_B_VALUES,
    bval_bytes,
    make_ivim_volume,
    nifti_bytes,
)


def test_make_ivim_volume_shape_and_biexp_decay():
    data, b = make_ivim_volume(shape=(3, 3, 2))
    assert data.shape == (3, 3, 2, len(DEFAULT_B_VALUES))
    assert np.allclose(b, DEFAULT_B_VALUES)
    # Signal at b=0 equals s0; strictly decreasing in b for a clean voxel.
    voxel = data[0, 0, 0, :]
    assert np.isclose(voxel[0], 100.0)
    assert np.all(np.diff(voxel) < 0)


def test_make_ivim_volume_noise_is_seeded():
    a, _ = make_ivim_volume(noise_sigma=1.0, seed=42)
    b, _ = make_ivim_volume(noise_sigma=1.0, seed=42)
    assert np.array_equal(a, b)


def test_nifti_bytes_roundtrips_through_nibabel():
    import gzip

    import nibabel as nib

    data, _ = make_ivim_volume(shape=(2, 2, 2))
    raw = nifti_bytes(data, gzip=True)
    img = nib.Nifti1Image.from_bytes(gzip.decompress(raw))
    assert img.shape == data.shape
    assert np.allclose(img.get_fdata(), data)


def test_bval_bytes_format():
    out = bval_bytes(np.array([0.0, 10.0, 800.0]))
    assert out.decode().strip() == "0 10 800"
