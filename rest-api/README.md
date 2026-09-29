# osipy REST API

A REST API backend that wraps the [osipy](https://osipi.github.io/osipy/) perfusion
analysis toolkit and exposes it to a web frontend (the
[OSIPI dashboard](https://github.com/OSIPI/dashboard)).

**Status:** local dashboard backend, awaiting scientific review. Results are not
a clinical assessment. The API deliberately exposes unavailable estimates as
`NaN` with validity/status maps rather than fabricating values.
Full design: [`docs/superpowers/specs/2026-09-09-osipy-ivim-rest-api-design.md`](docs/superpowers/specs/2026-09-09-osipy-ivim-rest-api-design.md).
Design specs live in [`docs/superpowers/specs/`](docs/superpowers/specs/) and the
task-by-task implementation plans in [`docs/superpowers/plans/`](docs/superpowers/plans/).

## Scope of the prototype

- **IVIM only.** Intravoxel incoherent motion diffusion analysis. DCE, DSC and ASL
  are deliberately left out for now, but the structure does not preclude them.
- **Local-first.** Runs only on a loopback address and requires a bearer session
  token on every API route. Host, Origin and CORS checks limit browser access to
  explicitly configured dashboard origins.
- **No persistence.** DWI data is sensitive; uploaded volumes and results live in
  memory only and are cleared on exit or after a TTL. Optional disk persistence and
  batch processing are planned but not built.
- **Async fitting.** Whole-volume fits take seconds to minutes, so a fit is a
  background job the client polls.

## What the API exposes

```
                         ┌──────────────────────────────────────────┐
                         │            OSIPI dashboard (UI)          │
                         │   upload · configure fit · view slices   │
                         │        inspect voxels · download         │
                         └────────────────────┬─────────────────────┘
                                              │  HTTP / JSON + files
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            osipy REST API                                    │
│                                                                             │
│  DATASETS                        FITS                       RESULTS          │
│  ────────                        ────                       ───────          │
│  POST   /datasets                POST /datasets/{id}/fits   GET .../maps/{n} │
│  GET    /datasets/{id}           GET  /fits/{job_id}        GET .../maps     │
│  DELETE /datasets/{id}                                      GET .../voxel    │
│                                                                             │
│         │                              │                          │         │
│         ▼                              ▼                          ▼         │
│  ┌─────────────┐   ┌──────────────────────────────┐   ┌──────────────────┐  │
│  │  in-memory  │   │  job runner (background)     │   │  NIfTI serializer │  │
│  │   storage   │◄──│  runs one fit at a time,     │──►│  ParameterMap →   │  │
│  │  (TTL, caps)│   │  reports progress 0..1       │   │  .nii.gz bytes    │  │
│  └─────────────┘   └───────────────┬──────────────┘   └──────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│                          ┌───────────────────┐                              │
│                          │   osipy.fit_ivim  │  (the only osipy touch point)│
│                          │  D · D* · f · S0  │                              │
│                          └───────────────────┘                              │
└─────────────────────────────────────────────────────────────────────────────┘

Swappable later without changing the HTTP contract:
  • in-memory storage  → disk-backed storage
  • one-fit-at-a-time   → queue / batch processing
```

## Endpoints

### Datasets — get DWI data into the API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/datasets` | Upload a 4D NIfTI (`.nii` / `.nii.gz`) + b-values (`.bval` file or JSON array). Returns a `dataset_id`. Data is held in memory only. |
| `GET` | `/datasets/{id}` | Dataset metadata: shape, b-values, creation time. |
| `DELETE` | `/datasets/{id}` | Drop the dataset (and its fits) from memory. |

**Upload response**
```jsonc
{ "dataset_id": "a1b2c3…", "shape": [128, 128, 40, 8],
  "b_values": [0, 10, 20, 50, 100, 200, 400, 800], "created_at": "…" }
```

### Fits — run the IVIM analysis

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/datasets/{id}/fits` | Start an explicit dataset/ROI/voxel fit as a background job. |
| `GET` | `/fits/{job_id}` | Poll job status, progress, and (when done) a summary. |
| `DELETE` | `/fits/{job_id}` | Cancel a pending/running fit. A running OSIPY fit stops at its next progress boundary. Delete a terminal fit to reclaim its retained job record (`204 No Content`). |
| `GET` | `/catalog` (or `/models`) | Discover verified IVIM models and fitter strategies. |

**Fit configuration** (what the UI can tune)
```jsonc
{
  "model": "biexponential", // biexponential | simplified
  "method": "segmented",    // segmented | full | bayesian
  "b_threshold": 200.0,     // used by segmented/bayesian; simplified cutoff except full
  "scope": "roi",           // dataset | voxel | roi
  "voxels": [[64, 64, 20]]   // required for voxel/roi; native [x, y, z]
}
```
There is **no automatic intensity mask**. Dataset scope fits every native-grid
voxel; voxel/ROI scope fits exactly the supplied unique coordinates. The
simplified model does not expose a `d_star` estimate.

`max_iterations` and `tolerance` are deliberately **not accepted**. In OSIPY
0.1.4, the public IVIM path ignores those `IVIMFitParams` values, so accepting
them would misrepresent the computation. `GET /catalog` reports the effective
optimizer defaults: vectorized LM uses 100 iterations and tolerance `1e-6`;
Bayesian uses that LM stage plus a 100-iteration, `1e-6` MAP stage,
baseline-derived noise, prior scale `1.5`, and uncertainty computation.

OSIPY's batch output does not expose per-voxel convergence diagnostics, and its
batch fit mask means only that a voxel was submitted to fitting. It is not a
convergence certificate. The API therefore labels convergence `unavailable` in
the completed-job summary and provenance. Status value `1` means the selected
voxel has a finite physical-domain estimate and passes the API's explicit
R² `> 0.5` post-fit gate (the same threshold used by OSIPY's single-fit
`FittingResult.is_valid` convention); it does **not** mean converged. The
status policy in provenance records this distinction.

For the `full` strategy OSIPY forces the fit threshold to `0`; any requested
`b_threshold` is retained only as request metadata. For simplified `full`, the
model cutoff is therefore `0`. Provenance reports both the effective threshold
and `model_cutoff`, and voxel curves use that recorded cutoff.

**Job status while running**
```jsonc
{ "job_id": "…", "status": "running", "progress": 0.42 }
```

**Job status when finished**
```jsonc
{
  "job_id": "…", "status": "succeeded", "progress": 1.0,
  "config": { … },
  "summary": {
    "fit_success_rate": 0.98,
    "n_voxels_selected": 12345,
    "n_voxels_valid": 12098,
    "maps": {
      "d":      { "mean": 0.0012, "median": 0.0012, "std": 2.7e-5,
                  "valid_fraction": 0.98, "units": "mm^2/s" },
      "d_star": { … }, "f": { … }, "s0": { … }
    }
  }
}
```

### Results — display and download

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/fits/{job_id}/maps/{name}` | Download a map as `.nii.gz`. Parameter names depend on the model; `valid`, `status`, and `r_squared` are available for overlays/quality. |
| `GET` | `/fits/{job_id}/maps` | Download the model's parameter maps as a `.zip`. |
| `GET` | `/fits/{job_id}/voxel?x=&y=&z=` | Per-voxel detail for the "click a voxel" view. |

The **parameter maps** are the fitted quantities, one 3D volume each:

| `name` | parameter | meaning |
|---|---|---|
| `d` | D | true tissue diffusion coefficient |
| `d_star` | D\* | pseudo-diffusion coefficient (perfusion-related) |
| `f` | f | perfusion fraction |
| `s0` | S₀ | signal at b = 0 |

The frontend uses a JavaScript NIfTI reader on these files for **both** slice
display and reading a voxel's value on click. Download is the same file. No
server-side image rendering.

**Voxel detail response** — enough to plot the measured vs. fitted decay curve
```jsonc
{
  "voxel": [64, 64, 20],
  "b_values":     [0, 10, 20, 50, 100, 200, 400, 800],
  "signal":       [ … ],   // measured signal at this voxel
  "available":    true,
  "reason":       null,
  "params":       { "d": 0.0012, "d_star": 0.021, "f": 0.15, "s0": 100.2 },
  "fitted_curve": [ … ],   // biexponential model at the b-values
  "r_squared":    0.991
}
```
For an unselected voxel or a selected voxel with no valid physical estimate,
the endpoint returns `200` with `available: false`, reason `not_selected` or
`invalid_estimate`, and `params`, `fitted_curve`, and `r_squared` all `null`.
It never serializes `NaN` or invents a curve.

### Meta

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness check. |
| `GET` | `/` | API name, version, link to docs. |
| `GET` | `/docs` | Interactive OpenAPI documentation (auto-generated). |

## A typical session

```
1. POST /datasets            (nifti + bval)        → dataset_id
2. POST /datasets/{id}/fits  {method, b_threshold} → job_id
3. GET  /fits/{job_id}        (poll)               → progress 0.0 … 1.0
4. GET  /fits/{job_id}        (poll)               → status "succeeded" + summary
5. GET  /fits/{job_id}/maps/d                      → D.nii.gz   (display + download)
6. GET  /fits/{job_id}/voxel?x=64&y=64&z=20        → curve for the clicked voxel
```

## Resource limits

Environment variables use the `OSIPY_API_` prefix:

- `MAX_UPLOAD_BYTES` (512 MiB): caps each NIfTI upload, decompressed payload,
  and decoded float64 array. Decoding is also limited by remaining storage capacity.
  Oversized input returns 413; malformed images and non-finite b-values return 422.
- `MAX_DATASETS` (5) and `MAX_JOBS` (5): cap retained datasets and fit records,
  including completed results. The runner also caps pending/running tasks so deleting
  records cannot bypass the queue limit. Full capacity returns 429.
- `MAX_TOTAL_BYTES` (2 GiB): caps retained dataset and result array buffers,
  including quality/uncertainty arrays. A result exceeding capacity marks its job
  failed without retaining the result.

Delete a dataset (and its fits), delete a completed/cancelled/failed fit with
`DELETE /fits/{job_id}/retained`, or wait for TTL eviction to reclaim retained capacity.
`DELETE /fits/{job_id}` requests cancellation; if the fit has already finished,
it returns that terminal state without deleting the result.
Completed worker tasks are released immediately. These limits bound
application buffers, not total process RSS: multipart parsing, decompression,
fitting and export still need working memory. Keep the service local; deployments
need request/concurrency limits and an OS/container memory limit as well.

## Safe local startup

Set a private session token (at least 16 characters) and list only the dashboard
origins that may call this API. The supported entry point validates that the bind
host is loopback-only; do not start this package with a public `uvicorn --host`
override.

```bash
export OSIPY_API_SESSION_TOKEN="$(openssl rand -base64 32)"
export OSIPY_API_CORS_ORIGINS='["http://localhost:60010","http://127.0.0.1:60010","https://osipi.github.io"]'
uv sync
uv run osipy-rest-api
```

It binds to `127.0.0.1:8000` by default. Send the token only in
`Authorization: Bearer <token>`; do not put it in a URL, persistent browser
storage, exports, or logs. If no token is configured, a random token is generated
and printed once at startup for an interactive local session.

## Design choices up for review

These are the decisions worth confirming with the project partners:

| Choice | What we picked | Alternative if wrong |
|---|---|---|
| **Fit configuration surface** | verified model + strategy, effective threshold semantics and explicit scope | expose controls only when OSIPY's public API applies them |
| **Result transport** | `.nii.gz` per map; frontend parses in JS | raw binary blobs, or server-rendered PNG slices |
| **Voxel inspection** | dedicated `/voxel` endpoint returning signal + fitted curve | frontend holds the source volume and computes curves itself |
| **Execution model** | async job + polling, one fit at a time, in-process | synchronous requests; or a real job queue from the start |
| **Persistence** | none — in-memory, TTL-evicted | opt-in local directory; or always persist |
| **Masking** | explicit dataset/ROI/voxel selection only | user-uploaded mask NIfTI (planned, not built) |
| **Modalities** | IVIM only | add DCE / DSC / ASL behind the same `/datasets` + `/fits` shape |

The `Storage` and `JobRunner` layers and explicit selection request object are shaped so
that **disk persistence, batch processing, mask upload, and extra modalities** can
be added later without breaking the endpoints above.

## Running it

```bash
uv sync
export OSIPY_API_SESSION_TOKEN="$(openssl rand -base64 32)"
uv run osipy-rest-api
# API on http://127.0.0.1:8000, docs at /docs
```

The dashboard runs on `http://localhost:60010`; that origin is allowed by CORS
(configurable via `OSIPY_API_CORS_ORIGINS`).

---

*AI involvement in this project is declared in [aidecl.yaml](./aidecl.yaml)
following the [AI Declaration Format](https://ai-declaration.org).*
