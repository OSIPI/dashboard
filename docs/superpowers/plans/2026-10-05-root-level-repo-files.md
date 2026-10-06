# Move Repo-Level Files from dashboard/ to Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move files that belong to the whole monorepo (Dockerfile, docker/, docs/, project metadata, governance docs, Makefile) out of `dashboard/` and up to the repository root, updating every CI workflow, script, test, and doc that references their old paths, without changing release behavior or breaking any existing test.

**Architecture:** This is a mechanical relocation, not new functionality: for each file/group, `git mv` it to its new root-level path, then fix every reference (CI YAML, `release.ts`/`release.test.ts`, `docker-compose.yml`, both READMEs, both `AGENTS.md` files — merged into one). The `dashboard/` directory keeps only SvelteKit-specific files (`package.json`, `bun.lock`, `src/`, `scripts/`, `svelte.config.js`, etc.) plus its own `AGENTS.md` for frontend-specific rules. `rest-api/` is untouched. The riskiest surface is `dashboard/scripts/release.ts` and `release.test.ts`, which hardcode `dashboard/<file>` path strings and a `process.chdir(resolve(root, 'dashboard'))` — these need surgical edits, not just `git mv`.

**Tech Stack:** Bun, TypeScript, GitHub Actions YAML, Make, Docker.

**Spec:** No separate spec doc; derived directly from repo inspection (this plan's investigation phase) and explicit user scoping: move Dockerfile, docker/, docs/, .zenodo.json, CITATION.cff, CHANGELOG.md, CODE_OF_CONDUCT.md, codemeta.json, GOVERNANCE.md, Makefile, ROADMAP.md, SECURITY.md to root; merge (don't just move) AGENTS.md; leave `scripts/` in `dashboard/`.

## Global Constraints

- Never touch release *behavior* — only paths. `make release-dry-run` and `bun test scripts/release.test.ts` must pass identically before and after (same version-bump logic, same commit/tag/push semantics).
- Keep `dashboard/` as the one Bun/SvelteKit project root for `bun install`, `bun run dev`, `bun test` — don't move `package.json`, `bun.lock`, `src/`, `static/`, `scripts/`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `.vscode/`, `data/`, `locale/`, `README.excalidraw*`.
- `rest-api/` is a separate Python project; do not move or edit anything under it except where a moved root file (Dockerfile, docker-compose.yml) already references it by relative path — those relative paths (`rest-api/...`) are unaffected by this move since `rest-api/` and the new root-level files will be siblings.
- Every `git mv` preserves history — use `git mv`, never delete+recreate.
- AGENTS.md merge: root `AGENTS.md` keeps repo-wide layout/release rules; `dashboard/AGENTS.md` keeps frontend-specific rules (stack, port contract, app shell, viewer, etc.). Update the root one's "Layout" section and release file-path references; leave the dashboard one's content as-is except its own "Releases" section's relative link.
- No commits until the final task's full verification passes — work happens on the already-checked-out `cleanup` branch.

## Review Focus

