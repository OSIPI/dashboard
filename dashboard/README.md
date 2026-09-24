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

`make dev` starts the Bun frontend and the authenticated OSIPY companion on your host. The browser connects automatically; no token entry is needed. The private credential stays between the local dev server and companion. Ctrl+C stops both. The companion uses the sibling OSIPY virtual environment by default (override with `COMPANION_PYTHON` if needed). The root Makefile delegates development here and owns the release entry points.

To run the built dashboard and local fitting companion without a host Python or Bun environment, run from the parent repository directory (the same place you run `make dev`):

```sh
docker compose up
```

Open <http://localhost:60010/dashboard/>. Compose builds the production image on first use; use `docker compose up --build` after changing the source. It installs OSIPY 0.1.4 in the image, serves the static dashboard, and starts the companion inside the same container. The GHCR release image includes prepared public demo data; a local Compose build includes it only if you first follow [data/README.md](data/README.md). Only port 60010 is published, on your computer's loopback interface. The companion remains private on container loopback, and its credential is generated in memory and never shown in the browser. Stop the container with Ctrl+C. Stop `make dev` before starting Compose (and vice versa), since both use port 60010.

Once the stable GHCR image is published and public, the shorter command is `docker run --rm --pull=always -p 127.0.0.1:60010:37183 ghcr.io/osipi/dashboard:latest`. Replace `latest` with a published `vX.Y.Z` tag for a reproducible version. The public GitHub Pages site remains a separate browser origin; its locally saved scans are not transferred into the container workspace automatically.

## Data

The public demo dataset is not committed. Follow [data/README.md](data/README.md) to download and prepare it. An unprepared checkout still builds but reports that the brain dataset is unavailable.

Local NIfTI files and subject metadata remain in the browser session. Dataset preferences and notes may use local storage, but MRI samples do not.

## Local fitting companion

The dashboard works without the companion. To run real IVIM fitting, install OSIPY and follow [companion/README.md](companion/README.md), then start:

```sh
../../osipy/.venv/bin/python companion/server.py
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
