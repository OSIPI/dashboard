# Local Imaging Data

This folder is for local challenge data. The data files are ignored by git; only this README is tracked.

## Acquired IVIM Brain (Dashboard)

From the dashboard directory, using the existing sibling osipy environment:

```sh
../osipy/.venv/bin/python scripts/prepare_ivim.py
../osipy/.venv/bin/python scripts/prepare_ivim.py --verify
bun run dev
```

Alternatively use Python 3.11+ with `numpy==2.3.5` and `nibabel==5.3.3` installed in an isolated environment. These are preparation-only dependencies, not a server. The script downloads with curl if needed, validates the archive size and MD5, extracts only four named brain files, prepares static assets and verifies every scaled voxel against nibabel. `--verify` makes no changes to imaging files and fails if outputs are absent or differ. Remove an invalid archive before retrying; it is never accepted silently.

### Provenance

- Dataset: Gurney-Champion, Oliver; Rashid, Ivan; van der Thiel, Merel; Kuppens, Daan; Voorter, Paulien; van Houdt, Petra; Peterson, Eric; Jalnefjord, Oscar (2025). _Data to https://github.com/OSIPI/TF2.4_IVIM-MRI_CodeCollection_. Zenodo, [10.5281/zenodo.14605039](https://doi.org/10.5281/zenodo.14605039).
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/), separate from the dashboard's MIT license.
- Exact source: <https://zenodo.org/api/records/14605039/files/OSIPI_TF24_data_phantoms.zip/content>.
- Archive: `OSIPI_TF24_data_phantoms.zip`, **245080480 bytes**, MD5 **e7b3fe1d811a7a45c5aaf6c604c82793**. Verified against both downloaded bytes and the Zenodo record.
- Selected members: `Data/brain.nii.gz`, `Data/brain.bval`, `Data/brain.bvec`, `Data/brain_readme.txt`. The archive separately contains simulated data under `Phantoms/brain/`; those are not used. No masks, segmentations or phantom parameter maps are applied.
- Acquisition README: “Scanned on a Philips 3T system. Vendor-provided DWI image registration was applied on console.” No further subject or acquisition claims are inferred.

### Inspected Data And Preparation

- NIfTI-1 gzip source: **36568932 bytes**; dimensions **112 x 112 x 56 x 85**; int16, little endian. Native voxel spacing approximately **2.402173995971679 x 2.402173995971679 x 2.880000114440918 mm**.
- Scaling retained exactly: `signal = raw * 55.58512496948242 + 0`. Scaled range: `0` to `227621.08675003052` a.u. No normalization, quantization, averaging, denoising, resampling or fitting.
- Original oblique scanner affine retained in the manifest; nearest axis codes LAS. Rendering uses x increasing right and y increasing down, with no flips. These are native slices, not a canonical anatomical axial reconstruction. Spatial aspect uses voxel spacing. Full affine maps original voxel indices to NIfTI RAS+ millimetres.
- All **85** b-values and b-vectors retained in original volume order. One b=0 volume, then six volumes each at **10, 20, 30, 40, 50, 60, 100, 200, 300, 400, 500, 600, 800, 1000 s/mm²**. Repeats remain distinct; no direction averaging or b-vector coordinate-system reinterpretation.
- Prepared `signal.i16`: **119418880 bytes**, raw little-endian int16, x fastest, then y, z, volume; SHA256 `8283e28d967d41eec33f037498a7e39701b3f6b18b5f4893e9824dd2bc1f4380`. `manifest.json` supplies dimensions, b-values/vectors, exact scaling, spacing, affine, provenance and a metadata-sensitive dataset identity.
- Default display window uses the source's 99th percentile, only for contrast. Signal inspection always uses unchanged scaled samples. All volumes are loaded together; allow memory for the 119 MB samples and download/checksum buffers, particularly on mobile.

### Local use and data hosting

Downloads, extraction and local verification outputs stay in gitignored `data/`. Do not stage, commit, package or publish them. Preparation is for local verification only. OSIPI Pages, GitHub Release archives and future GHCR images are built without MRI samples; the public dashboard imports the dataset directly from Zenodo in the browser. Release and container builds fail if local prepared data could enter an artifact.

## DCE Challenge References (Not Used By The Viewer)

## Download Synthetic Data

```bash
mkdir -p data/osipi-dce

curl -L --fail -o data/osipi-dce/OSIPI-DCE-Challenge-Guidelines.pdf https://osf.io/download/qagc3/
curl -L --fail -o data/osipi-dce/Synthetic_P1.zip https://osf.io/download/stmua/
curl -L --fail -o data/osipi-dce/Synthetic_P2.zip https://osf.io/download/atu59/
```

Expected downloads:

| File                                 |   Size | MD5                                |
| ------------------------------------ | -----: | ---------------------------------- |
| `OSIPI-DCE-Challenge-Guidelines.pdf` | 506 KB | `2144921e5e57b8cb92298064f5a4ccda` |
| `Synthetic_P1.zip`                   | 201 MB | `dbbd1d3802724892835748df5fbac2a5` |
| `Synthetic_P2.zip`                   | 202 MB | `7145ed7ebda6f9fd4d338dbf1d8901c2` |

## Download Challenge References

Use a sparse checkout for masks, scoring, and DRO reference maps:

```bash
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/OSIPI/TF6.2_DCE-DSC-MRI_Challenges.git \
  data/osipi-dce/challenge-repo

git -C data/osipi-dce/challenge-repo sparse-checkout set --no-cone \
  "/additionalDROData/**" \
  "/Scoring/challengeScoring.py" \
  "/Scoring/DROKtransNifti/**" \
  "/Scoring/Masks/**" \
  "/README.md" \
  "/OSIPI_DCE_Challenge_Guidelines.pdf"
```

## Unpack First Example

```bash
unzip data/osipi-dce/Synthetic_P1.zip -d data/osipi-dce/Synthetic_P1
```

Start with `Synthetic_P1`; add `Synthetic_P2` when challenge-style scoring is needed.
