# Governance

This file explains how decisions are made and how OSIPY Dashboard is maintained.

## Roles

- **Project community:** OSIPI contributors and users.
- **Maintainers:** Contributors with repository review and release responsibilities.
- **Domain reviewers:** OSIPY and perfusion MRI users who review workflow assumptions and user-facing behavior.

## Decision Process

Use issues and pull requests for visible discussion. Document significant technical, workflow, deployment, or data-handling decisions as Architecture Decision Records in `docs/decisions/`.

For decisions made in meetings or chat, summarize the outcome in an issue, pull request, ADR, or documentation update so future maintainers can recover the context.

## Maintainer Responsibilities

- Review pull requests for correctness, maintainability, accessibility, and OSIPY workflow alignment.
- Keep checks, documentation, releases, and metadata current.
- Triage issues and label known limitations.
- Preserve handover information so future maintainers can run, test, deploy, and release the dashboard.

## Handover

Before a maintainer leaves or changes role, update:

- Architecture decision records in `docs/decisions/`.
- Release and deployment documentation in `docs/release.md`.
- Open issues, milestones, and known risks.
- Any external service, package, deployment, or data access notes.
