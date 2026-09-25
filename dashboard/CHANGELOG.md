# Changelog

## 0.2.0 - 2026-09-25

### Features

- viewer: import public demo from Zenodo (121731a)
- viewer: add standalone NIfTI spatial views (3fc9b48)

### Fixes

- delivery: exclude MRI data from artifacts (0d39e7f)
- api: preserve terminal job progress (95371dd)
- ci: build container from dashboard directory (557211e)

## 0.1.0 - 2026-09-24

### Features

- container: package local fitting workspace (c8d1858)
- viewer: refine analysis and exploration UI (5d4ecc7)
- Add configurable IVIM fitting dialog (d222a34)
- Add automatic local companion pairing (9a0bd3d)
- api: add IVIM REST backend (#9) (ea6d1bd)

### Fixes

- companion: reuse and evict dataset inputs (8468f68)
- api: address backend review findings (8847ce8)

### Other changes

- dev: add scoped make stop (a139e6c)
- Add OSIPY methods menu (7d2e13e)
- deploy Pages from main (6cb736f)
- Add feedback link to viewer header (1bcb165)
- Improve viewer panels and series selection (be8d3d7)
- Improve viewer controls and typography (bfb3238)
- move release workflow to repository root (ae21e3f)
- prepare different places for dashboard and backend api for the future monorepo (0d78512)
- release: add intentional local release workflow (84b24fb)
- prepare demo data for Pages (dad89b3)

Local releases prepend dated, categorized notes from Conventional Commits here. Annotated Git tags identify released versions; package and research metadata are updated in the same release commit.

This project follows semantic versioning where practical during active development.

## Unreleased

- Add research software metadata, governance, security, contribution, and release documentation before automated releases.
