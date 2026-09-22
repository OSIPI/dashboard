# Releases

Run from the repository root. `make release` is the intentional one-command release for `OSIPI/dashboard`: dashboard checks, build and packaging run locally; commit, tag, atomic push and GitHub Release publication follow. Separately, every push to `main` makes GitHub Actions build that exact commit and deploy it to Pages. Main pushes never publish a GitHub Release. This private npm package is a static website, not a registry product.

## Preview and prerequisites

`make release-dry-run` reads local Git history/files only. No network, credentials, installs, generated files, tests, builds, index writes, commits or tags. It prints prospective version/notes, readiness, saved checkpoints and the complete conditional plan. Remote freshness remains unverified.

Before a real release, finish review/merge, fetch origin and tags yourself, and check out clean, current `main`. Full history and a reachable stable `vX.Y.Z` baseline are required (initial baseline: `v0.0.1`). Latest means highest stable SemVer reachable from HEAD. Unsupported reachable `v*` tags fail closed. No qualifying commits means no new release.

Install locked Bun dependencies in `dashboard/`, Git, GitHub CLI and the existing Python environment separately. `RELEASE_PYTHON` defaults to `../../osipy/.venv/bin/python` from the dashboard working directory. Prepare public demo data per [dashboard/data/README.md](../dashboard/data/README.md); release verifies it, never downloads it. Existing Git HTTPS and `gh` authentication must allow pushing main/tags and managing Releases in `OSIPI/dashboard`; branch protections must permit the release commit. No credentials are printed, exported or stored by the script. Configure Pages to use GitHub Actions and permit the `github-pages` environment to deploy from `main`.

## One-command release

Run real `make release` only with explicit authorization for commits, tags, push and publication. Editing or testing release tooling never implies that authorization.

1. Check clean main/full history and live public repository refs without credential helpers. Require matching remote tags and current main. No automatic fetch, force push, reset or tag replacement.
2. Analyze complete Conventional Commit messages since the latest reachable tag: `fix`/`perf` patch, `feat` minor, `!`/`BREAKING CHANGE:`/`BREAKING-CHANGE:` major (including before 1.0). Highest bump wins.
3. Update `dashboard/package.json`, `dashboard/CITATION.cff`, `dashboard/codemeta.json` and the UTC-dated categorized `dashboard/CHANGELOG.md` together. Preserve previous notes. Bun lockfile and Zenodo metadata have no version field to update.
4. Run `bun run check`, `bun test`, Python companion unittest discovery and prepared-data verification. Build with release version and source parent SHA. Include `release.json` identifying version, source and `/dashboard` base path. Freeze `osipy-vX.Y.Z.tar.gz` plus `.sha256` in Git's `dashboard-releases/vX.Y.Z/` directory, outside disposable `build/`. Record its SHA-256 before any publication.
5. Create `chore(release): vX.Y.Z` containing only the four dashboard metadata files, then an annotated tag binding archive checksum and source SHA. This static site has no platform binary signing or notarization step. Git commit/tag signing and commit/push hooks are disabled to avoid hidden side effects. App SHA identifies tested source parent; release commit adds metadata/notes.
6. Push the exact release commit to main and annotated tag together with `git push --atomic` to the fixed organization repository. Read both refs back before continuing. Rejected pushes preserve local checkpoints.
7. Create or reconcile the tag's draft GitHub Release, update draft title/notes as needed, and upload exact frozen archive/checksum. Read asset bytes back and compare digests. Existing identical uploads are reused; conflicting assets are never overwritten/deleted. Publish only after both assets verify, then read publication back. Published metadata/assets are treated as immutable; mismatches fail closed.
8. The atomic push of the release commit to `main` triggers the independent Pages workflow. It checks out that exact SHA, installs locked dependencies, prepares the public IVIM demo data, builds with `APP_SHA` set to the pushed SHA, uploads the Pages artifact and deploys only after that build succeeds. The tagged archive and checksum remain GitHub Release assets; keep published tags protected. GitHub's repository-level immutable releases may additionally be enabled by maintainers, but tooling never changes repository settings.

Command completion confirms Release publication, not successful Pages deployment. Inspect the pushed-main Pages workflow's final deployment status at GitHub. Pages remains `https://osipi.github.io/dashboard/`.

## Retry and recovery

Git's `dashboard-release.json` is atomically replaced after each checkpoint: original HEAD and before/after files, frozen archive digest/path, release commit, verified push, release ID, verified asset IDs and publication. Rerun `make release` after correcting a failure. Before archive checkpoint, checks/build may rerun; afterwards exact archived bytes are reused, never rebuilt. Asset listing and byte verification reconcile requests that succeeded just before interruption, so retries do not duplicate releases/uploads. Missing/corrupt frozen bytes require restoring the original archive; never rebuild or clobber a published version.

Only a fully published receipt may retire when later commits contain its tag. Pending releases reject unrelated HEAD changes or unexpected staged/working files. Completed retries revalidate remote publication without creating another version. Old local-only receipts/tags without checksum bindings require manual inspection, not automatic replacement.

The main push starts Pages independently of local GitHub Release uploads. A Pages failure can be rerun for the same main-push workflow and SHA without changing or republishing the tagged release.

Git's `dashboard-release.lock` directory prevents simultaneous local releases. Normal failures remove the lock but keep checkpoints. After a hard kill, verify no release process remains before removing the empty lock. Never remove a receipt to bypass mismatched HEAD/files. Preserve edits and inspect first. Abandoning an uncommitted release requires manually restoring only its four recorded files/index entries; never delete a commit/tag as automatic recovery.

## Verification

PRs/main retain Svelte/TypeScript checks, Bun tests, metadata checks and Conventional Commit PR-title validation. The separate Pages workflow runs a production build and deployment for pushed `main` commits only; PRs and tags never deploy. Local release still owns its release build/data/companion checks.

Tooling verification (no release effects): `cd dashboard && bun test scripts/release.test.ts`, `make release-dry-run`, focused ESLint/Prettier and `git diff --check`. Tests use mocks and temporary files, never Git writes, credentials or external services. Do not run real `make release` to test tooling.
