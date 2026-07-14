# OSIPI DCE Challenge Data

This folder is for local challenge data. The data files are ignored by git; only this README is tracked.

## Download Synthetic Data

```bash
mkdir -p data/osipi-dce

curl -L --fail -o data/osipi-dce/OSIPI-DCE-Challenge-Guidelines.pdf https://osf.io/download/qagc3/
curl -L --fail -o data/osipi-dce/Synthetic_P1.zip https://osf.io/download/stmua/
curl -L --fail -o data/osipi-dce/Synthetic_P2.zip https://osf.io/download/atu59/
```

Expected downloads:

| File | Size | MD5 |
| --- | ---: | --- |
| `OSIPI-DCE-Challenge-Guidelines.pdf` | 506 KB | `2144921e5e57b8cb92298064f5a4ccda` |
| `Synthetic_P1.zip` | 201 MB | `dbbd1d3802724892835748df5fbac2a5` |
| `Synthetic_P2.zip` | 202 MB | `7145ed7ebda6f9fd4d338dbf1d8901c2` |

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
