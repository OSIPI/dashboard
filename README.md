# OSIPY Dashboard

A small SvelteKit dashboard scaffold for OSIPY projects, copy, and ideas.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Deploy GitHub Pages](https://github.com/OSIPI/dashboard/actions/workflows/pages.yml/badge.svg)](https://github.com/OSIPI/dashboard/actions/workflows/pages.yml)
[![Metadata](https://github.com/OSIPI/dashboard/actions/workflows/metadata.yml/badge.svg)](https://github.com/OSIPI/dashboard/actions/workflows/metadata.yml)
[![Citation File Format](https://img.shields.io/badge/citation-CFF-blue.svg)](CITATION.cff)

The current version is intentionally frontend-only. Login, account creation, PocketBase, and seed scripts were removed until the dashboard needs persistence.

## Tech Stack

- SvelteKit 2 and Svelte 5
- Tailwind CSS 4 and daisyUI
- Bun runtime
- Docker Compose for local development

## Development

Run the app through Docker Compose with Bun:

```sh
make dev
```

`make dev` uses the fixed dashboard port `37183` and prints the URL before starting Docker Compose.

You can also run it locally without Docker:

```sh
bun install
bun run dev
```

Before opening a pull request, run:

```sh
bun run check
bun run lint
bun run build
```

## Configuration

Copy `.env.example` to `.env` if you want to use Docker Compose directly with the same frontend port:

```sh
cp .env.example .env
```

## Citation

If you use OSIPY Dashboard in your work, cite it using the metadata in [CITATION.cff](CITATION.cff). Release archives can be connected to Zenodo using the metadata in [.zenodo.json](.zenodo.json).

## Project Practices

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow, [SECURITY.md](SECURITY.md) for vulnerability reporting, [GOVERNANCE.md](GOVERNANCE.md) for decision-making and handover expectations, and [docs/release.md](docs/release.md) for release notes.

## License

MIT License. See [LICENSE](LICENSE).
