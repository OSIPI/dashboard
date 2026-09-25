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

To run the built dashboard and local OSIPY companion instead of the development server:

```sh
docker compose up
```

Open <http://localhost:60010/dashboard/>. Stop `make dev` first; both commands use port 60010. Rebuild after source changes with `docker compose up --build`.

After a sample-free container release is verified, the old data-bearing `v0.1.0` package version is removed, **and** the GHCR package is made public, users can skip cloning and run:

```sh
docker run --rm --pull=always -p 127.0.0.1:60010:37183 ghcr.io/osipi/dashboard:latest
```

This downloads the image and opens the same local workspace at <http://localhost:60010/dashboard/>. Use `ghcr.io/osipi/dashboard:vX.Y.Z` instead of `:latest` to pin a specific published version. Only local port 60010 is exposed; the OSIPY companion remains private inside the container. Until the first public image is verified, use the clone-and-Compose route above.

See the [architecture diagram](dashboard/README.excalidraw.png) and its [editable Excalidraw source](dashboard/README.excalidraw).

## Releases

```sh
make release-dry-run
make release
```

Use the dry run to preview the intentional local release workflow. See [docs/releases.md](docs/releases.md); a real release requires explicit authorization because it commits, tags, pushes, and publishes.

## License

MIT. See [LICENSE](LICENSE).
