import numpy as np
import pytest
from osipy.ivim.models.biexponential import IVIMSimplifiedModel

import osipy_rest_api.core.ivim as ivim
from osipy_rest_api.core.domain import Dataset, FitConfig, SelectionSpec
from osipy_rest_api.core.errors import InvalidInputError
from osipy_rest_api.core.ivim import (
    run_fit,
    validate_fit_config,
    voxel_detail,
)
from tests.fixtures.synthetic import make_ivim_volume


def _advertised_combinations() -> list[tuple[str, str]]:
    from osipy_rest_api.api.catalog import _catalog

    return [
        (model.id, method)
        for model in _catalog().models
        for method in model.fitter_strategies
    ]


def _dataset(noise=0.0, seed=0):
    data, b = make_ivim_volume(shape=(4, 4, 2), noise_sigma=noise, seed=seed)
    return Dataset(id="d", data=data, affine=np.eye(4), b_values=b, created_at=0.0)


def test_validate_fit_config_accepts_defaults():
    validate_fit_config(FitConfig(), _dataset())  # no raise


def test_validate_fit_config_rejects_b_threshold_out_of_range():
    ds = _dataset()
    with pytest.raises(InvalidInputError):
        validate_fit_config(FitConfig(b_threshold=5000.0), ds)


def test_full_biexponential_ignores_unused_b_threshold():
    result = run_fit(_dataset(), FitConfig(method="full", b_threshold=5000.0))
    assert result.summary["n_voxels_valid"] > 0


def test_validate_fit_config_rejects_empty_roi():
    with pytest.raises(InvalidInputError):
        validate_fit_config(FitConfig(selection=SelectionSpec(scope="roi")), _dataset())


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


@pytest.mark.parametrize(("model", "method"), _advertised_combinations())
def test_every_catalog_advertised_combination_runs_with_quality_outputs(model, method):
    """The catalog must never advertise an OSIPY model/strategy pair we cannot run."""
    result = run_fit(_dataset(noise=0.0), FitConfig(model=model, method=method))
    expected_maps = {"d", "f", "s0"}
    if model == "biexponential":
        expected_maps.add("d_star")
    assert set(result.maps) == expected_maps
    assert result.quality_mask.shape == result.status_map.shape == (4, 4, 2)
    assert np.all(result.status_map[result.quality_mask] == 1)
    assert np.all(np.isfinite(result.maps["d"].values[result.quality_mask]))
    for parameter_map in result.maps.values():
        assert np.all(np.isnan(parameter_map.values[~result.quality_mask]))
    if model == "simplified":
        assert "d_star" not in result.maps


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


@pytest.mark.parametrize(
    ("method", "requested_threshold", "effective_cutoff"),
    [("segmented", 50.0, 50.0), ("full", 50.0, 0.0)],
)
def test_simplified_voxel_curve_uses_effective_model_cutoff(
    method, requested_threshold, effective_cutoff
):
    b = np.array([0.0, 10.0, 20.0, 50.0, 100.0, 200.0, 400.0, 800.0])
    source_params = np.array([100.0, 1.2e-3, 0.2])
    data = np.broadcast_to(
        IVIMSimplifiedModel(effective_cutoff).predict(b, source_params), (2, 2, 1, len(b))
    ).copy()
    dataset = Dataset(id="simplified", data=data, affine=np.eye(4), b_values=b, created_at=0.0)
    result = run_fit(
        dataset,
        FitConfig(model="simplified", method=method, b_threshold=requested_threshold),
    )
    detail = voxel_detail(dataset, result, 0, 0, 0)
    assert result.model_cutoff == effective_cutoff
    assert result.provenance["model_cutoff"] == effective_cutoff
    assert detail["available"] is True
    fitted_params = detail["params"]
    expected = IVIMSimplifiedModel(effective_cutoff).predict(
        b, np.array([fitted_params["s0"], fitted_params["d"], fitted_params["f"]])
    )
    assert np.allclose(detail["fitted_curve"], expected)


def test_voxel_detail_rejects_out_of_bounds():
    ds = _dataset()
    result = run_fit(ds, FitConfig())
    with pytest.raises(InvalidInputError):
        voxel_detail(ds, result, 99, 0, 0)


def test_voxel_detail_marks_invalid_fit_unavailable_without_curve():
    ds = _dataset()
    ds.data[0, 0, 0, :] = 0.0  # selected but invalid/nonpositive baseline
    detail = voxel_detail(ds, run_fit(ds, FitConfig()), 0, 0, 0)
    assert detail["available"] is False
    assert detail["reason"] == "invalid_estimate"
    assert detail["params"] is None
    assert detail["fitted_curve"] is None


def test_low_r_squared_is_invalid_without_claiming_convergence(monkeypatch):
    """OSIPY's batch mask means "fit attempted", not converged/quality-valid."""
    shape = (1, 1, 1)

    def parameter_map(value):
        return type("ParameterMap", (), {"values": np.full(shape, value), "affine": np.eye(4)})()

    osipy_result = type(
        "OSIPYResult",
        (),
        {
            "d_map": parameter_map(1.2e-3),
            "d_star_map": parameter_map(20e-3),
            "f_map": parameter_map(0.15),
            "s0_map": parameter_map(100.0),
            "quality_mask": np.ones(shape, dtype=bool),
            "r_squared": np.full(shape, 0.2),
        },
    )()
    monkeypatch.setattr(ivim, "fit_ivim", lambda **_: osipy_result)
    dataset = Dataset(
        id="low-r2",
        data=np.full((*shape, 4), 100.0),
        affine=np.eye(4),
        b_values=np.array([0.0, 100.0, 200.0, 800.0]),
        created_at=0.0,
    )

    result = run_fit(dataset, FitConfig())

    assert result.status_map[0, 0, 0] == 2
    assert not result.quality_mask[0, 0, 0]
    assert all(np.isnan(parameter_map.values[0, 0, 0]) for parameter_map in result.maps.values())
    assert result.r_squared[0, 0, 0] == pytest.approx(0.2)
    assert result.summary["convergence"]["status"] == "unavailable"
    assert result.provenance["status_policy"]["convergence"]["status"] == "unavailable"


def test_missing_r_squared_does_not_certify_estimates(monkeypatch):
    shape = (1, 1, 1)

    def parameter_map(value):
        return type("ParameterMap", (), {"values": np.full(shape, value), "affine": np.eye(4)})()

    osipy_result = type(
        "OSIPYResult",
        (),
        {
            "d_map": parameter_map(1.2e-3),
            "d_star_map": parameter_map(20e-3),
            "f_map": parameter_map(0.15),
            "s0_map": parameter_map(100.0),
            "quality_mask": np.ones(shape, dtype=bool),
            "r_squared": None,
        },
    )()
    monkeypatch.setattr(ivim, "fit_ivim", lambda **_: osipy_result)
    dataset = Dataset(
        id="no-r2",
        data=np.full((*shape, 4), 100.0),
        affine=np.eye(4),
        b_values=np.array([0.0, 100.0, 200.0, 800.0]),
        created_at=0.0,
    )
    result = run_fit(dataset, FitConfig())
    assert result.status_map[0, 0, 0] == 2
    assert result.summary["n_voxels_valid"] == 0
    assert all(np.isnan(parameter_map.values[0, 0, 0]) for parameter_map in result.maps.values())