- **CI workflow YAML parsed by `release.test.ts`** (`pages.yml`, `checks.yml`, `container.yml`): the test parses these with `Bun.YAML.parse` and asserts exact field values (`working-directory`, `run` strings, `with.context`). A single stray path left as `dashboard/Dockerfile` instead of `Dockerfile`, or vice versa, fails that test — update workflow files and their asserting test lines together in the same task.
- **`release.ts`'s `process.chdir(resolve(root, 'dashboard'))` and `files` path list**: this script currently reads/writes `package.json`, `CITATION.cff`, `codemeta.json`, `CHANGELOG.md` relative to `dashboard/` after chdir'ing there. Moving `CITATION.cff`, `codemeta.json`, `CHANGELOG.md` to root but leaving `package.json` in `dashboard/` means these four files are no longer co-located — the script must read three of them from root and one from `dashboard/`, which changes `gitFiles` path construction (currently a uniform `dashboard/${file}` map).
- **`metadata.yml`'s `test -f dashboard/CITATION.cff` etc. and JSON-metadata python block**: every moved metadata file's path assertion in this workflow must flip to its new root path, including the `package.json` read (which stays in `dashboard/` — don't move it).
- **Dockerfile COPY paths and docker-compose.yml build context**: `Dockerfile` currently lives at `dashboard/Dockerfile` and is invoked with build context `.` (repo root) via `-f dashboard/Dockerfile`. Moving the Dockerfile to repo root changes the `-f` flag value in three places (`checks.yml`, `container.yml`, and implicitly `docker-compose.yml`'s `dockerfile:` field) — miss one and CI builds the wrong (or a missing) file.
- **`docs/releases.md` prose and both READMEs' relative links**: these contain prose like "Update `dashboard/package.json`, `dashboard/CITATION.cff`, `dashboard/codemeta.json` and the UTC-dated categorized `dashboard/CHANGELOG.md`" and links like `[architecture diagram](dashboard/README.excalidraw.png)` (stays) vs `[docs/releases.md](docs/releases.md)` (already root-relative, unaffected) — these are easy to half-update since they mix moved and unmoved paths in the same sentence.

---

## File Structure

**Moves (via `git mv`, preserving history):**

| From | To |
|---|---|
| `dashboard/Dockerfile` | `Dockerfile` |
| `dashboard/docker/` | `docker/` |
| `dashboard/docs/` | merge into existing root `docs/` (see Task 2) |
| `dashboard/.zenodo.json` | `.zenodo.json` |
| `dashboard/CITATION.cff` | `CITATION.cff` |
| `dashboard/CHANGELOG.md` | `CHANGELOG.md` |
| `dashboard/CODE_OF_CONDUCT.md` | `CODE_OF_CONDUCT.md` |
| `dashboard/codemeta.json` | `codemeta.json` |
| `dashboard/GOVERNANCE.md` | `GOVERNANCE.md` |
| `dashboard/Makefile` | **not moved** — stays as `dashboard/Makefile`, the per-project dev Makefile. Root already has its own `Makefile` that delegates (`$(MAKE) -C dashboard dev`) — this is already correct and needs no file move, only an update to `release:`/`release-dry-run:` targets if the script's working directory changes (it doesn't — see Task 4). |
| `dashboard/ROADMAP.md` | `ROADMAP.md` |
| `dashboard/SECURITY.md` | `SECURITY.md` |
| `dashboard/CONTRIBUTING.md` | `CONTRIBUTING.md` (not explicitly listed by user but is in the same governance-doc family as CODE_OF_CONDUCT/SECURITY/GOVERNANCE and root has no CONTRIBUTING.md of its own — see Task 1 clarification step) |
| `dashboard/AGENTS.md` | **merged**, not moved — see Task 6 |

**Modified in place (references updated, files stay where they are):**
- `Makefile` (root) — no path changes needed (delegates via `-C dashboard`, doesn't reference moved files directly)
- `dashboard/Makefile` — no path changes needed (doesn't reference moved files)
- `dashboard/scripts/release.ts` — path construction for the 4 version-bearing files
- `dashboard/scripts/release.test.ts` — fixture paths, workflow assertions, Dockerfile/dockerignore assertions
- `.github/workflows/checks.yml`, `.github/workflows/container.yml`, `.github/workflows/metadata.yml`, `.github/workflows/pages.yml`
- `docker-compose.yml`
- `README.md` (root), `dashboard/README.md`
- `docs/releases.md`
- `AGENTS.md` (root) — merged content from `dashboard/AGENTS.md`'s repo-wide-relevant bits (none needed beyond what's already there — see Task 6) plus corrected paths
- `.dockerignore` (root) — already covers `**/...` patterns; verify no change needed
- `dashboard/.dockerignore` — check whether still needed after Dockerfile moves (Task 3)

---

### Task 1: Decide and record the CONTRIBUTING.md question, then move the plain governance/doc files

**Files:**
- Move: `dashboard/.zenodo.json` → `.zenodo.json`
- Move: `dashboard/CODE_OF_CONDUCT.md` → `CODE_OF_CONDUCT.md`
- Move: `dashboard/GOVERNANCE.md` → `GOVERNANCE.md`
- Move: `dashboard/ROADMAP.md` → `ROADMAP.md`
- Move: `dashboard/SECURITY.md` → `SECURITY.md`
- Move: `dashboard/CONTRIBUTING.md` → `CONTRIBUTING.md`
- Test: none yet (these files aren't referenced by path in any test at this point in the plan — `metadata.yml` still points at the old paths until Task 5)

These six files have no internal cross-references to other moved files (verified: `grep` for `dashboard/` inside each found nothing). Moving them is pure `git mv` with no follow-up edits needed in this task — their *referrers* (`metadata.yml`, READMEs) are fixed in later tasks. Do this first because it's the simplest, lowest-risk group and establishes the pattern.

- [ ] **Step 1: Confirm CONTRIBUTING.md belongs in this move**

Root has no `CONTRIBUTING.md` of its own (confirmed via `ls` in investigation). `dashboard/CONTRIBUTING.md`'s content is generic project-contribution guidance, not frontend-specific (confirmed by reading its head: "Report reproducible frontend bugs... Suggest dashboard workflows" — it does mention dashboard specifically in places). Since the user's explicit list didn't name CONTRIBUTING.md, but `metadata.yml` already asserts `test -f dashboard/CONTRIBUTING.md` as a *required repository file* alongside the other governance docs being moved, moving it keeps that whole family consistent. Proceed with the move.

- [ ] **Step 2: Move the six files**

```bash
cd /home/dsmits/projects/OSIPY/dashboard
git mv dashboard/.zenodo.json .zenodo.json
git mv dashboard/CODE_OF_CONDUCT.md CODE_OF_CONDUCT.md
git mv dashboard/GOVERNANCE.md GOVERNANCE.md
git mv dashboard/ROADMAP.md ROADMAP.md
git mv dashboard/SECURITY.md SECURITY.md
git mv dashboard/CONTRIBUTING.md CONTRIBUTING.md
```

- [ ] **Step 3: Verify no other file references their old paths**

```bash
grep -rn "dashboard/\.zenodo\|dashboard/CODE_OF_CONDUCT\|dashboard/GOVERNANCE\|dashboard/ROADMAP\|dashboard/SECURITY\|dashboard/CONTRIBUTING" --include="*.yml" --include="*.ts" --include="*.md" --include="Makefile" . 2>/dev/null
```

Expected: only hits inside `.github/workflows/metadata.yml` (fixed in Task 5) and possibly `README.md`/`dashboard/README.md` (fixed in Task 7). Confirm no hits in `.ts` files.

- [ ] **Step 4: Commit**

```bash
git add -A -- .zenodo.json CODE_OF_CONDUCT.md GOVERNANCE.md ROADMAP.md SECURITY.md CONTRIBUTING.md dashboard/.zenodo.json dashboard/CODE_OF_CONDUCT.md dashboard/GOVERNANCE.md dashboard/ROADMAP.md dashboard/SECURITY.md dashboard/CONTRIBUTING.md
git commit -m "chore: move governance and project docs to repository root

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Merge dashboard/docs/ into root docs/

**Files:**
- Inspect: `dashboard/docs/` (contents unknown at plan-writing time beyond knowing it exists per earlier `ls` — confirm structure in Step 1)
- Root already has: `docs/releases.md`, `docs/diagrams/osipy-local-architecture.{excalidraw,png,svg}`

Root's `docs/` and `dashboard/docs/` may have disjoint or overlapping content. Since release.ts/release.test.ts and docs/releases.md all reference `docs/releases.md` at the root already (confirmed — root AGENTS.md says "Follow docs/releases.md" and it already exists at root), this task only needs to relocate whatever lives under `dashboard/docs/` into the root `docs/` tree without clobbering the existing `releases.md` or `diagrams/`.

- [ ] **Step 1: List what's under dashboard/docs/**

```bash
find dashboard/docs -type f
```

- [ ] **Step 2: For each file found, git mv it into docs/ at root, preserving any subdirectory structure, and resolve name collisions**

If a file path under `dashboard/docs/` would collide with an existing root `docs/` path (e.g. both have a file at the same relative path), stop and diff the two before deciding whether to keep root's, keep dashboard's, or merge content — do not silently overwrite. Based on the investigation, the only known root `docs/` content is `releases.md` and `diagrams/osipy-local-architecture.*`; if `dashboard/docs/` contains different filenames, this is a plain move:

```bash
# example pattern once Step 1's output is known — run git mv per discovered file/dir, e.g.:
git mv dashboard/docs/<subpath> docs/<subpath>
```

Remove the now-empty `dashboard/docs/` directory if `git mv` of its last file didn't already do so (git doesn't track empty directories, so this is automatic).

- [ ] **Step 3: Verify no reference to dashboard/docs/ remains**

```bash
grep -rn "dashboard/docs" --include="*.yml" --include="*.ts" --include="*.md" --include="Makefile" . 2>/dev/null
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add -A -- docs dashboard/docs
git commit -m "chore: merge dashboard docs into root docs directory

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Move Dockerfile and docker/, update all three CI references and docker-compose.yml

**Files:**
- Move: `dashboard/Dockerfile` → `Dockerfile`
- Move: `dashboard/docker/` → `docker/` (contains `api-entrypoint.sh`)
- Modify: `docker-compose.yml:4-5`
- Modify: `.github/workflows/checks.yml` (the `container` job's `docker build -f dashboard/Dockerfile .` step)
- Modify: `.github/workflows/container.yml` (the `publish` job's `file: ./dashboard/Dockerfile`)
- Modify: `dashboard/.dockerignore` — decide whether it's still needed (it currently excludes `node_modules`, `.svelte-kit`, etc. for a *build context of `.`* at repo root when invoked as `docker build -f dashboard/Dockerfile .`; since Docker uses `.dockerignore` from the build context root, not from the Dockerfile's directory, the root `.dockerignore` is what actually applies today — `dashboard/.dockerignore` may already be dead weight, confirm before deciding)

**Interfaces:**
- Produces: `Dockerfile` at root referencing `COPY rest-api/...` and `COPY docker/api-entrypoint.sh /app/api-entrypoint.sh` (relative paths change because the Dockerfile's own location changed relative to its build context, which stays repo root)

The Dockerfile's `COPY` instructions are resolved relative to the **build context** (repo root, passed as `.`), not relative to the Dockerfile's own location. Currently: `COPY dashboard/docker/api-entrypoint.sh /app/api-entrypoint.sh`. Wait — re-check: investigation showed the actual line is `COPY dashboard/docker/api-entrypoint.sh /app/api-entrypoint.sh`. After moving `docker/` to root, this becomes `COPY docker/api-entrypoint.sh /app/api-entrypoint.sh`. The `rest-api/...` COPY lines are unaffected since `rest-api/` doesn't move.

- [ ] **Step 1: Check whether dashboard/.dockerignore has any effect today**

```bash
cat dashboard/.dockerignore
cat .dockerignore
```

Since both `checks.yml` and `container.yml` build with context `.` (repo root) and `-f dashboard/Dockerfile` (soon `-f Dockerfile`), Docker reads `.dockerignore` from the context root (`.dockerignore` at repo root), never `dashboard/.dockerignore`. Confirm this understanding holds, then leave `dashboard/.dockerignore` in place untouched (it's unused by Docker but may still serve editors/IDEs that respect it for the dashboard folder) — do not delete it since the user didn't ask for a dockerignore cleanup and it's harmless.

- [ ] **Step 2: Move the files**

```bash
git mv dashboard/Dockerfile Dockerfile
git mv dashboard/docker docker
```

- [ ] **Step 3: Update the Dockerfile's COPY path for the entrypoint script**

Read the moved `Dockerfile` and change:
```dockerfile
COPY dashboard/docker/api-entrypoint.sh /app/api-entrypoint.sh
```
to:
```dockerfile
COPY docker/api-entrypoint.sh /app/api-entrypoint.sh
```

- [ ] **Step 4: Update docker-compose.yml**

Change:
```yaml
    build:
      context: .
      dockerfile: dashboard/Dockerfile
```
to:
```yaml
    build:
      context: .
      dockerfile: Dockerfile
```

- [ ] **Step 5: Update checks.yml's container job**

In `.github/workflows/checks.yml`, change:
```yaml
      - name: Build local dashboard image without publishing
        working-directory: .
        run: docker build -f dashboard/Dockerfile .
```
to:
```yaml
      - name: Build local dashboard image without publishing
        working-directory: .
        run: docker build -f Dockerfile .
```

- [ ] **Step 6: Update container.yml's publish job**

In `.github/workflows/container.yml`, change:
```yaml
      - name: Publish exact release image
        uses: docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8 # v6
        with:
          context: .
          file: ./dashboard/Dockerfile
```
to:
```yaml
      - name: Publish exact release image
        uses: docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8 # v6
        with:
          context: .
          file: ./Dockerfile
```

- [ ] **Step 7: Verify the image still builds locally**

```bash
docker build -f Dockerfile -t osipy-dashboard-api-test .
```

Expected: build succeeds (same as before the move — this only validates path correctness, not new functionality). If Docker isn't available in this environment, skip this step and rely on Task 8's CI-config test instead; note the skip when reporting task completion.

- [ ] **Step 8: Commit**

```bash
git add -A -- Dockerfile docker dashboard/Dockerfile dashboard/docker docker-compose.yml .github/workflows/checks.yml .github/workflows/container.yml
git commit -m "chore: move Dockerfile and docker/ to repository root

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Move CHANGELOG.md, CITATION.cff, codemeta.json; update release.ts and release.test.ts

**Files:**
- Move: `dashboard/CHANGELOG.md` → `CHANGELOG.md`
- Move: `dashboard/CITATION.cff` → `CITATION.cff`
- Move: `dashboard/codemeta.json` → `codemeta.json`
- Modify: `dashboard/scripts/release.ts` (the `files` array, `gitFiles` construction, and the `process.chdir` line)
- Modify: `dashboard/scripts/release.test.ts` (fixture-building tests that write these files under `dashboard/...`, and the dry-run path-reading test)

**Interfaces:**
- Consumes: none from earlier tasks
- Produces: `release.ts` exports (`analyze`, `nextVersion`, `prependNotes`, `versionFiles`, `validateRetryContent`, `validateRemoteTags`, `fileDigest`, `assertArchive`, `publishRelease`, `release`, `State` type) — **signatures must not change**, since `release.test.ts` imports them by name and the plan's constraint is "never touch release behavior."

This is the highest-risk task. `package.json` stays in `dashboard/` (it's the Bun project's own manifest and nothing in scope asks to move it), but `CITATION.cff`, `codemeta.json`, `CHANGELOG.md` move to root. The script currently does:

```ts
const files = ['package.json', 'CITATION.cff', 'codemeta.json', 'CHANGELOG.md'];
...
process.chdir(resolve(root, 'dashboard'));
const gitFiles = Object.fromEntries(files.map((file) => [file, `dashboard/${file}`]));
```

This reads/writes all four files relative to the dashboard-chdir'd cwd, and separately tracks their git-relative paths (`dashboard/${file}`) for `git diff`/`git show`/`git add` calls. After the move, `package.json` is still read relative to `dashboard/`, but the other three are read relative to repo root. The cleanest fix that preserves every function's behavior (`versionFiles`, `prependNotes` etc. only operate on in-memory string maps keyed by filename — they don't know about paths) is to **not chdir**, and instead build an explicit per-file disk path and git path map up front.

- [ ] **Step 1: Move the three files**

```bash
git mv dashboard/CHANGELOG.md CHANGELOG.md
git mv dashboard/CITATION.cff CITATION.cff
git mv dashboard/codemeta.json codemeta.json
```

- [ ] **Step 2: Read the current release.ts in full and locate every line touching `files`, `gitFiles`, or `process.chdir`**

```bash
grep -n "files\|gitFiles\|chdir\|readFileSync\|writeFileSync\|git('show'\|git('diff'\|git('ls-files'\|git('add'" dashboard/scripts/release.ts
```

This confirms every call site that assumes "cwd is dashboard/, so bare filenames work" — expect to find: the `release()` function's `process.chdir`, `gitFiles` construction, the `before`/`after` `readFileSync(file, ...)` calls (bare filename), `writeFileSync(file, ...)` (bare filename), `existsSync(checksumPath)` (unrelated, archive-based, no change needed), and the `dry` branch's `readFileSync(file, 'utf8')` (bare filename).

- [ ] **Step 3: Replace the chdir-based path model with an explicit disk-path map**

Edit `dashboard/scripts/release.ts`. Replace:

```ts
const files = ['package.json', 'CITATION.cff', 'codemeta.json', 'CHANGELOG.md'];
```

with:

```ts
const files = ['package.json', 'CITATION.cff', 'codemeta.json', 'CHANGELOG.md'];
const gitPaths: Record<string, string> = {
	'package.json': 'dashboard/package.json',
	'CITATION.cff': 'CITATION.cff',
	'codemeta.json': 'codemeta.json',
	'CHANGELOG.md': 'CHANGELOG.md'
};
```

Keep `files` as the ordered list of logical names (used throughout for iteration and as map keys — no call site needs to change its iteration order). `gitPaths[file]` now gives the path relative to repo root for every git subcommand and disk read, replacing both `` `dashboard/${file}` `` and the implicit "bare filename relative to chdir'd cwd."

In `release()`, replace:

```ts
const root = git('rev-parse', '--show-toplevel');
process.chdir(resolve(root, 'dashboard'));
const gitFiles = Object.fromEntries(files.map((file) => [file, `dashboard/${file}`]));
```

with:

```ts
const root = git('rev-parse', '--show-toplevel');
process.chdir(root);
const gitFiles = Object.fromEntries(files.map((file) => [file, gitPaths[file]]));
```

Every subsequent `readFileSync(file, 'utf8')` / `writeFileSync(file, ...)` call in `release()` must become `readFileSync(gitFiles[file], 'utf8')` / `writeFileSync(gitFiles[file], ...)` since cwd is now repo root, not `dashboard/`. Locate each one (Step 2's grep gives line numbers) and apply this substitution. Do **not** change any `git(...)` call argument that already uses `gitFiles[file]` — those are already correct since `gitFiles` now maps to root-relative paths.

Also check the `dry` branch (inside `if (dry) { ... }`), which currently does:

```ts
const source = Object.fromEntries(files.map((file) => [file, readFileSync(file, 'utf8')]));
```

This runs *before* any chdir in the dry path (the dry branch returns early, before `process.chdir` is reached in the current code — verify this by re-reading the function's control flow: `process.chdir` happens inside `release()` unconditionally near the top, before the `if (dry)` check, per the original source at line ~302-303 vs ~335). Re-read the actual current source around the `if (dry)` block before editing — if `process.chdir(root)` (not `dashboard`) now runs before it, then this line must also become `readFileSync(gitPaths[file], 'utf8')`.

Also check the RELEASE_PYTHON default and any other `../rest-api` relative reference inside `release()`:

```ts
const python = process.env.RELEASE_PYTHON ?? '../rest-api/.venv/bin/python';
```

Since cwd is now repo root instead of `dashboard/`, this default must become `'rest-api/.venv/bin/python'` (drop the `../`). Similarly check the `bun` build invocations — `run('bun', ['run', 'check'])` etc. currently run with cwd=`dashboard/` implicitly; since `bun`'s `check`/`test`/`build` scripts only exist in `dashboard/package.json`, these calls need an explicit working directory now that cwd is repo root. The least invasive fix: keep a second chdir *after* reading/before running project-local commands, or pass `cwd` via a wrapping shell. Re-examine `run()`'s signature:

```ts
function run(command: string, args: string[], env = process.env) {
	console.log(`> ${command} ${args.join(' ')}`);
	execFileSync(command, args, { stdio: 'inherit', env });
}
```

It has no `cwd` option. Add one, defaulting to `process.cwd()`, and pass `dashboard` explicitly for the bun-script invocations:

```ts
function run(command: string, args: string[], env = process.env, cwd = process.cwd()) {
	console.log(`> ${command} ${args.join(' ')}`);
	execFileSync(command, args, { stdio: 'inherit', env, cwd });
}
```

Then update every `run('bun', ...)` call site to pass `resolve(root, 'dashboard')` as the fourth argument, and the `run(python, ['-m', 'pytest', '../rest-api/tests'])` call to drop the `../` prefix (becomes `['-m', 'pytest', 'rest-api/tests']`) since it now runs from repo root — unless you keep it running from `dashboard/` with `cwd`, in which case leave `../rest-api/tests` as-is. **Pick one consistent model**: since `root` is now the single working reference point, prefer running every subprocess with an explicit `cwd`, computed from `root`, rather than relying on ambient `process.cwd()`. Apply this uniformly:
- `run('bun', ['run', 'check'])` → `run('bun', ['run', 'check'], process.env, resolve(root, 'dashboard'))`
- `run('bun', ['test'])` → `run('bun', ['test'], process.env, resolve(root, 'dashboard'))`
- `run(python, ['-m', 'pytest', '../rest-api/tests'])` → `run(python, ['-m', 'pytest', 'tests'], process.env, resolve(root, 'rest-api'))` (also drop the now-redundant `../rest-api/` prefix since cwd is `rest-api/` itself)
- `run('bun', ['run', 'build'], { ...process.env, APP_VERSION: tag, APP_SHA: base })` → add `resolve(root, 'dashboard')` as the fourth argument
- The `tar` call (`run('tar', ['-czf', ...])`) packages `build/` — since `build/` is produced inside `dashboard/` by the bun build above, this call's `-C build` must become `-C ${resolve(root, 'dashboard', 'build')}`, and `assertSampleFreeDirectory('static')` / `assertSampleFreeDirectory('build')` calls must likewise resolve against `dashboard/`, becoming `assertSampleFreeDirectory(resolve(root, 'dashboard', 'static'))` / `assertSampleFreeDirectory(resolve(root, 'dashboard', 'build'))`.
- The `writeFileSync('build/release.json', ...)` call becomes `writeFileSync(resolve(root, 'dashboard', 'build', 'release.json'), ...)`.
- The `directory`/`path` archive-staging lines (`git('rev-parse', '--git-path', ...)`, `mkdirSync(directory, ...)`) are already root-relative via `git` itself, so these don't need a `dashboard/` prefix — only the `-C build` source argument to `tar` does.

Also update the `RELEASE_PYTHON` default: `'../rest-api/.venv/bin/python'` → `'rest-api/.venv/bin/python'` (no `../` needed since cwd is now root), and update its single consumer to resolve against `root` consistently with the pattern above if not already covered.

Also update the `statePath` lookup (`git('rev-parse', '--git-path', 'dashboard-release.json')`) — this is a `.git`-internal path unaffected by cwd, no change needed. Same for `dashboard-release.lock` in the `import.meta.main` block at the bottom.

- [ ] **Step 4: Re-read the fully edited release.ts once to self-check consistency**

```bash
cat dashboard/scripts/release.ts
```

Confirm: no remaining bare `readFileSync(file, ...)` / `writeFileSync(file, ...)` calls where `file` is a logical name rather than `gitFiles[file]`; no remaining `'../rest-api` or bare `'build'` / `'static'` path literals that assume dashboard-relative cwd; every `run(...)` call for a dashboard-local or rest-api-local command passes an explicit `cwd`.

- [ ] **Step 5: Update release.test.ts's path-sensitive fixtures and assertions**

In `dashboard/scripts/release.test.ts`:

1. The "`dry-run uses only read-only Git calls...`" test currently does:
   ```ts
   files: ['package.json', 'CITATION.cff', 'codemeta.json', 'CHANGELOG.md'].map((file) =>
   	fileDigest(join(root, file))
   ),
   ```
   where `root = new URL('../', import.meta.url).pathname` (i.e., `dashboard/`). Since three of these four files no longer live under `dashboard/`, change this to resolve each file against its actual new location:
   ```ts
   files: [
   	join(root, 'package.json'),
   	join(root, '..', 'CITATION.cff'),
   	join(root, '..', 'codemeta.json'),
   	join(root, '..', 'CHANGELOG.md')
   ].map(fileDigest),
   ```

2. The "`dry-run reads authoritative versions from dashboard in a monorepo`" test builds a synthetic fixture repo with all four files under `directory/dashboard/...`. This test's whole premise — "release.ts, when run with cwd at a repo root containing a `dashboard/` subdirectory, finds dashboard's metadata" — no longer matches the real script after Step 3's edit (which stops special-casing `dashboard/` for 3 of 4 files). Rewrite this fixture to put `CITATION.cff`, `codemeta.json`, `CHANGELOG.md` at `directory/` (root) and only `package.json` at `directory/dashboard/package.json`:
   ```ts
   mkdirSync(join(directory, 'dashboard'));
   writeFileSync(join(directory, 'dashboard/package.json'), '{"version":"0.0.1"}\n');
   writeFileSync(join(directory, 'codemeta.json'), '{"softwareVersion":"0.0.1"}\n');
   writeFileSync(join(directory, 'CITATION.cff'), "cff-version: 1.2.0\nversion: '0.0.1'\n");
   writeFileSync(join(directory, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n');
   ```
   Keep the rest of the test (git init, tag, feature commit, spawning `release.ts --dry-run`) unchanged — just verify the assertions (`v0.0.1 → v0.1.0`, `## 0.1.0 - `) still hold once the fixture matches the new layout. Rename the test description if "in a monorepo" framing becomes misleading; a fitting replacement: `'dry-run reads package.json from dashboard/ and metadata files from the repository root'`.

3. The "`container builds only the local REST API...`" test currently asserts:
   ```ts
   const dockerfile = readFileSync(new URL('dashboard/Dockerfile', repositoryRoot), 'utf8');
   ```
   Change to:
   ```ts
   const dockerfile = readFileSync(new URL('Dockerfile', repositoryRoot), 'utf8');
   ```
   And its COPY-path assertions:
   ```ts
   expect(dockerfile).toContain('COPY rest-api/src /app/rest-api/src');
   expect(dockerfile).toContain('CMD ["sh", "/app/api-entrypoint.sh"]');
   ```
   remain valid as-is (neither references `dashboard/docker` or the old Dockerfile path directly) — but re-check the `not.toMatch` negative assertion:
   ```ts
   expect(dockerfile).not.toMatch(/COPY\s+(?:\.|(?:static|build|data|docker)(?:\s|\/))/);
   ```
   This still correctly forbids `COPY docker/...`-style lines from matching only if the *actual* entrypoint COPY (`COPY docker/api-entrypoint.sh ...`, per Task 3 Step 3) doesn't trip this regex — but it will, since `docker(?:\s|\/)` matches `docker/api-entrypoint.sh`. This negative assertion needs to become more specific: it's meant to forbid copying the frontend's `static`/`build`/`data` directories or the *dashboard's* `docker/` folder structure wholesale, not forbid the one legitimate `docker/api-entrypoint.sh` file copy. Narrow it to:
   ```ts
   expect(dockerfile).not.toMatch(/COPY\s+(?:\.|(?:static|build|data)(?:\s|\/))/);
   expect(dockerfile).not.toMatch(/COPY\s+docker(?:\s|\/)(?!api-entrypoint\.sh)/);
   ```
   And the ciImage assertion:
   ```ts
   expect(ciImage?.run).toBe('docker build -f dashboard/Dockerfile .');
   ```
   becomes:
   ```ts
   expect(ciImage?.run).toBe('docker build -f Dockerfile .');
   ```

4. The "`repository root owns release entry points...`" test's Makefile/AGENTS.md assertions reference only `bun dashboard/scripts/release.ts` (unchanged — `release.ts` stays in `dashboard/scripts/`) and quoted AGENTS.md prose fragments — re-verify these quoted fragments still appear verbatim in the merged root AGENTS.md after Task 6; do not edit this test now, but flag it for re-verification in Task 6's steps.

- [ ] **Step 6: Run the release test suite**

```bash
cd dashboard && bun test scripts/release.test.ts
```

Expected: all tests pass. If any fail, read the failure, cross-check against Step 3/5's edits, and fix — do not proceed to commit with failing tests.

- [ ] **Step 7: Run make release-dry-run from repo root**

```bash
cd /home/dsmits/projects/OSIPY/dashboard && make release-dry-run
```

Expected: prints a version preview (or "No release-worthy commits") with no errors, no file writes, no git writes (per the script's own dry-run guarantees). Confirm via `git status --short` immediately after that nothing changed.

- [ ] **Step 8: Commit**

```bash
git add -A -- CHANGELOG.md CITATION.cff codemeta.json dashboard/CHANGELOG.md dashboard/CITATION.cff dashboard/codemeta.json dashboard/scripts/release.ts dashboard/scripts/release.test.ts
git commit -m "chore: move release metadata files to root; adapt release tooling paths

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Update metadata.yml for all moved metadata/governance files

**Files:**
- Modify: `.github/workflows/metadata.yml`

**Interfaces:**
- Consumes: the final file locations from Tasks 1 and 4 (this task must run after both, since it asserts paths for files moved in each)

- [ ] **Step 1: Update the "Check required repository files" step**

Change:
```yaml
      - name: Check required repository files
        run: |
          test -f LICENSE
          test -f README.md
          test -f AGENTS.md
          test -f Makefile
          test -f dashboard/CITATION.cff
          test -f dashboard/.zenodo.json
          test -f dashboard/codemeta.json
          test -f dashboard/CONTRIBUTING.md
          test -f dashboard/SECURITY.md
          test -f dashboard/GOVERNANCE.md
          test -f dashboard/CODE_OF_CONDUCT.md
          test -f dashboard/CHANGELOG.md
```
to:
```yaml
      - name: Check required repository files
        run: |
          test -f LICENSE
          test -f README.md
          test -f AGENTS.md
          test -f Makefile
          test -f CITATION.cff
          test -f .zenodo.json
          test -f codemeta.json
          test -f CONTRIBUTING.md
          test -f SECURITY.md
          test -f GOVERNANCE.md
          test -f CODE_OF_CONDUCT.md
          test -f CHANGELOG.md
```

- [ ] **Step 2: Update the "Validate JSON metadata" step**

Change:
```yaml
      - name: Validate JSON metadata
        run: |
          python -m json.tool dashboard/.zenodo.json > /dev/null
          python -m json.tool dashboard/codemeta.json > /dev/null
```
to:
```yaml
      - name: Validate JSON metadata
        run: |
          python -m json.tool .zenodo.json > /dev/null
          python -m json.tool codemeta.json > /dev/null
```

- [ ] **Step 3: Leave the "Check package metadata" step's `dashboard/package.json` reference untouched**

`package.json` is not moving (per Global Constraints). Confirm the step still reads:
```yaml
          package = json.loads(pathlib.Path("dashboard/package.json").read_text())
```
unchanged.

- [ ] **Step 4: Validate the YAML parses and matches intent**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/metadata.yml'))" 2>/dev/null || python3 -c "import json,sys; print('no yaml module, skipping parse check')"
```

If `yaml` isn't available, visually re-read the file instead to confirm indentation is intact.

- [ ] **Step 5: Commit**

```bash
git add -A -- .github/workflows/metadata.yml
git commit -m "ci: point metadata checks at root-level files

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Merge dashboard/AGENTS.md guidance into root AGENTS.md

**Files:**
- Modify: `AGENTS.md` (root)
- Modify: `dashboard/AGENTS.md`

**Interfaces:**
- Consumes: final paths from Tasks 1-5 (this task's edits reference `docs/releases.md`, `CITATION.cff`, etc. by their new root-relative paths)

The root `AGENTS.md` is already structured as the repo-wide rules file with a "Layout" section pointing to `dashboard/AGENTS.md` for frontend-specific guidance — this structure is correct and should be *kept*, not collapsed into one file. "Merge" here means: fix the root file's Layout section to reflect the new file locations, and verify `dashboard/AGENTS.md`'s own "Releases" section (which links to `../docs/releases.md` and references `../AGENTS.md`) still resolves correctly given `docs/` didn't move relative to `dashboard/`'s parent (it was already at root) — that relative link was already correct and needs no change. The one necessary edit is making root `AGENTS.md`'s prose match the new file locations.

- [ ] **Step 1: Re-read the current root AGENTS.md's exact text**

```bash
cat AGENTS.md
```

(Already read during investigation — reconfirm nothing changed since then.)

- [ ] **Step 2: Update the Layout section**

The current Layout section says:
```markdown
## Layout

- `dashboard/` contains the SvelteKit dashboard; `rest-api/` is its optional local Python analysis backend.
- Repository-level automation, release entry points, and CI live at the root.
- Keep project-specific implementation guidance in `dashboard/AGENTS.md`.
```

This is already accurate post-move (it doesn't name specific moved files) — no edit strictly required. But since governance/metadata/Docker files are now *also* at the root, make this explicit so a future reader isn't confused about where `CITATION.cff` etc. live:

```markdown
## Layout

- `dashboard/` contains the SvelteKit dashboard; `rest-api/` is its optional local Python analysis backend.
- Repository-level automation, release entry points, CI, Docker packaging (`Dockerfile`, `docker/`), and project/governance metadata (`CITATION.cff`, `codemeta.json`, `.zenodo.json`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `GOVERNANCE.md`, `CODE_OF_CONDUCT.md`, `ROADMAP.md`) live at the root.
- Keep project-specific implementation guidance in `dashboard/AGENTS.md`.
```

- [ ] **Step 3: Verify the Releases section's prose still matches release.ts's actual behavior after Task 4**

The current Releases section says:
```markdown
3. Update every authoritative dashboard version in `dashboard/package.json`, `dashboard/CITATION.cff`, and `dashboard/codemeta.json`, then prepend UTC-dated categorized notes to `dashboard/CHANGELOG.md`.
```

This is now wrong — only `package.json` stays under `dashboard/`. Change to:
```markdown
3. Update every authoritative dashboard version in `dashboard/package.json`, `CITATION.cff`, and `codemeta.json`, then prepend UTC-dated categorized notes to `CHANGELOG.md`.
```

Also check step 4's prose: `"Run dashboard type checks, Bun tests, Python REST API tests, prepared-data verification, and the production build locally."` — no file paths named, no change needed.

- [ ] **Step 4: Check the final paragraph's test-file reference**

```markdown
Before changing release behavior, add or update tests in `dashboard/scripts/release.test.ts`. Verify with `cd dashboard && bun test scripts/release.test.ts`, `make release-dry-run`, and `git diff --check`.
```

`release.test.ts` stays at `dashboard/scripts/release.test.ts` (unchanged per Task 4) — no edit needed here.

- [ ] **Step 5: Re-verify release.test.ts's quoted-fragment assertions against the edited AGENTS.md**

The test (`repository root owns release entry points and documents all release effects`) asserts the root AGENTS.md contains these exact substrings:
```
'clean, current `main`'
'Conventional Commits'
'`chore(release): vX.Y.Z`'
'annotated `vX.Y.Z` tag'
'Never run `make release` without explicit authorization'
```
None of Step 2/3's edits touch these phrases — confirm by re-reading the edited file that all five substrings remain present verbatim.

- [ ] **Step 6: Check dashboard/AGENTS.md's own Releases section needs no path fix**

```markdown
## Releases

- Follow the repository-level [release documentation](../docs/releases.md) and [agent rules](../AGENTS.md). Run `make release-dry-run` or an explicitly authorized `make release` from the repository root.
```

`../docs/releases.md` from `dashboard/AGENTS.md` resolves to `docs/releases.md` at root — correct both before and after this plan (docs/ was already at root; Task 2 only added dashboard's extra doc files into it, it didn't move `releases.md` itself). `../AGENTS.md` likewise correctly resolves to root `AGENTS.md`. No edit needed.

- [ ] **Step 7: Run the release test suite again to confirm the AGENTS.md assertions pass**

```bash
cd dashboard && bun test scripts/release.test.ts
```

Expected: full pass, specifically the `'repository root owns release entry points...'` test.

- [ ] **Step 8: Commit**

```bash
git add -A -- AGENTS.md
git commit -m "docs: clarify root AGENTS.md layout and release file paths after move

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Update both READMEs for moved file paths

**Files:**
- Modify: `README.md` (root)
- Modify: `dashboard/README.md`

- [ ] **Step 1: Re-read both READMEs in full**

```bash
cat README.md
cat dashboard/README.md
```

(Root README already read in full during investigation; re-confirm dashboard/README.md's full content since only its head was read.)

- [ ] **Step 2: Fix root README's architecture-diagram link if it moved**

Root README currently has:
```markdown
See the [architecture diagram](dashboard/README.excalidraw.png) and its [editable Excalidraw source](dashboard/README.excalidraw).
```

`README.excalidraw` and `README.excalidraw.png` are **not** in the move list (they're dashboard-specific app-shell diagrams per Global Constraints) — confirm this link is still correct as-is pointing into `dashboard/`. No edit needed unless Step 1 reveals otherwise.

- [ ] **Step 3: Check dashboard/README.md for any reference to files that moved**

Search for the moved filenames inside `dashboard/README.md`:
```bash
grep -n "CITATION\|codemeta\|CHANGELOG\|zenodo\|CONTRIBUTING\|SECURITY\|GOVERNANCE\|CODE_OF_CONDUCT\|ROADMAP\|Dockerfile\|docker/" dashboard/README.md
```

For every hit, read the surrounding line and decide: if it's a relative link like `[...](CITATION.cff)` or `[...](./CITATION.cff)` meant to resolve inside `dashboard/`, change it to `[...](../CITATION.cff)` (one level up to root). If it's prose mentioning "the Dockerfile" or "docker/" without a path link, check whether the prose's implied location ("this directory", "here") needs rewording now that the file lives one level up.

- [ ] **Step 4: Check root README.md for any reference to files that moved**

```bash
grep -n "CITATION\|codemeta\|CHANGELOG\|zenodo\|CONTRIBUTING\|SECURITY\|GOVERNANCE\|CODE_OF_CONDUCT\|ROADMAP\|Dockerfile\|docker/" README.md
```

Root README's links to these files (if any) should already be correct or need their `dashboard/` prefix dropped, e.g. a hypothetical `[Changelog](dashboard/CHANGELOG.md)` becomes `[Changelog](CHANGELOG.md)`. Apply per-hit based on actual content found.

- [ ] **Step 5: Render both files mentally (or with a markdown linter if available) to confirm no broken relative links remain**

```bash
command -v markdown-link-check >/dev/null && markdown-link-check README.md dashboard/README.md || echo "no link checker available; relying on manual grep verification from Steps 3-4"
```

- [ ] **Step 6: Commit**

```bash
git add -A -- README.md dashboard/README.md
git commit -m "docs: fix README links after moving root-level files

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Update docs/releases.md prose for the new file locations

**Files:**
- Modify: `docs/releases.md`

- [ ] **Step 1: Re-read the full current content**

(Already read in full during investigation — reconfirm unchanged.)

- [ ] **Step 2: Fix the metadata-file list in step 3's description**

Change:
```markdown
3. Update `dashboard/package.json`, `dashboard/CITATION.cff`, `dashboard/codemeta.json` and the UTC-dated categorized `dashboard/CHANGELOG.md` together. Preserve previous notes. Bun lockfile and Zenodo metadata have no version field to update.
```
to:
```markdown
3. Update `dashboard/package.json`, `CITATION.cff`, `codemeta.json` and the UTC-dated categorized `CHANGELOG.md` together. Preserve previous notes. Bun lockfile and Zenodo metadata have no version field to update.
```

- [ ] **Step 3: Fix step 5's description**

Change:
```markdown
5. Create `chore(release): vX.Y.Z` containing only the four dashboard metadata files, then an annotated tag binding archive checksum and source SHA.
```
to:
```markdown
5. Create `chore(release): vX.Y.Z` containing only the four release metadata files (`dashboard/package.json`, `CITATION.cff`, `codemeta.json`, `CHANGELOG.md`), then an annotated tag binding archive checksum and source SHA.
```

- [ ] **Step 4: Check the "Install locked Bun dependencies in `dashboard/`..." paragraph for the RELEASE_PYTHON default**

Current text:
```markdown
Install locked Bun dependencies in `dashboard/`, Git, GitHub CLI and the REST API Python environment separately. `RELEASE_PYTHON` defaults to `../rest-api/.venv/bin/python` from the dashboard working directory.
```

Since Task 4 changes the script's cwd model (no longer chdir'd into `dashboard/`, and `RELEASE_PYTHON` default drops its `../` prefix), update this sentence to match the new default:
```markdown
Install locked Bun dependencies in `dashboard/`, Git, GitHub CLI and the REST API Python environment separately. `RELEASE_PYTHON` defaults to `rest-api/.venv/bin/python` from the repository root.
```

- [ ] **Step 5: Scan the rest of the doc for any other `dashboard/`-prefixed reference to a moved file**

```bash
grep -n "dashboard/CITATION\|dashboard/codemeta\|dashboard/CHANGELOG\|dashboard/\.zenodo\|dashboard/Dockerfile\|dashboard/docker" docs/releases.md
```

Fix any remaining hits following the same pattern (drop the `dashboard/` prefix for files that moved; leave it for `dashboard/package.json` and anything that stayed).

- [ ] **Step 6: Commit**

```bash
git add -A -- docs/releases.md
git commit -m "docs: update release docs for root-level metadata file paths

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification pass

**Files:** none modified — this task only runs checks across everything touched by Tasks 1-8.

- [ ] **Step 1: Confirm working tree is clean and on the cleanup branch**

```bash
git status --short
git branch --show-current
```

Expected: clean tree, `cleanup` branch.

- [ ] **Step 2: Run the full Bun test suite from dashboard/**

```bash
cd dashboard && bun install --frozen-lockfile && bun run check && bun test
```

Expected: all pass, including `scripts/release.test.ts`.

- [ ] **Step 3: Run the REST API test suite**

```bash
cd rest-api && uv sync --locked --extra dev && uv run --locked pytest -q && uv run --locked ruff check .
```

Expected: all pass (this task touches nothing under `rest-api/`, so this is a regression check, not expected to reveal anything — but confirms the move didn't accidentally break the sibling-relative paths `rest-api/...` that Dockerfile/Makefile/release.ts reference).

- [ ] **Step 4: Run make release-dry-run from root**

```bash
cd /home/dsmits/projects/OSIPY/dashboard && make release-dry-run
```

Expected: clean preview output, no file/git writes (`git status --short` unchanged before/after).

- [ ] **Step 5: Build the Docker image from root**

```bash
docker build -f Dockerfile -t osipy-dashboard-api-verify .
```

Expected: succeeds. Skip with a note if Docker isn't available in this environment.

- [ ] **Step 6: Validate every moved-file reference is gone**

```bash
grep -rn "dashboard/Dockerfile\|dashboard/docker/\|dashboard/CITATION\|dashboard/codemeta\|dashboard/CHANGELOG\|dashboard/\.zenodo\|dashboard/CONTRIBUTING\|dashboard/SECURITY\|dashboard/GOVERNANCE\|dashboard/CODE_OF_CONDUCT\|dashboard/ROADMAP\|dashboard/docs/" --include="*.yml" --include="*.ts" --include="*.md" --include="Makefile" --include="*.json" . 2>/dev/null
```

Expected: no output (every reference should have been updated in Tasks 3-8). `dashboard/package.json` and `dashboard/scripts/...` references are expected to remain and are correct — this grep pattern deliberately excludes those by not matching them.

- [ ] **Step 7: Confirm new root files are all tracked**

```bash
git ls-files | grep -E "^(Dockerfile|docker/|CHANGELOG\.md|CITATION\.cff|CODE_OF_CONDUCT\.md|codemeta\.json|GOVERNANCE\.md|ROADMAP\.md|SECURITY\.md|CONTRIBUTING\.md|\.zenodo\.json)$"
```

Expected: every moved file listed.

- [ ] **Step 8: Report completion**

Summarize to the user: files moved, files merged (AGENTS.md), every CI workflow/script/doc updated, full test suite + dry-run + Docker build green. List the commits made (one per task) for easy review/squash before pushing.

---

## Self-Review Notes

**Spec coverage:** Every file the user listed (Dockerfile, docker/, docs/, .zenodo.json, CITATION.cff, CHANGELOG.md, CODE_OF_CONDUCT.md, codemeta.json, GOVERNANCE.md, ROADMAP.md, SECURITY.md) has a task. Makefile was explicitly scoped to **not** move per user's "leave scripts for now" plus investigation showing root's Makefile already correctly delegates. AGENTS.md is merged (Task 6), not moved. CONTRIBUTING.md was added to the move list in Task 1 since it travels with the same governance-doc family already asserted together in `metadata.yml` — flagged explicitly as a judgment call in Task 1 Step 1 rather than silently added.

**Placeholder scan:** Re-read every step; all contain literal commands, literal diffs, or literal grep patterns — no "add appropriate handling" language.

**Type consistency:** `gitPaths`/`gitFiles`/`files` naming is kept consistent through Task 4; `run()`'s new `cwd` parameter is threaded through every call site in the same task that introduces it.

**Review Focus coverage:** All five listed risks (CI YAML assertions, release.ts chdir model, metadata.yml paths, Dockerfile COPY paths, docs prose mixing moved/unmoved paths) each have a dedicated task (3, 4, 4, 3, 7/8 respectively) with explicit before/after snippets.
