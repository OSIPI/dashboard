# Partner session diagnostics

Diagnostics start automatically when the dashboard opens. Use the activity icon
in the header (**Session diagnostics**) to pause/resume, clear, or **Download
diagnostics**. Reproduce the slow or failing workflow, then download the `.jsonl`
file for the current session or a saved session. Logs survive closing or reloading
the tab in this browser. Review the download under your institution's
sharing policy and send it to the OSIPY team instead of the imaging data.

## What the log contains

- A random session ID, application version/build, recording start/export times,
  increasing event sequence numbers and elapsed milliseconds.
- Clicks, committed control changes, canvas pointer releases and throttled wheel
  interactions. Controls use static workspace areas and numeric DOM positions,
  not their text, accessible labels, element IDs or entered/selected values.
  Keyboard activation that produces a click is included; keystrokes are not.
- Discovery duration, total file bytes/count, recognized NIfTI/DICOM candidate
  counts, validation warning/error counts. DICOM discovery is headers only.
- Image read/decompression, sidecar and decoding stages, cancellation, validation
  rejection, source/decoded sizes, available memory budget, dimensions,
  acquisition count and an allowlisted scalar type. Datasets receive temporary
  numeric aliases, never their original IDs or checksums.
- Browser fitting lifecycle, approximate 10% progress steps, selected/valid voxel
  counts and duration. Local Python API stages record HTTP status, timing, job
  state and coarse progress without request/response bodies or URLs. Successful
  routine polls/voxel requests are omitted unless headers take over two seconds;
  failures are retained. These are browser-side observations, not server logs.
- Local-library transactions, workspace validation and bundle export lifecycle.
- Unhandled errors/rejections use fixed categories only, never message/stack text.
- Resource summaries every 15 seconds: request count/transferred bytes, suppressed
  interaction count and long main-thread tasks. Heap usage/limit and long-task
  observations appear only where the browser supports them. Request URLs and
  performance-entry names are never recorded. API request duration measures time
  to response headers; enclosing workflow timings include processing afterward.

No image intensities, signals, fitted parameters, ROI contents, notes, patient,
study or acquisition identifiers/dates, filenames, paths, query strings, tokens,
raw user-agent strings, form values, arbitrary exception text or stacks are
included. Technical sizes, geometry and counts can still be sensitive in context;
review logs before sharing. This is operational diagnostics, not session replay
or a clinical audit trail; exact private inputs cannot be reconstructed.

## Limits and overhead

Logs are saved locally in a separate `osipy-diagnostics` IndexedDB database with
no network collector. Up to 10 recently updated sessions are retained, each with
the latest 5,000 events. Older sessions/events are automatically pruned; exports
report dropped events. Each reload starts a new session; use **Session to download**
to retrieve previous sessions. Other tabs record separate sessions.

Writes are incremental and transactional, with synchronous event bursts grouped
while a write is pending rather than copying the entire log. The memory buffer
and pending write buffer are bounded. Successfully committed events survive tab
closure/reload; a crash can still lose an unfinished write. Browser eviction,
clearing site data and private browsing can remove saved history. Storage failures
are shown in the diagnostics dialog; recording then continues in memory and the
current session can still be downloaded. Diagnostics never depend on imaging-library
storage and never store patient data there.

**Clear saved history** requires confirmation and deletes diagnostic history only,
not datasets. Recording resumes with a clear marker. Other open tabs may continue
recording. Pausing creates intentional gaps.
Repeated interactions on one control are limited to one per 500 ms; counters and
coarse fitting progress avoid recording every voxel or pointer movement. The
logger never copies dataset arrays. Saved events are allowlisted again on export.

The first JSONL line is the session header; subsequent lines are structured
events. Match `operation` numbers for start/stage/end events and `dataset`
numbers for scan lifetimes. `controlPath` is an array of zero-based child indices
from the document hierarchy (up to 16 levels); interpret it against the matching
build. This intentionally avoids reading DOM text or patient-derived attributes.

## Maintaining coverage

`frontend/src/lib/diagnostics.ts` is the only event writer. Both event names and
field names/enum strings are allowlisted at runtime; unknown fields/strings and
non-finite numbers are discarded. Use `diagnosticOperation` around new long-lived
workflows, ending it on success, rejection, cancellation and failure. Keep
`data-diagnostic` values static and allowlisted to name new UI areas. Do not log
whole errors, datasets, HTTP objects, sidecars, DOM text or arbitrary metadata.
Do not wrap `console` or `fetch` to capture payloads. Export diagnostics separately
from imaging/workspace bundles, which can contain private data.
