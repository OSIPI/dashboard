# osipy IVIM REST API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, in-memory FastAPI backend that wraps the osipy IVIM
fitting pipeline so the OSIPI dashboard can upload DWI data, run a fit as a
background job, and display / download the resulting parameter maps.

**Architecture:** Three layers — `api/` (HTTP handlers, Pydantic validation),
`core/` (a `Storage` protocol with an in-memory implementation, a `JobRunner`
protocol with an in-process implementation, one module isolating all osipy
calls, and an in-memory NIfTI I/O module), and `models/` (shared Pydantic
schemas). All state is held in RAM and cleared on exit or TTL expiry; nothing
is written to disk. Fits run one at a time as `asyncio` tasks that offload the
CPU-bound osipy call via `asyncio.to_thread`.

**Tech Stack:** Python 3.12+, uv, FastAPI, uvicorn, python-multipart, osipy
0.1.4, nibabel, numpy, pydantic, pydantic-settings. Dev: pytest,
pytest-asyncio, httpx, ruff.

**Spec:** `docs/superpowers/specs/2026-09-09-osipy-ivim-rest-api-design.md`

## Global Constraints

- **Package manager:** uv only. `uv add` for deps, `uv run` to execute, never
  pip. `pyproject.toml` + committed `uv.lock`.
- **Python floor:** `requires-python = ">=3.12"` (osipy requires 3.12+).
- **No disk persistence:** uploaded volumes, parameter maps, and job state live
  in memory only. NIfTI parsing and serialization happen through in-memory
  buffers (`io.BytesIO`), never temp files. The only files the process writes
  are logs to stderr.
- **License:** Apache-2.0. `SPDX-License-Identifier: Apache-2.0` in
  `pyproject.toml`; a `LICENSE` file with the canonical Apache License 2.0
  text; a `NOTICE` file naming "The OSIPI contributors". Copyright holder
  "The OSIPI contributors".
- **Import boundary:** only `src/osipy_rest_api/core/ivim.py` and
  `src/osipy_rest_api/core/nifti_io.py` may import `osipy` or `nibabel`.
  `api/` modules import from `core/` and `models/` only.
- **Package layout:** `src/` layout. Package name `osipy_rest_api`.
- **Config prefix:** all settings env vars start with `OSIPY_API_`.
- **CORS default origin:** `http://localhost:60010` (the dashboard).
- **Commit trailer:** every commit ends with
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt`.
- **aidecl.yaml:** update the matching component entry in the same commit as
  each task's code; bump `declaration.date` and append a dated note.
- **Verified osipy API (osipy 0.1.4), use exactly these:**
  - `osipy.fit_ivim(signal, b_values, mask=None, params=None, method=None, progress_callback=None) -> IVIMFitResult`
  - `from osipy.ivim.fitting.estimators import FittingMethod, IVIMFitParams`
    — `FittingMethod` values: `"segmented"`, `"full"`, `"bayesian"`.
    — `IVIMFitParams(method=..., b_threshold=200.0, max_iterations=500, tolerance=1e-6, ...)`
  - `IVIMFitResult` dataclass fields: `d_map`, `d_star_map`, `f_map`,
    `s0_map` (each a `ParameterMap`), `quality_mask`, `r_squared`
    (`np.ndarray | None`), `fitting_stats` (`dict`).
  - `ParameterMap` attributes: `.values` (ndarray), `.affine` (4x4 ndarray),
    `.units` (str), `.name`, `.symbol`, `.statistics() -> dict` with keys
    `mean, std, min, max, median`, `.valid_fraction` (float),
    `.n_valid` (int), `.n_failed` (int), `.shape`.
  - `fitting_stats` keys observed: `n_voxels_total`, `n_voxels_fitted`,
    `fit_success_rate`, `D_mean`, `D_std`, `D_median`, `D*_mean`, `D*_std`,
    `D*_median`, `f_mean`, `f_std`, `f_median`.
  - Per-voxel curve:
    `from osipy.ivim.models.biexponential import IVIMBiexponentialModel, IVIMParams`
    — `IVIMBiexponentialModel().predict(b_values, IVIMParams(s0=, d=, d_star=, f=)) -> ndarray`
    — `IVIMParams(s0=1.0, d=0.001, d_star=0.01, f=0.1)` (dataclass).
  - `progress_callback` is called by osipy with a single float in `[0, 1]`.

---

## File Structure

Created across the tasks below:

| File | Responsibility |
|---|---|
| `pyproject.toml` | uv project definition, deps, ruff + pytest config |
| `LICENSE` | Apache License 2.0 text |
| `NOTICE` | attribution notice required by Apache-2.0 |
| `.gitignore` | Python, venv, uv, agent working dirs, `.env` |
| `README.md` | already exists — updated once at the end |
| `CITATION.cff`, `codemeta.json` | citation metadata; osipy credited in `references` |
| `aidecl.yaml` | AI usage declaration, updated per task |
| `.env.example` | documents every `OSIPY_API_*` setting |
| `src/osipy_rest_api/__init__.py` | package version |
| `src/osipy_rest_api/config.py` | `Settings` (pydantic-settings) + `get_settings()` |
| `src/osipy_rest_api/models/__init__.py` | — |
| `src/osipy_rest_api/models/schemas.py` | Pydantic request/response models + the `FitConfig`/`MaskSpec` dataclasses |
| `src/osipy_rest_api/core/__init__.py` | — |
| `src/osipy_rest_api/core/errors.py` | `CapacityError`, `ValidationError`, `NotFoundError`, `JobStateError` |
| `src/osipy_rest_api/core/domain.py` | `Dataset`, `Job`, `FitResult` dataclasses; `JobStatus` enum |
| `src/osipy_rest_api/core/storage.py` | `Storage` Protocol + `InMemoryStorage` (locks, caps, TTL sweep, `clear()`) |
| `src/osipy_rest_api/core/nifti_io.py` | `parse_nifti_bytes`, `parse_bval_bytes`, `parameter_map_to_nifti_bytes`, `maps_to_zip_bytes` |
| `src/osipy_rest_api/core/ivim.py` | `validate_fit_config`, `run_fit`, `voxel_detail`, `build_summary` — the only osipy consumer |
| `src/osipy_rest_api/core/jobs.py` | `JobRunner` Protocol + `InProcessJobRunner` (semaphore, progress bridging) |
| `src/osipy_rest_api/deps.py` | FastAPI dependency providers for `Settings`, `Storage`, `JobRunner` |
| `src/osipy_rest_api/api/__init__.py` | — |
| `src/osipy_rest_api/api/meta.py` | `GET /`, `GET /health` |
| `src/osipy_rest_api/api/datasets.py` | `POST /datasets`, `GET /datasets/{id}`, `DELETE /datasets/{id}` |
| `src/osipy_rest_api/api/fits.py` | `POST /datasets/{id}/fits`, `GET /fits/{job_id}` |
| `src/osipy_rest_api/api/results.py` | `GET /fits/{job_id}/maps`, `GET /fits/{job_id}/maps/{name}`, `GET /fits/{job_id}/voxel` |
| `src/osipy_rest_api/main.py` | app factory, lifespan (start/stop sweep, `clear()` on shutdown), CORS, exception handlers, router wiring |
| `tests/conftest.py` | fixtures: `settings`, `storage`, `client`, `synthetic_*` |
| `tests/fixtures/synthetic.py` | `make_ivim_volume(...)`, `nifti_bytes(...)`, `bval_bytes(...)` |
| `tests/test_nifti_io.py`, `tests/test_storage.py`, `tests/test_jobs.py`, `tests/test_ivim.py`, `tests/test_datasets_api.py`, `tests/test_fits_api.py`, `tests/test_results_api.py`, `tests/test_full_flow.py` | per-module test suites |
| `.github/workflows/ci.yml` | ruff + pytest on push / PR |
| `docs/decisions/0001-in-memory-only.md`, `0002-license-apache-2.md` | decision log entries |
| `LOG.md` | project journal, appended per milestone |
| `CONTRIBUTING.md` | short contribution note |

---

## Task 1: Project scaffold

**Files:**
- Create: `pyproject.toml`, `LICENSE`, `.gitignore`, `.env.example`,
  `src/osipy_rest_api/__init__.py`, `aidecl.yaml`, `CONTRIBUTING.md`,
  `docs/decisions/0001-in-memory-only.md`, `LOG.md`
- Test: `tests/test_smoke.py`

**Interfaces:**
- Consumes: nothing.
- Produces: an installable `osipy_rest_api` package with `__version__ = "0.1.0"`;
  `uv run pytest` works.

- [ ] **Step 1: Write the failing test**

`tests/test_smoke.py`:
```python
def test_package_imports_and_has_version():
    import osipy_rest_api

    assert osipy_rest_api.__version__ == "0.1.0"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_smoke.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'osipy_rest_api'`
(before `pyproject.toml` exists, `uv run` will error; that also counts as red).

- [ ] **Step 3: Create the project files**

`pyproject.toml`:
```toml
[project]
name = "osipy-rest-api"
version = "0.1.0"
description = "REST API backend wrapping the osipy toolkit for IVIM perfusion analysis"
readme = "README.md"
requires-python = ">=3.12"
license = { text = "Apache-2.0" }
authors = [{ name = "The OSIPI contributors" }]
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "python-multipart>=0.0.12",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "numpy>=2.0",
    "nibabel>=5.3",
    "osipy>=0.1.4",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "httpx>=0.27",
    "ruff>=0.7",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/osipy_rest_api"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
src = ["src", "tests"]

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]
```

`src/osipy_rest_api/__init__.py`:
```python
"""REST API backend for osipy IVIM perfusion analysis."""

__version__ = "0.1.0"
```

`LICENSE` — the canonical Apache License 2.0 text (verbatim from
https://www.apache.org/licenses/LICENSE-2.0.txt).

`NOTICE`:
```
osipy REST API
Copyright 2026 The OSIPI contributors

This product includes software developed by The OSIPI contributors.
```

`.gitignore`:
```gitignore
__pycache__/
*.py[cod]
.venv/
dist/
build/
*.egg-info/
.pytest_cache/
.ruff_cache/
.coverage
.env
.claude/
.agents/
.cursor/
.rseng-agent-skills-*
.rseng-backup-*
.rseng-check-waivers
```

`.env.example`:
```bash
# All settings are optional; defaults shown.
OSIPY_API_CORS_ORIGINS=["http://localhost:60010"]
OSIPY_API_DATA_TTL_SECONDS=3600
OSIPY_API_MAX_DATASETS=5
OSIPY_API_MAX_UPLOAD_BYTES=536870912
OSIPY_API_MAX_TOTAL_BYTES=2147483648
OSIPY_API_HOST=127.0.0.1
OSIPY_API_PORT=8000
```

`aidecl.yaml`:
```yaml
schema_version: "1.0.0"

project:
  name: osipy-rest-api
  version: "0.1.0"
  repository: https://github.com/OSIPI/osipy-rest-api
  license: Apache-2.0
  content_type: software

ai_usage:
  used: true
  level: significant
  summary: >-
    An autonomous coding agent (Claude Code) implemented the FastAPI backend
    wrapping the osipy IVIM pipeline from a human-approved design spec, in
    September 2026, working task-by-task from a written implementation plan.
    All AI output is reviewed by the maintainer before merge.
  tools:
    - name: Claude Code
      vendor: Anthropic
      type: agent
      model: claude-sonnet-5
      hosting: cloud_vendor
      period: { start: "2026-09-09" }
      purpose: [code generation, test writing, documentation]
    - name: rseng-agent-skills
      type: standalone
      version: "0.1.0"
      skills_consulted:
        [rseng-quality-framework, rseng-project-tracking, rseng-testing,
         rseng-defensive-coding, rseng-reproducible-environments,
         rseng-version-control-review, rseng-code-review,
         rseng-citation-metadata, rseng-licensing, rseng-ai-declaration,
         rseng-honesty, rseng-human-verification, rseng-agent-security]
  activities: [code_generation, testing, documentation]
  scope:
    code_generation: true
    code_review: false
    documentation: true
    testing: true
    infrastructure: true
  components:
    - name: project scaffold
      description: pyproject.toml, packaging, license, gitignore, config template
      ai_involvement: >-
        Generated by the agent from the implementation plan, 2026-09-10.
      tools_used: [Claude Code]
      notes: NOT yet reviewed line by line by a human.

declaration:
  date: "2026-09-10"
  declared_by: Djura Smits
  contact: djura.smits@gmail.com
  reviewed_by: pending
  notes: >-
    2026-09-10 initial declaration; scaffold task. Awaiting human review.
```

`CONTRIBUTING.md` — a short note: uv workflow, run `uv run pytest` and
`uv run ruff check`, branch off `main`, PR with review. State that
contributions are accepted under Apache-2.0.

`docs/decisions/0001-in-memory-only.md`:
```markdown
# 0001 — In-memory only, no disk persistence

**Date:** 2026-09-09
**Status:** Accepted

## Context

DWI data is sensitive medical imaging data. The backend runs locally on the
user's own machine, one user at a time.

## Decision

Uploaded volumes, parameter maps, and job state are held in RAM only, keyed by
UUID, and cleared on process exit or after a TTL. NIfTI parsing and
serialization go through in-memory buffers, never temp files.

## Consequences

- No database, no data directory.
- Metadata and results are lost on restart (acceptable for a local tool).
- A memory cap and dataset-count cap bound RAM use.
- Disk persistence and batch processing are deferred; the `Storage` and
  `JobRunner` protocols are the seams where they will attach.
