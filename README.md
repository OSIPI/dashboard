# OSIPY Dashboard

An inspectable synthetic IVIM MRI workspace for OSIPY projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Deploy GitHub Pages](https://github.com/OSIPI/dashboard/actions/workflows/pages.yml/badge.svg)](https://github.com/OSIPI/dashboard/actions/workflows/pages.yml)
[![Metadata](https://github.com/OSIPI/dashboard/actions/workflows/metadata.yml/badge.svg)](https://github.com/OSIPI/dashboard/actions/workflows/metadata.yml)
[![Citation File Format](https://img.shields.io/badge/citation-CFF-blue.svg)](CITATION.cff)

The dashboard is frontend-only. The home page generates a noise-free geometric IVIM phantom locally: no patient images, backend, uploads or runtime network requests are needed for the demo. It is an educational interface, not a medical device or diagnostic tool.

## MRI Viewer

- Browse nine b-value volumes in a searchable, filterable grid or list; inspect 32 axial slices with voxel selection, zoom, pan, window/level and reset.
- Inspect the selected voxel's actual volume samples as a signal graph and accessible value table. Displayed S0, f, D and D\* are synthetic ground truth, not fitted parameters.
- Save voxel coordinates, b-value, slice and an optional note in this browser; restore or delete them locally. Restoring a voxel resets image display controls. Storage failures are reported in the interface.
- DCE, DSC and ASL are selectable **unimplemented** workflows. Real DICOM, NIfTI and BIDS import, parameter fitting, ROI averaging, freehand drawing and non-axial reconstruction are not implemented.

`src/lib/ivim.ts` generates nine 96 x 96 x 32 Float32 volumes from `S(b) = S0 * ((1-f) * exp(-b*D) + f * exp(-b*Dstar))`, with b in s/mm² and diffusion coefficients in mm²/s. A geometric matrix, outer shell and two inserts provide different signal behaviors. These are not anatomical or patient-orientation claims. `src/lib/components/IvimImage.svelte` renders the same data with canvas windowing; `src/routes/+page.svelte` owns the Svelte 5 workspace and browser-local saved views.

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
