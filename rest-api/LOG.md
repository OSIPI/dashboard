# Project log

Newest first.

## 2026-09-10 — Milestone: implementation complete, entry point verified

Plan tasks 1–13 done. Full FastAPI backend wrapping the osipy IVIM pipeline:
config/domain/errors, NIfTI I/O, in-memory storage (caps + TTL), background
job runner, pydantic schemas, DI container, app factory, and the datasets /
fits / results / meta routers. **69 tests passing** (`uv run pytest`), ruff
clean, CI workflow added (`.github/workflows/ci.yml` — ruff + smoke + full
pytest on push/PR). `CITATION.cff` (validated with cffconvert) and
`codemeta.json` added.

Entry point verified the way a user runs it:
`uv run uvicorn osipy_rest_api.main:app` → `/health` returns `{"status":"ok"}`,
`/openapi.json` serves, and a live httpx end-to-end chain (upload → segmented
fit → poll to succeeded → download D map as a 3D NIfTI → `/voxel` → maps zip →
delete dataset → 404 on the map afterward) all returned the expected status
codes. Server logs clean — no errors, no scipy/osipy warnings.

Delete/evict semantics follow the design spec: `delete_dataset` cascade-deletes
the dataset's jobs, so a later `GET /fits/{job_id}/maps/{name}` or `/voxel`
returns **404** (spec §2 error table, §4, §8). The `/voxel` handler's
source-dataset-gone branch was aligned to raise `NotFoundError` (404) rather
than 409 to match. (An earlier revision of this task kept jobs marked `failed`
to return 409; the controller ruled the spec wins and it was reverted in fix
round 1 — see `.superpowers/sdd/.../task-13-report.md`.)

Known limitation for review: `deps.get_settings_dep()` returns the global
`@lru_cache`d `Settings()` rather than any `build_app(settings)`-injected
instance. Consistent for the live server (both resolve to the same object);
only matters for tests that inject non-default settings into a handler-read
path, of which there are none. Left as-is per the task brief; noted for the
controller's final review.

**Awaiting human review** before reliance: the auto-mask percentile default,
the `b_threshold` validation rule, the fit tolerances in `tests/test_ivim.py`,
and the biexponential model evaluation in `voxel_detail`. Every agent-built
module is recorded in `aidecl.yaml` as not yet reviewed line by line.

## 2026-09-10 — Task 6: osipy IVIM integration module

`core/ivim.py` added — the sole osipy consumer besides `nifti_io.py`.
`validate_fit_config`, `run_fit`, `build_summary`, `voxel_detail`; 7 tests,
full suite 35 passing, ruff clean, no osipy/scipy warnings (verified with
`pytest -W error`).

Spec deviation, `_auto_mask`: the design uses `mask = b0 > thr`. Changed to
`b0 >= thr`. The percentile is a lower cutoff, so voxels exactly at it are
foreground; with strict `>` a uniform-intensity b0 volume (noiseless synthetic
data) has its percentile equal to that single value and the mask collapses to
empty, which makes osipy's batch fitter raise. `>=` is a no-op on real data
with a dark background. Reference-case recovery on noiseless data is exact:
d=1.20000e-3, D*=2.00000e-2, f=0.15000 — brief tolerances (d rel=0.15,
f abs=0.05) kept unchanged, not widened.

## 2026-09-10 — Implementation started

Design spec approved. Scaffold task: uv project, packaging, license, config
template, aidecl.yaml, decision log seeded.
