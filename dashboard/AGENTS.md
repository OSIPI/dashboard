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
- Viewing/import/ROI/export remain browser-local. Optional Python analysis uses `companion/server.py`, bound strictly to `127.0.0.1:60016`; preserve token authentication, Host/Origin checks, request/resource limits and clean shutdown. Never expose it on a public network interface or invent remote analysis services.
- Preserve the production base path `/dashboard` and URL `https://osipi.github.io/dashboard/`.

## Verification

- Run `bun run check` and `bun run build` after frontend changes.
- Run focused ESLint and Prettier checks for changed files; do not modify unrelated files solely to clear existing repo-wide lint debt.
- Smoke-test changed UI at desktop and mobile widths.

## Releases

- Follow the repository-level [release documentation](../docs/releases.md) and [agent rules](../AGENTS.md). Run `make release-dry-run` or an explicitly authorized `make release` from the repository root.
- Derive stable SemVer from Conventional Commits since the latest reachable `v*` tag: `fix`/`perf` patch, `feat` minor, breaking major. Update package, citation, CodeMeta and dated categorized changelog together.
- Keep GitHub Actions free of builds. Main pushes and pull requests run checks only. Only tag pushes deploy Pages: download the published prebuilt release, verify its tag-bound checksum/version/source, and deploy without install/build. Running real `make release` requires explicit authorization for commits, tags, push and publication; editing/testing this tooling does not authorize those effects.
- Preserve retry receipts and unexpected edits; never reset or force a release/tag. Retain frozen archives and reconcile remote releases/assets on retry; never clobber uploads or rebuild a checkpointed archive. Test release logic and no-build Pages handoff with `bun test scripts/release.test.ts`.

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
- Voxel scatter plots and canvas use the same acquired samples. Never connect raw acquisitions into curves, average repeats or jitter points. A separately labelled curve may show an actual companion fit; ROI spatial means must be explicitly labelled. Preserve repeated b-value volumes and original index orientation; precision controls select by one-based volume number, not by b-value.
- Use neutral near-black/charcoal dark surfaces and muted coral `--selection` tokens for data, crosshairs, sliders and selection borders; use darker coral in light mode. Keep buttons neutral, the Save voxel primary foreground-colored with inverse text, and active technique text/underline coral. No neon accents or glowing shadows; preserve the official logo. Keep secondary acquisition metadata collapsed and reuse `NumericControl` for finite, clamped slider/step/numeric edits.
- Local NIfTI-1/2 scalar 3D/4D images with b-values load through a cancellable worker. DICOM/BIDS discovery catalogues subjects, sessions and series; DICOM pixels are not decoded. Only the verified OSIPY biexponential/LM analysis pair is exposed; other technique workflows remain unimplemented.
- Saved voxel coordinates and optional notes use browser localStorage only, with validation and visible storage-failure feedback. No migration layers or external dependencies are needed.
- Run `bun test scripts/ivim.test.ts` for loading, integrity, windowing and storage boundaries, plus `../osipy/.venv/bin/python scripts/prepare_ivim.py --verify` for exact source/prepared data comparison.

## Exploration Workspace

- `ViewerTile.svelte` handles single/montage image interaction; home owns shared slice/voxel and linked or per-volume display state. Montage selection uses acquisition indices, never deduplicated b-values. Preserve individual repeated acquisitions.
- Viewer components live in `src/lib/components/viewer/`: `SeriesBrowser`, `ViewerPanel`, `ImageControls`, `SignalPanel`, `SavedVoxels`, `WorkspaceFiles`, `DatasetDetails`, and `PanelDivider`. The page owns dataset/selection state; `SignalPanel` owns chart rendering/export/theme observation; `WorkspaceFiles` owns import validation/confirmation and file downloads; `PanelDivider` owns resize interactions. Preserve these boundaries.
- The Series browser's Select switch enables comparison selection; it starts off and is transient. When on, thumbnail buttons toggle comparison membership with `aria-pressed`; bulk selection actions are shown only in this mode. Switching the mode off preserves the comparison set. Coral outlines and tinted surfaces show membership in either mode; a separate dot and `aria-current` identify the active volume. Keep each tile to the image, b-value and volume number; do not repeat checkboxes, comparison labels or slice counts. Selection determines single/multiview; do not reintroduce an Open montage mode switch. The visual layout popover supports automatic, paired, four/eight-tile grids and image context menus. Fixed grids page by active acquisition without dropping selections; workspace JSON stores `gridLayout` rather than a separate montage flag.
- With Select off, thumbnail navigation and volume-step navigation replace the active pane; if that acquisition already exists, focus its pane instead of duplicating it. With Select on, thumbnail toggles (or explicit Select filtered) add panes. Preserve pane order when replacing acquisitions. Mobile comparison selection stays in Series; normal thumbnail browsing returns to Image.
- Wheel/trackpad scrolling over an image zooms at the pointer within 1–4× and activates that pane, honoring display linking. Use a non-passive listener with teardown. Shift+wheel scrolls the image grid; sidebar scrolling stays native.
- Hold Space + mouse drag for temporary panning over/focused on an image; never persist this modifier or change the selected tool. Ignore editable fields and other interactive controls; release it on keyup, window blur, or document hiding. Clear temporary drags on release and preserve normal Space button/typing behavior elsewhere.
- Panel dividers support pointer and keyboard resizing with local width preferences. Large montages scroll internally; keep mobile panel switching accessible.
- `workspace.ts` validates portable workspace JSON against dataset ID and sample SHA-256. Validate the complete file before applying; confirm replacement of notes/settings. Export settings only, not imaging samples.
- Auto windowing uses exact int16 histogram quantiles or sorted scalar samples with original scaling and an explicit slice/volume scope; never mutate source samples. `VoxelVolume` retains scalar source precision, including floats and signed scaling.
- Inline/focused charts and SVG/PNG exports share an escaped SVG renderer. Keep raw samples separate and labelled. Compare at most four saved voxels plus current for readable distinct markers/colors; CSV exports every acquisition at the current voxel.
- Run `bun test` including workspace round-trip, rejection, auto-window and scatter/CSV tests; browser-check downloads, import restoration, linked/unlinked montage, panel resizing and short mobile layouts.

