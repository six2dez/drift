# Phase 3: CI Spike — Prove LLRT Basics on Windows - Pattern Map

**Mapped:** 2026-08-13
**Files analyzed:** 4 (2 new code/CI files, 1 new evidence doc, 1 modified planning file)
**Analogs found:** 4 / 4

> This is a **CI-only phase**. Zero files under `packages/*/src` are created or modified.
> The two files that carry real risk are `scripts/windows-llrt-probe.mjs` (a new file type in a
> new directory) and `.github/workflows/windows-llrt-probe.yml` (whose analog `ci.yml` changed
> under Phase 1 — `03-RESEARCH.md`'s skeleton predates that change and is stale in three places).
>
> **Read `.github/workflows/ci.yml` before writing the workflow.** `03-RESEARCH.md` §Standard
> Stack pins `@v4` and `branches: [main]`; both are superseded by CONTEXT D-01 and D-04. The
> excerpts below are from the file as it exists now.

---

## File Classification

| New/Modified File | Status | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `scripts/windows-llrt-probe.mjs` | NEW | standalone CLI script (diagnostic probe) | batch / one-shot: process-spawn → structured stdout → exit code | `packages/backend/assets/mcp-server.mjs` (module shape, zero-dep constraint, CLI-flag mode, exit-code contract) + `packages/backend/src/index.ts:1519-1529` (`spawnAndWait`) and `:852-875` (timeout/settle) for the spawn helper | role-match (shape) + partial (spawn helper) |
| `.github/workflows/windows-llrt-probe.yml` | NEW | CI workflow | batch pipeline | `.github/workflows/ci.yml` | exact |
| `.planning/phases/03-.../03-FINDINGS.md` (name = planner's choice, D-11) | NEW | evidence document | record / report | `.planning/phases/01-restore-the-verification-signal/01-06-SUMMARY.md` | role-match |
| `.planning/STATE.md` | MODIFY | planning state | record | itself, lines 88-94 (`### Blockers/Concerns`); line 91 is the exact blocker this phase resolves | exact (in-place) |

**Directory note:** `scripts/` does not exist in this repo. `git ls-files '*.mjs'` returns exactly
two files: `eslint.config.mjs` and `packages/backend/assets/mcp-server.mjs`. The probe is the
third `.mjs` in the repo and the first file in a new top-level directory — so nothing constrains
its placement except the two workflow/lint globs analyzed in `## Shared Patterns` below.

---

## Pattern Assignments

### `scripts/windows-llrt-probe.mjs` (standalone CLI script, batch)

**Analog:** `packages/backend/assets/mcp-server.mjs` — the repo's only other hand-written
standalone `.mjs`. Same category: run by plain `node` outside any build step, no bundler, no
npm dependencies, Node built-ins only, structured stdout, explicit `process.exit(code)`.

**Where the analogy stops:** `mcp-server.mjs` is a long-lived stdio JSON-RPC server; the probe is
a one-shot batch job. Copy its *file shape and constraints*, not its transport.

**1. Header + module style** — `mcp-server.mjs:1-10`:

```javascript
#!/usr/bin/env node
/**
 * Drift MCP Server — stdio transport
 * Standalone script spawned by Claude Code via --mcp-config.
 * Calls Caido's GraphQL API to provide security tools.
 *
 * Environment: CAIDO_URL, CAIDO_TOKEN
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
```

Conventions to copy:
- A block docblock naming *what the file is*, *who runs it*, and *its environment contract*. For
  the probe that contract is: which runtime vehicle (Node, not LLRT) and why — CONTEXT D-08 makes
  this labelling load-bearing, not decorative.
- `node:`-prefixed built-in imports (`node:fs`). `03-RESEARCH.md`'s skeleton mixes bare `"os"`,
  `"child_process"`, `"fs"`, `"path"`, `"url"` with `"node:crypto"`. That mix is not an accident
  to be tidied away — **P2-OS's entire assertion is that the bare specifier resolves**, so at
  least one bare import must stay bare and be commented as deliberate, or P2-OS asserts nothing.
- `#!/usr/bin/env node` shebang: present here because Caido `exec`s the file. The probe is invoked
  as `node scripts/windows-llrt-probe.mjs`, so the shebang is optional; include it for
  consistency, but do not rely on it (it is inert on Windows).

**2. Zero-dependency constraint** — the whole of `mcp-server.mjs` (829 lines) imports exactly one
module: `node:fs` at line 10. Everything else — the GraphQL client, the JSON-RPC framing, the
approval poller — is hand-written against globals. `03-RESEARCH.md` §Package Legitimacy Audit says
the probe installs nothing; this file is the precedent that says that is normal here, not austere.

**3. CLI-flag mode with top-level await and an exit-code contract** — `mcp-server.mjs:698-707`:

```javascript
if (process.argv.includes("--validate-auth")) {
  const result = await validateAuth();
  await new Promise((resolve, reject) => {
    process.stdout.write(JSON.stringify(result) + "\n", (error) => {
      if (error) reject(error);
      else resolve(undefined);
    });
  });
  process.exit(result.ok ? 0 : 1);
}
```

This is the closest existing thing to the probe's `main()`: a one-shot mode that runs, writes a
machine-readable line to stdout, and maps a boolean verdict onto an exit code. Two things to lift:
- **Top-level `await` is already used in this repo** (line 699). ESLint resolves `sourceType:
  module`, `ecmaVersion: 2026` for `.mjs` (verified — see `## Shared Patterns`), so the probe may
  use top-level await instead of the `main().catch(...)` wrapper in `03-RESEARCH.md`. Either is
  fine; do not invent a third form.
- **`process.stdout.write` is awaited via its callback before `process.exit`.** This matters for
  the probe: `process.exit()` truncates pending stdout writes. Under `2>&1 | tee probe-results.txt`
  on a Windows runner, a truncated final line silently deletes the verdict D-13 requires. Prefer
  `process.exitCode = 1` and letting the script fall off the end, or replicate this callback-await
  before exiting.

**4. Timeout via a helper, not ad-hoc `setTimeout`** — `mcp-server.mjs:246-284` (`graphqlRaw`):

```javascript
  const controller = timeoutMs !== undefined ? new AbortController() : undefined;
  const timeoutId = timeoutMs !== undefined
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  try {
    ...
  } catch (error) {
    if (error?.name === "AbortError" && timeoutMs !== undefined) {
      throw new Error(`GraphQL request timed out after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
```

The invariant: **a timeout is always cleared in `finally`, and a timed-out result is reported as a
distinct outcome with the duration named in the message.** Both halves matter for P1-CMD, whose
"hangs" outcome is one of the three legitimate answers under D-07 and must be distinguishable from
"errored" and "ran".

**5. Bounded polling loop with an explicit deadline** — `mcp-server.mjs:641-651`:

```javascript
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    const approvals = readApprovalDecisions();
    const decision = approvals[approvalId];
    if (decision && typeof decision.approved === "boolean") {
      return decision.approved;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for confirmation of ${toolName}.`);
```

Relevant only if the probe needs to wait on the freshly-written `.cmd` file (RESEARCH Pitfall 3:
Defender may hold a handle). If a retry is added, this is the shape — a wall-clock deadline, not a
retry count.

---

**Spawn helper analog:** `packages/backend/src/index.ts` — this is TypeScript inside the Caido
bundle, so it is a *partial* match (different role), but it is the same data flow and it is the
version of this code the project has actually shipped and tested.

**6. Promise-wrapped spawn that resolves on BOTH `close` and `error`** — `index.ts:1519-1529`:

```typescript
function spawnAndWait(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on("error", () => resolve({ code: 1, stdout, stderr }));
  });
}
```

**Defect in the RESEARCH skeleton this fixes:** `03-RESEARCH.md`'s `spawnCapture` (lines 237-266)
records the error in `child.on("error", …)` but **only resolves inside `close`**. The repo's
proven helper resolves in both handlers. On Windows the failure modes P1-CMD is characterizing
(`EINVAL`, `EPERM`, `EBUSY`, `ENOENT`) arrive as `error`; relying on `close` also firing is an
assumption this phase exists to avoid making. Resolve in both, guard with a `settled` flag.

**7. Settle-flag + `clearTimeout` + `SIGKILL` on the timeout path** — `index.ts:852-875`:

```typescript
  const pathResolution = await new Promise<string | undefined>((resolve) => {
    const child = spawn("which", [command]);
    let out = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
      resolve(undefined);
    }, 1000);
    child.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(code === 0 && out.trim() !== "" ? out.trim() : undefined);
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(undefined);
    });
  });
```

This is the exact function the Windows port will replace (`which` → `where.exe`), so P1-WHERE is
probing *this* code path. Three things to copy verbatim into `spawnCapture`:
- the `settled` flag on all three paths (timeout / close / error),
- `clearTimeout(timeout)` on the non-timeout paths — the RESEARCH skeleton never clears its 5 s
  timer, which keeps the event loop alive and makes "the probe finished" indistinguishable from
  "the probe is waiting on stale timers",
- `try { child.kill(...) } catch { /* ignore */ }` — note the **comment inside the empty catch**.
  That comment is not style, it is the only thing keeping `no-empty` quiet (see Shared Patterns).

**8. P1-CMD needs three distinct failure surfaces, not one.** Node's CVE-2024-27980 guard throws
**synchronously** out of `spawn()` for a `.cmd` target, so the probe must handle:

| Surface | Where it appears | RESEARCH skeleton coverage |
|---|---|---|
| synchronous throw from `spawn()` | `try { child = spawn(...) } catch` | present (lines 245-250) |
| async `error` event | `child.on("error")` | records but does not resolve — **fix per excerpt 6** |
| clean `close` with output | `child.on("close")` | present |
| timeout with no event at all | the safety timer | present but never cleared — **fix per excerpt 7** |

D-07 requires P1-CMD to be *conclusive*: an outcome the probe cannot classify must break the job.
That means the output line has to name which of the four surfaces fired, and the `else` branch
that classifies nothing must `FAIL`, not `PASS`.

---

### `.github/workflows/windows-llrt-probe.yml` (CI workflow, batch pipeline)

**Analog:** `.github/workflows/ci.yml` — **exact match**, and under D-04 the authoritative source
for every action pin. Copy from the file, not from `03-RESEARCH.md`.

**1. Trigger block — copy verbatim, comment included** — `ci.yml:1-8`:

```yaml
name: CI

# Bare push/pull_request keys (no branches filter) mean every branch. A workflow
# only runs from the branch it lives on, so filtering to main meant no feature
# branch was ever verified before merge.
on:
  push:
  pull_request:
```

This is D-01. `03-RESEARCH.md:464-468` specifies `branches: [main]` on both keys — that is the
filter Phase 1 deliberately removed. Reintroducing it means the probe never runs on the branch
where it is being developed, and D-13 (a real run producing all seven lines) becomes unreachable
without merging to `main` first.

**2. Concurrency group** — `ci.yml:10-15`:

```yaml
concurrency:
  # A same-repo PR fires both push and pull_request. Keying on the PR number when
  # present collapses the two into one cancellable group instead of running the
  # whole matrix twice.
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

`03-RESEARCH.md:470-473` uses the older `${{ github.workflow }}-${{ github.ref }}` form. With bare
`push` + `pull_request` (D-01) that form runs the probe twice per same-repo PR — burning two
Windows runners and producing two artifacts to reconcile. Use `ci.yml`'s expression.

**3. Job header + the four action pins (D-04)** — `ci.yml:17-42`:

```yaml
jobs:
  verify:
    name: Verify (Node ${{ matrix.node }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: ['20', '22', '24', '26']
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      # Must stay ahead of Setup Node, whose pnpm store cache needs the pnpm
      # binary to already exist. No version input: pnpm 9.0.0 is derived from
      # package.json's packageManager field.
      - name: Setup pnpm
        uses: pnpm/action-setup@v6

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm
```

- Pins: `actions/checkout@v5`, `pnpm/action-setup@v6`, `actions/setup-node@v5` — exactly D-04.
  `03-RESEARCH.md:100-107` lists `@v4` for all three; that table is stale.
- **Step ordering is load-bearing**, and the comment says why: `setup-node`'s `cache: pnpm` needs
  the pnpm binary to already exist. Same ordering on Windows.
- **`pnpm/action-setup@v6` takes no `version:` input here** — it derives 9.0.0 from
  `package.json`'s `packageManager` field. Do not add a `version:` input to the new workflow; that
  would create a second, divergent source of truth for the pnpm version.
- The probe job is single-legged, so no `strategy`/`matrix`/`fail-fast` block. `runs-on:
  windows-latest`. Job `name:` should carry the requirement ID (`CI-02`) the way `ci.yml`'s legs
  carry the discriminating variable.

**4. Install step** — `ci.yml:44-45`:

```yaml
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
```

No `shell:` key. On `ubuntu-latest` the default is bash; on `windows-latest` the default is
`pwsh`. `pnpm install --frozen-lockfile` is shell-agnostic, so this line ports as-is, but the
probe step is not — see excerpt 6.

**5. Artifact upload with `if:` guard, `if-no-files-found`, `retention-days`** — `ci.yml:59-69`:

```yaml
      # The build runs on every leg because it is real signal; only the upload is
      # restricted to one, because upload-artifact returns 409 on duplicate
      # artifact names across a matrix. Node 24 is Active LTS.
      - name: Upload plugin artifact
        if: matrix.node == '24'
        uses: actions/upload-artifact@v5
        with:
          name: drift-plugin
          path: dist/plugin_package.zip
          if-no-files-found: error
          retention-days: 14
```

Copy the pin (`@v5`, D-04) and the three `with:` keys. Two deliberate divergences:
- `if: always()` instead of a matrix guard — CONTEXT §Specific Ideas: the results matter most when
  the probe exits non-zero. There is no matrix here, so no 409 risk.
- `retention-days: 30` (per `03-RESEARCH.md:507`) rather than 14. D-11 already accepts that the
  artifact expires and makes the committed findings doc the durable record, so this is a
  convenience number, not a correctness one.
- Keep `if-no-files-found: error` rather than RESEARCH's `warn`. A missing `probe-results.txt` is
  the false-green shape D-13 exists to prevent: the job would be green with no evidence at all.

**6. Inline shell gate with `exit 1`** — `release.yml:15-20` (secondary analog):

```yaml
      - name: Verify main branch
        run: |
          if [[ "${{ github.ref_name }}" != "main" ]]; then
            echo "Release can only be run from the main branch."
            exit 1
          fi
```

This is the shape for D-10's automated secret-leak gate (assert neither `CAIDO_TOKEN` nor
`secrets.` appears in the workflow or the probe): a `run: |` block with `[[ ]]`/`grep`, an
explanatory `echo`, and a bare `exit 1`. Note `release.yml` gets `[[ ]]` for free on
`ubuntu-latest`; on `windows-latest` the gate step needs an explicit `shell: bash`.

**7. `shell: bash` on Windows and the `tee` exit code.** GitHub Actions maps `shell: bash` to
`bash --noprofile --norc -eo pipefail {0}` on every OS including Windows, so `node
scripts/windows-llrt-probe.mjs 2>&1 | tee probe-results.txt` propagates the probe's exit code
rather than `tee`'s. This closes `03-RESEARCH.md` assumption A2 on paper — but D-13 says static
reasoning is not sufficient. **Prove it with a deliberate-FAIL run** (the Phase 1 `01-06` run-2
pattern: a temporarily broken input, observe red, revert), the same way SIG-03e proved the lint
gate actually bites.

**8. Comment density.** Every non-obvious line in `ci.yml` carries a "why" comment (lines 3-5,
12-14, 22-24, 32-34, 59-61). Match that. Two comments the new file specifically needs:
- **D-02's expiry:** this workflow is deleted in Phase 9 when CI-01 lands. Say so at the top, name
  Phase 9, and name CI-01. An undated "temporary" comment becomes permanent.
- **The vehicle caveat (D-08):** the file runs Node, not LLRT. State it in the workflow too, not
  only in the probe output — a reader lands on the YAML first.

---

### `03-FINDINGS.md` (evidence document, record) — D-11

**Analog:** `.planning/phases/01-restore-the-verification-signal/01-06-SUMMARY.md` — the file that
established the pattern D-11/D-12/D-13 are applying (`[01-06]` in `STATE.md:74`).

**1. The run table** — `01-06-SUMMARY.md:66-70`:

```markdown
| # | Purpose | Branch (deleted) | Commit | Run URL | Conclusion |
|---|---|---|---|---|---|
| 1 | SIG-01d, SIG-03g — first real matrix run | `scratch/ci-proof-matrix` | `1608051` | https://github.com/six2dez/drift/actions/runs/31605493233 | **success** |
```

Every claim gets: purpose, branch, commit SHA, full run URL, and the recorded conclusion.

**2. Per-leg / per-step conclusions read from the API, not the YAML** — `01-06-SUMMARY.md:74-81`:

```markdown
| Leg | Conclusion | Node resolved | Test result |
|---|---|---|---|
| `Verify (Node 20)` | **success** | 20.20.2 | 23 files / 131 tests / 0 failed |

Step order on all four legs, read from the API not from the YAML: `Typecheck` (6) → `Lint` (7)
→ `Test` (8) → `Build` (9).
```

For Phase 3 the equivalent table is **one row per assertion ID** (`P0-ENV`, `P0-TMP`, `P1-CMD`,
`P1-WHERE`, `P2-OS`, `P3-VARS`, `P3-UUID`) with the verbatim probe output line as the evidence
column — that is the "log line proving the mechanism" from `[01-06]`.

**3. The scratch-branch procedure** — `01-06-SUMMARY.md:25-27` and `:171-179`:

```markdown
- "Integration proof by throwaway scratch branch: push, observe, record run URL, delete locally and remotely"
- "Targeted `git add <path>` instead of `git add -A` on scratch branches pushed to a public remote"
```

```markdown
| `git ls-remote --heads origin 'scratch/*'` | *(empty)* |
| `git ls-remote --heads origin` (all) | **`main` only** |
| Run records survive branch deletion | run 31605493233 still `success`; artifact count still `1` |
```

Naming convention: `scratch/ci-proof-<purpose>`. Teardown is asserted with a glob, and the
findings doc records the assertion output. `git add -A` is forbidden repo-wide
(`STATE.md:76`) — `IMPROVEMENT-PLAN.md` sits untracked at the root (now also `.gitignore`d).

**4. Front-matter block** — `01-06-SUMMARY.md:1-50` uses YAML front matter with `requires` /
`provides` / `patterns-established` / `requirements-completed`. If the findings doc is a plan
SUMMARY, match it; if it is a standalone artifact (D-11 leaves the form open), the run table and
the per-assertion evidence table are the load-bearing parts.

---

### `.planning/STATE.md` (planning state, record) — MODIFY

**Analog:** itself. `### Blockers/Concerns` at line 84.

**1. The blocker this phase resolves already exists** — `STATE.md:91`:

```markdown
- LLRT `spawn({env})` env-passthrough on Windows is unverified (P0 risk). Phase 3 resolves it; if it fails, the documented fallback is a minimal `.cmd` launcher that `set`s env vars.
```

This is P0-ENV. D-05 says a P0-ENV failure must be recorded as an explicit blocker here; the entry
to edit is this one.

**2. The RESOLVED/OPEN prefix convention** — `STATE.md:88` and `:94`:

```markdown
- RESOLVED 2026-08-12 (plan 01-06): the test suite is no longer red on Node >= 25, and the blind spot that hid it is **proven** closed rather than assumed. ... ([run 31605493233](https://github.com/six2dez/drift/actions/runs/31605493233))
- OPEN DECISION (user, outside git) — supersedes assumption A7, whose premise is **false**. ... Measured read-only on 2026-08-12 (plan 01-06 task 3): `GET repos/six2dez/drift/branches/main/protection` → **404 "Branch not protected"** ...
```

Format: `RESOLVED <date> (plan NN-NN):` or `OPEN …:` prefix, the measured fact, and an inline
markdown link to the run URL. Blocker entries are rewritten in place, not appended to.

---

## Shared Patterns

### ESLint applies to `scripts/*.mjs` — verified, with two rules that bite

**Source:** `eslint.config.mjs`, confirmed by `pnpm exec eslint --print-config
scripts/windows-llrt-probe.mjs` (read-only; the file need not exist).
**Apply to:** `scripts/windows-llrt-probe.mjs`.

`eslint.config.mjs:22` ignores only `node_modules` and `dist`:

```javascript
  { ignores: ["**/node_modules/**", "dist/**", "**/dist/**"] },
```

so a new `scripts/` directory **is** linted, and `pnpm lint` runs `eslint . --max-warnings 0` on
all four `ubuntu-latest` matrix legs (`package.json:23`, `ci.yml:50-51`). A lint error in the probe
turns the *existing* CI red, not the new workflow.

`eslint.config.mjs:51-57` is what gives the file Node globals:

```javascript
  // mcp-server.mjs is a standalone Node process spawned outside the plugin
  // bundle, not part of the QuickJS bundle, so it gets real Node globals — as do
  // the root-level build configs.
  {
    files: ["**/*.mjs", "*.config.ts", "vitest.setup.ts"],
    languageOptions: { globals: globals.node },
  },
```

Resolved config for `scripts/windows-llrt-probe.mjs` (measured):

| Setting | Value | Consequence for the probe |
|---|---|---|
| `languageOptions.sourceType` | `module` | ESM, no `require` |
| `languageOptions.ecmaVersion` | `2026` | top-level `await` is allowed |
| globals | `process`, `console`, `setTimeout`, `Buffer`, `fetch`, `URL`, `crypto` all `readonly` | `no-undef` will not fire on Node builtins |
| `no-empty` | `[2, { allowEmptyCatch: false }]` | **`catch (_) {}` is an error** |
| `@typescript-eslint/no-unused-vars` | `[2, { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }]` | an unused catch binding must be `_err`, or omitted entirely |
| `no-undef` | `[2]` | on |
| `no-console` | not configured | `console.log` / `console.error` are fine |
| `@typescript-eslint/*` recommended | active (the TS parser parses `.mjs`) | no type-aware rules, so no `parserOptions.project` needed |

**Concrete defect in `03-RESEARCH.md`'s skeleton:** it uses `catch (_) {}` twice (lines 262 and
333). With `allowEmptyCatch: false` that is two `no-empty` errors and `pnpm lint --max-warnings 0`
goes red on every existing CI leg. The repo's own form, used at `index.ts:859`, `:1207` and
`:1243`, puts a comment inside the block — `no-empty` accepts a block containing a comment:

```typescript
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
```

```typescript
          } catch { /* ignore malformed line */ }
```

Bare `catch { … }` (no binding) is the dominant repo style — 12 occurrences in `index.ts`, 5 in
`mcp-server.mjs`. Use it unless the error value is actually reported.

### Prettier does NOT cover `scripts/` — decide explicitly

**Source:** `package.json:25`
**Apply to:** `scripts/windows-llrt-probe.mjs`

```json
    "format": "prettier --write \"packages/**/src/**/*.{vue,ts,js,json}\" \"*.{ts,mjs}\"",
```

The second glob is root-level only (`*.{ts,mjs}` matches `eslint.config.mjs`, not
`scripts/*.mjs`). So `pnpm format` will not touch the probe.

This is **not a gate** — `eslint.config.mjs:91` puts `prettier` (eslint-config-prettier) last,
which disables every formatting rule, so `pnpm lint` cannot fail on formatting either. It is a
consistency choice with two options:
1. extend the glob to include `"scripts/*.mjs"` (a one-line `package.json` edit), or
2. hand-match Prettier defaults (2-space indent, double quotes — no `.prettierrc` is committed).

Note the collision risk: ROADMAP backlog **999.11** is a parked repo-wide Prettier sweep. Option 1
slightly enlarges its future scope; option 2 leaves a file the sweep will later reformat.

### Secrets and the sentinel (D-10)

**Source:** `.gitignore`, `mcp-server.mjs:12-16`, `release.yml:52-61`
**Apply to:** both new files

- The sentinel is `drift-probe-sentinel-<timestamp>` — a dummy string, never a real token
  (D-10, `03-RESEARCH.md` Pitfall 6). The probe must not read `CAIDO_TOKEN`, and the workflow must
  not reference `secrets.` at all. `release.yml` is the only workflow that touches `secrets.` and
  it is `workflow_dispatch`-only and `main`-gated; the probe workflow keeps that separation.
- `.gitignore` contains `*.log` but not `*.txt`, so `probe-results.txt` is **not** ignored. If the
  probe is ever run locally, that file will show up in `git status` — either name it `*.log`, add
  a targeted ignore, or rely on the targeted-`git add` discipline from `STATE.md:76`.
- `T-01-32` (`01-06-SUMMARY.md:270`) is the precedent to preserve: scratch branches must not
  trigger a secret-bearing workflow. Adding a bare-trigger workflow means `scratch/*` pushes now
  fire *two* workflows (`CI` and the probe) — neither consumes a secret, which keeps the property
  true, and the D-10 gate is what keeps it true through Phases 4-8.

### Section headers in long files

**Source:** `mcp-server.mjs:41`, `:654`; `index.ts:846`

```javascript
// ── GraphQL client ──────────────────────────────────────────────────
```

```javascript
// ── MCP JSON-RPC stdio transport ────────────────────────────────────
```

ASCII box-rule headers delimit logical sections (CLAUDE.md §Code Style). The probe has seven
assertion blocks plus helpers; use this form rather than the `// === P0: … ===` style in
`03-RESEARCH.md` if section headers are wanted — but the RESEARCH style is self-consistent and
carries the assertion IDs, which has its own value. Pick one and apply it uniformly.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | Every file in this phase has an analog. |

Two *gaps within* otherwise-matched files, where `03-RESEARCH.md` is the fallback source:

| Gap | Where | Fallback |
|---|---|---|
| A `windows-latest` job has never existed in this repo. `ci.yml` and `release.yml` are both `ubuntu-latest`. Windows-specific keys (`shell: bash`, `where.exe` absolute path, CRLF handling) have no in-repo precedent. | `.github/workflows/windows-llrt-probe.yml` | `03-RESEARCH.md` §Common Pitfalls 1 and 4, §Environment Availability |
| No file in this repo emits machine-parseable `PASS`/`FAIL` lines. `mcp-server.mjs` emits JSON-RPC; vitest emits its own format. The `PASS [ID]: detail` / `FAIL [ID]: reason` / `INFO [ID]: detail` grammar is new. | `scripts/windows-llrt-probe.mjs` | `03-RESEARCH.md` §CI Artifact and the assertion-ID list in `03-VALIDATION.md`; D-08 adds the mandatory non-LLRT label on `P2-OS` and `P3-UUID` |

---

## Stale Upstream Guidance (do not copy)

Collected here because `03-RESEARCH.md` and `03-01-PLAN.md` both predate Phase 1 and the planner
will read them.

| Source | Stale content | Correct value | Authority |
|---|---|---|---|
| `03-RESEARCH.md:104-107`, `:480-489`, `:503` | `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4` | `@v5`, `@v6`, `@v5`, `@v5` | D-04; `ci.yml:30,36,39,64` |
| `03-RESEARCH.md:464-468` | `on: push: branches: [main]` / `pull_request: branches: [main]` | bare `on: push:` + `pull_request:` | D-01; `ci.yml:6-8` |
| `03-RESEARCH.md:470-473` | `group: ${{ github.workflow }}-${{ github.ref }}` | `group: ${{ github.workflow }}-${{ github.event.pull_request.number \|\| github.ref }}` | `ci.yml:14` |
| `03-RESEARCH.md:237-266` | `spawnCapture` resolves only in `close`; timeout never cleared | resolve in `close` **and** `error` with a `settled` flag; `clearTimeout` on both | `index.ts:1519-1529`, `:852-875` |
| `03-RESEARCH.md:262,333` | `catch (_) {}` | `catch { /* ignore */ }` | `no-empty: [2,{allowEmptyCatch:false}]`; `index.ts:859` |
| `03-RESEARCH.md:318-331` | every P1-CMD branch calls `pass(...)` | the unclassifiable branch must `FAIL` | D-07 (conclusive-or-fail) |
| `03-RESEARCH.md:366-369`, `:396-399` | `P2-OS` / `P3-UUID` output lines carry no vehicle label | append the non-LLRT label, e.g. `(node-vehicle; LLRT verified by source analysis)` | D-08 |
| `03-RESEARCH.md:506` | `if-no-files-found: warn` | `error` | `ci.yml:68`; D-13 (no evidence = not green) |
| `03-01-PLAN.md` gates | `grep -q "actions/checkout@v4"` etc. | rewrite against the `@v5`/`@v6` pins | D-04 |

---

## Metadata

**Analog search scope:** `.github/workflows/` (2 files), repo root configs (`package.json`,
`eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `tsconfig.json`), `packages/backend/assets/`
(1 file), `packages/backend/src/index.ts` (targeted reads), `.planning/phases/01-*/`,
`.planning/STATE.md`.
**Files scanned:** 14 read or grepped; 4 analogs read in depth.
**Verification performed:** `pnpm exec eslint --print-config scripts/windows-llrt-probe.mjs`
(read-only) to confirm which config blocks and rules resolve for a not-yet-existing
`scripts/*.mjs`; `git ls-files '*.mjs'` to confirm the probe is the repo's third `.mjs`.
**Pattern extraction date:** 2026-08-13
