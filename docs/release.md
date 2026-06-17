# Release Process

This document records the release process so the dashboard can be archived, cited, deployed, and handed over.

## Before A Release

- Confirm the version in `package.json` follows semantic versioning.
- Run the relevant checks and build.
- Check that local development instructions still work from a clean environment.
- Update `CHANGELOG.md` with user-visible changes.
- Update `CITATION.cff`, `.zenodo.json`, and `codemeta.json` if project metadata changed.
- Confirm known limitations are documented in `README.md`, `ROADMAP.md`, or issues.

## Release Workflow

1. Create and push a version tag such as `v0.1.0`.
2. Let the GitHub `Release` workflow create the GitHub release from commit history.
3. Confirm the GitHub Pages deployment workflow still succeeds on `main`.
4. Confirm Zenodo archived the GitHub release when Zenodo integration is enabled.

## After A Release

- Check the GitHub release notes.
- Check the deployed dashboard at `https://osipi.github.io/dashboard/`.
- Check the Zenodo record and DOI metadata when available.
- Open follow-up issues for failed checks or missing release metadata.