```

`docs/decisions/0002-license-apache-2.md`:
```markdown
# 0002 — License: Apache-2.0

**Date:** 2026-09-10
**Status:** Accepted

## Context

The project needs an OSI-approved license. The dependency stack (osipy,
FastAPI, uvicorn, nibabel, pydantic, numpy) is uniformly permissive (MIT/BSD),
so both permissive and copyleft choices are legally open.

## Decision

Apache License 2.0. Chosen by the maintainer. It adds an explicit patent grant
over MIT/BSD, which suits a project intended for use across the OSIPI
ecosystem. Ship `LICENSE` (verbatim Apache-2.0 text) and `NOTICE`;
`SPDX-License-Identifier: Apache-2.0` in `pyproject.toml`.

## Consequences

- Redistributors must retain the `NOTICE` file's attributions.
- Apache-2.0 is one-way compatible with the permissive deps (fine downstream).
- Contributions are inbound-Apache-2.0 by default (state this in CONTRIBUTING).
```

`LOG.md`:
```markdown
# Project log

Newest first.

## 2026-09-10 — Implementation started

Design spec approved. Scaffold task: uv project, packaging, license, config
template, aidecl.yaml, decision log seeded.
```

- [ ] **Step 4: Generate the lockfile and run the test**

Run: `uv sync --extra dev && uv run pytest tests/test_smoke.py -v`
Expected: PASS.

- [ ] **Step 5: Run the linter**

Run: `uv run ruff check .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold uv project, packaging, license, aidecl

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

---

## Task 2: Synthetic IVIM data fixtures

**Files:**
- Create: `tests/fixtures/__init__.py`, `tests/fixtures/synthetic.py`
- Test: `tests/test_fixtures.py`

**Interfaces:**
- Consumes: nothing (uses numpy + nibabel directly — test code, so the import
  boundary does not apply).
- Produces:
  - `make_ivim_volume(shape=(4, 4, 2), b_values=DEFAULT_B_VALUES, d=1.2e-3, d_star=20e-3, f=0.15, s0=100.0, noise_sigma=0.0, seed=0) -> tuple[np.ndarray, np.ndarray]`
    returning `(data_4d, b_values)` where `data_4d` has shape `(*shape, len(b_values))`.
  - `DEFAULT_B_VALUES = np.array([0.0, 10.0, 20.0, 50.0, 100.0, 200.0, 400.0, 800.0])`
  - `nifti_bytes(data: np.ndarray, affine: np.ndarray | None = None, gzip: bool = True) -> bytes`
  - `bval_bytes(b_values: np.ndarray) -> bytes` (FSL format: space-separated on one line)
  - `IDENTITY_AFFINE = np.eye(4)`

- [ ] **Step 1: Write the failing test**

`tests/test_fixtures.py`:
```python
import numpy as np

from tests.fixtures.synthetic import (
    DEFAULT_B_VALUES,
    bval_bytes,
    make_ivim_volume,
    nifti_bytes,
)


def test_make_ivim_volume_shape_and_biexp_decay():
    data, b = make_ivim_volume(shape=(3, 3, 2))
    assert data.shape == (3, 3, 2, len(DEFAULT_B_VALUES))
    assert np.allclose(b, DEFAULT_B_VALUES)
    # Signal at b=0 equals s0; strictly decreasing in b for a clean voxel.
    voxel = data[0, 0, 0, :]
    assert np.isclose(voxel[0], 100.0)
    assert np.all(np.diff(voxel) < 0)


def test_make_ivim_volume_noise_is_seeded():
    a, _ = make_ivim_volume(noise_sigma=1.0, seed=42)
    b, _ = make_ivim_volume(noise_sigma=1.0, seed=42)
    assert np.array_equal(a, b)


def test_nifti_bytes_roundtrips_through_nibabel():
    import gzip
    import io

    import nibabel as nib

    data, _ = make_ivim_volume(shape=(2, 2, 2))
    raw = nifti_bytes(data, gzip=True)
    img = nib.Nifti1Image.from_bytes(gzip.decompress(raw))
    assert img.shape == data.shape
    assert np.allclose(img.get_fdata(), data)


def test_bval_bytes_format():
    out = bval_bytes(np.array([0.0, 10.0, 800.0]))
    assert out.decode().strip() == "0 10 800"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_fixtures.py -v`
Expected: FAIL — `ModuleNotFoundError: tests.fixtures.synthetic`

- [ ] **Step 3: Write the implementation**

`tests/fixtures/__init__.py`: empty.

`tests/fixtures/synthetic.py`:
```python
"""Synthetic IVIM data generators for tests.

The bi-exponential IVIM signal model:
    S(b) = S0 * (f * exp(-b * D*) + (1 - f) * exp(-b * D))
"""

from __future__ import annotations

import gzip as _gzip
import io

import nibabel as nib
import numpy as np

DEFAULT_B_VALUES = np.array([0.0, 10.0, 20.0, 50.0, 100.0, 200.0, 400.0, 800.0])
IDENTITY_AFFINE = np.eye(4)


def make_ivim_volume(
    shape: tuple[int, int, int] = (4, 4, 2),
    b_values: np.ndarray = DEFAULT_B_VALUES,
    d: float = 1.2e-3,
    d_star: float = 20e-3,
    f: float = 0.15,
    s0: float = 100.0,
    noise_sigma: float = 0.0,
    seed: int = 0,
) -> tuple[np.ndarray, np.ndarray]:
    b = np.asarray(b_values, dtype=float)
    curve = s0 * (f * np.exp(-b * d_star) + (1.0 - f) * np.exp(-b * d))
    data = np.broadcast_to(curve, (*shape, b.size)).astype(float).copy()
    if noise_sigma > 0.0:
        rng = np.random.default_rng(seed)
        data = data + rng.normal(0.0, noise_sigma, size=data.shape)
    return data, b


def nifti_bytes(
    data: np.ndarray,
    affine: np.ndarray | None = None,
    gzip: bool = True,
) -> bytes:
    img = nib.Nifti1Image(np.asarray(data, dtype=np.float32),
                          IDENTITY_AFFINE if affine is None else affine)
    raw = img.to_bytes()
    if gzip:
        buf = io.BytesIO()
        with _gzip.GzipFile(fileobj=buf, mode="wb") as gz:
            gz.write(raw)
        return buf.getvalue()
    return raw


def bval_bytes(b_values: np.ndarray) -> bytes:
    nums = " ".join(
        str(int(v)) if float(v).is_integer() else repr(float(v))
        for v in np.asarray(b_values)
    )
    return (nums + "\n").encode()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_fixtures.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test: synthetic IVIM volume and NIfTI/bval fixtures

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

---

## Task 3: Config and domain types

**Files:**
- Create: `src/osipy_rest_api/config.py`, `src/osipy_rest_api/core/__init__.py`,
  `src/osipy_rest_api/core/errors.py`, `src/osipy_rest_api/core/domain.py`,
  `src/osipy_rest_api/models/__init__.py`
- Test: `tests/test_config_domain.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `config.Settings` (pydantic-settings `BaseSettings`, env prefix
    `OSIPY_API_`) with fields: `cors_origins: list[str] = ["http://localhost:60010"]`,
    `data_ttl_seconds: int = 3600`, `max_datasets: int = 5`,
    `max_upload_bytes: int = 536_870_912`, `max_total_bytes: int = 2_147_483_648`,
    `host: str = "127.0.0.1"`, `port: int = 8000`.
  - `config.get_settings() -> Settings` (module-level singleton via
    `functools.lru_cache`).
  - `core.errors`: `ApiError(Exception)` base with `.status_code` and
    `.detail`; subclasses `NotFoundError` (404), `CapacityError` (429),
    `PayloadTooLargeError` (413), `InvalidInputError` (422),
    `JobStateError` (409). Each `__init__(self, detail: str)`.
  - `core.domain`:
    - `class JobStatus(str, Enum): PENDING="pending"; RUNNING="running"; SUCCEEDED="succeeded"; FAILED="failed"`
    - `@dataclass class MaskSpec: type: str = "auto"; percentile: float = 5.0`
    - `@dataclass class FitConfig: method: str = "segmented"; b_threshold: float = 200.0; mask: MaskSpec = field(default_factory=MaskSpec)`
    - `@dataclass class Dataset: id: str; data: np.ndarray; affine: np.ndarray; b_values: np.ndarray; created_at: float; ` with a `shape` property returning `tuple(self.data.shape)` and an `nbytes` property returning `int(self.data.nbytes)`.
    - `@dataclass class FitResult: maps: dict[str, object]; r_squared: "np.ndarray | None"; summary: dict` (maps values are osipy `ParameterMap`s; typed as `object` to keep the import boundary — `core.domain` must not import osipy).
    - `@dataclass class Job: id: str; dataset_id: str; config: FitConfig; status: JobStatus = JobStatus.PENDING; progress: float = 0.0; created_at: float = field(default_factory=time.time); finished_at: float | None = None; result: FitResult | None = None; error: str | None = None`

- [ ] **Step 1: Write the failing test**

`tests/test_config_domain.py`:
```python
import numpy as np

from osipy_rest_api.config import Settings, get_settings
from osipy_rest_api.core.domain import Dataset, FitConfig, Job, JobStatus, MaskSpec
from osipy_rest_api.core.errors import CapacityError, NotFoundError


def test_settings_defaults():
    s = Settings()
    assert s.cors_origins == ["http://localhost:60010"]
    assert s.max_datasets == 5
    assert s.data_ttl_seconds == 3600


def test_settings_env_override(monkeypatch):
    monkeypatch.setenv("OSIPY_API_MAX_DATASETS", "9")
    assert Settings().max_datasets == 9


def test_get_settings_is_cached():
    assert get_settings() is get_settings()


def test_fit_config_defaults():
    c = FitConfig()
    assert c.method == "segmented"
    assert c.b_threshold == 200.0
    assert c.mask == MaskSpec(type="auto", percentile=5.0)


def test_dataset_shape_and_nbytes():
    data = np.zeros((4, 4, 2, 8), dtype=np.float64)
    ds = Dataset(id="x", data=data, affine=np.eye(4),
                 b_values=np.arange(8.0), created_at=0.0)
    assert ds.shape == (4, 4, 2, 8)
    assert ds.nbytes == data.nbytes


def test_job_defaults():
    job = Job(id="j", dataset_id="d", config=FitConfig())
    assert job.status is JobStatus.PENDING
    assert job.progress == 0.0
    assert job.result is None


def test_errors_carry_status_codes():
    assert NotFoundError("nope").status_code == 404
    assert CapacityError("full").status_code == 429
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_config_domain.py -v`
Expected: FAIL — `ModuleNotFoundError: osipy_rest_api.config`

- [ ] **Step 3: Write the implementation**

`src/osipy_rest_api/models/__init__.py`: empty.
`src/osipy_rest_api/core/__init__.py`: empty.

`src/osipy_rest_api/config.py`:
```python
"""Application settings, environment-overridable with the OSIPY_API_ prefix."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OSIPY_API_", env_file=".env")

    cors_origins: list[str] = ["http://localhost:60010"]
    data_ttl_seconds: int = 3600
    max_datasets: int = 5
    max_upload_bytes: int = 536_870_912
    max_total_bytes: int = 2_147_483_648
    host: str = "127.0.0.1"
    port: int = 8000


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`src/osipy_rest_api/core/errors.py`:
```python
"""Domain errors, each mapping to an HTTP status code."""

from __future__ import annotations


class ApiError(Exception):
    status_code: int = 500

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFoundError(ApiError):
    status_code = 404


class InvalidInputError(ApiError):
    status_code = 422


class JobStateError(ApiError):
    status_code = 409


class PayloadTooLargeError(ApiError):
    status_code = 413


class CapacityError(ApiError):
    status_code = 429
