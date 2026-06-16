# OSIPY Dashboard

A small SvelteKit dashboard scaffold for OSIPY projects, copy, and ideas.

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

## Configuration

Copy `.env.example` to `.env` if you want to use Docker Compose directly with the same frontend port:

```sh
cp .env.example .env
```
