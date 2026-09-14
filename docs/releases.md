# Releases

Git tags are version truth. `package.json` remains at bootstrap version `0.0.1`; release jobs do not rewrite or commit version files. GitHub Releases contain generated release notes.

## One-time baseline

The initial `v0.0.1` baseline includes the release automation. After committing and verifying these changes on `main`, create the baseline tag and push it together with `main`:

```sh
git tag -a v0.0.1 HEAD -m "Release v0.0.1"
git push --atomic origin main refs/tags/v0.0.1
```

Workflow refuses to release or deploy until `v0.0.1` exists in `main` history. The baseline run publishes the tagged build through the release recovery step. With baseline present, first `fix:` becomes `v0.0.2`; first `feat:` becomes `v0.1.0`.

## Automated flow

Every pull request runs Svelte/TypeScript checks, tests, and a production build without release or deployment side effects. Every `main` revision runs same gates, then semantic-release:

- `fix:` creates a patch release.
- `feat:` creates a minor release.
- `type!:` or a `BREAKING CHANGE:` footer creates a major release.
- Other commit types do not release.

For a release, semantic-release passes `nextRelease.version` into production build before creating `v<version>` and its GitHub Release. The release attaches `osipy-vX.Y.Z.tar.gz`, built from the same `build/` directory sent to Pages. For a no-release commit, workflow builds `<latest-tag>-dev+<sha>`. If a prior run pushed a tag but stopped before publication or deployment, a rerun restores the release archive—or rebuilds and attaches it when missing—then deploys it instead of falling back to a development build. In every case, the selected job artifact deploys to `https://osipi.github.io/dashboard/` under `/dashboard`.

Workflow uses full Git history, serial execution with cancellation disabled, and minimum per-job permissions. Semantic-release and its plugins are installed from the committed Bun lockfile. Configuration has no npm publish plugin, `@semantic-release/git`, generated release commits, or tag-triggered follow-up workflow. GitHub issue and pull-request comments are disabled.

Safe local preview:

```sh
bun run release --dry-run --no-ci
```

Dry run still needs readable remote history and GitHub authentication, but skips prepare, tag, publish, and success/failure steps.

## Squash merges

Pull-request titles must use Conventional Commit form because GitHub permits squash merges and the squash title becomes the commit analyzed on `main`. CI accepts `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, and `test`, with optional scope and `!`; only `feat`, `fix`, or a breaking change creates a release.
