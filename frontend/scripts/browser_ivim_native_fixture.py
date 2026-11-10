"""Generate or verify browser-IVIM results with the REST API's OSIPY version."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import osipy
from osipy.common.backend import GPUConfig, set_backend
from osipy.ivim import fit_ivim
from osipy.ivim.fitting.estimators import FittingMethod, IVIMFitParams

EXPECTED_OSIPY = "0.1.4"
FIXTURE = Path(__file__).parent / "fixtures" / "browser-ivim-native.json"
B_VALUES = np.asarray([0, 0, 10, 50, 100, 200, 400, 800], dtype=float)
SIGNAL = 1000 * (
    (1 - 0.16) * np.exp(-B_VALUES * 0.0011) + 0.16 * np.exp(-B_VALUES * 0.018)
)


def generate() -> dict:
    if osipy.__version__ != EXPECTED_OSIPY:
        raise RuntimeError(f"expected OSIPY {EXPECTED_OSIPY}, found {osipy.__version__}")
    set_backend(GPUConfig(force_cpu=True, n_workers=1))
    combinations = []
    for model in ("biexponential", "simplified"):
        for method in ("segmented", "full", "bayesian"):
            threshold = 0.0 if method == "full" else 200.0
            result = fit_ivim(
                signal=SIGNAL.reshape(1, 1, 1, -1),
                b_values=B_VALUES,
                mask=np.ones((1, 1, 1), dtype=bool),
                params=IVIMFitParams(
                    method=FittingMethod(method),
                    b_threshold=threshold,
                    signal_model=model,
                ),
            )
            params = {
                "d": float(result.d_map.values[0, 0, 0]),
                "f": float(result.f_map.values[0, 0, 0]),
                "s0": float(result.s0_map.values[0, 0, 0]),
            }
            if model == "biexponential":
                params["dStar"] = float(result.d_star_map.values[0, 0, 0])
            combinations.append(
                {
                    "model": model,
                    "method": method,
                    "effectiveBThreshold": threshold,
                    "params": params,
                    "rSquared": float(result.r_squared[0, 0, 0]),
                }
            )
    return {
        "schema": 1,
        "osipyVersion": EXPECTED_OSIPY,
        "relativeTolerance": 1e-7,
        "absoluteTolerance": 1e-9,
        "input": {"bValues": B_VALUES.tolist(), "signal": SIGNAL.tolist()},
        "combinations": combinations,
    }


def compare(actual: object, expected: object, path: str, rel_tol: float, abs_tol: float) -> None:
    if isinstance(expected, float):
        if not isinstance(actual, (int, float)) or not math.isclose(
            float(actual), expected, rel_tol=rel_tol, abs_tol=abs_tol
        ):
            raise AssertionError(f"{path}: expected {expected!r}, got {actual!r}")
    elif isinstance(expected, dict):
        if not isinstance(actual, dict) or actual.keys() != expected.keys():
            raise AssertionError(f"{path}: object keys differ")
        for key in expected:
            compare(actual[key], expected[key], f"{path}.{key}", rel_tol, abs_tol)
    elif isinstance(expected, list):
        if not isinstance(actual, list) or len(actual) != len(expected):
            raise AssertionError(f"{path}: list length differs")
        for index, item in enumerate(expected):
            compare(actual[index], item, f"{path}[{index}]", rel_tol, abs_tol)
    elif actual != expected:
        raise AssertionError(f"{path}: expected {expected!r}, got {actual!r}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="replace the checked-in fixture")
    args = parser.parse_args()
    actual = generate()
    if args.write:
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(json.dumps(actual, indent=2) + "\n")
        print(f"wrote {FIXTURE}")
        return
    expected = json.loads(FIXTURE.read_text())
    compare(
        actual,
        expected,
        "fixture",
        float(expected["relativeTolerance"]),
        float(expected["absoluteTolerance"]),
    )
    print(f"verified {len(actual['combinations'])} combinations with OSIPY {osipy.__version__}")


if __name__ == "__main__":
    main()
