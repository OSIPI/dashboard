# OSIPY

This repository contains the OSIPY web platform.

- [`dashboard/`](dashboard/) contains the SvelteKit dashboard.
- [`rest-api/`](rest-api/) contains the optional local IVIM analysis backend consumed by the dashboard.

## Dashboard development

```sh
make dev
```

The dashboard is available at <http://localhost:60010>.
Run `make stop` from the repository root to stop the frontend and REST API started by `make dev` (also available in `dashboard/`). This does not stop Docker Compose or unrelated servers. Stopping the API removes its in-memory datasets and run history.

To preview the production Pages build locally, run `make dev-prod` and open <http://127.0.0.1:60014/dashboard/>. It starts only the static frontend. Run the local REST API separately for fitting; stop each process in its own terminal.

To run the local OSIPY REST API for the dashboard:

```sh
docker compose up
```

Keep using <https://osipi.github.io/dashboard/>. Compose builds a Python-only image, publishes the REST API on `127.0.0.1:60016`. The dashboard connects automatically when that port is available. Rebuild after source changes with `docker compose up --build`. Stop `make dev` first; both commands use API port 60016.

To run the published REST API image without cloning:

```sh
docker run --rm --pull=always -p 127.0.0.1:60016:60016 ghcr.io/osipi/dashboard:latest
```

This pulls the local API with OSIPY installed; the public dashboard connects to it through the loopback port. Use a versioned tag for a reproducible image. Only local port 60016 is exposed; do not publish it to a LAN or the internet.

See the [architecture diagram](dashboard/README.excalidraw.png) and its [editable Excalidraw source](dashboard/README.excalidraw).

## Releases

```sh
make release-dry-run
make release
```

Use the dry run to preview the intentional local release workflow. See [docs/releases.md](docs/releases.md); a real release requires explicit authorization because it commits, tags, pushes, and publishes.

## License

MIT. See [LICENSE](LICENSE).
