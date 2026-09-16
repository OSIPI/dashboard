# OSIPY

This repository contains the OSIPY web platform.

- [`dashboard/`](dashboard/) contains the SvelteKit dashboard and its optional local Python companion.
- The backend will be added as a separate top-level project.

## Dashboard development

```sh
cd dashboard
bun install
bun run dev
```

The dashboard is available at <http://localhost:60010>. Its existing Makefile and Docker Compose setup remain inside `dashboard/` until repository-wide tooling is introduced.

## License

MIT. See [LICENSE](LICENSE).