```

`src/osipy_rest_api/core/domain.py`:
```python
"""In-memory domain objects. Must not import osipy or nibabel."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum

import numpy as np


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass
class MaskSpec:
    type: str = "auto"
    percentile: float = 5.0


@dataclass
class FitConfig:
    method: str = "segmented"
    b_threshold: float = 200.0
    mask: MaskSpec = field(default_factory=MaskSpec)


@dataclass
class Dataset:
    id: str
    data: np.ndarray
    affine: np.ndarray
    b_values: np.ndarray
    created_at: float

    @property
    def shape(self) -> tuple[int, ...]:
        return tuple(self.data.shape)

    @property
    def nbytes(self) -> int:
        return int(self.data.nbytes)


@dataclass
class FitResult:
    maps: dict[str, object]  # osipy ParameterMap instances
    r_squared: np.ndarray | None
    summary: dict


@dataclass
class Job:
    id: str
    dataset_id: str
    config: FitConfig
    status: JobStatus = JobStatus.PENDING
    progress: float = 0.0
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    result: FitResult | None = None
    error: str | None = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_config_domain.py -v`
Expected: PASS (8 tests). If `test_get_settings_is_cached` interferes with
`test_settings_env_override` ordering, clear the cache in a fixture — add to
`tests/conftest.py` later; for now the monkeypatch test constructs `Settings()`
directly so ordering is safe.

- [ ] **Step 5: Commit**

```bash
git add src/ tests/test_config_domain.py
git commit -m "feat: settings, domain dataclasses, and typed API errors

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

---

## Task 4: NIfTI I/O (in-memory)

**Files:**
- Create: `src/osipy_rest_api/core/nifti_io.py`
- Test: `tests/test_nifti_io.py`

**Interfaces:**
- Consumes: `core.errors.InvalidInputError`.
- Produces:
  - `parse_nifti_bytes(raw: bytes, filename: str = "upload.nii.gz") -> tuple[np.ndarray, np.ndarray]`
    — returns `(data, affine)`; `data` is `float64`, exactly 4 dims;
    raises `InvalidInputError` if not parseable or not 4D. Handles both
    gzipped (`.nii.gz` / gzip magic `0x1f 0x8b`) and plain `.nii`.
  - `parse_bval_bytes(raw: bytes) -> np.ndarray`
    — parses whitespace-separated floats (any number of lines); raises
    `InvalidInputError` if empty or non-numeric.
  - `parameter_map_to_nifti_bytes(param_map: object) -> bytes`
    — `param_map` is an osipy `ParameterMap`; uses `.values` and `.affine`;
    returns gzipped NIfTI bytes with `float32` data.
  - `maps_to_zip_bytes(maps: dict[str, object]) -> bytes`
    — zip archive; entry names `D.nii.gz`, `D_star.nii.gz`, `f.nii.gz`,
    `S0.nii.gz` mapped from keys `d`, `d_star`, `f`, `s0`.
  - `MAP_FILENAMES = {"d": "D.nii.gz", "d_star": "D_star.nii.gz", "f": "f.nii.gz", "s0": "S0.nii.gz"}`

- [ ] **Step 1: Write the failing test**

`tests/test_nifti_io.py`:
```python
import gzip
import io
import zipfile
from dataclasses import dataclass

import nibabel as nib
import numpy as np
import pytest

from osipy_rest_api.core.errors import InvalidInputError
from osipy_rest_api.core.nifti_io import (
    MAP_FILENAMES,
    maps_to_zip_bytes,
    parameter_map_to_nifti_bytes,
    parse_bval_bytes,
    parse_nifti_bytes,
)
from tests.fixtures.synthetic import bval_bytes, make_ivim_volume, nifti_bytes


@dataclass
class FakeParameterMap:
    values: np.ndarray
    affine: np.ndarray


def test_parse_nifti_bytes_gzipped_roundtrip():
    data, _ = make_ivim_volume(shape=(3, 3, 2))
    out_data, affine = parse_nifti_bytes(nifti_bytes(data, gzip=True))
    assert out_data.shape == data.shape
    assert out_data.dtype == np.float64
    assert np.allclose(out_data, data, atol=1e-4)
    assert affine.shape == (4, 4)


def test_parse_nifti_bytes_plain_roundtrip():
    data, _ = make_ivim_volume(shape=(2, 2, 2))
    out_data, _ = parse_nifti_bytes(nifti_bytes(data, gzip=False), "upload.nii")
    assert np.allclose(out_data, data, atol=1e-4)


def test_parse_nifti_bytes_rejects_3d():
    img_3d = nib.Nifti1Image(np.zeros((4, 4, 4), np.float32), np.eye(4))
    with pytest.raises(InvalidInputError):
        parse_nifti_bytes(img_3d.to_bytes(), "x.nii")


def test_parse_nifti_bytes_rejects_garbage():
    with pytest.raises(InvalidInputError):
        parse_nifti_bytes(b"not a nifti file", "x.nii")


def test_parse_bval_bytes_multiline_and_whitespace():
    raw = b"0 10   20\n50 100 200\n400\t800\n"
    assert np.allclose(parse_bval_bytes(raw),
                       [0, 10, 20, 50, 100, 200, 400, 800])


def test_parse_bval_bytes_rejects_empty():
    with pytest.raises(InvalidInputError):
        parse_bval_bytes(b"   \n  ")


def test_parse_bval_bytes_rejects_nonnumeric():
    with pytest.raises(InvalidInputError):
        parse_bval_bytes(b"0 10 twenty")


def test_parameter_map_to_nifti_bytes_is_loadable():
    pm = FakeParameterMap(values=np.random.rand(4, 4, 2).astype(float),
                          affine=np.eye(4))
    raw = parameter_map_to_nifti_bytes(pm)
    img = nib.Nifti1Image.from_bytes(gzip.decompress(raw))
    assert img.shape == (4, 4, 2)
    assert np.allclose(img.get_fdata(), pm.values, atol=1e-5)


def test_maps_to_zip_bytes_has_four_named_entries():
    maps = {k: FakeParameterMap(np.zeros((2, 2, 2)), np.eye(4))
            for k in ("d", "d_star", "f", "s0")}
    archive = zipfile.ZipFile(io.BytesIO(maps_to_zip_bytes(maps)))
    assert set(archive.namelist()) == set(MAP_FILENAMES.values())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_nifti_io.py -v`
Expected: FAIL — `ModuleNotFoundError: osipy_rest_api.core.nifti_io`

- [ ] **Step 3: Write the implementation**

`src/osipy_rest_api/core/nifti_io.py`:
```python
"""In-memory NIfTI and b-value parsing and serialization.

One of only two modules permitted to import nibabel. No temp files: everything
goes through io.BytesIO so sensitive image data never touches disk.
"""

from __future__ import annotations

import gzip
import io
import zipfile

import nibabel as nib
import numpy as np

from osipy_rest_api.core.errors import InvalidInputError

MAP_FILENAMES = {
    "d": "D.nii.gz",
    "d_star": "D_star.nii.gz",
    "f": "f.nii.gz",
    "s0": "S0.nii.gz",
}

_GZIP_MAGIC = b"\x1f\x8b"


def parse_nifti_bytes(
    raw: bytes, filename: str = "upload.nii.gz"
) -> tuple[np.ndarray, np.ndarray]:
    payload = gzip.decompress(raw) if raw[:2] == _GZIP_MAGIC else raw
    try:
        img = nib.Nifti1Image.from_bytes(payload)
    except Exception as exc:  # nibabel raises a variety of types
        raise InvalidInputError(
            f"could not read {filename} as a NIfTI image: {exc}"
        ) from exc
    if img.ndim != 4:
        raise InvalidInputError(
            f"expected a 4D DWI volume, got {img.ndim}D with shape {img.shape}"
        )
    data = np.asarray(img.get_fdata(), dtype=np.float64)
    return data, np.asarray(img.affine, dtype=np.float64)


def parse_bval_bytes(raw: bytes) -> np.ndarray:
    text = raw.decode("utf-8", errors="replace").strip()
    if not text:
        raise InvalidInputError("b-value file is empty")
    try:
        values = [float(tok) for tok in text.split()]
    except ValueError as exc:
        raise InvalidInputError(f"b-value file has a non-numeric entry: {exc}") from exc
    if not values:
        raise InvalidInputError("b-value file contains no numbers")
    return np.asarray(values, dtype=float)


def parameter_map_to_nifti_bytes(param_map: object) -> bytes:
    values = np.asarray(param_map.values, dtype=np.float32)  # type: ignore[attr-defined]
    affine = np.asarray(param_map.affine, dtype=np.float64)  # type: ignore[attr-defined]
    img = nib.Nifti1Image(values, affine)
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(img.to_bytes())
    return buf.getvalue()


def maps_to_zip_bytes(maps: dict[str, object]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for key, filename in MAP_FILENAMES.items():
            if key in maps:
                archive.writestr(filename, parameter_map_to_nifti_bytes(maps[key]))
    return buf.getvalue()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_nifti_io.py -v`
Expected: PASS (9 tests). If `nib.Nifti1Image.from_bytes` rejects the plain
`.nii` payload in `test_parse_nifti_bytes_plain_roundtrip`, confirm the fixture
calls `img.to_bytes()` (uncompressed) — it does.

- [ ] **Step 5: Commit**

```bash
git add src/osipy_rest_api/core/nifti_io.py tests/test_nifti_io.py
git commit -m "feat: in-memory NIfTI and b-value parsing/serialization

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

---

## Task 5: In-memory storage

**Files:**
- Create: `src/osipy_rest_api/core/storage.py`
- Test: `tests/test_storage.py`

**Interfaces:**
- Consumes: `core.domain.Dataset`, `core.domain.Job`, `core.errors.CapacityError`.
- Produces:
  - `class Storage(Protocol)` with async methods:
    `put_dataset(ds: Dataset) -> None`, `get_dataset(dataset_id: str) -> Dataset | None`,
    `delete_dataset(dataset_id: str) -> bool`, `list_datasets() -> list[Dataset]`,
    `total_bytes() -> int`, `put_job(job: Job) -> None`,
    `get_job(job_id: str) -> Job | None`, `update_job(job_id: str, **fields) -> None`,
    `list_jobs() -> list[Job]`, `clear() -> None`, `sweep(now: float | None = None) -> int`
    (returns count evicted).
  - `class InMemoryStorage:` constructed as
    `InMemoryStorage(max_datasets: int, max_total_bytes: int, ttl_seconds: int)`.
    - `put_dataset` raises `CapacityError` when `len(datasets) >= max_datasets`
      or `current_total + ds.nbytes > max_total_bytes`.
    - `delete_dataset` also removes every job whose `dataset_id` matches.
    - `update_job` mutates the stored `Job` in place; unknown `job_id` raises
      `NotFoundError`.
    - `sweep(now)` removes datasets and jobs with `created_at < now - ttl_seconds`
      (deleting a dataset cascades to its jobs); returns the number of
      datasets + jobs removed.
    - `clear()` empties both stores.
    - All mutating methods hold a single `asyncio.Lock`.

- [ ] **Step 1: Write the failing test**

`tests/test_storage.py`:
```python
import numpy as np
import pytest

from osipy_rest_api.core.domain import Dataset, FitConfig, Job
from osipy_rest_api.core.errors import CapacityError, NotFoundError
from osipy_rest_api.core.storage import InMemoryStorage


def _dataset(id_: str, created_at: float = 1000.0, voxels: int = 8) -> Dataset:
    data = np.zeros((voxels, 1, 1, 4), dtype=np.float64)
    return Dataset(id=id_, data=data, affine=np.eye(4),
                   b_values=np.arange(4.0), created_at=created_at)


@pytest.fixture
def storage() -> InMemoryStorage:
    return InMemoryStorage(max_datasets=3, max_total_bytes=10_000, ttl_seconds=3600)


async def test_put_and_get_dataset(storage):
    ds = _dataset("a")
    await storage.put_dataset(ds)
    assert await storage.get_dataset("a") is ds
    assert await storage.get_dataset("missing") is None


async def test_dataset_count_cap(storage):
    for i in range(3):
        await storage.put_dataset(_dataset(str(i)))
    with pytest.raises(CapacityError):
        await storage.put_dataset(_dataset("overflow"))


async def test_dataset_byte_cap():
    s = InMemoryStorage(max_datasets=100, max_total_bytes=500, ttl_seconds=3600)
    await s.put_dataset(_dataset("a", voxels=8))   # 8*4*8 = 256 bytes
    with pytest.raises(CapacityError):
        await s.put_dataset(_dataset("b", voxels=16))  # +512 -> over 500


async def test_delete_dataset_cascades_to_jobs(storage):
    await storage.put_dataset(_dataset("a"))
    await storage.put_job(Job(id="j1", dataset_id="a", config=FitConfig()))
    await storage.put_job(Job(id="j2", dataset_id="other", config=FitConfig()))
    assert await storage.delete_dataset("a") is True
    assert await storage.get_job("j1") is None
    assert await storage.get_job("j2") is not None


async def test_update_job_in_place_and_unknown(storage):
    await storage.put_job(Job(id="j", dataset_id="d", config=FitConfig()))
    await storage.update_job("j", progress=0.5, error="boom")
    job = await storage.get_job("j")
    assert job.progress == 0.5
    assert job.error == "boom"
    with pytest.raises(NotFoundError):
        await storage.update_job("nope", progress=1.0)


async def test_sweep_evicts_expired(storage):
    await storage.put_dataset(_dataset("old", created_at=0.0))
    await storage.put_job(Job(id="j", dataset_id="old", config=FitConfig(),
                              created_at=0.0))
    await storage.put_dataset(_dataset("fresh", created_at=10_000.0))
    removed = await storage.sweep(now=10_000.0)
    assert removed == 2  # old dataset + its job
    assert await storage.get_dataset("old") is None
    assert await storage.get_dataset("fresh") is not None


async def test_clear(storage):
    await storage.put_dataset(_dataset("a"))
    await storage.clear()
    assert await storage.list_datasets() == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_storage.py -v`
Expected: FAIL — `ModuleNotFoundError: osipy_rest_api.core.storage`

- [ ] **Step 3: Write the implementation**

`src/osipy_rest_api/core/storage.py`:
```python
"""In-memory storage for datasets and jobs.

