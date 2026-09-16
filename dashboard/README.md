# OSIPY Dashboard

An inspectable in-vivo IVIM MRI workspace for OSIPY projects. This app lives in the repository's `dashboard/` directory; run dashboard commands from here unless a command says otherwise.

The dashboard can load the public OSIPI TF2.4 brain series or local NIfTI diffusion MRI files, explore images and signals, manage ROIs, compare scans, and export interoperable analysis bundles. Optional local IVIM fitting runs through the authenticated Python companion. MRI data is not sent to a remote analysis service.

This is research software, not a medical device or diagnostic tool. Missing, invalid, or unsupported data produces a visible error rather than fabricated images or results.

## Development

From the repository root:

```sh
cd dashboard
bun install
bun run dev
```

The app opens at <http://localhost:60010>. You can also use the dashboard-local development tooling:

```sh
make dev
```

The root Makefile delegates development here and owns the release entry points. Docker Compose remains dashboard-local until the backend is added.

## Data

The public demo dataset is not committed. Follow [data/README.md](data/README.md) to download and prepare it. An unprepared checkout still builds but reports that the brain dataset is unavailable.

Local NIfTI files and subject metadata remain in the browser session. Dataset preferences and notes may use local storage, but MRI samples do not.

## Local fitting companion

The dashboard works without the companion. To run real IVIM fitting, install OSIPY and follow [companion/README.md](companion/README.md), then start:

```sh
python companion/server.py
```

The companion listens only on `127.0.0.1:60016` and requires the session token printed at startup.

## Checks

```sh
bun run check
bun test
bun run lint
bun run build
```

## Stack

SvelteKit 2, Svelte 5, Tailwind CSS 4, Bun, and an optional Python companion.

Project policies and technical notes are kept alongside the dashboard until the repository-wide documentation is reorganized.
