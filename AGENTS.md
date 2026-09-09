# Dashboard Agent Notes

## Frontend Stack

- Use Svelte 5, SvelteKit 2, TypeScript, Bun, Vite, and Tailwind CSS 4.
- Follow the shadcn design model: semantic tokens and shared component recipes live in `src/app.css`.
- Reuse the existing `card`, `button`, `badge`, and `input` recipes before adding components or dependencies.
- Use the installed Iconify integration for icons.
- Do not add DaisyUI, DaisyUI classes, or `data-theme` themes.
- Keep the interface responsive, accessible, and visually consistent with the compact application workspace.

## Port Contract

- Direct Vite development listens on host port `60010`.
- Vite preview listens on host port `60014`.
- Docker Compose maps host port `60010` to frontend container port `37183`.
- Keep Vite development and preview ports strict; do not allow automatic fallback ports.
- The dashboard is frontend-only. Do not advertise or invent a backend service.
- Preserve the production base path `/dashboard` and URL `https://osipi.github.io/dashboard/`.

## Verification

- Run `bun run check` and `bun run build` after frontend changes.
- Run focused ESLint and Prettier checks for changed files; do not modify unrelated files solely to clear existing repo-wide lint debt.
- Smoke-test changed UI at desktop and mobile widths.
