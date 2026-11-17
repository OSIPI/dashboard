# OSIPY functionality and source references

The dashboard's `/packages` route presents **registered OSIPY implementations**
first. The OSIPI code collections appear separately in a collapsed sources and
references section. These collections informed scientific functionality; listing
them does not mean their packages must be installed, integrated, or ported.

This corrects the earlier page's focus on third-party Pyodide readiness, which
could misleadingly suggest an integration backlog. It changes no fitting,
backend, import, or storage behavior.

## What the functionality list means

`frontend/src/lib/osipy-capabilities.ts` records a snapshot enumerated from the
installed **OSIPY 0.1.4** Python package on **2026-11-16**. This matches the browser
worker's package version, rather than an evolving OSIPY main branch. Each group
links to its registry in the
[tagged release source](https://github.com/OSIPI/osipy/tree/bcecaea4c79728cc67e8836183aa91b7bf9a224d/osipy).

The 14 groups cover registered models and methods for IVIM, DCE, DSC, ASL and
common fitting/AIF functionality. This is not a complete inventory of all OSIPY
utilities and does not count aliases as distinct scientific algorithms. For
example, `fritz-hansen` and `fritz_hansen` are both registered AIF keys.

The snapshot distinguishes three concepts:

- **Implemented in OSIPY:** a registered implementation exists in this release.
  This is not a new scientific-validation claim or proof of browser execution.
- **Browser demo evidence:** the existing recorded Chromium/native comparison
  covers six IVIM model/strategy combinations for synthetic single-voxel fitting.
  See [the demo evidence](browser-ivim-demo.md). No scientific execution was rerun
  for this catalog correction.
- **Source/reference material:** contributions in the code collections may
  overlap with functionality already implemented in OSIPY. Their original
  language or dependencies do not determine the browser support of OSIPY's
  implementation of the corresponding method.

The viewer also has a browser IVIM client with a 4,096 selected-voxel limit, but
the historical single-voxel demo evidence is not verification of that larger
workflow. DCE, DSC and ASL are not enabled browser analysis workflows on this page.
The running backend's `/catalog` remains authoritative for the actual local
engine's advertised capabilities/version. This static page neither connects to
that endpoint nor enables additional methods.

## Registries, not general enums

OSIPY's current development branch provides listing functions including
`list_models`, `list_ivim_fitters`, `list_deconvolvers`, and
`list_quantification_models`. These are version dependent: the published 0.1.4
release does not provide every listing helper. Its registered dictionaries were
enumerated directly after importing the modality packages.

General enums are not an availability contract. For example,
`common.types.FittingMethod` includes `NEURAL_NETWORK`, described as future work.
Do not advertise a method merely because an enum member exists.

To inspect the pinned release in a Python environment where it is installed:

```python
import osipy
import osipy.ivim  # imports register the built-in IVIM implementations
from osipy.ivim.models.registry import IVIM_MODEL_REGISTRY
from osipy.ivim.fitting.registry import _IVIM_FITTER_REGISTRY

assert osipy.__version__ == "0.1.4"
print(sorted(IVIM_MODEL_REGISTRY))
print(sorted(_IVIM_FITTER_REGISTRY))
```

The private fitter dictionary is a release-specific inspection detail, not a
recommended public API for application integration. Use public listing functions
where provided by the target release. To refresh the snapshot, enumerate each
modality's actual registries from the chosen package version, preserve aliases,
update the release source/date, and separately establish browser evidence. Do
not infer implemented methods from filenames or copy future entries from enums.

## Historical source inventory

The reference data remains in `frontend/src/lib/contributions.ts`, reviewed on
2026-11-10. Its old assessments and adaptation notes are retained as dated static
research, not displayed as current integration recommendations. The page only
shows contribution names, descriptions, collection, language, reference type and
pinned source links. It excludes the historical OSIPY engine row from this list.

| Collection | Reference entries | Counting boundary                                                                                             |
| ---------- | ----------------: | ------------------------------------------------------------------------------------------------------------- |
| DCE/DSC    |                13 | Original contributor directories                                                                              |
| ASL        |                12 | Original directories, splitting three named preclinical contributions and including four README references    |
| IVIM       |                15 | Twelve fitting directories and three preprocessing directories, including an external SUPER-IVIM-DC reference |

These 40 entries are not 40 installable packages, 40 distinct algorithms, or a
requirement to integrate 40 tools. Earlier filename-based Python/MATLAB counts
should not be treated as package or porting requirements. Check existing OSIPY
implementations and scientific coverage before proposing additional work.

Pinned collection sources:

- [DCE/DSC](https://github.com/OSIPI/DCE-DSC-MRI_CodeCollection/tree/78cc4c7b8ec09d01ff209724ce0a49fcde6c175f/src/original)
- [ASL](https://github.com/OSIPI/TF2.2_OSIPI-ASL-toolbox/tree/86e723639eae4bf507ae6ee9dc7932d2a9077a97)
- [IVIM](https://github.com/OSIPI/TF2.4_IVIM-MRI_CodeCollection/tree/3058d5deed347125be5b829bbc2a5cdcdb43ec88/src/original)

An identified scientific gap may justify extending OSIPY, but a source entry by
itself does not. Establish that gap with maintainers first; preserve attribution,
licensing, model definitions, units, input observations, and explicit failure
diagnostics in any approved implementation.
