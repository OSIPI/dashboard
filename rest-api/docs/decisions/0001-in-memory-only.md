# 0001 — In-memory only, no disk persistence

**Date:** 2026-09-09
**Status:** Accepted

## Context

DWI data is sensitive medical imaging data. The backend runs locally on the
user's own machine, one user at a time.

## Decision

Uploaded volumes, parameter maps, and job state are held in RAM only, keyed by
UUID, and cleared on process exit or after a TTL. NIfTI parsing and
serialization go through in-memory buffers, never temp files.

## Consequences

- No database, no data directory.
- Metadata and results are lost on restart (acceptable for a local tool).
- A memory cap and dataset-count cap bound RAM use.
- Disk persistence and batch processing are deferred; the `Storage` and
  `JobRunner` protocols are the seams where they will attach.