The Storage protocol is the seam where disk-backed persistence would later
attach. InMemoryStorage keeps everything in two dicts guarded by one lock,
enforces capacity caps, and evicts on a TTL.
"""

from __future__ import annotations

import asyncio
import time
from typing import Protocol

from osipy_rest_api.core.domain import Dataset, Job
from osipy_rest_api.core.errors import CapacityError, NotFoundError


class Storage(Protocol):
    async def put_dataset(self, ds: Dataset) -> None: ...
    async def get_dataset(self, dataset_id: str) -> Dataset | None: ...
    async def delete_dataset(self, dataset_id: str) -> bool: ...
    async def list_datasets(self) -> list[Dataset]: ...
    async def total_bytes(self) -> int: ...
    async def put_job(self, job: Job) -> None: ...
    async def get_job(self, job_id: str) -> Job | None: ...
    async def update_job(self, job_id: str, **fields: object) -> None: ...
    async def list_jobs(self) -> list[Job]: ...
    async def clear(self) -> None: ...
    async def sweep(self, now: float | None = None) -> int: ...


class InMemoryStorage:
    def __init__(
        self, max_datasets: int, max_total_bytes: int, ttl_seconds: int
    ) -> None:
        self._max_datasets = max_datasets
        self._max_total_bytes = max_total_bytes
        self._ttl = ttl_seconds
        self._datasets: dict[str, Dataset] = {}
        self._jobs: dict[str, Job] = {}
        self._lock = asyncio.Lock()

    async def put_dataset(self, ds: Dataset) -> None:
        async with self._lock:
            if len(self._datasets) >= self._max_datasets:
                raise CapacityError(
                    f"dataset limit reached ({self._max_datasets}); "
                    "delete an existing dataset first"
                )
            current = sum(d.nbytes for d in self._datasets.values())
            if current + ds.nbytes > self._max_total_bytes:
                raise CapacityError(
                    "in-memory data limit reached; delete an existing dataset first"
                )
            self._datasets[ds.id] = ds

    async def get_dataset(self, dataset_id: str) -> Dataset | None:
        return self._datasets.get(dataset_id)

    async def delete_dataset(self, dataset_id: str) -> bool:
        async with self._lock:
            existed = self._datasets.pop(dataset_id, None) is not None
            for jid in [j.id for j in self._jobs.values() if j.dataset_id == dataset_id]:
                self._jobs.pop(jid, None)
            return existed

    async def list_datasets(self) -> list[Dataset]:
        return list(self._datasets.values())

    async def total_bytes(self) -> int:
        return sum(d.nbytes for d in self._datasets.values())

    async def put_job(self, job: Job) -> None:
        async with self._lock:
            self._jobs[job.id] = job

    async def get_job(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    async def update_job(self, job_id: str, **fields: object) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise NotFoundError(f"job {job_id} not found")
            for key, value in fields.items():
                setattr(job, key, value)

    async def list_jobs(self) -> list[Job]:
        return list(self._jobs.values())

    async def clear(self) -> None:
        async with self._lock:
            self._datasets.clear()
            self._jobs.clear()

    async def sweep(self, now: float | None = None) -> int:
        now = time.time() if now is None else now
        cutoff = now - self._ttl
        async with self._lock:
            stale_ds = [d.id for d in self._datasets.values() if d.created_at < cutoff]
            removed = 0
            for did in stale_ds:
                self._datasets.pop(did, None)
                removed += 1
            stale_jobs = [
                j.id
                for j in self._jobs.values()
                if j.created_at < cutoff or j.dataset_id in stale_ds
            ]
            for jid in stale_jobs:
                if self._jobs.pop(jid, None) is not None:
                    removed += 1
            return removed
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_storage.py -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/osipy_rest_api/core/storage.py tests/test_storage.py
git commit -m "feat: in-memory storage with capacity caps and TTL sweep

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

---

## Task 6: osipy integration module

**Files:**
- Create: `src/osipy_rest_api/core/ivim.py`
- Test: `tests/test_ivim.py`

**Interfaces:**
- Consumes: `core.domain.Dataset`, `core.domain.FitConfig`, `core.domain.FitResult`,
  `core.errors.InvalidInputError`.
- Produces:
  - `validate_fit_config(config: FitConfig, dataset: Dataset) -> None`
    — raises `InvalidInputError` unless: `config.method in {"segmented","full","bayesian"}`;
    `min(b) <= config.b_threshold <= max(b)`; at least one b-value `< config.b_threshold`
    and one `>= config.b_threshold`; `0 < config.mask.percentile < 100`.
  - `run_fit(dataset: Dataset, config: FitConfig, progress_callback: "Callable[[float], None] | None" = None) -> FitResult`
    — builds an auto mask from the b≈0 volume
    (`b0 = data[..., int(argmin(b_values))]`;
    `thr = percentile(b0[b0 > 0], config.mask.percentile)`; `mask = b0 > thr`),
    calls `osipy.fit_ivim(signal=data, b_values=b, mask=mask, params=IVIMFitParams(method=FittingMethod(config.method), b_threshold=config.b_threshold), progress_callback=progress_callback)`,
    returns `FitResult(maps={"d": r.d_map, "d_star": r.d_star_map, "f": r.f_map, "s0": r.s0_map}, r_squared=r.r_squared, summary=build_summary(r))`.
  - `build_summary(result: object) -> dict`
    — `{"fit_success_rate": stats.get("fit_success_rate"), "n_voxels_fitted": stats.get("n_voxels_fitted"), "n_voxels_total": stats.get("n_voxels_total"), "maps": {key: {**pm.statistics(), "valid_fraction": pm.valid_fraction, "units": pm.units} for key, pm in maps.items()}}`
    where `stats = result.fitting_stats`.
  - `voxel_detail(dataset: Dataset, fit_result: FitResult, x: int, y: int, z: int) -> dict`
    — raises `InvalidInputError` if `(x, y, z)` is outside `dataset.shape[:3]`;
    returns `{"voxel": [x, y, z], "b_values": b.tolist(), "signal": data[x, y, z, :].tolist(), "params": {"d": ..., "d_star": ..., "f": ..., "s0": ...}, "fitted_curve": IVIMBiexponentialModel().predict(b, IVIMParams(s0=s0, d=d, d_star=d_star, f=f)).tolist(), "r_squared": (None or float(fit_result.r_squared[x, y, z]))}`.

- [ ] **Step 1: Write the failing test**

`tests/test_ivim.py`:
```python
import numpy as np
import pytest

from osipy_rest_api.core.domain import Dataset, FitConfig, MaskSpec
from osipy_rest_api.core.errors import InvalidInputError
from osipy_rest_api.core.ivim import (
    build_summary,
    run_fit,
    validate_fit_config,
    voxel_detail,
)
from tests.fixtures.synthetic import make_ivim_volume


def _dataset(noise=0.0, seed=0):
    data, b = make_ivim_volume(shape=(4, 4, 2), noise_sigma=noise, seed=seed)
    return Dataset(id="d", data=data, affine=np.eye(4), b_values=b, created_at=0.0)


def test_validate_fit_config_accepts_defaults():
    validate_fit_config(FitConfig(), _dataset())  # no raise


def test_validate_fit_config_rejects_b_threshold_out_of_range():
    ds = _dataset()
    with pytest.raises(InvalidInputError):
        validate_fit_config(FitConfig(b_threshold=5000.0), ds)


def test_validate_fit_config_rejects_bad_percentile():
    with pytest.raises(InvalidInputError):
        validate_fit_config(FitConfig(mask=MaskSpec(percentile=0.0)), _dataset())


def test_run_fit_recovers_known_parameters():
    # Clean synthetic data with D=1.2e-3, D*=20e-3, f=0.15.
    result = run_fit(_dataset(noise=0.0), FitConfig())
    d = np.nanmean(result.maps["d"].values)
    f = np.nanmean(result.maps["f"].values)
    # Tolerances: segmented fitting on noiseless data should land close.
    # These bounds encode a scientific judgement — see the design spec.
    assert d == pytest.approx(1.2e-3, rel=0.15)
    assert f == pytest.approx(0.15, abs=0.05)


def test_build_summary_shape():
    result = run_fit(_dataset(noise=0.0), FitConfig())
    summary = result.summary
    assert set(summary["maps"]) == {"d", "d_star", "f", "s0"}
    assert "mean" in summary["maps"]["d"]
    assert "valid_fraction" in summary["maps"]["d"]
    assert "units" in summary["maps"]["d"]
    assert "fit_success_rate" in summary


def test_voxel_detail_curve_matches_signal_for_clean_voxel():
    ds = _dataset(noise=0.0)
    result = run_fit(ds, FitConfig())
    detail = voxel_detail(ds, result, 1, 1, 0)
    assert detail["voxel"] == [1, 1, 0]
    assert len(detail["signal"]) == len(ds.b_values)
    assert len(detail["fitted_curve"]) == len(ds.b_values)
    signal = np.array(detail["signal"])
    fitted = np.array(detail["fitted_curve"])
    # Clean data: fitted curve tracks the measured signal closely.
    assert np.allclose(fitted, signal, rtol=0.05, atol=1.0)


def test_voxel_detail_rejects_out_of_bounds():
    ds = _dataset()
    result = run_fit(ds, FitConfig())
    with pytest.raises(InvalidInputError):
        voxel_detail(ds, result, 99, 0, 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_ivim.py -v`
Expected: FAIL — `ModuleNotFoundError: osipy_rest_api.core.ivim`

- [ ] **Step 3: Write the implementation**

`src/osipy_rest_api/core/ivim.py`:
```python
"""All osipy IVIM calls live here. The only module (with nifti_io) that may
import osipy."""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from osipy import fit_ivim
from osipy.ivim.fitting.estimators import FittingMethod, IVIMFitParams
from osipy.ivim.models.biexponential import IVIMBiexponentialModel, IVIMParams

from osipy_rest_api.core.domain import Dataset, FitConfig, FitResult
from osipy_rest_api.core.errors import InvalidInputError

_METHODS = {"segmented", "full", "bayesian"}
_MAP_KEYS = ("d", "d_star", "f", "s0")


def validate_fit_config(config: FitConfig, dataset: Dataset) -> None:
    if config.method not in _METHODS:
        raise InvalidInputError(
            f"unknown fitting method {config.method!r}; "
            f"choose one of {sorted(_METHODS)}"
        )
    b = np.asarray(dataset.b_values, dtype=float)
    lo, hi = float(b.min()), float(b.max())
    if not lo <= config.b_threshold <= hi:
        raise InvalidInputError(
            f"b_threshold {config.b_threshold} is outside the acquired "
            f"b-value range [{lo}, {hi}]"
        )
    if not (np.any(b < config.b_threshold) and np.any(b >= config.b_threshold)):
        raise InvalidInputError(
            "b_threshold must split the b-values into a low and a high group; "
            f"none fall on one side of {config.b_threshold}"
        )
    if not 0.0 < config.mask.percentile < 100.0:
        raise InvalidInputError("mask percentile must be between 0 and 100 (exclusive)")


def _auto_mask(dataset: Dataset, percentile: float) -> np.ndarray:
    b = np.asarray(dataset.b_values, dtype=float)
    b0 = dataset.data[..., int(b.argmin())]
    positive = b0[b0 > 0]
    threshold = float(np.percentile(positive, percentile)) if positive.size else 0.0
    return b0 > threshold


def build_summary(result: object) -> dict:
    stats = getattr(result, "fitting_stats", {}) or {}
    maps = {
        "d": result.d_map,        # type: ignore[attr-defined]
        "d_star": result.d_star_map,  # type: ignore[attr-defined]
        "f": result.f_map,        # type: ignore[attr-defined]
        "s0": result.s0_map,      # type: ignore[attr-defined]
    }
    return {
        "fit_success_rate": stats.get("fit_success_rate"),
        "n_voxels_fitted": stats.get("n_voxels_fitted"),
        "n_voxels_total": stats.get("n_voxels_total"),
        "maps": {
            key: {
                **pm.statistics(),
                "valid_fraction": pm.valid_fraction,
                "units": pm.units,
            }
            for key, pm in maps.items()
        },
    }


def run_fit(
    dataset: Dataset,
    config: FitConfig,
    progress_callback: Callable[[float], None] | None = None,
) -> FitResult:
    mask = _auto_mask(dataset, config.mask.percentile)
    params = IVIMFitParams(
        method=FittingMethod(config.method),
        b_threshold=config.b_threshold,
    )
    result = fit_ivim(
        signal=dataset.data,
        b_values=np.asarray(dataset.b_values, dtype=float),
        mask=mask,
        params=params,
        progress_callback=progress_callback,
    )
    return FitResult(
        maps={
            "d": result.d_map,
            "d_star": result.d_star_map,
            "f": result.f_map,
            "s0": result.s0_map,
        },
        r_squared=result.r_squared,
        summary=build_summary(result),
    )


def voxel_detail(
    dataset: Dataset, fit_result: FitResult, x: int, y: int, z: int
) -> dict:
    nx, ny, nz = dataset.shape[:3]
    if not (0 <= x < nx and 0 <= y < ny and 0 <= z < nz):
        raise InvalidInputError(
            f"voxel ({x}, {y}, {z}) is outside the volume {(nx, ny, nz)}"
        )
    b = np.asarray(dataset.b_values, dtype=float)
    params = {
        key: float(fit_result.maps[key].values[x, y, z])  # type: ignore[attr-defined]
        for key in _MAP_KEYS
    }
    curve = IVIMBiexponentialModel().predict(
        b,
        IVIMParams(
            s0=params["s0"], d=params["d"], d_star=params["d_star"], f=params["f"]
        ),
    )
    r2 = fit_result.r_squared
    return {
        "voxel": [x, y, z],
        "b_values": b.tolist(),
        "signal": dataset.data[x, y, z, :].tolist(),
        "params": params,
        "fitted_curve": np.asarray(curve, dtype=float).tolist(),
        "r_squared": None if r2 is None else float(r2[x, y, z]),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_ivim.py -v`
Expected: PASS (7 tests). If `test_run_fit_recovers_known_parameters` fails
because `IVIMFitParams` does not accept `method=` as a keyword, fall back to
passing `method=FittingMethod(config.method)` as the `fit_ivim(..., method=...)`
argument instead and drop it from `IVIMFitParams` — both are in the verified
signature. If the recovered `d` is outside `rel=0.15`, widen to `rel=0.25` and
record the observed value and the widening as a comment citing that segmented
fitting on this b-value spacing is the cause — a tolerance change is a
scientific decision, note it in the test and in `LOG.md`.

- [ ] **Step 5: Commit**

```bash
git add src/osipy_rest_api/core/ivim.py tests/test_ivim.py
git commit -m "feat: osipy IVIM integration — validate, fit, summarize, voxel detail

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

---

## Task 7: In-process job runner

**Files:**
- Create: `src/osipy_rest_api/core/jobs.py`
- Test: `tests/test_jobs.py`

**Interfaces:**
- Consumes: `core.domain.Job`, `core.domain.JobStatus`, `core.domain.FitConfig`,
  `core.storage.Storage`, `core.ivim.run_fit`.
- Produces:
  - `class JobRunner(Protocol)`: `async def submit(self, dataset_id: str, config: FitConfig) -> str` (returns job_id);
    `async def wait(self, job_id: str) -> None` (test helper — awaits the
    task for that job; no-op if unknown or already done).
  - `class InProcessJobRunner:` constructed as
    `InProcessJobRunner(storage: Storage, fit_fn: Callable[..., FitResult] = run_fit)`.
    - `submit`: creates `Job(id=uuid4().hex, dataset_id=..., config=...)`,
      `await storage.put_job(job)`, schedules `asyncio.create_task(self._run(job.id))`,
      keeps the task in `self._tasks[job.id]`, returns `job.id`.
    - `_run(job_id)`:
      1. `await storage.update_job(job_id, status=JobStatus.RUNNING)`
      2. `job = await storage.get_job(job_id)`; `dataset = await storage.get_dataset(job.dataset_id)`
      3. if `dataset is None`: `update_job(status=FAILED, error="dataset no longer available", finished_at=time.time())`; return
      4. build `progress_cb` that calls
         `loop.call_soon_threadsafe(lambda v=value: asyncio.create_task(storage.update_job(job_id, progress=float(v))))`
         — capture the running loop before entering the thread.
      5. `async with self._semaphore:` `result = await asyncio.to_thread(self._fit_fn, dataset, job.config, progress_cb)`
      6. success: `update_job(status=SUCCEEDED, progress=1.0, result=result, finished_at=time.time())`
      7. `except Exception as exc:` `update_job(status=FAILED, error=str(exc), finished_at=time.time())`; log with `logging.getLogger(__name__).exception(...)`.
    - `self._semaphore = asyncio.Semaphore(1)` — one fit at a time.

- [ ] **Step 1: Write the failing test**

`tests/test_jobs.py`:
```python
import numpy as np
import pytest

from osipy_rest_api.core.domain import Dataset, FitConfig, FitResult, JobStatus
from osipy_rest_api.core.jobs import InProcessJobRunner
from osipy_rest_api.core.storage import InMemoryStorage


def _dataset(id_="d"):
    data = np.zeros((2, 2, 1, 4), dtype=np.float64)
    return Dataset(id=id_, data=data, affine=np.eye(4),
                   b_values=np.arange(4.0), created_at=0.0)


@pytest.fixture
def storage():
    return InMemoryStorage(max_datasets=10, max_total_bytes=10**9, ttl_seconds=3600)


async def test_successful_job_lifecycle(storage):
    await storage.put_dataset(_dataset())

    def fake_fit(dataset, config, progress_cb):
        if progress_cb:
            progress_cb(0.5)
        return FitResult(maps={}, r_squared=None, summary={"ok": True})

    runner = InProcessJobRunner(storage, fit_fn=fake_fit)
    job_id = await runner.submit("d", FitConfig())
    await runner.wait(job_id)

    job = await storage.get_job(job_id)
    assert job.status is JobStatus.SUCCEEDED
    assert job.progress == 1.0
    assert job.result.summary == {"ok": True}
    assert job.finished_at is not None


async def test_failed_fit_marks_job_failed(storage):
    await storage.put_dataset(_dataset())

    def boom(dataset, config, progress_cb):
        raise RuntimeError("fit exploded")

    runner = InProcessJobRunner(storage, fit_fn=boom)
    job_id = await runner.submit("d", FitConfig())
    await runner.wait(job_id)

    job = await storage.get_job(job_id)
    assert job.status is JobStatus.FAILED
    assert "fit exploded" in job.error


async def test_missing_dataset_fails_job(storage):
    def never_called(*a, **k):
        raise AssertionError("should not run")

    runner = InProcessJobRunner(storage, fit_fn=never_called)
    job_id = await runner.submit("absent", FitConfig())
    await runner.wait(job_id)

    job = await storage.get_job(job_id)
    assert job.status is JobStatus.FAILED
    assert "no longer available" in job.error


async def test_progress_callback_updates_job(storage):
    await storage.put_dataset(_dataset())
    seen = []

    def fit_with_progress(dataset, config, progress_cb):
        for p in (0.25, 0.5, 0.75):
            progress_cb(p)
            seen.append(p)
        return FitResult(maps={}, r_squared=None, summary={})

    runner = InProcessJobRunner(storage, fit_fn=fit_with_progress)
    job_id = await runner.submit("d", FitConfig())
    await runner.wait(job_id)
    # progress ends at 1.0 after success; the callback fired during the run
    assert seen == [0.25, 0.5, 0.75]
    assert (await storage.get_job(job_id)).progress == 1.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_jobs.py -v`
Expected: FAIL — `ModuleNotFoundError: osipy_rest_api.core.jobs`

- [ ] **Step 3: Write the implementation**

`src/osipy_rest_api/core/jobs.py`:
```python
"""Background fit execution.

