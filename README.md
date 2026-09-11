# OSIPY Dashboard

An inspectable in-vivo IVIM MRI workspace for OSIPY projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Deploy GitHub Pages](https://github.com/OSIPI/dashboard/actions/workflows/pages.yml/badge.svg)](https://github.com/OSIPI/dashboard/actions/workflows/pages.yml)
[![Metadata](https://github.com/OSIPI/dashboard/actions/workflows/metadata.yml/badge.svg)](https://github.com/OSIPI/dashboard/actions/workflows/metadata.yml)
[![Citation File Format](https://img.shields.io/badge/citation-CFF-blue.svg)](CITATION.cff)

The dashboard is frontend-only. The home page loads the public OSIPI TF2.4 acquired brain series from prepared static assets. No backend, uploads or fitting are implemented. It is a research interface, not a medical device or diagnostic tool. Missing or corrupt assets produce a visible error, never mock images.

## MRI Viewer

- Browse all 85 acquired volumes (including repeated b-values) in a searchable, filterable grid or list; inspect 56 native oblique slices with voxel selection, zoom, pan, window/level and reset.
- Inspect the selected voxel's scaled NIfTI samples as a signal graph and accessible value table. No ground truth or parameter estimates are displayed.
- Save voxel coordinates, b-value, slice and an optional note in this browser; restore or delete them locally. Restoring a voxel resets image display controls. Storage failures are reported in the interface.
- DCE, DSC and ASL are selectable **unimplemented** workflows. User DICOM, NIfTI and BIDS import, parameter fitting, ROI averaging, freehand drawing and anatomical reconstruction are not implemented.

### Exploration workspace (roadmap Section A)

- Drag the panel dividers or focus them and use arrow keys to resize; Home or **Reset layout** restores defaults. Width preferences are remembered locally. The document never scrolls; individual panels do.
- Checking volumes or **Select filtered** immediately splits the view, preserving every repeated b-value acquisition. Unchecking down to one restores a single view. Use the visual **View layout** menu (also available by right-clicking an image) for automatic arrangement, side-by-side, 4-tile or 8-tile grids. Fixed grids page through additional selections; automatic arrangement scrolls internally. Tiles share slice and voxel coordinates. Toggle display linking in Controls to share or independently adjust zoom, pan and window/level; click a tile to make it active. Workspace files preserve the chosen grid layout.
- Clicking a thumbnail replaces the acquisition in the active pane without adding panes. If it is already displayed, its existing pane becomes active. Volume-step controls follow the same rule; only checkbox/bulk selection adds panes.
- **Expand chart** opens a keyboard-dismissible focus view. Compare up to four saved voxels with the current voxel, using distinct colors/markers. Raw acquisitions remain separate without averaging, connecting lines, jitter or fitting.
- Download the displayed plot as **SVG/PNG**, or **Voxel CSV** for all acquisitions at the current coordinate. SVG includes dataset/checksum metadata; plots include dataset name, voxel labels, units and comparison legends. CSV preserves acquisition order and repeated b-values.
- **Auto 2–98%**, **Full range**, and **Dataset preset** adjust display only. Auto uses scaled intensities from the active volume, with an explicit current-slice/whole-volume scope. Linked display settings apply to every tile; the underlying samples never change.
- **Export workspace** saves a JSON file containing selections, display states, layout, bookmarks, comparisons, filters and the draft note—not MRI data. Import checks dataset ID and sample checksum, validates every field, and asks before replacing the current workspace/notes. Files are limited to 100 KB. Export first to retain a previous workspace.

`ViewerTile.svelte` owns image interactions for both single and montage views. `src/lib/workspace.ts` owns workspace validation, histogram-based auto windowing and shared scatter/CSV serialization; the same escaped SVG powers the inline chart, expanded chart and image exports. No extra runtime dependencies or backend are required.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow, [SECURITY.md](SECURITY.md) for vulnerability reporting, [GOVERNANCE.md](GOVERNANCE.md) for decision-making and handover expectations, and [docs/release.md](docs/release.md) for release notes.

## License

MIT License. See [LICENSE](LICENSE).
