"""Prepare the acquired brain series, without resampling, averaging or fitting.

Run with Python containing numpy and nibabel. --verify checks existing outputs.
"""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

import nibabel as nib
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
URL = "https://zenodo.org/api/records/14605039/files/OSIPI_TF24_data_phantoms.zip/content"
MD5 = "e7b3fe1d811a7a45c5aaf6c604c82793"
SIZE = 245080480
SOURCE = ROOT / "data/ivim/Data"
OUTPUT = ROOT / "static/datasets/ivim-brain"


def prepare(verify=False):
    archive = ROOT / "data/OSIPI_TF24_data_phantoms.zip"
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        if verify:
            raise ValueError("Source archive missing; run preparation first")
        partial = archive.with_suffix(".zip.part")
        subprocess.run(["curl", "--fail", "--location", "--retry", "3", "--output", str(partial), URL], check=True)
        partial.replace(archive)
    with archive.open("rb") as stream:
        checksum = hashlib.file_digest(stream, "md5").hexdigest()
    if archive.stat().st_size != SIZE or checksum != MD5:
        raise ValueError("Archive size/checksum mismatch; remove the invalid archive and retry")
    if not verify:
        SOURCE.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive) as bundle:
            for name in ("brain.nii.gz", "brain.bval", "brain.bvec", "brain_readme.txt"):
                with bundle.open(f"Data/{name}") as src, (SOURCE / name).open("wb") as dst:
                    shutil.copyfileobj(src, dst)
    image = nib.load(SOURCE / "brain.nii.gz")
    raw = image.dataobj.get_unscaled()
    bvals = np.loadtxt(SOURCE / "brain.bval")
    bvecs = np.loadtxt(SOURCE / "brain.bvec").T
    if raw.ndim != 4 or raw.dtype != np.dtype("int16"):
        raise ValueError("Expected the inspected 4D int16 brain NIfTI")
    if bvals.shape != (raw.shape[3],) or bvecs.shape != (raw.shape[3], 3):
        raise ValueError("Diffusion metadata does not match volume count")
    slope, intercept = float(image.dataobj.slope), float(image.dataobj.inter)
    spacing = image.header.get_zooms()[:3]
    if not (np.isfinite(bvals).all() and (bvals >= 0).all() and np.isfinite(bvecs).all()
            and np.isfinite(image.affine).all() and np.isfinite([slope, intercept]).all()
            and slope > 0 and all(s > 0 for s in spacing)):
        raise ValueError("Invalid spatial, diffusion or scaling metadata")
    if image.header.get_xyzt_units()[0] != "mm":
        raise ValueError("Expected millimetre spatial units")
    # NIfTI order: x fastest, then y, z, volume. Keep integers and scaling separately.
    payload = raw.astype("<i2", copy=False).tobytes(order="F")
    digest = hashlib.sha256(payload).hexdigest()
    low, high = float(raw.min()) * slope + intercept, float(raw.max()) * slope + intercept
    display_high = float(np.percentile(raw, 99)) * slope + intercept
    metadata = {
        "schema": 1,
        "id": f"zenodo-14605039-brain-{digest}",
        "name": "OSIPI TF2.4 in-vivo brain",
        "dimensions": list(raw.shape),
        "spacing": [float(s) for s in spacing],
        "spatialUnit": "mm",
        "affine": image.affine.tolist(),
        "axisCodes": list(nib.aff2axcodes(image.affine)),
        "slope": slope, "intercept": intercept,
        "bValues": bvals.tolist(), "bVectors": bvecs.tolist(),
        "dtype": "int16-le", "order": "x-y-z-volume",
        "byteLength": len(payload), "sha256": digest,
        "signalRange": [low, high],
        "window": [display_high / 2, display_high],
        "source": {"url": URL, "archiveBytes": SIZE, "md5": MD5,
                   "member": "Data/brain.nii.gz", "doi": "10.5281/zenodo.14605039",
                   "license": "CC BY 4.0", "readme": (SOURCE / "brain_readme.txt").read_text().strip()},
    }
    metadata["id"] = "zenodo-14605039-brain-" + hashlib.sha256(
        json.dumps(metadata, sort_keys=True).encode()
    ).hexdigest()
    if not verify:
        OUTPUT.mkdir(parents=True, exist_ok=True)
        (OUTPUT / "signal.i16").write_bytes(payload)
        # Publish the manifest last so incomplete preparation fails validation.
        (OUTPUT / "manifest.json").write_text(json.dumps(metadata, indent=2) + "\n")
    actual = json.loads((OUTPUT / "manifest.json").read_text())
    if actual != metadata:
        raise ValueError("Prepared metadata differs from source")
    prepared = (OUTPUT / "signal.i16").read_bytes()
    if prepared != payload:
        raise ValueError("Prepared samples differ from source")
    restored = np.frombuffer(prepared, dtype="<i2").reshape(raw.shape, order="F")
    # Check every scaled voxel against nibabel, one volume at a time to bound memory.
    for volume in range(raw.shape[3]):
        np.testing.assert_array_equal(restored[..., volume] * slope + intercept,
                                      np.asarray(image.dataobj[..., volume]))
    print(f"Verified {raw.shape}, {len(payload)} bytes, scaled range {low}..{high}; SHA256 {digest}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    try:
        prepare(parser.parse_args().verify)
    except (OSError, ValueError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        parser.exit(1, f"IVIM preparation failed: {error}\n")
