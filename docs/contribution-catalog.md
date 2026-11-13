# Community contribution catalog

The dashboard's `/packages` route lists the contributions represented in three
OSIPI code collections, plus the existing OSIPY browser engine. It does not install,
import, redistribute or execute any newly listed third-party code. It is not a
complete inventory of software used by the OSIPI community.

## Scope and counting

Snapshot reviewed on **2026-11-10**:

| Collection               | Entries | Counting boundary                                                                                                                  |
| ------------------------ | ------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| DCE/DSC                  |      13 | Original contributor directories                                                                                                   |
| ASL                      |      12 | Original tool directories; three named preclinical contributions counted separately; four README-only upstream references included |
| IVIM                     |      15 | 12 fitting contribution directories and 3 preprocessing contribution directories; SUPER-IVIM-DC counted as an external reference   |
| Total collection entries |      40 | Not a count of independently installable packages                                                                                  |
| Existing OSIPY engine    |       1 | Separate, narrowly scoped browser implementation                                                                                   |

These entries can overlap scientifically or refer to the same upstream project.
They are neither independent algorithms nor completed OSIPY integrations.

Earlier informal slide counts of “30 Python / 8 MATLAB” were based on filename
presence and excluded link-only ASL entries. They must not be interpreted as
package counts. In particular MRI-QAMPER's only original `.py` is an empty
initializer; its standardized wrapper uses `matlab.engine`. SUPER-IVIM-DC also has
an empty original initializer and points to an external Python package. The catalog
records actual implementation language and source/reference type instead.

Eight source-bearing collection entries contain MATLAB (six ASL, MRI-QAMPER, and
Oscar Jalnefjord's mixed-language IVIM bundle). ExploreASL is a **ninth,
externally referenced** MATLAB entry. The mixed IVIM entry includes a Python
segmented method, not established Python equivalents of both MATLAB methods.
PyASL already contains related ASL ports; assess coverage rather than requesting
blind duplicate translations.

[MATLAB-to-Python tracking issue #31](https://github.com/OSIPI/dashboard/issues/31)
records all nine MATLAB source/reference entries and their reuse-versus-port work.

## Assessment rules

Baseline: **Pyodide 0.27.7 / Python 3.12.7**, matching the existing browser worker.
This is deliberately not a claim about the latest Pyodide release.

- **Documented browser workflow:** an existing integration has recorded execution
  evidence, with its exact limits. Only OSIPY 0.1.4 numeric single-voxel IVIM is in
  this category. Historical evidence is in [browser-ivim-demo.md](browser-ivim-demo.md);
  no scientific execution was rerun for this catalog.
- **Candidate, not verified:** inspected numeric source uses dependencies available
  in the pinned runtime; imports, estimator entry points and output equivalence
  have not been established in a browser.
- **Adaptation needed, not verified:** concrete packaging, legacy API, image I/O,
  dependency or process-scheduling work is identified. A serial path must retain
  the scientific method, not substitute a different estimator.
- **Not compatible as supplied:** the full workflow has known native executables,
  framework or operating-system dependencies. This is not proof that every
  individual mathematical function is impossible to port.
- **MATLAB port needed:** Pyodide cannot execute MATLAB or `matlab.engine`.
  Existing Python equivalents must be assessed before new ports are commissioned.

Availability in the Pyodide package catalog does not establish compatibility of
arbitrary versions, transitive dependencies, process/thread backends, model assets
or APIs. Absence from that catalog does not prove a pure Python wheel cannot be
installed with micropip. No package is marked compatible based only on its suffix,
README, imports, Python wrapper or `py3-none-any` wheel.

## Sources and reproducibility

The maintained data is `frontend/src/lib/contributions.ts`. Every source link on
the page is pinned to one of these inspected commits:

- [DCE/DSC original source](https://github.com/OSIPI/DCE-DSC-MRI_CodeCollection/tree/78cc4c7b8ec09d01ff209724ce0a49fcde6c175f/src/original)
- [ASL collection](https://github.com/OSIPI/TF2.2_OSIPI-ASL-toolbox/tree/86e723639eae4bf507ae6ee9dc7932d2a9077a97)
- [IVIM original source](https://github.com/OSIPI/TF2.4_IVIM-MRI_CodeCollection/tree/3058d5deed347125be5b829bbc2a5cdcdb43ec88/src/original)
- [Existing dashboard worker and evidence](https://github.com/OSIPI/dashboard/tree/a0a3b78becea99d73ac336d74786001d66e031b9)
- [Exact Pyodide package/version lock](https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide-lock.json)
- [Versioned Pyodide runtime compatibility](https://pyodide.org/en/0.27.7/usage/wasm-constraints.html)
- [SUPER-IVIM-DC 0.4.0 dependency metadata](https://pypi.org/pypi/super-ivim-dc/0.4.0/json)

Read-only inspection covered original Python imports, declared dependencies,
MATLAB source presence, README references, and relevant standardized IVIM wrappers.
The external reference languages were checked against their upstream GitHub
repositories (BASIL, Oxford ASL, DeepASL/ASL_CNN, ExploreASL and SUPER-IVIM-DC).
Those live external projects are not frozen, audited or vendored by this catalog.
The assessment is a bounded static triage, not a full dependency/security audit.

## Before a new runtime integration

Obtain maintainer/license approval where needed; pin packages, models and complete
dependencies; define exact inputs, methods, units and diagnostics; establish real
browser execution and reference-output equivalence; assess resource limits,
cancellation, accessibility and network/privacy behavior. Keep unavailable estimates
explicit and never silently replace the estimator. Adding the catalog changes no
existing fitting, upload, backend or scan-storage behavior.
