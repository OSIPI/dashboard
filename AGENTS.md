# Dashboard Agent Notes

## Frontend Stack

- Use Svelte 5, SvelteKit 2, TypeScript, Bun, Vite, and Tailwind CSS 4.
- Follow the shadcn design model: semantic tokens and shared component recipes live in `src/app.css`.
- Use **inline Tailwind CSS utilities first** throughout the app: layout, spacing, typography, responsive/container rules, states, focus, and transitions belong in component markup. Use Tailwind arbitrary values/variants when needed, rather than recreating a scoped stylesheet.
- Tailwind handles layout; shadcn-style primitives handle shared visual/interaction patterns. Reuse the existing recipes and semantic tokens (`background`, `foreground`, `border`, `selection`, etc.). If adding library primitives, use **shadcn-svelte**, not React shadcn/ui, and style them with the same Tailwind tokens. The current repo has shadcn-inspired recipes, not an installed shadcn component library.
- Keep global CSS limited to theme tokens, base rules, shared primitive recipes and generated-content styling (Markdown/Prism/scrollbars). Avoid component-specific `<style>` blocks. Inline `style:` bindings are appropriate for runtime values such as image transforms and user-resized panel widths.
- Keep route files focused on loading, shared state, and composition. Extract cohesive UI responsibilities into named components; use typed props, callbacks, bindings, and snippets instead of duplicating state or adding a global store for every panel.
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

- The document never scrolls: the root layout owns `h-dvh`, safe-area padding and hidden overflow. Other routes scroll only inside the layout's inner route container.
- Home owns the integrated `Header` with technique selection and secondary dataset badges; Voxel / Pan / Reset live in the viewport header. Do not add a separate website header or marketing heading above the workspace.
- Keep the viewer in the remaining height with a square image fitted to both available dimensions. Series, inspector and image controls own their scrolling; always propagate `min-height: 0` through the shell.
- Keep `ImageControls` a compact dock: Acquisition / Display / Windowing use two columns at a 640px container width and three at 960px. Use `NumericControl compact` for this dock only; preserve the default for spatial controls. Keep 44px mobile targets, inline units, secondary help collapsed, and all overflow inside the controls panel.
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

## Exploration Workspace

- `ViewerTile.svelte` handles single/montage image interaction; home owns shared slice/voxel and linked or per-volume display state. Montage selection uses acquisition indices, never deduplicated b-values. Preserve individual repeated acquisitions.
- Viewer components live in `src/lib/components/viewer/`: `SeriesBrowser`, `ViewerPanel`, `ImageControls`, `SignalPanel`, `SavedVoxels`, `WorkspaceFiles`, `DatasetDetails`, and `PanelDivider`. The page owns dataset/selection state; `SignalPanel` owns chart rendering/export/theme observation; `WorkspaceFiles` owns import validation/confirmation and file downloads; `PanelDivider` owns resize interactions. Preserve these boundaries.
- Checkbox selection directly determines single/multiview; do not reintroduce an Open montage mode switch. The visual layout popover supports automatic, paired, four/eight-tile grids and image context menus. Fixed grids page by active acquisition without dropping selections; workspace JSON stores `gridLayout` rather than a separate montage flag.
- Thumbnail/volume-step navigation replaces the active pane; if that acquisition already exists, focus its pane instead of duplicating it. Only checkboxes (or explicit Select filtered) add panes. Preserve pane order when replacing acquisitions.
- Wheel/trackpad scrolling over an image zooms at the pointer within 1–4× and activates that pane, honoring display linking. Use a non-passive listener with teardown. Shift+wheel scrolls the image grid; sidebar scrolling stays native.
- Hold Space + mouse drag for temporary panning over/focused on an image; never persist this modifier or change the selected tool. Ignore editable fields and other interactive controls; release it on keyup, window blur, or document hiding. Clear temporary drags on release and preserve normal Space button/typing behavior elsewhere.
- Panel dividers support pointer and keyboard resizing with local width preferences. Large montages scroll internally; keep mobile panel switching accessible.
- `workspace.ts` validates portable workspace JSON against dataset ID and sample SHA-256. Validate the complete file before applying; confirm replacement of notes/settings. Export settings only, not imaging samples.
- Auto windowing uses exact int16 histogram quantiles with original scaling and an explicit slice/volume scope; never mutate source samples.
- Inline/focused charts and SVG/PNG exports share an escaped SVG renderer. Keep raw samples separate and labelled. Compare at most four saved voxels plus current for readable distinct markers/colors; CSV exports every acquisition at the current voxel.
- Run `bun test` including workspace round-trip, rejection, auto-window and scatter/CSV tests; browser-check downloads, import restoration, linked/unlinked montage, panel resizing and short mobile layouts.

## Layout Persistence

- Use Runed `PersistedState` through `persistedPreference` for layout preferences, rather than manual localStorage handlers. Bind controls directly to `preferences.current` so all UI changes, including workspace imports, persist automatically.
- `osipy.viewer.layout` stores grid mode, sidebar widths, series grid/list view, active mobile panel, linked-display preference, and disclosure states. `theme` uses the same Runed helper with the raw light/dark value required by the early theme script.
- Pane selection and active acquisition persist under `osipy.viewer.panes.<sample-sha256>` after loading and validating the dataset. Never store MRI sample buffers in localStorage or reuse pane indices across different data checksums.
- `layout-preferences.ts` validates enums, booleans, sizes and acquisition bounds. Malformed preferences restore defaults. Storage denial must leave reactive session controls usable. Cross-tab synchronization is disabled so another workspace cannot unexpectedly rearrange this one.
- Reset layout writes the default layout immediately (it preserves dataset selections and theme). Do not restore temporary dialogs/context menus, image data, or analysis jobs on reload. Verify reloads, route return, imported layout persistence, reset, and malformed/denied storage when changing this contract.