The JobRunner protocol is the seam where a real queue / batch worker would
later attach. InProcessJobRunner runs each fit as an asyncio task that offloads
the CPU-bound osipy call with asyncio.to_thread, one at a time.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from typing import Protocol
from uuid import uuid4

from osipy_rest_api.core.domain import FitConfig, FitResult, Job, JobStatus
from osipy_rest_api.core.ivim import run_fit
from osipy_rest_api.core.storage import Storage

logger = logging.getLogger(__name__)


class JobRunner(Protocol):
    async def submit(self, dataset_id: str, config: FitConfig) -> str: ...
    async def wait(self, job_id: str) -> None: ...


class InProcessJobRunner:
    def __init__(
        self,
        storage: Storage,
        fit_fn: Callable[..., FitResult] = run_fit,
    ) -> None:
        self._storage = storage
        self._fit_fn = fit_fn
        self._tasks: dict[str, asyncio.Task] = {}
        self._semaphore = asyncio.Semaphore(1)

    async def submit(self, dataset_id: str, config: FitConfig) -> str:
        job = Job(id=uuid4().hex, dataset_id=dataset_id, config=config)
        await self._storage.put_job(job)
        self._tasks[job.id] = asyncio.create_task(self._run(job.id))
        return job.id

    async def wait(self, job_id: str) -> None:
        task = self._tasks.get(job_id)
        if task is not None:
            await asyncio.shield(task)

    async def _run(self, job_id: str) -> None:
        await self._storage.update_job(job_id, status=JobStatus.RUNNING)
        job = await self._storage.get_job(job_id)
        dataset = await self._storage.get_dataset(job.dataset_id)
        if dataset is None:
            await self._storage.update_job(
                job_id,
                status=JobStatus.FAILED,
                error="dataset no longer available",
                finished_at=time.time(),
            )
            return

        loop = asyncio.get_running_loop()

        def progress_cb(value: float) -> None:
            loop.call_soon_threadsafe(
                lambda: loop.create_task(
                    self._storage.update_job(job_id, progress=float(value))
                )
            )

        try:
            async with self._semaphore:
                result = await asyncio.to_thread(
                    self._fit_fn, dataset, job.config, progress_cb
                )
        except Exception as exc:  # noqa: BLE001 — surfaced to the client as job state
            logger.exception("fit job %s failed", job_id)
            await self._storage.update_job(
                job_id,
                status=JobStatus.FAILED,
                error=str(exc),
                finished_at=time.time(),
            )
            return

        await self._storage.update_job(
            job_id,
            status=JobStatus.SUCCEEDED,
            progress=1.0,
            result=result,
            finished_at=time.time(),
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_jobs.py -v`
Expected: PASS (4 tests). If `test_progress_callback_updates_job` is flaky
because the `call_soon_threadsafe` tasks have not drained by the time `wait()`
returns, add `await asyncio.sleep(0)` at the end of `_run` after the final
`update_job` — the final `progress=1.0` write is awaited directly so the
assertion on `1.0` is stable regardless.

- [ ] **Step 5: Commit**

```bash
git add src/osipy_rest_api/core/jobs.py tests/test_jobs.py
git commit -m "feat: in-process background job runner with progress bridging

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

---

## Task 8: Pydantic schemas and FastAPI dependencies

**Files:**
- Create: `src/osipy_rest_api/models/schemas.py`, `src/osipy_rest_api/deps.py`
- Test: `tests/test_schemas.py`

**Interfaces:**
- Consumes: `core.domain` (`FitConfig`, `MaskSpec`, `Dataset`, `Job`),
  `core.storage.Storage`, `core.storage.InMemoryStorage`,
  `core.jobs.JobRunner`, `core.jobs.InProcessJobRunner`, `config.Settings`,
  `config.get_settings`.
- Produces:
  - `models.schemas`:
    - `class MaskSpecIn(BaseModel): type: Literal["auto"] = "auto"; percentile: float = Field(5.0, gt=0, lt=100)`
    - `class FitRequest(BaseModel): method: Literal["segmented","full","bayesian"] = "segmented"; b_threshold: float = 200.0; mask: MaskSpecIn = MaskSpecIn()` with `.to_domain() -> FitConfig`.
    - `class DatasetMeta(BaseModel): dataset_id: str; shape: list[int]; b_values: list[float]; created_at: float` with `@classmethod from_domain(cls, ds: Dataset) -> "DatasetMeta"`.
    - `class FitCreated(BaseModel): job_id: str; status: str`
    - `class JobView(BaseModel): job_id: str; dataset_id: str; status: str; progress: float; config: FitRequest | None = None; summary: dict | None = None; error: str | None = None` with `@classmethod from_domain(cls, job: Job) -> "JobView"`.
    - `class VoxelView(BaseModel): voxel: list[int]; b_values: list[float]; signal: list[float]; params: dict[str, float]; fitted_curve: list[float]; r_squared: float | None`
    - `class Health(BaseModel): status: str = "ok"`
    - `class Root(BaseModel): name: str; version: str; docs: str`
  - `deps`:
    - `get_settings_dep() -> Settings` (wraps `config.get_settings`)
    - module-level `_storage` and `_runner` set by `main.build_app` via
      `set_container(storage, runner)`; `get_storage() -> Storage` and
      `get_job_runner() -> JobRunner` return them, raising `RuntimeError` if unset.

- [ ] **Step 1: Write the failing test**

`tests/test_schemas.py`:
```python
import numpy as np

from osipy_rest_api.core.domain import Dataset, FitConfig, Job, JobStatus
from osipy_rest_api.models.schemas import (
    DatasetMeta,
    FitRequest,
    JobView,
)


def test_fit_request_defaults_and_to_domain():
    req = FitRequest()
    cfg = req.to_domain()
    assert isinstance(cfg, FitConfig)
    assert cfg.method == "segmented"
    assert cfg.mask.percentile == 5.0


def test_fit_request_rejects_bad_percentile():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        FitRequest(mask={"type": "auto", "percentile": 150})


def test_dataset_meta_from_domain():
    ds = Dataset(id="abc", data=np.zeros((4, 4, 2, 8)), affine=np.eye(4),
                 b_values=np.array([0.0, 100.0, 800.0]), created_at=12.0)
    meta = DatasetMeta.from_domain(ds)
    assert meta.dataset_id == "abc"
    assert meta.shape == [4, 4, 2, 8]
    assert meta.b_values == [0.0, 100.0, 800.0]


def test_job_view_from_domain_succeeded():
    job = Job(id="j", dataset_id="d", config=FitConfig(),
              status=JobStatus.SUCCEEDED, progress=1.0)
    job.result = type("R", (), {"summary": {"fit_success_rate": 0.9}})()
    view = JobView.from_domain(job)
    assert view.status == "succeeded"
    assert view.summary == {"fit_success_rate": 0.9}


def test_job_view_from_domain_failed_has_error():
    job = Job(id="j", dataset_id="d", config=FitConfig(),
              status=JobStatus.FAILED, error="boom")
    view = JobView.from_domain(job)
    assert view.error == "boom"
    assert view.summary is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError: osipy_rest_api.models.schemas`

- [ ] **Step 3: Write the implementation**

`src/osipy_rest_api/models/schemas.py`:
```python
"""Pydantic request/response models and their mapping to domain objects."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from osipy_rest_api.core.domain import Dataset, FitConfig, Job, JobStatus, MaskSpec


class MaskSpecIn(BaseModel):
    type: Literal["auto"] = "auto"
    percentile: float = Field(5.0, gt=0, lt=100)


class FitRequest(BaseModel):
    method: Literal["segmented", "full", "bayesian"] = "segmented"
    b_threshold: float = 200.0
    mask: MaskSpecIn = MaskSpecIn()

    def to_domain(self) -> FitConfig:
        return FitConfig(
            method=self.method,
            b_threshold=self.b_threshold,
            mask=MaskSpec(type=self.mask.type, percentile=self.mask.percentile),
        )

    @classmethod
    def from_domain(cls, config: FitConfig) -> "FitRequest":
        return cls(
            method=config.method,
            b_threshold=config.b_threshold,
            mask=MaskSpecIn(type=config.mask.type, percentile=config.mask.percentile),
        )


class DatasetMeta(BaseModel):
    dataset_id: str
    shape: list[int]
    b_values: list[float]
    created_at: float

    @classmethod
    def from_domain(cls, ds: Dataset) -> "DatasetMeta":
        return cls(
            dataset_id=ds.id,
            shape=[int(n) for n in ds.shape],
            b_values=[float(v) for v in ds.b_values],
            created_at=ds.created_at,
        )


class FitCreated(BaseModel):
    job_id: str
    status: str


class JobView(BaseModel):
    job_id: str
    dataset_id: str
    status: str
    progress: float
    config: FitRequest | None = None
    summary: dict | None = None
    error: str | None = None

    @classmethod
    def from_domain(cls, job: Job) -> "JobView":
        summary = None
        if job.status is JobStatus.SUCCEEDED and job.result is not None:
            summary = job.result.summary
        return cls(
            job_id=job.id,
            dataset_id=job.dataset_id,
            status=job.status.value,
            progress=job.progress,
            config=FitRequest.from_domain(job.config),
            summary=summary,
            error=job.error,
        )


class VoxelView(BaseModel):
    voxel: list[int]
    b_values: list[float]
    signal: list[float]
    params: dict[str, float]
    fitted_curve: list[float]
    r_squared: float | None


class Health(BaseModel):
    status: str = "ok"


class Root(BaseModel):
    name: str
    version: str
    docs: str
```

`src/osipy_rest_api/deps.py`:
```python
"""FastAPI dependency providers. The container is set once by the app factory."""

from __future__ import annotations

from osipy_rest_api.config import Settings, get_settings
from osipy_rest_api.core.jobs import JobRunner
from osipy_rest_api.core.storage import Storage

_storage: Storage | None = None
_runner: JobRunner | None = None


def set_container(storage: Storage, runner: JobRunner) -> None:
    global _storage, _runner
    _storage = storage
    _runner = runner


def get_storage() -> Storage:
    if _storage is None:
        raise RuntimeError("storage not initialised; call set_container in the app factory")
    return _storage


def get_job_runner() -> JobRunner:
    if _runner is None:
        raise RuntimeError("job runner not initialised; call set_container in the app factory")
    return _runner


def get_settings_dep() -> Settings:
    return get_settings()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_schemas.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/osipy_rest_api/models/schemas.py src/osipy_rest_api/deps.py tests/test_schemas.py
git commit -m "feat: pydantic schemas and dependency container

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

---

## Task 9: App factory, meta routes, exception handlers, conftest

**Files:**
- Create: `src/osipy_rest_api/api/__init__.py`, `src/osipy_rest_api/api/meta.py`,
  `src/osipy_rest_api/main.py`, `tests/conftest.py`
- Test: `tests/test_meta_api.py`

**Interfaces:**
- Consumes: everything from tasks 3–8.
- Produces:
  - `main.build_app(settings: Settings | None = None) -> FastAPI`
    — creates `InMemoryStorage` and `InProcessJobRunner`, calls
    `deps.set_container(...)`, registers a lifespan that starts a background
    `sweep` loop task (interval `min(ttl // 4, 300)` seconds, guarded so a
    non-positive interval falls back to 300) and on shutdown cancels it and
    `await storage.clear()`, adds `CORSMiddleware` with `settings.cors_origins`,
    registers an exception handler for `ApiError` returning
    `JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})`,
    and includes the routers from `api.meta`, `api.datasets`, `api.fits`,
    `api.results`.
  - `main.app = build_app()` — module-level ASGI app for `uvicorn`.
  - `api.meta.router`: `GET /` -> `Root(name="osipy-rest-api", version=__version__, docs="/docs")`;
    `GET /health` -> `Health()`.
  - `tests/conftest.py`:
    - `@pytest.fixture def settings() -> Settings` — small caps
      (`max_datasets=3`, `max_total_bytes=50_000_000`, `data_ttl_seconds=3600`),
      cors `["http://testserver"]`.
    - `@pytest.fixture def app(settings)` — `build_app(settings)`.
    - `@pytest.fixture async def client(app)` — `httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")`, yields it.
    - `@pytest.fixture def storage(app) -> InMemoryStorage` — returns
      `deps.get_storage()`.
    - `@pytest.fixture def runner(app)` — returns `deps.get_job_runner()`.
    - `@pytest.fixture(autouse=True) def _reset_settings_cache()` — calls
      `get_settings.cache_clear()` before and after each test.
    - re-export `make_ivim_volume`, `nifti_bytes`, `bval_bytes` for convenience.

- [ ] **Step 1: Write the failing test**

`tests/test_meta_api.py`:
```python
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_root(client):
    resp = await client.get("/")
    body = resp.json()
    assert body["name"] == "osipy-rest-api"
    assert body["version"] == "0.1.0"
    assert body["docs"] == "/docs"


async def test_openapi_docs_served(client):
    assert (await client.get("/openapi.json")).status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_meta_api.py -v`
Expected: FAIL — fixtures / `osipy_rest_api.main` missing.

- [ ] **Step 3: Write the implementation**

`src/osipy_rest_api/api/__init__.py`: empty.

`src/osipy_rest_api/api/meta.py`:
```python
"""Liveness and root metadata routes."""

from __future__ import annotations

from fastapi import APIRouter

from osipy_rest_api import __version__
from osipy_rest_api.models.schemas import Health, Root

router = APIRouter(tags=["meta"])


@router.get("/", response_model=Root)
def root() -> Root:
    return Root(name="osipy-rest-api", version=__version__, docs="/docs")


@router.get("/health", response_model=Health)
def health() -> Health:
    return Health()
```

`src/osipy_rest_api/main.py`:
```python
"""Application factory and ASGI entry point."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from osipy_rest_api import __version__
from osipy_rest_api.api import datasets, fits, meta, results
from osipy_rest_api.config import Settings, get_settings
from osipy_rest_api.core.errors import ApiError
from osipy_rest_api.core.jobs import InProcessJobRunner
from osipy_rest_api.core.storage import InMemoryStorage
from osipy_rest_api.deps import set_container

logger = logging.getLogger(__name__)


def build_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    storage = InMemoryStorage(
        max_datasets=settings.max_datasets,
        max_total_bytes=settings.max_total_bytes,
        ttl_seconds=settings.data_ttl_seconds,
    )
    runner = InProcessJobRunner(storage)
    set_container(storage, runner)

    sweep_interval = min(settings.data_ttl_seconds // 4, 300) or 300

    @contextlib.asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        async def sweeper() -> None:
            while True:
                await asyncio.sleep(sweep_interval)
                removed = await storage.sweep()
                if removed:
                    logger.info("evicted %d expired datasets/jobs", removed)

        task = asyncio.create_task(sweeper())
        try:
            yield
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            await storage.clear()

    app = FastAPI(title="osipy REST API", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ApiError)
    async def _api_error_handler(_, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.include_router(meta.router)
    app.include_router(datasets.router)
    app.include_router(fits.router)
    app.include_router(results.router)
    return app


app = build_app()
```

`tests/conftest.py`:
```python
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from osipy_rest_api.config import Settings, get_settings
from osipy_rest_api.deps import get_job_runner, get_storage
from osipy_rest_api.main import build_app
from tests.fixtures.synthetic import (  # noqa: F401 — re-exported for tests
    DEFAULT_B_VALUES,
    bval_bytes,
    make_ivim_volume,
    nifti_bytes,
)


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def settings() -> Settings:
    return Settings(
        cors_origins=["http://testserver"],
        max_datasets=3,
        max_total_bytes=50_000_000,
        data_ttl_seconds=3600,
    )


@pytest.fixture
def app(settings):
    return build_app(settings)


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        async with app.router.lifespan_context(app):
            yield c


@pytest.fixture
def storage(app):
    return get_storage()


@pytest.fixture
def runner(app):
    return get_job_runner()
```

Note: tasks 10–12 create `api/datasets.py`, `api/fits.py`, `api/results.py`.
Until then `main.py` cannot import them. Create **stub routers** now so the app
imports: add to each of the three files just
`from fastapi import APIRouter` and `router = APIRouter()`. Each later task
replaces its stub with the real routes. Do this in Step 3 of THIS task.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_meta_api.py -v`
Expected: PASS (3 tests). Run the whole suite too:
`uv run pytest -v` — all prior tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/ tests/conftest.py tests/test_meta_api.py
git commit -m "feat: app factory, lifespan sweep, meta routes, test harness

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

---

## Task 10: Datasets endpoints

**Files:**
- Create: `src/osipy_rest_api/api/datasets.py` (replaces the stub)
- Test: `tests/test_datasets_api.py`

**Interfaces:**
- Consumes: `deps.get_storage`, `deps.get_settings_dep`, `core.nifti_io`,
  `core.domain.Dataset`, `core.errors`, `models.schemas.DatasetMeta`.
- Produces routes on `router` (no prefix):
  - `POST /datasets` — `multipart/form-data`:
    `nifti: UploadFile`, `bval: UploadFile | None = File(None)`,
    `b_values: str | None = Form(None)`. Behaviour:
    1. read `nifti` bytes; if `len > settings.max_upload_bytes` raise
       `PayloadTooLargeError`.
    2. `data, affine = parse_nifti_bytes(raw, nifti.filename)`.
    3. b-values: if `bval` provided, `parse_bval_bytes(await bval.read())`;
       elif `b_values` provided, `np.asarray(json.loads(b_values), dtype=float)`
       (raise `InvalidInputError` on bad JSON / not a list of numbers);
       else raise `InvalidInputError("provide a .bval file or a b_values JSON array")`.
    4. validate: `data.ndim == 4`; `len(b_values) == data.shape[3]`
       (else `InvalidInputError`); `len(b_values) >= 4`; `np.min(b_values) < 1.0`
       (at least one near-zero b-value).
    5. `ds = Dataset(id=uuid4().hex, data=data, affine=affine, b_values=b_values, created_at=time.time())`
    6. `await storage.put_dataset(ds)` (may raise `CapacityError` -> 429)
    7. return `201`, `DatasetMeta.from_domain(ds)`.
  - `GET /datasets/{dataset_id}` -> `DatasetMeta` or `NotFoundError`.
  - `DELETE /datasets/{dataset_id}` -> `204`; `NotFoundError` if it did not exist.

- [ ] **Step 1: Write the failing test**

`tests/test_datasets_api.py`:
```python
import json

import numpy as np

from tests.fixtures.synthetic import bval_bytes, make_ivim_volume, nifti_bytes


def _files(shape=(4, 4, 2), b=None):
    data, bvals = make_ivim_volume(shape=shape, b_values=b) if b is not None \
        else make_ivim_volume(shape=shape)
    return data, bvals


async def _upload(client, data, bvals, use_form=False):
    files = {"nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip")}
    if use_form:
        return await client.post("/datasets", files=files,
                                 data={"b_values": json.dumps([float(v) for v in bvals])})
    files["bval"] = ("dwi.bval", bval_bytes(bvals), "text/plain")
    return await client.post("/datasets", files=files)


