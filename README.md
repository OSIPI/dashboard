# OSIPY Dashboard

An inspectable in-vivo IVIM MRI workspace for OSIPY projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Deploy GitHub Pages](https://github.com/OSIPI/dashboard/actions/workflows/pages.yml/badge.svg)](https://github.com/OSIPI/dashboard/actions/workflows/pages.yml)
[![Metadata](https://github.com/OSIPI/dashboard/actions/workflows/metadata.yml/badge.svg)](https://github.com/OSIPI/dashboard/actions/workflows/metadata.yml)
[![Citation File Format](https://img.shields.io/badge/citation-CFF-blue.svg)](CITATION.cff)

The dashboard loads the public OSIPI TF2.4 brain series or local diffusion MRI files, supports ROI exploration, and can run real IVIM fitting through an authenticated local Python companion. Images are never sent to a remote analysis service. It is a research interface, not a medical device or diagnostic tool. Missing or corrupt assets produce a visible error, never mock images or fits.

## MRI Viewer

- Browse all 85 acquired volumes (including repeated b-values) in a searchable, filterable grid or list; inspect 56 native oblique slices with voxel selection, zoom, pan, window/level and reset.
- Inspect scaled NIfTI samples as a signal graph and accessible value table. Actual fitted estimates, residuals and quality flags appear when a matching companion result is available.
- Save voxel coordinates, b-value, slice and an optional note in this browser; restore or delete them locally. Restoring a voxel resets image display controls. Storage failures are reported in the interface.
- DCE, DSC and ASL remain **unimplemented analysis workflows**; scans can be catalogued under those techniques. IVIM NIfTI loading and DICOM/BIDS discovery are available as described below.

### Local datasets and timepoints (Section B)

Open **Scans / Import** to choose `.nii`/`.nii.gz` plus `.bval`, optional FSL `.bvec` (3 rows), and matching JSON metadata, or discover a BIDS/DICOM directory. The viewer accepts scalar NIfTI-1/2 3D/4D uint8/int8/uint16/int16/uint32/int32/float32/float64 data. It preserves sample values, scaling, acquisition order and affine geometry; it normalizes spatial units to mm. RGB, complex, 64-bit integer and higher-dimensional images need preparation outside this viewer.

Validation blocks count mismatches, invalid geometry/units, truncated images and non-finite samples. Missing b=0 or b-vectors are warnings; unknown vectors are not replaced with fabricated directions. Parsing runs in a cancellable worker, bounded at 512 MiB decoded data and 768 MiB total session image memory.

BIDS discovery pairs per-image sidecars, reads `dataset_description.json` names and `scans.tsv` acquisition dates, and extracts subject/session entities. It does not implement the full BIDS inheritance/validation specification. DICOM discovery groups readable headers by patient, study and series; **pixel decoding/conversion is not implemented**. Convert those series to NIfTI+b-values using a validated converter before opening them.

The library lets you edit subject, study, timepoint, date and technique. Dates remain unknown unless supplied. Loaded timepoints are selectable and retain independent viewer state. **Compare** opens two scans side by side (with a compact switcher on mobile). Displays remain independent; linked navigation is enabled only for a declared, verified common coordinate frame within the same subject/study. Points map through physical RAS millimetres to nearest native voxels; out-of-field points are reported, not clamped. Registration itself is not inferred from equal image dimensions or matching affine values.

Local files and subject/date metadata are session-only: reselect files after reload. Dataset-local notes/layout preferences can still persist, but MRI samples never enter localStorage. The public demo retains its own attribution; local imports are never labelled as the OSIPI public dataset.

### Linked 3D exploration

Choose **3D + slices** to locate the active acquisition's voxels in axial, coronal and sagittal reformats alongside interactive 3D slice planes. Drag to orbit, Shift-drag to pan, scroll/pinch to zoom, and click a plane to select a voxel. Camera buttons provide keyboard-accessible rotation, zoom and reset. Slice views support arrow keys and Page Up/Down; **Move linked planes** exposes precise one-based native voxel controls. Mobile uses 3D/Axial/Coronal/Sagittal tabs.

All views share the original voxel selection and acquired signal plot. Reformats use the original NIfTI RAS+ affine and nearest-neighbour display sampling; acquisition buffers and scaling remain unchanged. Switching back to native/montage viewing retains the selection. The 3D camera and spatial-view mode are session-only and are not included in workspace exports.

The vtk.js renderer loads only when spatial viewing opens and releases its graphics resources on exit. WebGL 2 is required for 3D; linked 2D reformats remain usable without it. This milestone renders **slice planes**, not a segmented anatomy model or a volume-rendered scan. Volume rendering, named anatomy and advanced Slicer workflows are tracked in [issue #8](https://github.com/OSIPI/dashboard/issues/8).

### Local IVIM fitting (Section C)

Start the companion using an environment with the OSIPY checkout installed (tested with OSIPY 0.1.1):

```sh
../osipy/.venv/bin/python companion/server.py
```

For a new environment, see [companion/README.md](companion/README.md). Copy the session token printed by the companion into **IVIM analysis → Local companion & fitting settings**, then connect to `http://127.0.0.1:60016`. The token stays in browser memory. Viewing and imports still work without the companion.

The implemented method is OSIPY's biexponential model with Levenberg–Marquardt fitting, data-dependent initialization, optional initial values, bounds, iteration/tolerance controls and quality thresholds. Fit the selected voxel, selected ROI **voxelwise**, or the full dataset. All acquired repetitions are retained; fitting needs a b=0 baseline and at least four distinct b-values. Progress, cancellation, errors and the last ten companion runs are available.

Results include S₀, D, D\*, f, RMSE, R², adjusted R², validity and status maps, with opacity/range controls on the native reference image. Estimates failing quality checks stay flagged; they are not silently made valid. A labelled model curve and residual plot accompany available voxel estimates. Reports record source identity, OSIPY version, model/settings, timing and quality policy. Maps/report can be exported individually or in a bundle.

### ROIs, masks and registration (Section D)

Use **Regions of interest → New ROI** to draw rectangles or freehand regions on native slices, or enter numeric rectangle bounds. Erase, clear, delete, rename, recolor and undo up to ten edits. Regions can span slices but are not automatically propagated. Current ROI overlays and mean-signal comparison are optional. Statistics show count, mean, median, population SD, min and max; parameter-map statistics use finite quality-valid voxels. ROI spatial means are not fits, and averaged voxelwise parameters are not parameters fitted to a mean signal.

Import/export integer-label NIfTI masks with matching dimensions and affine (1e-4 mm tolerance). Mismatched masks require external registration/resampling. Up to 32 labels are supported, with a two-million-voxel per-ROI limit and five-million-voxel editing grid limit. ROI data is session-local; export masks/bundles before reloading. Hide ROI/parameter overlays to return to linked 3D source exploration.

Scan comparison accepts an explicit affine transform through **Registration transform**: a checksum-bound JSON matrix in RAS millimetres or a single ITK affine `.tfm` in LPS coordinates. The direction is **primary physical coordinates → comparison physical coordinates**; use Invert when the supplied transform has the opposite direction. The dashboard does not compute registration. Nonlinear/composite transforms are not supported. Out-of-field positions are reported instead of clamped.

### Export and external tools (Section E)

**Export analysis/viewer bundle** creates a ZIP in a worker containing source NIfTI/b-values, optional b-vectors, actual maps and quality/run-selection masks when fitted, current ROI masks, notes, CSV, reports and per-file checksums. NIfTI-1 is used for interoperable image files; full source geometry/scaling metadata is also included in JSON. Separate ROI files preserve overlaps. Current annotations may differ from the immutable region used for a previous run, which is exported separately.

The ZIP includes `load-in-slicer.py` and ITK-SNAP loading/return instructions. No external application is launched. The Slicer helper loads images, maps, ROI segments and saved voxel markers; edited ITK-SNAP masks can be reimported if geometry matches. The bundled `workspace.json` references the original input identity, so restore it with the original dataset loaded. ZIP preparation is capped at 512 MiB before compression; larger outputs can be exported as individual maps/ROIs.

Verify an exported archive without launching either application:

```sh
../osipy/.venv/bin/python companion/verify_bundle.py /path/to/osipy-viewer-bundle.zip
```

### Exploration workspace (roadmap Section A)

- Drag the panel dividers or focus them and use arrow keys to resize; Home or **Reset layout** restores defaults. Width preferences are remembered locally. The document never scrolls; individual panels do.
- Checking volumes or **Select filtered** immediately splits the view, preserving every repeated b-value acquisition. Unchecking down to one restores a single view. Use the visual **View layout** menu (also available by right-clicking an image) for automatic arrangement, side-by-side, 4-tile or 8-tile grids. Fixed grids page through additional selections; automatic arrangement scrolls internally. Tiles share slice and voxel coordinates. Toggle display linking in Controls to share or independently adjust zoom, pan and window/level; click a tile to make it active. Workspace files preserve the chosen grid layout.
- Clicking a thumbnail replaces the acquisition in the active pane without adding panes. If it is already displayed, its existing pane becomes active. Volume-step controls follow the same rule; only checkbox/bulk selection adds panes.
- **Expand chart** opens a keyboard-dismissible focus view. Compare up to four saved voxels with the current voxel, using distinct colors/markers. Raw acquisitions remain separate; actual model curves and ROI spatial means are explicitly labelled.
- Download the displayed plot as **SVG/PNG**, or **Voxel CSV** for all acquisitions at the current coordinate. SVG includes dataset/checksum metadata; plots include dataset name, voxel labels, units and comparison legends. CSV preserves acquisition order and repeated b-values.
- **Auto 2–98%**, **Full range**, and **Dataset preset** adjust display only. Auto uses scaled intensities from the active volume, with an explicit current-slice/whole-volume scope. Linked display settings apply to every tile; the underlying samples never change.
- **Export workspace** saves a JSON file containing selections, display states, layout, bookmarks, comparisons, filters and the draft note—not MRI data. Import checks dataset ID and sample checksum, validates every field, and asks before replacing the current workspace/notes. Files are limited to 100 KB. Export first to retain a previous workspace.

`ViewerTile.svelte` owns image interactions for both single and montage views. `src/lib/workspace.ts` owns workspace validation, histogram-based auto windowing and shared scatter/CSV serialization; the same escaped SVG powers the inline chart, expanded chart and image exports. Spatial geometry/reslicing lives in `src/lib/spatial.ts`, with the lazy-loaded vtk.js lifecycle in `src/lib/spatial-renderer.ts`. No backend is required.

### UI organization

`src/routes/+page.svelte` loads data and coordinates shared selection/workspace state. Focused components under `src/lib/components/viewer/` render the series browser, viewer, image controls, signal chart, saved voxels, workspace files, metadata, and resize dividers. Chart/export lifecycle stays in `SignalPanel`; import validation and confirmation stay in `WorkspaceFiles`.

App styling is Tailwind-first: component layout, responsive states and interactions use inline utilities. `src/app.css` retains semantic light/dark tokens, base rules, shared shadcn-inspired recipes, and Markdown styling. Runtime transforms and panel widths use inline style bindings. Future shadcn primitives should use **shadcn-svelte** and the same tokens; there is no React UI dependency or installed shadcn component library.

Layout preferences automatically persist with Runed `PersistedState`: grid arrangement, panel widths, series grid/list mode, mobile panel, linked-display preference, expanded details, and theme. Selected panes/active acquisition are restored only for the matching dataset checksum. Workspace imports update these same preferences. **Reset layout** restores default layout settings while keeping the selected acquisitions and theme. Preferences are validated, malformed values reset safely, and storage-denied browsers retain session controls. MRI samples, transient menus/dialogs, and image display adjustments are not saved as layout preferences.

`scripts/prepare_ivim.py` uses nibabel and numpy to preserve the original 112 x 112 x 56 x 85 int16 samples, scaling, spacing, affine and diffusion metadata. `src/lib/ivim.ts` validates and loads those assets; canvas and signal inspection share the same samples and scaling. The image remains in native index order, with physical pixel aspect and explicit oblique orientation information. Saved views validate dataset identity and dynamic bounds; old phantom views are not migrated.

**Prepare data before development or deployment:** follow [data/README.md](data/README.md). All downloaded, extracted and prepared imaging assets are gitignored. The static host must serve the prepared `static/datasets/` assets, which are copied into the build. An unprepared checkout still builds but displays “Brain dataset unavailable”. The existing Pages workflow does not automatically prepare data.

The series-grid and local saved-frame interaction concepts were informed by [MRI Grid Viewer](https://github.com/MarvinSchwaibold/mri-grid-viewer), with permission reported by the requester. This is an original Svelte implementation; no reference source code or clinical screenshots are bundled.

## Tech Stack

- SvelteKit 2 and Svelte 5
- Tailwind CSS 4 with shared semantic CSS tokens and shadcn-inspired recipes (not an installed shadcn component library)
- Bun runtime
- Docker Compose for local development

## Development

Run the app through Docker Compose with Bun:

```sh
make dev
```

`make dev` opens the dashboard at `http://localhost:60010`. Docker Compose maps host port `60010` to the frontend container's fixed port `37183`.

You can also run it locally without Docker:

```sh
bun install
bun run dev
```

Direct Vite development uses `http://localhost:60010`. After `bun run build`, `bun run preview` uses `http://localhost:60014`. Both ports are strict, so Vite exits if the configured port is unavailable.

Before opening a pull request, run:

```sh
bun run check
bun test
bun run lint
bun run build
```

## Configuration

Copy `.env.example` to `.env` if you want to use Docker Compose directly. `FRONTEND_PORT` controls only the host side of the `60010:37183` mapping:

```sh
cp .env.example .env
```

## Citation

If you use OSIPY Dashboard in your work, cite it using the metadata in [CITATION.cff](CITATION.cff). Release archives can be connected to Zenodo using the metadata in [.zenodo.json](.zenodo.json).

## Project Practices

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow, [SECURITY.md](SECURITY.md) for vulnerability reporting, [GOVERNANCE.md](GOVERNANCE.md) for decision-making and handover expectations, and [docs/releases.md](docs/releases.md) for release automation.

## License

MIT License. See [LICENSE](LICENSE).
