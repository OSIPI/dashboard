import json
import struct
import tempfile
import unittest
from pathlib import Path

import numpy as np
from core import model_catalog, run_fit, unpack_dataset, validate_config


class FitTests(unittest.TestCase):
    def test_catalog_separates_runnable_methods_from_library(self):
        catalog = model_catalog()
        self.assertEqual([model["id"] for model in catalog["models"]], ["biexponential"])
        sections = {item["technique"]: item["groups"] for item in catalog["library"]}
        self.assertEqual(set(sections), {"IVIM", "DCE", "DSC", "ASL"})
        self.assertIn("simplified", sections["IVIM"][0]["methods"])
        self.assertIn("tofts", sections["DCE"][0]["methods"])

    def test_real_osipy_fit_and_geometry_order(self):
        b = np.array([0, 10, 20, 50, 100, 200, 400, 800.0])
        signal = 1000 * (0.8 * np.exp(-b * 0.001) + 0.2 * np.exp(-b * 0.02))
        values = np.repeat(signal[:, None], 8, axis=1).astype("<f4")
        meta = {
            "name": "Synthetic test only",
            "dimensions": [2, 2, 2, 8],
            "dtype": "float32",
            "bValues": b.tolist(),
            "affine": np.diag([2, 3, 4, 1]).tolist(),
            "slope": 1,
            "intercept": 0,
            "spatialUnit": "mm",
            "sha256": "a" * 64,
        }
        header = json.dumps(meta).encode()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            unpack_dataset(
                struct.pack("<I", len(header)) + header + values.tobytes(),
                root / "input",
            )
            progress = []
            report = run_fit(
                root / "input",
                root / "output",
                model_catalog()["defaults"],
                "roi",
                [1, 6],
                progress.append,
            )
            self.assertEqual(report["validVoxels"], 2)
            self.assertEqual(progress[-1], 1)
            maps = np.load(root / "output" / "maps.npz")
            np.testing.assert_allclose(maps["D"][[1, 6]], 0.001, rtol=0.001)
            np.testing.assert_allclose(maps["D*"][[1, 6]], 0.02, rtol=0.001)
            np.testing.assert_allclose(maps["f"][[1, 6]], 0.2, rtol=0.001)
            self.assertEqual(maps["Status"][0], 0)
            self.assertTrue(np.isnan(maps["D"][0]))

    def test_invalid_config_is_rejected(self):
        meta = {"bValues": [0, 10, 20, 100, 200, 800]}
        defaults = model_catalog()["defaults"]
        for change in (
            {"iterations": 0},
            {"tolerance": float("nan")},
            {"bounds": {"f": [1, 0]}},
            {"model": "made-up"},
            {"initial": {"D": -1}},
        ):
            with self.assertRaises(ValueError):
                validate_config({**defaults, **change}, meta)


if __name__ == "__main__":
    unittest.main()
