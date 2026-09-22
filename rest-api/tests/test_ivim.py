import numpy as np
import pytest

from osipy_rest_api.core.domain import Dataset, FitConfig, MaskSpec
from osipy_rest_api.core.errors import InvalidInputError
from osipy_rest_api.core.ivim import (
    run_fit,
    validate_fit_config,
    voxel_detail,
)
from tests.fixtures.synthetic import make_ivim_volume


def _dataset(noise=0.0, seed=0):
    data, b = make_ivim_volume(shape=(4, 4, 2), noise_sigma=noise, seed=seed)
    return Dataset(id="d", data=data, affine=np.eye(4), b_values=b, created_at=0.0)


def test_validate_fit_config_accepts_defaults():
    validate_fit_config(FitConfig(), _dataset())  # no raise


def test_validate_fit_config_rejects_b_threshold_out_of_range():
    ds = _dataset()
    with pytest.raises(InvalidInputError):
        validate_fit_config(FitConfig(b_threshold=5000.0), ds)


def test_validate_fit_config_rejects_bad_percentile():
    with pytest.raises(InvalidInputError):
        validate_fit_config(FitConfig(mask=MaskSpec(percentile=0.0)), _dataset())


def test_run_fit_recovers_known_parameters():
    # Clean synthetic data with D=1.2e-3, D*=20e-3, f=0.15.
    result = run_fit(_dataset(noise=0.0), FitConfig())
    d = np.nanmean(result.maps["d"].values)
    f = np.nanmean(result.maps["f"].values)
    # Observed on noiseless data: d=1.2e-3, f=0.15 recovered to ~1e-16.
    # The loose tolerances hedge against osipy version drift in the segmented
    # estimator; tightening them is a scientific decision for the maintainer.
    assert d == pytest.approx(1.2e-3, rel=0.15)
    assert f == pytest.approx(0.15, abs=0.05)


def test_run_fit_preserves_dataset_affine_on_every_map():
    dataset = _dataset(noise=0.0)
    dataset.affine = np.array(
        [[0.0, -2.0, 0.0, 14.0], [3.0, 0.0, 0.0, -9.0], [0.0, 0.0, 4.0, 7.0], [0, 0, 0, 1]]
    )
    result = run_fit(dataset, FitConfig())

    for parameter_map in result.maps.values():
        assert np.array_equal(parameter_map.affine, dataset.affine)


def test_build_summary_shape():
    result = run_fit(_dataset(noise=0.0), FitConfig())
    summary = result.summary  # produced by build_summary inside run_fit
    assert set(summary["maps"]) == {"d", "d_star", "f", "s0"}
    assert "mean" in summary["maps"]["d"]
    assert "valid_fraction" in summary["maps"]["d"]
    assert "units" in summary["maps"]["d"]
    assert "fit_success_rate" in summary


def test_voxel_detail_curve_matches_signal_for_clean_voxel():
    ds = _dataset(noise=0.0)
    result = run_fit(ds, FitConfig())
    detail = voxel_detail(ds, result, 1, 1, 0)
    assert detail["voxel"] == [1, 1, 0]
    assert len(detail["signal"]) == len(ds.b_values)
    assert len(detail["fitted_curve"]) == len(ds.b_values)
    signal = np.array(detail["signal"])
    fitted = np.array(detail["fitted_curve"])
    # Clean data: fitted curve tracks the measured signal closely.
    assert np.allclose(fitted, signal, rtol=0.05, atol=1.0)


def test_voxel_detail_rejects_out_of_bounds():
    ds = _dataset()
    result = run_fit(ds, FitConfig())
    with pytest.raises(InvalidInputError):
        voxel_detail(ds, result, 99, 0, 0)
