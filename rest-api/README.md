# osipy REST API

A REST API backend that wraps the [osipy](https://osipi.github.io/osipy/) perfusion
analysis toolkit and exposes it to a web frontend (the
[OSIPI dashboard](https://github.com/OSIPI/dashboard)).

**Status:** implemented prototype, awaiting human review. The full API described
below is built and covered by tests (`uv run pytest -v`); the running server has
been verified end to end. The scientific-judgment choices (auto-mask percentile,
`b_threshold` validation, fit tolerances, the biexponential voxel model) still
need a maintainer's review before results are relied upon.
Full design: [`docs/superpowers/specs/2026-09-09-osipy-ivim-rest-api-design.md`](docs/superpowers/specs/2026-09-09-osipy-ivim-rest-api-design.md).
Design specs live in [`docs/superpowers/specs/`](docs/superpowers/specs/) and the
task-by-task implementation plans in [`docs/superpowers/plans/`](docs/superpowers/plans/).

## Scope of the prototype

- **IVIM only.** Intravoxel incoherent motion diffusion analysis. DCE, DSC and ASL
  are deliberately left out for now, but the structure does not preclude them.
- **Local-first.** Runs as a single process on the user's own machine. One user,
  no authentication.
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
| `POST` | `/datasets/{id}/fits` | Start a fit as a background job. Returns a `job_id` immediately. |
| `GET` | `/fits/{job_id}` | Poll job status, progress, and (when done) a summary. |

**Fit configuration** (what the UI can tune)
```jsonc
{
  "method": "segmented",     // segmented | full | bayesian
  "b_threshold": 200.0,      // b-value split for the segmented method
  "mask": { "type": "auto", "percentile": 5 }   // tissue mask from the b=0 image
}
```
Everything else (parameter bounds, iterations, tolerance) uses osipy defaults for
the prototype. These become configurable later if the partners want them.

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
    "n_voxels_fitted": 12345,
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
| `GET` | `/fits/{job_id}/maps/{name}` | Download one parameter map as `.nii.gz`. `name` ∈ `d`, `d_star`, `f`, `s0`. |
| `GET` | `/fits/{job_id}/maps` | Download all four maps as a single `.zip`. |
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
  "params":       { "d": 0.0012, "d_star": 0.021, "f": 0.15, "s0": 100.2 },
  "fitted_curve": [ … ],   // biexponential model at the b-values
  "r_squared":    0.991
}
```

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

## Design choices up for review

These are the decisions worth confirming with the project partners:

| Choice | What we picked | Alternative if wrong |
|---|---|---|
| **Fit configuration surface** | method + `b_threshold` + auto-mask only | expose full osipy `IVIMFitParams` (bounds, initial guess, iterations) |
| **Result transport** | `.nii.gz` per map; frontend parses in JS | raw binary blobs, or server-rendered PNG slices |
| **Voxel inspection** | dedicated `/voxel` endpoint returning signal + fitted curve | frontend holds the source volume and computes curves itself |
| **Execution model** | async job + polling, one fit at a time, in-process | synchronous requests; or a real job queue from the start |
| **Persistence** | none — in-memory, TTL-evicted | opt-in local directory; or always persist |
| **Masking** | auto percentile threshold on b=0 | user-uploaded mask NIfTI (planned, not built) |
| **Modalities** | IVIM only | add DCE / DSC / ASL behind the same `/datasets` + `/fits` shape |

The `Storage` and `JobRunner` layers and the `mask` request object are shaped so
that **disk persistence, batch processing, mask upload, and extra modalities** can
be added later without breaking the endpoints above.

## Running it

```bash
uv sync
uv run uvicorn osipy_rest_api.main:app --reload
# API on http://127.0.0.1:8000, docs at /docs
```

The dashboard runs on `http://localhost:60010`; that origin is allowed by CORS
(configurable via `OSIPY_API_CORS_ORIGINS`).

---

*AI involvement in this project is declared in [aidecl.yaml](./aidecl.yaml)
following the [AI Declaration Format](https://ai-declaration.org).*
