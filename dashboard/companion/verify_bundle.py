"""Verify an exported ZIP without extracting files or launching external applications."""

import ast
import csv
import gzip
import hashlib
import io
import json
import sys
import zipfile

import nibabel as nib
import numpy as np


def verify(path):
    with zipfile.ZipFile(path) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["schema"] == 1
        for name, expected in manifest["checksums"].items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == expected, name

        def image(name):
            return nib.Nifti1Image.from_bytes(gzip.decompress(archive.read(name)))

        source = image(manifest["source"])
        for item in manifest["maps"] + manifest["rois"]:
            loaded = image(item["file"])
            assert loaded.shape[:3] == source.shape[:3]
            np.testing.assert_allclose(loaded.affine, source.affine, atol=1e-4)
            if "label" in item:
                values = loaded.get_fdata()
                assert set(np.unique(values)).issubset({0, item["label"]})
                assert int(np.sum(values == item["label"])) == item["voxelCount"]
        b = np.fromstring(archive.read("source.bval").decode(), sep=" ")
        assert len(b) == (source.shape[3] if len(source.shape) == 4 else 1)
        rows = list(
            csv.DictReader(io.StringIO(archive.read("selected-voxel.csv").decode()))
        )
        assert len(rows) == len(b)
        values = source.get_fdata()
        for i, row in enumerate(rows):
            position = tuple(int(row[k]) for k in ("x", "y", "z"))
            expected = values[position + (i,)] if values.ndim == 4 else values[position]
            np.testing.assert_allclose(float(row["signal_au"]), expected, rtol=1e-6)
        if manifest["hasAnalysis"]:
            report = json.loads(archive.read("analysis-report.json"))
            assert report["dataset"]["sha256"] == manifest["sourceHash"]
            assert (
                int(image("masks/valid.nii.gz").get_fdata().sum())
                == report["validVoxels"]
            )
            assert (
                int(image("masks/run-selection.nii.gz").get_fdata().sum())
                == report["selectedVoxels"]
            )
        ast.parse(archive.read("load-in-slicer.py").decode())
        return {
            "files": len(archive.namelist()),
            "maps": len(manifest["maps"]),
            "rois": len(manifest["rois"]),
            "shape": source.shape,
        }


if __name__ == "__main__":
    print(json.dumps(verify(sys.argv[1])))
