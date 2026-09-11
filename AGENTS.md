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
- Home owns the integrated `Header` with technique selection and secondary dataset badges; Voxel / Pan / Reset live in the viewport header. Do not add a separate website header or marketing heading above the workspace.
- Keep the viewer in the remaining height with a square image fitted to both available dimensions. Series, inspector and image controls own their scrolling; always propagate `min-height: 0` through the shell.
- Below 900px, use the shared Image / Controls / Series / Inspector panel switcher, preserving viewer state. Hidden panels must not remain keyboard-focusable.
- Verify desktop and short 390px/320px mobile: document scrollHeight must not exceed clientHeight, no horizontal overflow, and all panel content must be reachable by internal scrolling.

## Acquired MRI Viewer

- The home route is the working IVIM demo. Keep DCE, DSC and ASL selectable but explicitly unimplemented until real workflows exist.
- `scripts/prepare_ivim.py` prepares the acquired `Data/brain.nii.gz` from Zenodo 14605039 using nibabel. All imaging files remain gitignored. See `data/README.md` for source, license and preparation before deployment.
- `src/lib/ivim.ts` validates static data and saved-view identity/bounds. Dimensions and diffusion metadata come from the prepared manifest, never phantom constants. `IvimImage.svelte` renders native oblique slices with original scaling and physical aspect.
- Voxel scatter plots and canvas use the same acquired samples. Never connect acquisitions into curves, average repeats, jitter points or fit parameters. Preserve repeated b-value volumes and original index orientation; precision controls select by one-based volume number, not by b-value.
- Use neutral near-black/charcoal dark surfaces and muted coral `--selection` tokens for data, crosshairs, sliders and selection borders; use darker coral in light mode. Keep buttons neutral, the Save voxel primary foreground-colored with inverse text, and active technique text/underline coral. No neon accents or glowing shadows; preserve the official logo. Keep secondary acquisition metadata collapsed and reuse `NumericControl` for finite, clamped slider/step/numeric edits.
- No user DICOM/NIfTI/BIDS import, backend or analysis execution is supported. The public prepared in-vivo series is the only implemented acquisition workflow.
- Saved voxel coordinates and optional notes use browser localStorage only, with validation and visible storage-failure feedback. No migration layers or external dependencies are needed.
- Run `bun test scripts/ivim.test.ts` for loading, integrity, windowing and storage boundaries, plus `../osipy/.venv/bin/python scripts/prepare_ivim.py --verify` for exact source/prepared data comparison.