async def test_upload_with_bval_file(client):
    data, bvals = _files()
    resp = await _upload(client, data, bvals)
    assert resp.status_code == 201
    body = resp.json()
    assert body["shape"] == [4, 4, 2, 8]
    assert body["b_values"][0] == 0.0
    assert "dataset_id" in body


async def test_upload_with_bvalues_form_field(client):
    data, bvals = _files()
    resp = await _upload(client, data, bvals, use_form=True)
    assert resp.status_code == 201


async def test_upload_dimension_mismatch(client):
    data, _ = _files()
    resp = await _upload(client, data, np.array([0.0, 100.0, 800.0]))  # 3 != 8
    assert resp.status_code == 422


async def test_upload_too_few_b_values(client):
    data, bvals = make_ivim_volume(shape=(4, 4, 2),
                                   b_values=np.array([0.0, 200.0, 800.0]))
    resp = await _upload(client, data, bvals)
    assert resp.status_code == 422


async def test_upload_missing_b_value_source(client):
    data, _ = _files()
    resp = await client.post(
        "/datasets",
        files={"nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip")},
    )
    assert resp.status_code == 422


async def test_upload_capacity_limit(client):
    # settings fixture sets max_datasets=3
    for _ in range(3):
        data, bvals = _files()
        assert (await _upload(client, data, bvals)).status_code == 201
    data, bvals = _files()
    assert (await _upload(client, data, bvals)).status_code == 429


async def test_get_and_delete_dataset(client):
    data, bvals = _files()
    dataset_id = (await _upload(client, data, bvals)).json()["dataset_id"]

    assert (await client.get(f"/datasets/{dataset_id}")).status_code == 200
    assert (await client.delete(f"/datasets/{dataset_id}")).status_code == 204
    assert (await client.get(f"/datasets/{dataset_id}")).status_code == 404


async def test_get_unknown_dataset(client):
    assert (await client.get("/datasets/nope")).status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_datasets_api.py -v`
Expected: FAIL — routes return 404/405 (stub router).

- [ ] **Step 3: Write the implementation**

`src/osipy_rest_api/api/datasets.py`:
```python
"""Dataset upload, retrieval, and deletion."""

from __future__ import annotations

import json
import time
from uuid import uuid4

import numpy as np
from fastapi import APIRouter, Depends, File, Form, UploadFile, status

