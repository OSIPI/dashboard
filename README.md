# OSIPY

This repository contains the OSIPY web platform.

- [`dashboard/`](dashboard/) contains the SvelteKit dashboard and its optional local Python companion.
- [`rest-api/`](rest-api/) contains the local IVIM REST API.

## Dashboard development

```sh
make dev
```

The dashboard is available at <http://localhost:60010>.
Run `make stop` from the repository root to stop the frontend and companion started by `make dev` (also available in `dashboard/`). This does not stop Docker Compose or unrelated servers. Stopping the companion removes its temporary datasets and run history.

To run the local OSIPY fitting companion for the public dashboard:

```sh
docker compose up
```

Keep using <https://osipi.github.io/dashboard/>. Compose builds a Python-only image, publishes its authenticated REST companion on `127.0.0.1:60016`, and prints a session token in the terminal. After importing a scan, paste that token into Inspector → IVIM analysis on the public dashboard. Rebuild after source changes with `docker compose up --build`. Stop `make dev` first; both commands use companion port 60016.

The current public `v0.2.0` GHCR image still contains the self-hosted dashboard. Once a backend-only image is published, users will be able to skip cloning and run:

```sh
docker run --rm --pull=always -p 127.0.0.1:60016:60016 ghcr.io/osipi/dashboard:latest
```

This will download the companion image; continue using the public Pages dashboard and paste the token printed in the container logs. Use a new versioned tag instead of `:latest` to pin the backend-only release. Only local port 60016 is exposed; do not publish it to a LAN or the internet. Until that release, use the clone-and-Compose route above.

See the [architecture diagram](dashboard/README.excalidraw.png) and its [editable Excalidraw source](dashboard/README.excalidraw).

## Releases

```sh
make release-dry-run
make release
```

Use the dry run to preview the intentional local release workflow. See [docs/releases.md](docs/releases.md); a real release requires explicit authorization because it commits, tags, pushes, and publishes.

## License

MIT. See [LICENSE](LICENSE).
