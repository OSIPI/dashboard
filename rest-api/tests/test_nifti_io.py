import gzip
import io
import zipfile
from dataclasses import dataclass

import nibabel as nib
import numpy as np
import pytest

from osipy_rest_api.core.errors import InvalidInputError
from osipy_rest_api.core.nifti_io import (
    MAP_FILENAMES,
    maps_to_zip_bytes,
    parameter_map_to_nifti_bytes,
    parse_bval_bytes,
    parse_nifti_bytes,
)
from tests.fixtures.synthetic import make_ivim_volume, nifti_bytes


@dataclass
class FakeParameterMap:
    values: np.ndarray
    affine: np.ndarray


def test_parse_nifti_bytes_gzipped_roundtrip():
    data, _ = make_ivim_volume(shape=(3, 3, 2))
    out_data, affine = parse_nifti_bytes(nifti_bytes(data, gzip=True))
    assert out_data.shape == data.shape
    assert out_data.dtype == np.float64
    assert np.allclose(out_data, data, atol=1e-4)
    assert affine.shape == (4, 4)


def test_parse_nifti_bytes_plain_roundtrip():
    data, _ = make_ivim_volume(shape=(2, 2, 2))
    out_data, _ = parse_nifti_bytes(nifti_bytes(data, gzip=False), "upload.nii")
    assert np.allclose(out_data, data, atol=1e-4)


def test_parse_nifti_bytes_rejects_3d():
    img_3d = nib.Nifti1Image(np.zeros((4, 4, 4), np.float32), np.eye(4))
    with pytest.raises(InvalidInputError):
        parse_nifti_bytes(img_3d.to_bytes(), "x.nii")


def test_parse_nifti_bytes_rejects_garbage():
    with pytest.raises(InvalidInputError):
        parse_nifti_bytes(b"not a nifti file", "x.nii")


def test_parse_bval_bytes_multiline_and_whitespace():
    raw = b"0 10   20\n50 100 200\n400\t800\n"
    assert np.allclose(parse_bval_bytes(raw),
                       [0, 10, 20, 50, 100, 200, 400, 800])


def test_parse_bval_bytes_rejects_empty():
    with pytest.raises(InvalidInputError):
        parse_bval_bytes(b"   \n  ")


def test_parse_bval_bytes_rejects_nonnumeric():
    with pytest.raises(InvalidInputError):
        parse_bval_bytes(b"0 10 twenty")


def test_parameter_map_to_nifti_bytes_is_loadable():
    pm = FakeParameterMap(values=np.random.rand(4, 4, 2).astype(float),
                          affine=np.eye(4))
    raw = parameter_map_to_nifti_bytes(pm)
    img = nib.Nifti1Image.from_bytes(gzip.decompress(raw))
    assert img.shape == (4, 4, 2)
    assert np.allclose(img.get_fdata(), pm.values, atol=1e-5)


def test_maps_to_zip_bytes_has_four_named_entries():
    maps = {k: FakeParameterMap(np.zeros((2, 2, 2)), np.eye(4))
            for k in ("d", "d_star", "f", "s0")}
    archive = zipfile.ZipFile(io.BytesIO(maps_to_zip_bytes(maps)))
    assert set(archive.namelist()) == set(MAP_FILENAMES.values())
