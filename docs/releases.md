# Releases

Run from the repository root. `make release` is the intentional one-command release for `OSIPI/dashboard`: dashboard checks, build and packaging run locally; commit, tag, atomic push and GitHub Release publication follow. GitHub only deploys the prebuilt site to Pages. Main pushes never publish or deploy. This private npm package is a static website, not a registry product.

## Preview and prerequisites

`make release-dry-run` reads local Git history/files only. No network, credentials, installs, generated files, tests, builds, index writes, commits or tags. It prints prospective version/notes, readiness, saved checkpoints and the complete conditional plan. Remote freshness remains unverified.

Before a real release, finish review/merge, fetch origin and tags yourself, and check out clean, current `main`. Full history and a reachable stable `vX.Y.Z` baseline are required (initial baseline: `v0.0.1`). Latest means highest stable SemVer reachable from HEAD. Unsupported reachable `v*` tags fail closed. No qualifying commits means no new release.

Install locked Bun dependencies in `dashboard/`, Git, GitHub CLI and the existing Python environment separately. `RELEASE_PYTHON` defaults to `../../osipy/.venv/bin/python` from the dashboard working directory. Prepare public demo data per [dashboard/data/README.md](../dashboard/data/README.md); release verifies it, never downloads it. Existing Git HTTPS and `gh` authentication must allow pushing main/tags and managing Releases in `OSIPI/dashboard`; branch protections must permit the release commit. No credentials are printed, exported or stored by the script. Configure Pages to use GitHub Actions and permit the `github-pages` environment to deploy release tags.

## One-command release

Run real `make release` only with explicit authorization for commits, tags, push and publication. Editing or testing release tooling never implies that authorization.

1. Check clean main/full history and live public repository refs without credential helpers. Require matching remote tags and current main. No automatic fetch, force push, reset or tag replacement.
2. Analyze complete Conventional Commit messages since the latest reachable tag: `fix`/`perf` patch, `feat` minor, `!`/`BREAKING CHANGE:`/`BREAKING-CHANGE:` major (including before 1.0). Highest bump wins.
3. Update `dashboard/package.json`, `dashboard/CITATION.cff`, `dashboard/codemeta.json` and the UTC-dated categorized `dashboard/CHANGELOG.md` together. Preserve previous notes. Bun lockfile and Zenodo metadata have no version field to update.
4. Run `bun run check`, `bun test`, Python companion unittest discovery and prepared-data verification. Build with release version and source parent SHA. Include `release.json` identifying version, source and `/dashboard` base path. Freeze `osipy-vX.Y.Z.tar.gz` plus `.sha256` in Git's `dashboard-releases/vX.Y.Z/` directory, outside disposable `build/`. Record its SHA-256 before any publication.
5. Create `chore(release): vX.Y.Z` containing only the four dashboard metadata files, then an annotated tag binding archive checksum and source SHA. This static site has no platform binary signing or notarization step. Git commit/tag signing and commit/push hooks are disabled to avoid hidden side effects. App SHA identifies tested source parent; release commit adds metadata/notes.
6. Push the exact release commit to main and annotated tag together with `git push --atomic` to the fixed organization repository. Read both refs back before continuing. Rejected pushes preserve local checkpoints.
7. Create or reconcile the tag's draft GitHub Release, update draft title/notes as needed, and upload exact frozen archive/checksum. Read asset bytes back and compare digests. Existing identical uploads are reused; conflicting assets are never overwritten/deleted. Publish only after both assets verify, then read publication back. Published metadata/assets are treated as immutable; mismatches fail closed.
8. Tag-triggered Pages workflow waits up to 30 minutes for publication, downloads those assets, verifies checksum against the annotated tag, checks version/source/base-path manifest and tag commit, safely extracts and deploys. No checkout, install or build runs in Pages. SHA-256 bound into the tag prevents swapping archive and checksum together; keep published tags protected. GitHub's repository-level immutable releases may additionally be enabled by maintainers, but tooling never changes repository settings.

Command completion confirms Release publication, not successful Pages deployment. Inspect the tag workflow's final deployment status at GitHub. Pages remains `https://osipi.github.io/dashboard/`.

## Retry and recovery

Git's `dashboard-release.json` is atomically replaced after each checkpoint: original HEAD and before/after files, frozen archive digest/path, release commit, verified push, release ID, verified asset IDs and publication. Rerun `make release` after correcting a failure. Before archive checkpoint, checks/build may rerun; afterwards exact archived bytes are reused, never rebuilt. Asset listing and byte verification reconcile requests that succeeded just before interruption, so retries do not duplicate releases/uploads. Missing/corrupt frozen bytes require restoring the original archive; never rebuild or clobber a published version.

Only a fully published receipt may retire when later commits contain its tag. Pending releases reject unrelated HEAD changes or unexpected staged/working files. Completed retries revalidate remote publication without creating another version. Old local-only receipts/tags without checksum bindings require manual inspection, not automatic replacement.

Tag push starts Pages before local uploads finish. If publication takes longer than 30 minutes, complete the local retry then use GitHub's **Re-run jobs** on that same tag run. This needs no new tag or build. A deployment failure likewise uses the original tag run and archive.

Git's `dashboard-release.lock` directory prevents simultaneous local releases. Normal failures remove the lock but keep checkpoints. After a hard kill, verify no release process remains before removing the empty lock. Never remove a receipt to bypass mismatched HEAD/files. Preserve edits and inspect first. Abandoning an uncommitted release requires manually restoring only its four recorded files/index entries; never delete a commit/tag as automatic recovery.

## Verification

PRs/main retain Svelte/TypeScript checks, Bun tests, metadata checks and Conventional Commit PR-title validation. GitHub Actions never run production builds. Local release owns build/data/companion checks.

Tooling verification (no release effects): `cd dashboard && bun test scripts/release.test.ts`, `make release-dry-run`, focused ESLint/Prettier and `git diff --check`. Tests use mocks and temporary archives, never Git writes, credentials or external services. The actual Pages verifier runs under `python3` from `PATH` and supports Python 3.9+: SHA-256 is streamed in chunks, and validated regular files/directories are copied into a fresh destination without restoring archive links or special members. On macOS, test system Python explicitly with `cd dashboard && PATH=/usr/bin:/bin:$PATH bun test scripts/release.test.ts`. Do not run real `make release` to test tooling.