from osipy_rest_api.config import Settings
from osipy_rest_api.core.domain import Dataset
from osipy_rest_api.core.errors import InvalidInputError, NotFoundError, PayloadTooLargeError
from osipy_rest_api.core.nifti_io import parse_bval_bytes, parse_nifti_bytes
from osipy_rest_api.core.storage import Storage
from osipy_rest_api.deps import get_settings_dep, get_storage
from osipy_rest_api.models.schemas import DatasetMeta

router = APIRouter(tags=["datasets"])


def _b_values_from_form(raw: str) -> np.ndarray:
    try:
        parsed = json.loads(raw)
        values = [float(v) for v in parsed]
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise InvalidInputError(
            f"b_values must be a JSON array of numbers: {exc}"
        ) from exc
    return np.asarray(values, dtype=float)


@router.post("/datasets", status_code=status.HTTP_201_CREATED, response_model=DatasetMeta)
async def create_dataset(
    nifti: UploadFile = File(...),
    bval: UploadFile | None = File(None),
    b_values: str | None = Form(None),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(get_settings_dep),
) -> DatasetMeta:
    raw = await nifti.read()
    if len(raw) > settings.max_upload_bytes:
        raise PayloadTooLargeError(
            f"upload is {len(raw)} bytes; limit is {settings.max_upload_bytes}"
        )
    data, affine = parse_nifti_bytes(raw, nifti.filename or "upload.nii.gz")

    if bval is not None:
        bvals = parse_bval_bytes(await bval.read())
    elif b_values is not None:
        bvals = _b_values_from_form(b_values)
    else:
        raise InvalidInputError("provide a .bval file or a b_values JSON array")

    if data.ndim != 4:
        raise InvalidInputError(f"expected a 4D volume, got {data.ndim}D")
    if bvals.shape[0] != data.shape[3]:
        raise InvalidInputError(
            f"b-value count ({bvals.shape[0]}) does not match the number of "
            f"volumes ({data.shape[3]})"
        )
    if bvals.shape[0] < 4:
        raise InvalidInputError("IVIM fitting needs at least 4 b-values")
    if float(np.min(bvals)) >= 1.0:
        raise InvalidInputError("at least one b-value must be approximately 0")

    ds = Dataset(
        id=uuid4().hex,
        data=data,
        affine=affine,
        b_values=bvals,
        created_at=time.time(),
    )
    await storage.put_dataset(ds)
    return DatasetMeta.from_domain(ds)


@router.get("/datasets/{dataset_id}", response_model=DatasetMeta)
async def get_dataset(
    dataset_id: str, storage: Storage = Depends(get_storage)
) -> DatasetMeta:
    ds = await storage.get_dataset(dataset_id)
    if ds is None:
        raise NotFoundError(f"dataset {dataset_id} not found")
    return DatasetMeta.from_domain(ds)


@router.delete("/datasets/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    dataset_id: str, storage: Storage = Depends(get_storage)
) -> None:
    if not await storage.delete_dataset(dataset_id):
        raise NotFoundError(f"dataset {dataset_id} not found")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_datasets_api.py -v`
Expected: PASS (8 tests). If FastAPI returns 422 for the missing-`nifti` case
before our handler runs, that is fine — the test only exercises the
missing-b-value path with `nifti` present.

- [ ] **Step 5: Commit**

```bash
git add src/osipy_rest_api/api/datasets.py tests/test_datasets_api.py
git commit -m "feat: dataset upload, retrieval, deletion endpoints

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

---

## Task 11: Fit endpoints

**Files:**
- Create: `src/osipy_rest_api/api/fits.py` (replaces the stub)
- Test: `tests/test_fits_api.py`

**Interfaces:**
- Consumes: `deps.get_storage`, `deps.get_job_runner`, `core.ivim.validate_fit_config`,
  `core.errors`, `models.schemas.FitRequest`, `FitCreated`, `JobView`.
- Produces routes:
  - `POST /datasets/{dataset_id}/fits` — JSON body `FitRequest` (defaults apply
    if body omitted). Behaviour: `ds = await storage.get_dataset(dataset_id)` or
    `NotFoundError`; `config = body.to_domain()`;
    `validate_fit_config(config, ds)` (raises `InvalidInputError` -> 422);
    `job_id = await runner.submit(dataset_id, config)`; return `202`,
    `FitCreated(job_id=job_id, status="pending")`.
  - `GET /fits/{job_id}` -> `JobView.from_domain(job)` or `NotFoundError`.

- [ ] **Step 1: Write the failing test**

`tests/test_fits_api.py`:
```python
import asyncio
import json

import numpy as np

from tests.fixtures.synthetic import bval_bytes, make_ivim_volume, nifti_bytes


async def _make_dataset(client, noise=0.0):
    data, bvals = make_ivim_volume(shape=(4, 4, 2), noise_sigma=noise)
    resp = await client.post(
        "/datasets",
        files={
            "nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip"),
            "bval": ("dwi.bval", bval_bytes(bvals), "text/plain"),
        },
    )
    return resp.json()["dataset_id"]


async def _poll(client, job_id, timeout=30.0):
    async with asyncio.timeout(timeout):
        while True:
            body = (await client.get(f"/fits/{job_id}")).json()
            if body["status"] in ("succeeded", "failed"):
                return body
            await asyncio.sleep(0.05)


async def test_start_fit_returns_202_and_job_id(client):
    dataset_id = await _make_dataset(client)
    resp = await client.post(f"/datasets/{dataset_id}/fits", json={"method": "segmented"})
    assert resp.status_code == 202
    assert resp.json()["status"] == "pending"
    assert "job_id" in resp.json()


async def test_start_fit_unknown_dataset(client):
    resp = await client.post("/datasets/nope/fits", json={})
    assert resp.status_code == 404


async def test_start_fit_bad_config(client):
    dataset_id = await _make_dataset(client)
    resp = await client.post(
        f"/datasets/{dataset_id}/fits", json={"b_threshold": 99999}
    )
    assert resp.status_code == 422


async def test_fit_runs_to_succeeded_with_summary(client):
    dataset_id = await _make_dataset(client, noise=0.0)
    job_id = (await client.post(f"/datasets/{dataset_id}/fits", json={})).json()["job_id"]
    body = await _poll(client, job_id)
    assert body["status"] == "succeeded"
    assert body["progress"] == 1.0
    assert set(body["summary"]["maps"]) == {"d", "d_star", "f", "s0"}


async def test_get_unknown_job(client):
    assert (await client.get("/fits/deadbeef")).status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_fits_api.py -v`
Expected: FAIL — stub router.

- [ ] **Step 3: Write the implementation**

`src/osipy_rest_api/api/fits.py`:
```python
"""Start IVIM fits and poll their status."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from osipy_rest_api.core.errors import NotFoundError
from osipy_rest_api.core.ivim import validate_fit_config
from osipy_rest_api.core.jobs import JobRunner
from osipy_rest_api.core.storage import Storage
from osipy_rest_api.deps import get_job_runner, get_storage
from osipy_rest_api.models.schemas import FitCreated, FitRequest, JobView

router = APIRouter(tags=["fits"])


@router.post(
    "/datasets/{dataset_id}/fits",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=FitCreated,
)
async def create_fit(
    dataset_id: str,
    body: FitRequest = FitRequest(),
    storage: Storage = Depends(get_storage),
    runner: JobRunner = Depends(get_job_runner),
) -> FitCreated:
    ds = await storage.get_dataset(dataset_id)
    if ds is None:
        raise NotFoundError(f"dataset {dataset_id} not found")
    config = body.to_domain()
    validate_fit_config(config, ds)
    job_id = await runner.submit(dataset_id, config)
    return FitCreated(job_id=job_id, status="pending")


@router.get("/fits/{job_id}", response_model=JobView)
async def get_fit(job_id: str, storage: Storage = Depends(get_storage)) -> JobView:
    job = await storage.get_job(job_id)
    if job is None:
        raise NotFoundError(f"job {job_id} not found")
    return JobView.from_domain(job)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_fits_api.py -v`
Expected: PASS (5 tests). If `body: FitRequest = FitRequest()` as a default
triggers a FastAPI warning about a mutable default, change the signature to
`body: FitRequest | None = None` and `config = (body or FitRequest()).to_domain()`.

- [ ] **Step 5: Commit**

