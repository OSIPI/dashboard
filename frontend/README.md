# OSIPY Dashboard

An inspectable in-vivo IVIM MRI workspace for OSIPY projects. This app lives in the repository's `dashboard/` directory; run dashboard commands from here unless a command says otherwise.

The dashboard can load the public OSIPI TF2.4 brain series or local NIfTI diffusion MRI files, explore images and signals, manage ROIs, compare scans, and export interoperable analysis bundles. Optional local IVIM fitting runs through the loopback-only `../rest-api` Python package. MRI data is not sent to a remote analysis service.

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

`make dev` starts the Bun frontend and the OSIPY REST API on your host. The browser connects automatically through the local development proxy. Ctrl+C stops both. First run `cd ../rest-api && uv sync` to install the API environment (or override `API_PYTHON`). The root Makefile delegates development here and owns the release entry points.

For a Pages-style production preview without an embedded proxy or backend, run `make dev-prod` and open <http://127.0.0.1:60014/dashboard/>. It builds the static frontend and rejects local MRI sample files in the output. Run the site's **Run local fitting** Docker command yourself in a separate terminal; Ctrl+C stops only the preview.

To run the local REST API without a host Python or Bun environment, run from the parent repository directory (the same place you run `make dev`):

```sh
docker compose up
```

Continue using <https://osipi.github.io/dashboard/>. Compose builds a Python-only image with OSIPY 0.1.4 and the REST API; no frontend or MRI sample files are included. The dashboard connects automatically when the API is available on port 60016. If the browser requests local network access, allow it for this site. Only port 60016 is published, on your computer's loopback interface. Use `docker compose up --build` after changing the source; stop with Ctrl+C. Stop `make dev` before starting Compose (and vice versa), since both use API port 60016.

To use the published REST API and OSIPY without building locally, run `docker run --rm --pull=always -p 127.0.0.1:60016:60016 ghcr.io/osipi/dashboard:latest`. For a reproducible version, use the versioned image tag shown on the latest GitHub Release.

## Data

The public dataset is not committed. New Pages, release and container builds exclude MRI samples; the browser imports the demo directly from Zenodo. The old data-bearing v0.1.0 GHCR image and historical Pages artifacts were deleted. Follow [data/README.md](data/README.md) only to prepare a local verification copy.

Imported NIfTI files and subject metadata remain in the browser; saved scans, including MRI samples, use browser-local IndexedDB. They are not uploaded to OSIPI hosting. Notes and layout preferences use local storage.

## Local fitting API

The dashboard works without the API. To run real IVIM fitting, install [the local REST API](../rest-api/README.md), then start:

```sh
cd ../rest-api && OSIPY_API_PORT=60016 uv run uvicorn osipy_rest_api.main:app --host 127.0.0.1 --port 60016
```

The dashboard connects automatically to `127.0.0.1:60016`. Keep the API on that loopback address; do not expose it on a public interface.

## Checks

```sh
bun run check
bun test
bun run lint
bun run build
```

## Stack

SvelteKit 2, Svelte 5, Tailwind CSS 4, Bun, and the optional Python REST API.

Project policies (contributing, security, governance, citation) live at the repository root.
