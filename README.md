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
bun test scripts/ivim.test.ts
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
