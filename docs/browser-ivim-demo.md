# Browser IVIM demo

`/browser-ivim` is an isolated, synthetic-signal demonstration of the same published OSIPY IVIM fitting API and effective settings used by the local REST backend. It runs Python in a dedicated Pyodide Web Worker. It does not call Docker, the REST API, or any remote fitting service, and it does not modify the acquired-image viewer.

This is research software and is not for clinical use.

## Run it

Development:

```sh
cd frontend
bun run dev
```

Open <http://localhost:60010/browser-ivim>. The production-base equivalent after `bun run build && bun run preview` is <http://127.0.0.1:60014/dashboard/browser-ivim>.

The first run in a new worker downloads:

- Pyodide `0.27.7` and its pinned NumPy package from `cdn.jsdelivr.net`;
- the published pure-Python `osipy-0.1.4-py3-none-any.whl` from `files.pythonhosted.org`.

The OSIPY wheel URL is versioned and has PyPI SHA-256 `60731701427f59be28f3c00166c752d17345bd4edce74030ac8295b8d024bf06`. The worker checks the imported OSIPY version before returning a result. CDN files may be cached by the browser, but offline availability is not guaranteed.

Only NumPy and the OSIPY wheel are installed. `micropip.install(..., deps=False)` is deliberate: OSIPY's IVIM fitting path used here needs NumPy, while the package's broader dependencies include the native `dcm2niix` executable, which cannot run in Pyodide and is unrelated to numeric IVIM fitting. This route accepts bounded numeric arrays only; it does not load DICOM, NIfTI, or scans.

## Inputs and supported fits

The initial values are explicitly labelled, noise-free synthetic biexponential samples with repeated b=0 acquisitions. Editing preserves every sample, including repeated b-values. Input limits are 4–64 paired samples, b-values from 0–10,000 s/mm², and finite positive signal up to 1e9. Segmented and Bayesian thresholds must split the samples into low and high groups.

The exposed combinations are exactly the OSIPY 0.1.4 combinations covered by the native fixture:

- `biexponential`: `segmented`, `full`, `bayesian`
- `simplified`: `segmented`, `full`, `bayesian`

As in the REST backend, `full` fitting forces the effective threshold to `0`. Simplified fits do not report D\*. The demo reports OSIPY's actual R² and measured compute time for that browser run. “REST quality policy passed” means that OSIPY attempted the fit, the estimate is finite and in the physical domain, and R² is greater than 0.5. OSIPY 0.1.4 batch fitting does not expose per-voxel convergence, so the UI states that convergence is unavailable rather than inferring it.

## Cancellation and privacy

Cancel terminates the Web Worker. This reliably prevents a cancelled or stale job from updating the UI, but discards the downloaded in-memory Python runtime; the next run is a cold reload. Navigating away also terminates the worker.

Signals and results stay in the browser worker. No scans are accepted or transmitted. Normal browser requests still download the pinned runtime and wheel from the disclosed public CDNs.

## Native comparison fixture

The checked-in fixture was generated with the dashboard REST environment's installed OSIPY `0.1.4`, not the neighboring newer OSIPY checkout. It runs the identical public `osipy.fit_ivim` call, `IVIMFitParams`, effective threshold, model, strategies, repeated inputs, and one-voxel shape used by the worker.

Verify all six native combinations against the fixture:

```sh
cd frontend
../rest-api/.venv/bin/python scripts/browser_ivim_native_fixture.py
```

The comparison tolerances are recorded in `scripts/fixtures/browser-ivim-native.json` (`rtol=1e-7`, `atol=1e-9`). To compare a browser run, leave the default arrays unchanged, select each model/strategy combination, run it, and compare D, f, S0, optional D\*, R², and effective threshold with the corresponding fixture entry. Browser compute time and runtime versions are provenance, not comparison fields.

Only refresh the fixture intentionally after checking the installed package version:

```sh
../rest-api/.venv/bin/python scripts/browser_ivim_native_fixture.py --write
```

Focused logic tests:

```sh
bun test scripts/browser-ivim.test.ts
```

## Browser verification

The production build was exercised in headless Chromium at `/dashboard/browser-ivim`:
all six combinations matched the native parameter and R² fixture values within
`rtol=1e-7`, `atol=1e-9`. Sequential UI fits and cancellation were exercised.
Desktop (1440×1000), mobile (390×844), and short mobile (320×600) checks found no
document overflow; mobile content remained reachable through internal scrolling.
OSIPY emits a bounds-based prior warning for the single-voxel Bayesian example.

This establishes a single synthetic voxel proof of concept, not whole-volume
performance, noisy-data accuracy, offline support, or compatibility with every
browser. The existing viewer and its optional REST backend remain unchanged.
