# Local OSIPY companion

Runs actual IVIM fitting on the same computer as the browser. The viewer remains usable without it.

## Start

Requirements: Python 3.12+ and an installed OSIPY checkout with NumPy/nibabel. The integration is verified against OSIPY 0.1.1's public biexponential model and Levenberg–Marquardt batch API.

From the dashboard directory, if the sibling OSIPY checkout already has an environment:

```sh
../../osipy/.venv/bin/python companion/server.py
```

Otherwise, with OSIPY checked out at `../../osipy`:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -e ../../osipy
.venv/bin/python companion/server.py
```

On Windows use the environment's `Scripts/python.exe` instead of `bin/python`.

The companion binds only to **127.0.0.1:60016** and prints a random session token. Paste it into the dashboard's **IVIM analysis** connection form. An optional `OSIPY_DASHBOARD_TOKEN` environment value (at least 16 characters) can supply a token; it is never written into repository files. Do not publish the endpoint or disable authentication.

Development/preview origins on ports 60010/60014 and `https://osipi.github.io` are allowed. An additional exact origin may be supplied with `--origin`. The server checks both Host and Origin and authenticates all data/job requests. Tokens are sent in Authorization headers, not URLs.

## Execution and lifetime

- One CPU run at a time; cancellation terminates its worker process. A one-hour run limit applies.
- Source scalar values and scaling are retained. Repeated acquisitions are never averaged. Initial S₀ uses the first b=0 observation.
- The verified model/fitter is `biexponential` + `LevenbergMarquardtFitter.fit_batch`. Iteration limits, tolerance, bounds and optional initial values are applied to that API. Unintegrated registry entries are not advertised.
- Quality distinguishes invalid baseline, non-convergence, non-finite outputs, domain/bound checks, R²/RMSE thresholds and fitting errors. Unavailable estimates are NaN with explicit validity/status masks.
- Inputs and results live in a private temporary directory and are removed on clean shutdown (Ctrl+C/SIGTERM). Reconnect to inspect jobs after a browser reload; closing the tab does not cancel a running Python job.
- Up to six datasets/768 MiB of input data, five million spatial voxels per analysis grid, and ten retained runs. Restart the companion to release its dataset cache. No filesystem path supplied by the browser is executed or opened.
- No Slicer/ITK-SNAP launching, accounts, remote processing or automatic registration.

## Checks

```sh
../osipy/.venv/bin/python -m unittest discover -s companion -p 'test_*.py'
../osipy/.venv/bin/python companion/verify_bundle.py /path/to/osipy-viewer-bundle.zip
```

The bundle verifier checks hashes, NIfTI geometry/scaling, ROI labels, map/mask counts, CSV samples and Slicer-script syntax. It does not claim to validate a third-party GUI session.
