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

## App Shell

- The document never scrolls: the root shell owns `100dvh`, safe-area padding and hidden overflow. Other routes scroll only inside `.route-surface`.
- Home owns the integrated `Header` with technique selection, synthetic context and viewer actions. Do not add a separate website header or marketing heading above the workspace.
- Keep the viewer in the remaining height with a square image fitted to both available dimensions. Series, inspector and image controls own their scrolling; always propagate `min-height: 0` through the shell.
- Below 900px, use the shared Image / Controls / Series / Inspector panel switcher, preserving viewer state. Hidden panels must not remain keyboard-focusable.
- Verify desktop and short 390px/320px mobile: document scrollHeight must not exceed clientHeight, no horizontal overflow, and all panel content must be reachable by internal scrolling.

## Synthetic MRI Viewer

- The home route is the working IVIM demo. Keep DCE, DSC and ASL selectable but explicitly unimplemented until real workflows exist.
- `src/lib/ivim.ts` owns the deterministic 96 x 96 x 32 geometric phantom, nine Float32 signal volumes, windowing and saved-view validation. `IvimImage.svelte` renders slices; the home page owns interaction and signal inspection.
- Voxel curves read the same volume samples as the canvas. Parameters are synthetic generator ground truth, never fitted estimates. Axial indices are not patient orientation.
- No patient data, clinical imagery, real DICOM/NIfTI/BIDS import, network service or analysis execution is supported. Do not imply otherwise.
- Saved voxel coordinates and optional notes use browser localStorage only, with validation and visible storage-failure feedback. No migration layers or external dependencies are needed.
- Run `bun test scripts/ivim.test.ts` for the signal model, volume integrity, windowing and storage boundary tests.
