# 0002 — License: Apache-2.0

**Date:** 2026-09-10
**Status:** Accepted

## Context

The project needs an OSI-approved license. The dependency stack (osipy,
FastAPI, uvicorn, nibabel, pydantic, numpy) is uniformly permissive (MIT/BSD),
so both permissive and copyleft choices are legally open.

## Decision

Apache License 2.0. Chosen by the maintainer. It adds an explicit patent grant
over MIT/BSD, which suits a project intended for use across the OSIPI
ecosystem. Ship `LICENSE` (verbatim Apache-2.0 text) and `NOTICE`;
`SPDX-License-Identifier: Apache-2.0` in `pyproject.toml`.

## Consequences

- Redistributors must retain the `NOTICE` file's attributions.
- Apache-2.0 is one-way compatible with the permissive deps (fine downstream).
- Contributions are inbound-Apache-2.0 by default (state this in CONTRIBUTING).
