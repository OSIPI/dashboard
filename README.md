# OSIPY

This repository contains the OSIPY web platform.

- [`dashboard/`](dashboard/) contains the SvelteKit dashboard and its optional local Python companion.
- The backend will be added as a separate top-level project.

## Dashboard development

```sh
make dev
```

The dashboard is available at <http://localhost:60010>.

## Releases

```sh
make release-dry-run
make release
```

Use the dry run to preview the intentional local release workflow. See [docs/releases.md](docs/releases.md); a real release requires explicit authorization because it commits, tags, pushes, and publishes.

## License

MIT. See [LICENSE](LICENSE).
