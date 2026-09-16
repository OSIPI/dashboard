# osipy IVIM REST API — Design

**Date:** 2026-09-09
**Status:** Approved for implementation planning
**Scope:** Prototype REST API backend for IVIM perfusion analysis, to serve as the
backend for the OSIPI dashboard frontend.

## 1. Purpose & Context

Build a REST API that wraps the [osipy](https://osipi.github.io/osipy/) perfusion
analysis toolkit (installed version 0.1.4) and exposes IVIM (intravoxel incoherent
motion) diffusion analysis to a web frontend. The frontend is the
[OSIPI dashboard](https://github.com/OSIPI/dashboard) (SvelteKit, runs on
`http://localhost:60010`), which currently has no backend.

This prototype covers **only the IVIM modality**. DCE, DSC, and ASL are explicitly
out of scope but the structure should not preclude adding them later.

### Key constraints (from stakeholder)

- **Local-first.** Users run this backend on their own machine. Single user, single
  process. No authentication for the prototype.
- **Sensitive data.** Uploaded DWI volumes must not be persisted to disk. All state
  is held in memory and cleared on process exit / TTL expiry.
- **Async fitting.** Whole-volume IVIM fits take seconds to minutes. Fits run as
  background jobs; the client polls for status and progress.
- **Future work (design for, do not build):** optional disk persistence, batch
  processing of multiple datasets.

## 2. Architecture

A single FastAPI process, run via `uv run uvicorn`. Three layers:

```
src/osipy_rest_api/
  main.py            # FastAPI app, CORS, router wiring, lifespan (start/stop sweep task)
  config.py          # pydantic-settings; env-overridable
  api/
    datasets.py      # POST /datasets, GET/DELETE /datasets/{id}
    fits.py          # POST /datasets/{id}/fits, GET /fits/{job_id}
    results.py       # GET /fits/{job_id}/maps[/{name}], GET /fits/{job_id}/voxel
    meta.py          # GET /health, GET /
  core/
    storage.py       # Storage Protocol + InMemoryStorage (TTL eviction, size/count caps)
    jobs.py          # JobRunner Protocol + InProcessJobRunner (asyncio.to_thread, progress)
    ivim.py          # the ONLY module that imports osipy; fit execution + voxel curves
    nifti_io.py      # parse uploaded .nii.gz/.bval from memory; ParameterMap -> .nii.gz bytes
  models/
    schemas.py       # Pydantic request/response models
tests/
  conftest.py
  fixtures/make_synthetic.py
  test_datasets.py  test_fits.py  test_results.py
  test_storage.py  test_jobs.py  test_nifti_io.py
  test_ivim_integration.py
```

### Layer responsibilities

1. **`api/`** — HTTP handlers only. Parse and validate requests via Pydantic, call
   `core/`, shape responses. Must not import osipy and must not touch storage dicts
   directly (goes through the `Storage` interface).
2. **`core/`** — the two abstraction seams plus osipy isolation:
   - `storage.py`: `Storage` Protocol; `InMemoryStorage` implementation.
   - `jobs.py`: `JobRunner` Protocol; `InProcessJobRunner` implementation.
   - `ivim.py`: all osipy calls behind one module.
   - `nifti_io.py`: in-memory NIfTI parsing/serialization via nibabel (no temp files).
3. **`models/schemas.py`** — shared Pydantic request/response models.

### Dependency injection

`Storage` and `JobRunner` are constructed in the app lifespan and provided to
handlers via FastAPI dependencies. Tests substitute their own instances. Swapping
`InMemoryStorage` for a future disk-backed implementation, or `InProcessJobRunner`
for a queue-backed one, must not require changes in `api/`.

### Request flow (fit a dataset)

```
POST /datasets  (multipart: nifti + bval|b_values)
  -> nifti_io.parse_upload(buffer)  -> (data 4D, affine)
  -> validate: 4D, len(b_values) == shape[3], >= 4 b-values, at least one b ~ 0
  -> storage.put_dataset(Dataset{...})            -> 201 {dataset_id, shape, b_values, created_at}

POST /datasets/{id}/fits  (JSON: method, b_threshold, mask)
  -> storage.get_dataset(id) or 404
  -> ivim.validate_config(config, dataset) or 422
  -> jobs.submit(dataset_id, config)              -> 202 {job_id, status: "pending"}

GET /fits/{job_id}
  -> storage.get_job(job_id) or 404
  -> {status: "running", progress: 0.42}  ... then
  -> {status: "succeeded", config, summary: {...}}

GET /fits/{job_id}/maps/{name}    name in {d, d_star, f, s0}
  -> 409 if job status != "succeeded"
  -> nifti_io.parameter_map_to_nifti_bytes(map) -> 200 application/gzip attachment

GET /fits/{job_id}/maps          -> 200 application/zip of all four maps

GET /fits/{job_id}/voxel?x=&y=&z=
  -> 409 if not succeeded; 422 if out of bounds
  -> {b_values, signal, params, fitted_curve, r_squared}
```

### Error handling

| Situation | Response |
|---|---|
| Malformed request body / dimension mismatch / too few b-values | 422 with field detail |
| Unknown or evicted dataset / job | 404 |
| Upload exceeds `MAX_UPLOAD_BYTES` | 413 |
| Dataset count/byte cap reached | 429 |
| Map download or voxel query before job `succeeded` | 409 |
| Voxel coordinates out of bounds | 422 |
| Fit raises inside the job | job `status: "failed"`, `error` message; poll returns HTTP 200 |
| Fit completes but all voxels fail | job `status: "succeeded"`, `summary.fit_success_rate: 0.0` (not an error) |

The job-status endpoint always returns HTTP 200 for a known job; the job's own
`status` field carries success/failure of the computation.

## 3. Data Model

Plain dataclasses held in `InMemoryStorage`. No ORM, no serialization to disk.

```python
@dataclass
class Dataset:
    id: str                       # uuid4 hex
    data: np.ndarray              # 4D float32/float64 (x, y, z, b) DWI volume
    affine: np.ndarray           # 4x4 from the uploaded NIfTI
    b_values: np.ndarray         # 1D float, length == data.shape[3]
    shape: tuple[int, int, int, int]
    created_at: float            # time.time()
    nbytes: int                  # data.nbytes, for the memory cap

@dataclass
class MaskSpec:
    type: Literal["auto"]        # only "auto" for the prototype
    percentile: float = 5.0

@dataclass
class FitConfig:
    method: Literal["segmented", "full", "bayesian"] = "segmented"
    b_threshold: float = 200.0
    mask: MaskSpec = field(default_factory=MaskSpec)

@dataclass
class FitResult:
    maps: dict[str, "ParameterMap"]      # keys: "d", "d_star", "f", "s0"
    r_squared: np.ndarray | None
    summary: dict                         # see below

@dataclass
class Job:
    id: str                              # uuid4 hex
    dataset_id: str
    config: FitConfig
    status: Literal["pending", "running", "succeeded", "failed"]
    progress: float                      # 0.0 - 1.0
    created_at: float
    finished_at: float | None
    result: FitResult | None
    error: str | None
```

`ParameterMap` is `osipy.common.parameter_map.ParameterMap`; relevant attributes:
`.values` (ndarray), `.affine` (4x4), `.units` (str), `.name`, `.symbol`,
`.quality_mask`, `.statistics()` -> `{mean, std, min, max, median}` over valid voxels,
`.valid_fraction`.

### `summary` shape

```jsonc
{
  "fit_success_rate": 0.98,          // from IVIMFitResult.fitting_stats
  "n_voxels_fitted": 12345,
  "n_voxels_total": 12600,
  "maps": {
    "d":      { "mean": 0.0012, "median": 0.0012, "std": 2.7e-5,
                "min": 0.0009, "max": 0.0021, "valid_fraction": 0.98,
                "units": "mm^2/s" },
    "d_star": { ... }, "f": { ... }, "s0": { ... }
  }
}
```

## 4. Storage (`core/storage.py`)

### `Storage` Protocol

```python
class Storage(Protocol):
    async def put_dataset(self, ds: Dataset) -> None: ...
    async def get_dataset(self, dataset_id: str) -> Dataset | None: ...
    async def delete_dataset(self, dataset_id: str) -> bool: ...   # also deletes its jobs
    async def list_datasets(self) -> list[Dataset]: ...
    async def total_bytes(self) -> int: ...

    async def put_job(self, job: Job) -> None: ...
    async def get_job(self, job_id: str) -> Job | None: ...
    async def update_job(self, job_id: str, **fields) -> None: ...
    async def list_jobs(self) -> list[Job]: ...
```

### `InMemoryStorage`

- Two dicts `_datasets`, `_jobs`, guarded by a single `asyncio.Lock`.
- **Cap enforcement** on `put_dataset`: raise `CapacityError` (handler -> 429) if
  `len(_datasets) >= MAX_DATASETS` or `total_bytes + ds.nbytes > MAX_TOTAL_BYTES`.
  In-use data is never auto-evicted to make room.
- **TTL eviction:** `sweep()` coroutine removes datasets and jobs whose
  `created_at` is older than `DATA_TTL_SECONDS`. Deleting a dataset cascades to its
  jobs. Started as a background task in the app lifespan; interval = min(TTL/4, 300s).
- **Shutdown:** lifespan calls `storage.clear()` which empties both dicts and drops
  references, so large volumes do not linger.

## 5. Jobs (`core/jobs.py`)

### `JobRunner` Protocol

```python
class JobRunner(Protocol):
    async def submit(self, dataset_id: str, config: FitConfig) -> str: ...  # returns job_id
```

### `InProcessJobRunner`

- On `submit`: create a `Job` (status `pending`), `storage.put_job(job)`, schedule
  `_run(job_id)` as an `asyncio` task, return `job_id`.
- `_run`:
  1. `storage.update_job(id, status="running")`
  2. `dataset = await storage.get_dataset(job.dataset_id)` (guard: may have been
     evicted -> mark `failed`, `error="dataset no longer available"`)
  3. `result = await asyncio.to_thread(ivim.run_fit, dataset, job.config, progress_cb)`
     where `progress_cb(frac)` schedules `storage.update_job(id, progress=frac)` on
     the loop (thread-safe via `loop.call_soon_threadsafe`).
  4. On success: `storage.update_job(id, status="succeeded", progress=1.0,
     result=result, finished_at=now)`
  5. On exception: `storage.update_job(id, status="failed", error=str(exc),
     finished_at=now)`; log the traceback.
- **Concurrency:** a module-level `asyncio.Semaphore(1)` around the `to_thread`
  call — one fit at a time for the prototype. Batch processing would widen this and
  add a queue; the Protocol does not change.

## 6. osipy Integration (`core/ivim.py`)

The only module importing osipy. Verified against osipy 0.1.4.

### `run_fit(dataset, config, progress_callback) -> FitResult`

```python
from osipy import fit_ivim
from osipy.ivim.fitting.estimators import FittingMethod, IVIMFitParams

def run_fit(dataset, config, progress_callback):
    b0_index = int(dataset.b_values.argmin())
    b0 = dataset.data[..., b0_index]
    mask = _auto_mask(b0, config.mask.percentile)   # b0 > percentile(b0[b0 > 0], p)

    params = IVIMFitParams(
        method=FittingMethod(config.method),
        b_threshold=config.b_threshold,
    )
    result = fit_ivim(
        signal=dataset.data,
        b_values=dataset.b_values,
        mask=mask,
        params=params,
        progress_callback=progress_callback,   # osipy calls this with a float 0..1
    )
    return _to_fit_result(result)
```

### `_to_fit_result(result: IVIMFitResult) -> FitResult`

- `maps = {"d": result.d_map, "d_star": result.d_star_map, "f": result.f_map,
  "s0": result.s0_map}`
- `r_squared = result.r_squared`  (ndarray or None)
- `summary`: per-map `ParameterMap.statistics()` + `valid_fraction` + `units`,
  merged with `result.fitting_stats` (`fit_success_rate`, `n_voxels_fitted`,
  `n_voxels_total`).

### `validate_config(config, dataset)`

- `method` in the allowed set (Pydantic already enforces).
- `b_threshold` within `[min(b_values), max(b_values)]`; at least one b-value below
  and one at/above it (required for the segmented method). Otherwise 422.
- `mask.percentile` in `(0, 100)`.

### `voxel_detail(dataset, fit_result, x, y, z)`

```python
from osipy.ivim.models.biexponential import IVIMBiexponentialModel, IVIMParams

def voxel_detail(dataset, fit_result, x, y, z):
    _check_bounds(dataset.shape, x, y, z)            # else ValueError -> 422
    signal = dataset.data[x, y, z, :]
    p = {k: float(fit_result.maps[k].values[x, y, z])
         for k in ("d", "d_star", "f", "s0")}
    model = IVIMBiexponentialModel()
    fitted = _evaluate_model(model, dataset.b_values,
                             IVIMParams(s0=p["s0"], d=p["d"],
                                        d_star=p["d_star"], f=p["f"]))
    r2 = None if fit_result.r_squared is None else float(fit_result.r_squared[x, y, z])
    return signal.tolist(), p, fitted.tolist(), r2
```

`_evaluate_model` wraps the exact model call (`.signal()` vs `.predict()` vs
`__call__`) — resolved during TDD against the installed package. If no suitable
method exists, fall back to evaluating the closed-form biexponential directly:
`S(b) = s0 * (f * exp(-b * d_star) + (1 - f) * exp(-b * d))`.

## 7. NIfTI I/O (`core/nifti_io.py`)

Uses `nibabel` directly (an osipy dependency, already installed). No temp files.

```python
def parse_upload(nifti_bytes: bytes, filename: str) -> tuple[np.ndarray, np.ndarray]:
    """Load a .nii or .nii.gz from an in-memory buffer.
    Returns (data, affine). Raises ValueError if not 4D."""

def parse_bval(bval_bytes: bytes) -> np.ndarray:
    """FSL .bval: whitespace-separated numbers on one or more lines."""

def parameter_map_to_nifti_bytes(pm: ParameterMap) -> bytes:
    """Nifti1Image(pm.values.astype(float32), pm.affine) -> gzipped bytes."""

def maps_to_zip_bytes(maps: dict[str, ParameterMap]) -> bytes:
    """Zip of D.nii.gz, D_star.nii.gz, f.nii.gz, S0.nii.gz."""
```

nibabel reads from a buffer via `nibabel.Nifti1Image.from_bytes` (uncompressed) or,
for `.nii.gz`, `nibabel.load` on a `nibabel.FileHolder` wrapping a
`gzip.GzipFile(fileobj=BytesIO(...))`. Writing: `img.to_bytes()` for `.nii`, or
serialize through a `BytesIO` + `GzipFile` for `.nii.gz`. Exact mechanism confirmed
in `test_nifti_io.py` round-trip tests.

`osipy.load_nifti` requires a filesystem path, so it is bypassed for the upload
path. It would only be used if sample-data-from-disk is added later.

## 8. API Contract

### Datasets

**`POST /datasets`** — `multipart/form-data`
- `nifti`: file, `.nii` or `.nii.gz`, must be 4D
- `bval`: file (FSL `.bval` format) — OR — `b_values`: form field, JSON array
  (exactly one required)
- Validation: NIfTI loads and is 4D; `len(b_values) == shape[3]`; `>= 4` b-values;
  at least one b-value approximately 0 (`< 1.0`)
- **201** -> `{ "dataset_id", "shape": [x,y,z,b], "b_values": [...], "created_at" }`
- **413** upload too large · **422** malformed / dimension mismatch · **429** cap reached

**`GET /datasets/{id}`** -> same metadata body · **404** if unknown/evicted

**`DELETE /datasets/{id}`** -> **204**; cascades to the dataset's jobs

### Fits

**`POST /datasets/{id}/fits`** — `application/json`
```jsonc
{
  "method": "segmented",       // "segmented" | "full" | "bayesian"  (default "segmented")
  "b_threshold": 200.0,        // default 200.0
  "mask": { "type": "auto", "percentile": 5 }   // default {"type": "auto", "percentile": 5}
}
```
- **202** -> `{ "job_id", "status": "pending" }`
- **404** unknown dataset · **422** invalid config

**`GET /fits/{job_id}`**
```jsonc
// running
{ "job_id", "dataset_id", "status": "running", "progress": 0.42 }
// succeeded
{ "job_id", "dataset_id", "status": "succeeded", "progress": 1.0,
  "config": { ... }, "summary": { ... } }     // summary shape in section 3
// failed
{ "job_id", "dataset_id", "status": "failed", "error": "..." }
```
- **404** unknown job

**`GET /fits/{job_id}/maps/{name}`** — `name` in `{d, d_star, f, s0}`
- **200** `Content-Type: application/gzip`,
  `Content-Disposition: attachment; filename="D.nii.gz"`, body = NIfTI bytes
- **404** unknown job or name · **409** job not `succeeded`

**`GET /fits/{job_id}/maps`** — zip of all four maps
- **200** `application/zip`, `filename="{job_id}_ivim_maps.zip"` · **409** not succeeded

**`GET /fits/{job_id}/voxel?x=&y=&z=`**
```jsonc
{
  "voxel": [x, y, z],
  "b_values": [0, 10, 20, ...],
  "signal": [ ... ],           // measured signal at this voxel, per b-value
  "params": { "d": ..., "d_star": ..., "f": ..., "s0": ... },
  "fitted_curve": [ ... ],     // biexp model at b_values with fitted params
  "r_squared": 0.991           // or null
}
```
- **404** unknown job · **409** not succeeded · **422** voxel out of bounds

### Meta

**`GET /health`** -> `{ "status": "ok" }`
**`GET /`** -> `{ "name": "osipy-rest-api", "version": "...", "docs": "/docs" }`
OpenAPI docs at `/docs` (FastAPI default).

## 9. Configuration (`config.py`, `pydantic-settings`)

| Setting | Env var | Default |
|---|---|---|
| CORS origins | `OSIPY_API_CORS_ORIGINS` | `["http://localhost:60010"]` |
| Data TTL (seconds) | `OSIPY_API_DATA_TTL_SECONDS` | `3600` |
| Max datasets | `OSIPY_API_MAX_DATASETS` | `5` |
| Max upload bytes | `OSIPY_API_MAX_UPLOAD_BYTES` | `536870912` (512 MiB) |
| Max total bytes | `OSIPY_API_MAX_TOTAL_BYTES` | `2147483648` (2 GiB) |
| Host | `OSIPY_API_HOST` | `127.0.0.1` |
| Port | `OSIPY_API_PORT` | `8000` |

## 10. Project Setup

**Package manager:** `uv`.

`pyproject.toml`:
- **dependencies:** `fastapi`, `uvicorn[standard]`, `python-multipart`, `osipy`,
  `nibabel`, `numpy`, `pydantic`, `pydantic-settings`
- **dev dependencies:** `pytest`, `pytest-asyncio`, `httpx`, `ruff`

**Run (dev):** `uv run uvicorn osipy_rest_api.main:app --reload`

**README** documents: install with `uv sync`, run command, the dashboard CORS note,
the in-memory / no-persistence behavior, and the config table.

## 11. Testing (TDD)

Tests are written before implementation for every unit and endpoint.

- **`fixtures/make_synthetic.py`** — generates a small 4D DWI volume
  (e.g. `4 x 4 x 2 x 8` b-values) from known `D`, `D*`, `f`, `S0` using the
  biexponential model plus optional Gaussian noise, with a valid affine. Also
  emits the matching `.bval` content and `.nii.gz` bytes.
- **`test_storage.py`** — put/get/delete, cascade delete of jobs, cap enforcement
  (429 path), TTL eviction via `sweep()` with a short TTL, `clear()`.
- **`test_jobs.py`** — job lifecycle (`pending -> running -> succeeded`), progress
  updates propagate to the job, exception path -> `failed` with `error`, evicted
  dataset -> `failed`, semaphore serializes concurrent submits.
- **`test_nifti_io.py`** — `parse_upload` round-trips an ndarray through
  `.nii` and `.nii.gz` bytes with affine preserved; rejects 3D input;
  `parse_bval` handles multi-line and extra whitespace;
  `parameter_map_to_nifti_bytes` produces a loadable NIfTI; `maps_to_zip_bytes`
  yields a zip with four entries.
- **`test_ivim_integration.py`** — `run_fit` on the synthetic volume recovers
  `D`, `D*`, `f` within tolerance; `summary` has the documented shape;
  `voxel_detail` returns a `fitted_curve` close to the measured signal for a
  clean (noiseless) voxel; `validate_config` rejects an out-of-range
  `b_threshold`.
- **`test_datasets.py`** — upload success (201 + metadata), dimension mismatch
  (422), too few b-values (422), missing b-value source (422), oversized upload
  (413), cap reached (429), `GET` unknown (404), `DELETE` (204 + cascade).
- **`test_fits.py`** — start fit (202), unknown dataset (404), bad config (422),
  poll through to `succeeded`, failed-fit surfaces as `status: "failed"`.
- **`test_results.py`** — map download before completion (409), after (200 with
  correct content-type and a loadable NIfTI body), unknown map name (404),
  zip endpoint, `/voxel` happy path, out-of-bounds voxel (422), voxel before
  completion (409).
- **Full-flow test** — upload -> start fit -> poll to `succeeded` -> download `d`
  map -> `/voxel`, all through the HTTP client.

osipy runs for real in tests (fast on tiny volumes). No network, no mocks of the
fitting path.

## 12. Out of Scope (prototype)

Authentication, HTTPS, rate limiting beyond the dataset cap, Docker, CI
configuration, multi-worker deployment, other modalities (DCE / DSC / ASL),
disk persistence, batch processing, client-supplied mask upload, ROI statistics.

The `Storage` and `JobRunner` Protocols and the `mask` request object are shaped so
that disk persistence, batch processing, and mask upload can be added without
breaking the API contract.