## Layout Persistence

- Use Runed `PersistedState` through `persistedPreference` for layout preferences, rather than manual localStorage handlers. Bind controls directly to `preferences.current` so all UI changes, including workspace imports, persist automatically.
- `osipy.viewer.layout` stores grid mode, sidebar widths, series grid/list view, active mobile panel, linked-display preference, and disclosure states, including every inspector card. Inspector cards stay mounted when collapsed so draft inputs and session state are preserved. `theme` uses the same Runed helper with the raw light/dark value required by the early theme script.
- Pane selection and active acquisition persist under `osipy.viewer.panes.<sample-sha256>` after loading and validating the dataset. Never store MRI sample buffers in localStorage or reuse pane indices across different data checksums.
- `layout-preferences.ts` validates enums, booleans, sizes and acquisition bounds. Malformed preferences restore defaults. Storage denial must leave reactive session controls usable. Cross-tab synchronization is disabled so another workspace cannot unexpectedly rearrange this one.
- Reset layout writes the default layout immediately (it preserves dataset selections and theme). Do not restore temporary dialogs/context menus, image data, or analysis jobs on reload. Verify reloads, route return, imported layout persistence, reset, and malformed/denied storage when changing this contract.

## Local Scans and Comparison

- `src/lib/imports/` owns NIfTI decoding, bounded gzip reading, discovery, scan metadata and spatial mapping. Validate dimensions/payload, datatype, b-value counts, finite values/scaling, declared units and an invertible affine before committing a scan. Prefer declared sform, otherwise qform; normalize spatial units to mm without reorienting samples.
- Keep imported files/data and subject/study/date metadata session-local. No file-modified dates or invented scan dates. Imaging arrays never enter localStorage. Local bookmarks are checksum-scoped; switching scans preserves independent workspace state.
- Matching NIfTI sidecars and BIDS dataset names/scans.tsv dates are supported; broader BIDS metadata inheritance is not. DICOM discovery reads headers only (4 MiB limit), groups by patient/study/series IDs, and directs users to convert diffusion data to NIfTI+b-values.
- Compare within a subject/study with independent displays. Navigation linking requires an explicitly verified shared frame; equal dimensions/affines alone never establish alignment. Map points through RAS mm and show out-of-field status instead of clamping to a misleading voxel.
- Test imports with `scripts/local-import.test.ts` and generated fixtures only; never commit private imaging data. Decode in a worker with cancellation, a 512 MiB image limit and 768 MiB session limit.

## Analysis, ROI and Handoff

- `analysis-client.svelte.ts` owns companion connection/polling and session results. Tokens stay in memory, never localStorage, URLs, exports or logs. Raw scalar payloads retain original scaling; the Python fitter consumes all repetitions without averaging.
- The companion uses OSIPY's public `BoundIVIMModel`/`LevenbergMarquardtFitter.fit_batch` APIs, with real iteration/tolerance/bounds/initialization settings. Report actual software version, input identity, settings, timing and quality reasons. Never substitute mock fits or silently mark non-convergence/bound hits as valid.
- Parameter overlays are on the native grid. Preserve unavailable estimates as NaN plus explicit status/validity masks. Fitted curves and residuals are distinct from raw acquisition markers. Adjusted R² uses n observations and k fitted parameters, denominator n−k.
- ROI state is dataset-scoped, session-local and immutable per edit, with bounded undo. Rasterize native voxel centers; preserve per-slice indices. Mask import requires matching dimensions/affine and integer labels. ROI signal means and averages of voxelwise maps are different from fitting a mean signal.
- Registration import supports checksum-bound RAS-mm JSON and one ITK affine .tfm (LPS converted to RAS). Direction is explicitly primary→comparison. No nonlinear/composite or automatic registration; never clamp an out-of-field linked point.
- `export-bundle.worker.ts` creates local ZIPs with NIfTI source/maps/masks, ROI metadata, report, CSV, checksums, and Slicer/ITK-SNAP instructions. Separate ROI masks preserve overlaps. No application launching. Never embed unescaped user strings into executable scripts.
- Run Bun tests, `python -m unittest discover -s companion`, and `companion/verify_bundle.py` on a generated browser bundle. Verify genuine fitting, cancellation/auth, ROI drawing/undo/mask round trips, transforms and output geometry. Third-party GUI execution is not implied by syntax/file-format validation.
