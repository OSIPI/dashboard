# Repository Agent Notes

## Layout

- `dashboard/` contains the SvelteKit dashboard and local Python companion.
- Repository-level automation, release entry points, and CI live at the root.
- Keep project-specific implementation guidance in `dashboard/AGENTS.md`.

## Releases

Follow [docs/releases.md](docs/releases.md). Releases are intentional local operations; GitHub Actions validate changes and deploy an already-published artifact but never build or publish a release from a push to `main`.

Never run `make release` without explicit authorization to commit, tag, push, publish, and upload. Implementing or testing release tooling does not grant that authorization. Use `make release-dry-run` for a side-effect-free local preview.

`make release` performs this exact workflow:

1. Require full Git history, a clean, current `main`, a reachable stable `vX.Y.Z` baseline, matching remote tags, and local HEAD equal to live `OSIPI/dashboard` main.
2. Read Conventional Commits since the latest reachable `v*` tag. `fix`/`perf` selects patch, `feat` selects minor, and `!`, `BREAKING CHANGE:`, or `BREAKING-CHANGE:` selects major; the highest required bump wins.
3. Update every authoritative dashboard version in `dashboard/package.json`, `dashboard/CITATION.cff`, and `dashboard/codemeta.json`, then prepend UTC-dated categorized notes to `dashboard/CHANGELOG.md`.
4. Run dashboard type checks, Bun tests, Python companion tests, prepared-data verification, and the production build locally. This static web release has no platform signing or notarization step. Freeze the built archive and SHA-256 outside the disposable build directory.
5. Create only `chore(release): vX.Y.Z`, create an annotated `vX.Y.Z` tag bound to the source and archive checksum, then atomically push `main` and the tag.
6. Create or reconcile a draft GitHub Release, upload and read back the exact frozen archive and checksum, and publish only after verification. The tag-triggered Pages workflow deploys that prebuilt artifact without checkout, install, or build.

Retries use the receipt under `.git`, preserve the frozen archive, reconcile remote state, and refuse unrelated edits, conflicting tags, duplicate releases, changed assets, force pushes, or clobbering. Rerun the same `make release` after resolving a failure; never delete the receipt or rebuild published bytes to bypass a mismatch.

Before changing release behavior, add or update tests in `dashboard/scripts/release.test.ts`. Verify with `cd dashboard && bun test scripts/release.test.ts`, `make release-dry-run`, and `git diff --check`. Never use a real release as a test.