```bash
git add src/osipy_rest_api/api/fits.py tests/test_fits_api.py
git commit -m "feat: start-fit and poll-status endpoints

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

---

## Task 12: Results endpoints

**Files:**
- Create: `src/osipy_rest_api/api/results.py` (replaces the stub)
- Test: `tests/test_results_api.py`

**Interfaces:**
- Consumes: `deps.get_storage`, `core.nifti_io` (`parameter_map_to_nifti_bytes`,
  `maps_to_zip_bytes`, `MAP_FILENAMES`), `core.ivim.voxel_detail`,
  `core.domain.JobStatus`, `core.errors`, `models.schemas.VoxelView`.
- Produces routes:
  - `GET /fits/{job_id}/maps/{name}` — `name` path param. Behaviour:
    `job = get_job` or `NotFoundError`;
    if `job.status is not JobStatus.SUCCEEDED` raise `JobStateError`;
    if `name not in MAP_FILENAMES` raise `NotFoundError`;
    `body = parameter_map_to_nifti_bytes(job.result.maps[name])`;
    return `Response(content=body, media_type="application/gzip", headers={"Content-Disposition": f'attachment; filename="{MAP_FILENAMES[name]}"'})`.
  - `GET /fits/{job_id}/maps` — zip of all four. `JobStateError` if not
    succeeded; `Response(maps_to_zip_bytes(job.result.maps), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{job_id}_ivim_maps.zip"'})`.
  - `GET /fits/{job_id}/voxel?x=&y=&z=` — `x,y,z` required int query params.
    `NotFoundError` on unknown job; `JobStateError` if not succeeded;
    `dataset = await storage.get_dataset(job.dataset_id)` (if `None`,
    `JobStateError("source dataset was evicted; re-run the fit")`);
    `detail = voxel_detail(dataset, job.result, x, y, z)` (raises
    `InvalidInputError` -> 422 for out-of-bounds); return `VoxelView(**detail)`.

- [ ] **Step 1: Write the failing test**

`tests/test_results_api.py`:
```python
import asyncio
import gzip
import io
import zipfile

import nibabel as nib
import numpy as np

from tests.fixtures.synthetic import bval_bytes, make_ivim_volume, nifti_bytes


async def _succeeded_job(client):
    data, bvals = make_ivim_volume(shape=(4, 4, 2), noise_sigma=0.0)
    dataset_id = (await client.post(
        "/datasets",
        files={
            "nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip"),
            "bval": ("dwi.bval", bval_bytes(bvals), "text/plain"),
        },
    )).json()["dataset_id"]
    job_id = (await client.post(f"/datasets/{dataset_id}/fits", json={})).json()["job_id"]
    async with asyncio.timeout(30):
        while True:
            body = (await client.get(f"/fits/{job_id}")).json()
            if body["status"] == "succeeded":
                return dataset_id, job_id
            assert body["status"] != "failed", body
            await asyncio.sleep(0.05)


async def test_download_single_map_before_completion_is_409(client):
    data, bvals = make_ivim_volume(shape=(4, 4, 2))
    dataset_id = (await client.post(
        "/datasets",
        files={
            "nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip"),
            "bval": ("dwi.bval", bval_bytes(bvals), "text/plain"),
        },
    )).json()["dataset_id"]
    job_id = (await client.post(f"/datasets/{dataset_id}/fits", json={})).json()["job_id"]
    # Immediately — may already be running but very unlikely done.
    resp = await client.get(f"/fits/{job_id}/maps/d")
    assert resp.status_code in (409, 200)  # tolerate a race on a fast machine
    if resp.status_code == 200:
        return
    assert resp.json()["detail"]


async def test_download_single_map_after_completion(client):
    _, job_id = await _succeeded_job(client)
    resp = await client.get(f"/fits/{job_id}/maps/d")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/gzip"
    assert 'filename="D.nii.gz"' in resp.headers["content-disposition"]
    img = nib.Nifti1Image.from_bytes(gzip.decompress(resp.content))
    assert img.ndim == 3


async def test_unknown_map_name_is_404(client):
    _, job_id = await _succeeded_job(client)
    assert (await client.get(f"/fits/{job_id}/maps/bogus")).status_code == 404


async def test_download_all_maps_zip(client):
    _, job_id = await _succeeded_job(client)
    resp = await client.get(f"/fits/{job_id}/maps")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    archive = zipfile.ZipFile(io.BytesIO(resp.content))
    assert set(archive.namelist()) == {"D.nii.gz", "D_star.nii.gz", "f.nii.gz", "S0.nii.gz"}


async def test_voxel_detail_happy_path(client):
    _, job_id = await _succeeded_job(client)
    resp = await client.get(f"/fits/{job_id}/voxel", params={"x": 1, "y": 1, "z": 0})
    assert resp.status_code == 200
    body = resp.json()
    assert body["voxel"] == [1, 1, 0]
    assert len(body["signal"]) == 8
    assert len(body["fitted_curve"]) == 8
    assert set(body["params"]) == {"d", "d_star", "f", "s0"}


async def test_voxel_out_of_bounds_is_422(client):
    _, job_id = await _succeeded_job(client)
    resp = await client.get(f"/fits/{job_id}/voxel", params={"x": 99, "y": 0, "z": 0})
    assert resp.status_code == 422


async def test_voxel_before_completion_is_409(client):
    data, bvals = make_ivim_volume(shape=(4, 4, 2))
    dataset_id = (await client.post(
        "/datasets",
        files={
            "nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip"),
            "bval": ("dwi.bval", bval_bytes(bvals), "text/plain"),
        },
    )).json()["dataset_id"]
    job_id = (await client.post(f"/datasets/{dataset_id}/fits", json={})).json()["job_id"]
    resp = await client.get(f"/fits/{job_id}/voxel", params={"x": 0, "y": 0, "z": 0})
    assert resp.status_code in (409, 200)


async def test_maps_unknown_job_is_404(client):
    assert (await client.get("/fits/nope/maps/d")).status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_results_api.py -v`
Expected: FAIL — stub router.

- [ ] **Step 3: Write the implementation**

`src/osipy_rest_api/api/results.py`:
```python
"""Download parameter maps and inspect individual voxels."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response

from osipy_rest_api.core.domain import JobStatus
from osipy_rest_api.core.errors import JobStateError, NotFoundError
from osipy_rest_api.core.ivim import voxel_detail
from osipy_rest_api.core.nifti_io import (
    MAP_FILENAMES,
    maps_to_zip_bytes,
    parameter_map_to_nifti_bytes,
)
from osipy_rest_api.core.storage import Storage
from osipy_rest_api.deps import get_storage
from osipy_rest_api.models.schemas import VoxelView


async def _succeeded_job(job_id: str, storage: Storage):
    job = await storage.get_job(job_id)
    if job is None:
        raise NotFoundError(f"job {job_id} not found")
    if job.status is not JobStatus.SUCCEEDED:
        raise JobStateError(
            f"job {job_id} is {job.status.value}; results are not ready"
        )
    return job


router = APIRouter(tags=["results"])


@router.get("/fits/{job_id}/maps/{name}")
async def download_map(
    job_id: str, name: str, storage: Storage = Depends(get_storage)
) -> Response:
    job = await _succeeded_job(job_id, storage)
    if name not in MAP_FILENAMES:
        raise NotFoundError(
            f"unknown map {name!r}; choose one of {sorted(MAP_FILENAMES)}"
        )
    body = parameter_map_to_nifti_bytes(job.result.maps[name])
    return Response(
        content=body,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{MAP_FILENAMES[name]}"'},
    )


@router.get("/fits/{job_id}/maps")
async def download_all_maps(
    job_id: str, storage: Storage = Depends(get_storage)
) -> Response:
    job = await _succeeded_job(job_id, storage)
    return Response(
        content=maps_to_zip_bytes(job.result.maps),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{job_id}_ivim_maps.zip"'
        },
    )


@router.get("/fits/{job_id}/voxel", response_model=VoxelView)
async def get_voxel(
    job_id: str,
    x: int = Query(...),
    y: int = Query(...),
    z: int = Query(...),
    storage: Storage = Depends(get_storage),
) -> VoxelView:
    job = await _succeeded_job(job_id, storage)
    dataset = await storage.get_dataset(job.dataset_id)
    if dataset is None:
        raise JobStateError("source dataset was evicted; re-run the fit")
    return VoxelView(**voxel_detail(dataset, job.result, x, y, z))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_results_api.py -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/osipy_rest_api/api/results.py tests/test_results_api.py
git commit -m "feat: parameter-map download and voxel-detail endpoints

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

---

## Task 13: Full-flow test, CI, citation metadata, docs, delivery verification

**Files:**
- Create: `tests/test_full_flow.py`, `.github/workflows/ci.yml`,
  `CITATION.cff`, `codemeta.json`
- Modify: `README.md` (final pass), `aidecl.yaml` (final update), `LOG.md`

**Interfaces:**
- Consumes: the whole app.
- Produces: an end-to-end test through HTTP; a CI workflow; citation files;
  a verified running entry point.

- [ ] **Step 1: Write the full-flow test**

`tests/test_full_flow.py`:
```python
import asyncio
import gzip

import nibabel as nib
import numpy as np

from tests.fixtures.synthetic import bval_bytes, make_ivim_volume, nifti_bytes


async def test_upload_fit_poll_download_voxel(client):
    data, bvals = make_ivim_volume(shape=(6, 6, 3), noise_sigma=0.5, seed=1)

    upload = await client.post(
        "/datasets",
        files={
            "nifti": ("dwi.nii.gz", nifti_bytes(data), "application/gzip"),
            "bval": ("dwi.bval", bval_bytes(bvals), "text/plain"),
        },
    )
    assert upload.status_code == 201
    dataset_id = upload.json()["dataset_id"]

    start = await client.post(
        f"/datasets/{dataset_id}/fits",
        json={"method": "segmented", "b_threshold": 200.0},
    )
    assert start.status_code == 202
    job_id = start.json()["job_id"]

    async with asyncio.timeout(60):
        while True:
            body = (await client.get(f"/fits/{job_id}")).json()
            assert body["status"] != "failed", body
            if body["status"] == "succeeded":
                break
            await asyncio.sleep(0.05)

    assert body["summary"]["fit_success_rate"] is not None

    d_map = await client.get(f"/fits/{job_id}/maps/d")
    assert d_map.status_code == 200
    img = nib.Nifti1Image.from_bytes(gzip.decompress(d_map.content))
    assert img.shape == (6, 6, 3)

    voxel = await client.get(f"/fits/{job_id}/voxel", params={"x": 3, "y": 3, "z": 1})
    assert voxel.status_code == 200
    assert len(voxel.json()["fitted_curve"]) == len(bvals)

    assert (await client.delete(f"/datasets/{dataset_id}")).status_code == 204
    assert (await client.get(f"/fits/{job_id}/maps/d")).status_code == 409
```

- [ ] **Step 2: Run the full suite**

Run: `uv run pytest -v`
Expected: every test passes. Then `uv run ruff check .` — clean.

- [ ] **Step 3: Add the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          version: "0.8.24"
      - name: Set up Python
        run: uv python install 3.12
      - name: Sync dependencies
        run: uv sync --extra dev
      - name: Lint
        run: uv run ruff check .
      - name: Smoke test
        run: uv run pytest tests/test_smoke.py -q
      - name: Test
        run: uv run pytest -q
```

- [ ] **Step 4: Add citation metadata**

`CITATION.cff` (validate with `cffconvert` if available, otherwise follow the
schema exactly):
```yaml
cff-version: 1.2.0
message: "If you use this software, please cite it as below."
title: "osipy REST API"
version: "0.1.0"
date-released: "2026-09-10"
repository-code: "https://github.com/OSIPI/osipy-rest-api"
license: Apache-2.0
authors:
  - name: "The OSIPI contributors"
references:
  - type: software
    title: "osipy"
    notes: >-
      This API wraps the osipy perfusion analysis toolkit and adapts its IVIM
      analysis workflow (https://osipi.github.io/osipy/tutorials/ivim-analysis/).
    repository-code: "https://github.com/OSIPI/osipy"
    authors:
      - name: "The OSIPI contributors"
```

`codemeta.json`:
```json
{
  "@context": "https://doi.org/10.5063/schema/codemeta-2.0",
  "@type": "SoftwareSourceCode",
  "name": "osipy REST API",
  "description": "REST API backend wrapping the osipy toolkit for IVIM perfusion analysis, serving the OSIPI dashboard.",
  "version": "0.1.0",
  "license": "https://spdx.org/licenses/Apache-2.0",
  "codeRepository": "https://github.com/OSIPI/osipy-rest-api",
  "programmingLanguage": "Python",
  "runtimePlatform": "Python 3.12",
  "softwareRequirements": ["fastapi", "uvicorn", "nibabel", "numpy", "pydantic", "osipy"],
  "author": [{ "@type": "Organization", "name": "The OSIPI contributors" }],
  "referencePublication": null,
  "keywords": ["MRI", "perfusion", "IVIM", "REST API", "OSIPI"]
}
```

- [ ] **Step 5: Final README pass**

Update `README.md`: change the "Status: prototype / design phase" line to note
the API is implemented; confirm the "Running it" section matches
`uv run uvicorn osipy_rest_api.main:app --reload`; add a one-line pointer to
`docs/superpowers/specs/` and `docs/superpowers/plans/`. Append the AI
declaration footnote at the very end after a horizontal rule:
```markdown
---

*AI involvement in this project is declared in [aidecl.yaml](./aidecl.yaml)
following the [AI Declaration Format](https://ai-declaration.org).*
```

- [ ] **Step 6: Verify the delivered entry point**

Run the server the way a user will:
```bash
uv run uvicorn osipy_rest_api.main:app --port 8765 &
sleep 3
curl -sf http://127.0.0.1:8765/health
curl -sf http://127.0.0.1:8765/openapi.json > /dev/null && echo "openapi ok"
# upload a synthetic dataset, start a fit, poll, download a map — a short
# python -c script using httpx against the live server, mirroring
# test_full_flow. Confirm each step returns the expected status.
kill %1
```
Read the server startup logs for errors. Fix anything that fails here before
proceeding — a green suite with a broken entry point is not done.

- [ ] **Step 7: Update aidecl.yaml and LOG.md**

`aidecl.yaml`: add one `components` entry per module implemented in tasks 4–13
(nifti_io, storage, ivim integration, job runner, schemas, each API router,
app factory, tests, CI), each with `ai_involvement` naming the plan task and
date and `notes: "NOT yet reviewed line by line by a human."`; bump
`declaration.date` to today; append a dated line to `declaration.notes`.

`LOG.md`: append a milestone entry — implementation complete, N tests passing,
entry point verified, awaiting human review.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: end-to-end flow; add CI, citation metadata, finalize docs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KivvceDNwpWu1gabCgbAEt"
```

- [ ] **Step 9: Post-milestone review (rseng-code-review)**

Run a codebase review pass over the result-bearing paths
(`core/ivim.py`, `core/jobs.py`, `api/`): correctness, silent-failure modes,
the import boundary, the progress-callback threading. Record findings in
`docs/decisions/` if any change is warranted; fix must-fix items in their own
commits.

- [ ] **Step 10: Hand off to the human**

Tell the user: the API is implemented and the entry point verified, but the
scientific-judgment points need their review before they rely on it —
specifically the auto-mask percentile default, the `b_threshold` validation
rule, the fit tolerances encoded in `tests/test_ivim.py`, and the
biexponential model evaluation in `voxel_detail`. Point them at
`uv run pytest -v` and the running server.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) |
|---|---|
| §2 Architecture (3 layers, DI) | 3, 8, 9 |
| §2 Request flow | 10, 11, 12 |
| §2 Error handling table | 3 (errors), 9 (handler), 10–12 (raises) |
| §3 Data model (Dataset, Job, FitResult, MaskSpec, FitConfig) | 3 |
| §3 summary shape | 6 (`build_summary`) |
| §4 Storage protocol + InMemoryStorage (caps, TTL, clear) | 5 |
| §5 JobRunner protocol + InProcessJobRunner (semaphore, progress, evicted-dataset) | 7 |
| §6 osipy integration (run_fit, _to_fit_result, validate_config, voxel_detail) | 6 |
| §7 NIfTI I/O (parse_upload, parse_bval, param_map→bytes, zip) | 4 |
| §8 Datasets endpoints | 10 |
| §8 Fits endpoints | 11 |
| §8 Results endpoints (maps/{name}, maps zip, voxel) | 12 |
| §8 Meta endpoints | 9 |
| §9 Configuration table | 3 (`Settings`) |
| §10 Project setup (uv, layout, deps, run command) | 1 |
| §11 Testing (synthetic fixture, per-module suites, full-flow) | 2, 4–13 |
| §12 Out of scope | respected — no auth, no persistence, no batch, IVIM only |

No gaps.

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" left. Every code
step has real code. Two documented fallbacks (osipy `IVIMFitParams` keyword
handling in Task 6 Step 4; mutable-default in Task 11 Step 4) give the exact
alternative rather than "figure it out". The `aidecl.yaml` final update
(Task 13 Step 7) describes the content to add explicitly.

**3. Type consistency:**
- `FitConfig` / `MaskSpec` dataclasses: defined Task 3, consumed unchanged in
  Tasks 6, 7, 8, 11.
- `FitResult(maps, r_squared, summary)`: defined Task 3, built in Task 6,
  consumed in Tasks 7, 8, 12.
- `Storage` methods: signatures fixed in Task 5, matched by `InProcessJobRunner`
  calls in Task 7 (`get_job`, `get_dataset`, `update_job`, `put_job`) and by
  every API handler.
- `JobStatus` enum values (`pending/running/succeeded/failed`): Task 3, used as
  strings in schemas (Task 8) and compared as enum in Tasks 7, 12.
- `MAP_FILENAMES` keys (`d/d_star/f/s0`): defined Task 4, matched by
  `FitResult.maps` keys built in Task 6, and by the `_MAP_KEYS` tuple in Task 6.
- `parameter_map_to_nifti_bytes` / `maps_to_zip_bytes`: signature Task 4,
  called in Task 12.
- `voxel_detail(dataset, fit_result, x, y, z)`: signature Task 6, called in
  Task 12 with the same argument order.
- `deps.set_container` / `get_storage` / `get_job_runner`: defined Task 8,
  called in Task 9 (`build_app`) and every router.
- `build_app(settings)`: defined Task 9, used in `conftest.py` (Task 9) and
  `main.app` (Task 9).
- `run_fit(dataset, config, progress_callback)`: signature Task 6, matches the
  `fit_fn` call in `InProcessJobRunner._run` (Task 7) and the `fake_fit`
  test doubles.

Consistent throughout.
