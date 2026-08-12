---
phase: 01-restore-the-verification-signal
reviewed: 2026-08-12T14:51:36Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - .github/workflows/ci.yml
  - .github/workflows/release.yml
  - CLAUDE.md
  - caido.config.ts
  - eslint.config.mjs
  - package.json
  - packages/backend/assets/mcp-server.mjs
  - packages/backend/src/claude-print.test.ts
  - packages/backend/src/index.ts
  - packages/frontend/src/__storage-shim.test.ts
  - packages/frontend/src/components/chat/MessageBubble.vue
  - packages/frontend/src/stores/settings.test.ts
  - packages/frontend/src/stores/settings.ts
  - vitest.config.ts
  - vitest.setup.ts
findings:
  critical: 2
  warning: 9
  info: 9
  total: 20
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-08-12T14:51:36Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 01 set out to restore this repo's verification signal. Mechanically, most of it
works and I verified it rather than taking it on trust:

- `pnpm lint` runs clean over 62 files (confirmed via `eslint . --format json`).
- `pnpm exec vitest run` is green locally on Node 26.7.0: 23 files, 131 tests.
- `vitest/no-focused-tests` genuinely fires (proved by piping `describe.only` through
  `eslint --stdin`), so the plugin is not decorative.
- `vue/no-v-html` is genuinely enabled (severity `warn`, which `--max-warnings 0` promotes
  to a failure), so the `MessageBubble.vue` disable block is load-bearing rather than
  cargo-culted.
- `environmentMatchGlobs` really is gone from Vitest 4.0.18 (`grep` over `node_modules/vitest/dist`
  returns nothing), so removing it was correct, and the 7 DOM test files that need
  `happy-dom` all carry the line-1 docblock.
- The storage shim is real: I disabled `vitest.setup.ts` and 2 of its 3 self-tests failed
  on Node 26. The "inertness proof" test earns its keep.
- The four-leg matrix passed on real CI (run `31605493233`: Node 20/22/24/26 all green,
  upload skipped on 3 legs).

That is the good half. The problems are concentrated in the gap between what the phase
claims to have verified and what its gates can actually catch:

1. **The phase's own primary production change is untested in the direction that matters.**
   I mutated `readBrowserStorageItem` to `return undefined` unconditionally and the entire
   131-test suite still passed. The three new guard tests all assert the *same* fail-closed
   outcome that a permanently-broken read produces. A regression that silently kills Caido
   token pickup — which disables MCP, i.e. the plugin's stated core value — would ship green.
2. **Every test file in the repo is outside `pnpm typecheck`**, and so are all four
   root-level TypeScript files, including the `vitest.setup.ts` this phase added.
3. **Formatting enforcement was removed, not moved.** `eslint-config-prettier` silences the
   stylistic rules (the config itself says that is "168 of the 188 baseline warnings") and
   nothing runs `prettier --check`. 46 files are currently non-compliant, including the new
   `readBrowserStorageItem` block.
4. The `ci.yml` concurrency comment asserts a de-duplication that the expression does not
   perform; same-repo PRs still run 8 jobs.
5. Two pre-existing defects in files this phase touched are serious enough to name: the
   build script can sign and publish a plugin package that is missing `mcp-server.mjs`, and
   `mcp-server.mjs` exits 1 on a single `null` line of stdin (reproduced).

Findings that predate this phase are marked **[pre-existing]**. They are included only
where the consequence is release integrity, secret exposure, or a runtime crash.

## Structural Findings (fallow)

No `<structural_findings>` block was supplied with this review request, so there is no
structural pre-pass substrate to reconcile against. Everything below is narrative.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The phase's primary production change survives total mutation — the whole suite passes with `readBrowserStorageItem` stubbed out

**File:** `packages/frontend/src/stores/settings.ts:34-45`, `packages/frontend/src/stores/settings.test.ts:296-331`

**Issue:**
`readBrowserStorageItem()` is the one piece of production code this phase added, and it is
the single point through which the Caido session token reaches the backend. All three new
tests assert the *negative* outcome:

```
settings.test.ts:304  expect(mockSdk.backend.syncCaidoSessionToken).toHaveBeenCalledWith("");
settings.test.ts:319  expect(mockSdk.backend.syncCaidoSessionToken).toHaveBeenCalledWith("");
settings.test.ts:330  expect(mockSdk.backend.syncCaidoSessionToken).toHaveBeenCalledWith("");
```

`""` is also exactly what a function that *never works* produces. `beforeEach` (`:118-122`)
stubs `getItem` to return `null`, so no test in the file — and, verified by grep, no test in
the repo — ever drives a present token through this path.

I mutation-tested this rather than inferring it. In an isolated copy of the tree I inserted
one line at the top of the function:

```ts
function readBrowserStorageItem(key: string): string | undefined {
  if (key !== "__never__") return undefined; // MUTATION
  try {
```

Result: `settings.test.ts` 10/10 passed, and the **full suite passed 23 files / 131 tests**.

Consequence: the token read can regress to "always empty" with a green suite and a green
four-leg CI matrix. Downstream, an empty token makes `startMcpServer` bail at
`packages/backend/src/index.ts:1696-1702`, so the failure mode this blind spot hides is
total loss of the MCP bridge — the "if the MCP runtime doesn't launch, nothing else matters"
core value from `CLAUDE.md:8`.

This is the same class of defect the phase itself identified and defended against for the
storage shim (`__storage-shim.test.ts:35-50`, "This is the inertness proof… A setItem/getItem
round-trip passes on BOTH…"). That rigor was applied to the test harness and not to the
production code.

**Fix:** add the positive case, which is what pins the mutation:

```ts
it("forwards the parsed accessToken from browser storage", async () => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: vi.fn((key: string) =>
        key === "CAIDO_AUTHENTICATION"
          ? JSON.stringify({ accessToken: "  tok-123  " })
          : null,
      ),
    },
  });
  const store = useSettingsStore();

  await store.syncCaidoRuntimeContext();

  expect(mockSdk.backend.syncCaidoSessionToken).toHaveBeenCalledWith("tok-123");
});

it("treats a non-string getItem return as no token", async () => {
  vi.stubGlobal("window", {
    localStorage: { getItem: vi.fn(() => ({ accessToken: "x" }) as unknown as string) },
  });
  const store = useSettingsStore();

  await store.syncCaidoRuntimeContext();

  expect(mockSdk.backend.syncCaidoSessionToken).toHaveBeenCalledWith("");
});
```

The first test also closes the `readBrowserStorageItem` → `JSON.parse` → `.trim()` chain,
none of which currently has coverage.

### CR-02: `pnpm build` suppresses the asset-copy failure, so a signed release can ship without `mcp-server.mjs` [pre-existing]

**File:** `package.json:26`

**Issue:**

```
"build": "caido-dev build && cp -r packages/backend/assets/* dist/plugin_package/backend/assets/ 2>/dev/null; rm -f dist/plugin_package.zip dist/drift.zip && cd dist/plugin_package && zip -r ../drift.zip . -x '*.DS_Store'"
```

Two independent problems in one line.

*(a) The asset copy cannot fail loudly.* `2>/dev/null` discards stderr and the `;` discards
the exit status. If `caido-dev build` succeeds but does not create
`dist/plugin_package/backend/assets/`, `cp -r src/* dest/` fails, the failure is swallowed,
and `zip` packages a plugin with no `mcp-server.mjs`. `.github/workflows/release.yml:49-77`
then signs that zip with the Ed25519 key and publishes it via `caido/action-release@v1`.
**Nothing between `pnpm build` and the release asserts that `drift.zip` contains
`backend/assets/mcp-server.mjs`.** The plugin would install, the UI would load, and every
MCP start would fail at `index.ts:1706-1708` ("MCP server script not found in plugin assets").

*(b) `caido-dev build`'s exit status is discarded.* The shell shape is `A && B ; C && D && E`,
so the script's exit code is `E`'s, not `A`'s. Demonstrated:

```
$ bash -c 'false && echo A ; true && true && echo E'; echo "exit=$?"
E
exit=0
```

On a fresh CI runner `dist/plugin_package` does not exist, so `cd` fails and the masking is
neutralised by accident. It is live for local and incremental builds, where a stale
`dist/plugin_package` makes a failed compile report success.

**Fix:** make the chain fail-fast and verify the payload before signing.

```json
"build": "caido-dev build && mkdir -p dist/plugin_package/backend/assets && cp -R packages/backend/assets/. dist/plugin_package/backend/assets/ && rm -f dist/plugin_package.zip dist/drift.zip && cd dist/plugin_package && zip -r ../drift.zip . -x '*.DS_Store'"
```

and add a gate in `release.yml` immediately after `Build plugin`:

```yaml
      - name: Verify package payload
        working-directory: dist
        run: |
          set -euo pipefail
          unzip -l drift.zip | grep -q 'backend/assets/mcp-server.mjs'
          unzip -l drift.zip | grep -q 'backend/index.js'
          unzip -l drift.zip | grep -q 'manifest.json'
```

## Warnings

### WR-01: The `ci.yml` concurrency comment describes de-duplication the expression does not perform; same-repo PRs still run 8 jobs

**File:** `.github/workflows/ci.yml:6-15`

**Issue:** The comment claims:

> A same-repo PR fires both push and pull_request. Keying on the PR number when present
> collapses the two into one cancellable group instead of running the whole matrix twice.

`github.event.pull_request` does not exist in a `push` event payload, so the fallback always
fires for pushes:

| Event | `group` |
|---|---|
| `push` to `feature-x` | `CI-refs/heads/feature-x` |
| `pull_request` synchronize on PR #42 (same branch) | `CI-42` |

Two distinct groups means no collapse and no cancellation between them. Pushing one commit
to an open same-repo PR runs the matrix twice — 8 jobs, not 4. `on: push:` with no filter
also fires on tag pushes, so cutting a release tag triggers a fourth full matrix.

The comment is the defect as much as the config: it documents a guarantee that does not
exist, so the next reader will not re-check it.

**Fix:** the standard shape actually removes the duplicate.

```yaml
on:
  push:
    branches: [main]
  pull_request:

concurrency:
  # push only ever fires for main; pull_request covers every branch pre-merge, so the two
  # never overlap and github.ref is a sufficient key.
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

This still verifies every feature branch (via `pull_request`) — the problem the phase set
out to fix — without the duplicate run. If pre-PR pushes must also be verified, keep
`on: push:` bare and delete the misleading comment.

### WR-02: No test file in the repo is type-checked, and the phase added new TypeScript straight into that blind spot

**File:** `packages/backend/tsconfig.json:7`, `packages/frontend/tsconfig.json:8`, `package.json:22`

**Issue:** Both package tsconfigs exclude tests:

```json
"exclude": ["./src/**/*.test.ts"]
```

and `"typecheck": "pnpm -r typecheck"` only recurses into `packages/*`, so nothing type-checks
root-level files. Combined coverage gap:

| File | In `pnpm typecheck`? | Added/changed this phase? |
|---|---|---|
| `vitest.setup.ts` | no | added |
| `vitest.config.ts` | no | changed |
| `caido.config.ts` | no | changed |
| `eslint.config.mjs` | n/a (JS) | added |
| all 23 `*.test.ts` | no | 3 added/changed |

Two concrete consequences:

- `caido.config.ts:4` and `:58` carry `@ts-expect-error` directives. An unused
  `@ts-expect-error` is itself a compile error — but only if something compiles the file.
  Nothing does, so those two suppressions are unverifiable and could be masking real errors
  or masking nothing at all.
- `vitest.setup.ts` leans on hand-written assertions (`globalThis as { Storage?: new () => StorageLike }`
  at `:39`, `globalThis as Record<string, unknown>` at `:29`). I ran `tsc --noEmit` against
  it manually and it is clean today, but nothing keeps it that way.

Because WR-03 also means ESLint has no type information, these files currently get **zero**
static type verification — errors surface only as runtime test failures.

**Fix:** add a root typecheck project and wire it into the existing script.

```json
// tsconfig.tools.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true, "types": ["node"] },
  "include": ["vitest.config.ts", "vitest.setup.ts", "caido.config.ts"]
}
```

```json
"typecheck": "tsc -p tsconfig.tools.json --noEmit && pnpm -r typecheck"
```

and drop `"exclude": ["./src/**/*.test.ts"]` from both package tsconfigs (adding
`"types": ["vitest/globals"]` if any test relies on globals — none currently do, they all
import from `"vitest"`).

### WR-03: The lint gate has no type-aware rules, so the whole floating-promise bug class is invisible to it

**File:** `eslint.config.mjs:25`

**Issue:** The config uses `...tseslint.configs.recommended` and sets
`parserOptions: { parser: tseslint.parser }` (`:36`) with no `project` / `projectService`.
Verified with `eslint --print-config`:

```
@typescript-eslint/no-floating-promises  => undefined
@typescript-eslint/no-misused-promises   => undefined
@typescript-eslint/await-thenable        => undefined
```

This codebase is unusually exposed to exactly those rules. `CLAUDE.md:259` documents that
Caido's QuickJS host starves the event loop during awaits, and the code is built on
fire-and-forget promises to work around it: `void syncCaidoHistoryContext().catch(...)`
(`settings.ts:231`), `void runPostInitBootstrap()` (`:218`), `setInterval` firing async RPCs
(`:360-362`), plus the watchdog machinery in `index.ts`. A missing `void`/`await` in that
code is the single most likely defect shape in the repo, and the new gate cannot see it.
WR-02 compounds this: no type-aware lint *and* no typecheck over tests.

**Fix:** enable type-aware linting for TypeScript sources only, keeping `.vue` and `.mjs`
on the syntactic path.

```js
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["packages/*/src/**/*.ts"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  { files: ["**/*.mjs", "*.config.ts"], ...tseslint.configs.disableTypeChecked },
```

If `recommendedTypeChecked` produces too much churn to absorb now, enable the three rules
that matter on their own — `no-floating-promises`, `no-misused-promises`, `await-thenable` —
and record the rest as deferred.

### WR-04: Formatting enforcement was removed rather than relocated — 46 files are non-compliant, including this phase's own new code

**File:** `eslint.config.mjs:89-91`, `package.json:23-25`, `.github/workflows/ci.yml:50-51`

**Issue:** The config ends with:

```js
  // MUST be last: disables every rule Prettier already owns, which is 168 of the
  // 188 baseline warnings.
  prettier,
```

Deferring style to Prettier is correct — but nothing runs Prettier in check mode. There is
no `format:check` script and no CI step. Net effect: 168 of the 188 catalogued findings were
silenced and nothing replaced them.

Measured, using the repo's own `format` globs:

```
$ pnpm exec prettier --check "packages/**/src/**/*.{vue,ts,js,json}" "*.{ts,mjs}"
[warn] Code style issues found in 46 files.
```

Three of those 46 were edited in this phase — `packages/frontend/src/stores/settings.ts`,
`packages/frontend/src/stores/settings.test.ts`,
`packages/frontend/src/components/chat/MessageBubble.vue` — and the drift is inside the newly
added code, not just around it. `readBrowserStorageItem` as committed:

```ts
    const storage = (globalThis as { window?: { localStorage?: BrowserStorage } })
      .window?.localStorage;
```

Prettier wants:

```ts
    const storage = (
      globalThis as { window?: { localStorage?: BrowserStorage } }
    ).window?.localStorage;
```

The genuinely new files (`vitest.setup.ts`, `eslint.config.mjs`, `__storage-shim.test.ts`,
`vitest.config.ts`, `caido.config.ts`) *are* Prettier-clean, which shows the intent was there —
it just is not enforced, so it decayed within the same phase.

**Fix:**

```json
"format": "prettier --write \"packages/**/src/**/*.{vue,ts,js,json}\" \"*.{ts,mjs}\"",
"format:check": "prettier --check \"packages/**/src/**/*.{vue,ts,js,json}\" \"*.{ts,mjs}\"",
```

```yaml
      - name: Format check
        run: pnpm format:check
```

Run `pnpm format` once first (46 files) so the gate starts green, and extend the glob to
`packages/backend/assets/*.mjs` — `mcp-server.mjs` is currently outside every formatting
glob, which is why this phase's one-line edit there pushed that line to 88 columns unnoticed.

### WR-05: `CLAUDE.md` was edited in this phase but still describes the pre-phase CI

**File:** `CLAUDE.md:26`, `:76`, `:83-84`, `:87`

**Issue:** The diff updated the ESLint/Prettier bullets (`:73-74`, `:112-115`) and left every
CI statement stale. `CLAUDE.md` is the agent instruction file — stale content here actively
misdirects future work.

| Line | Says | Reality after this phase |
|---|---|---|
| 26 | "CI pins Node 20 via `actions/setup-node`" | four-leg matrix `['20','22','24','26']` (`ci.yml:27`) |
| 83 | "Triggers on push/PR to `main`" | every branch; bare `push:`/`pull_request:` (`ci.yml:6-8`) |
| 84 | "Runs: typecheck → `vitest run` → `pnpm build`" | lint step added (`ci.yml:50-51`) |
| 87 | release "Runs: typecheck → test → build" | lint step added (`release.yml:40-41`) |
| 76 | "Node.js 20 (`.nvmrc`)" | `.nvmrc` is still `20` while CI covers 4 majors and the maintainer's local Node is 26.7.0 |

The `.nvmrc` mismatch is the operationally interesting one: `engines.node` is `>=20`, but
`eslint@10.8.1` and `@eslint/js@10.0.1` both declare `"node": "^20.19.0 || ^22.13.0 || >=24"`.
A developer on Node 20.0–20.18 (which `.nvmrc: 20` permits) is outside the dev toolchain's
supported range.

**Fix:** update those four bullets to match the shipped workflows, and either bump `.nvmrc`
to the version the matrix treats as canonical (`24`, the leg that uploads the artifact) or
tighten `engines.node` to `>=20.19` so the constraint is machine-checkable.

### WR-06: `release.yml` interpolates the signing key into the shell and leaks it to disk when `openssl` fails

**File:** `.github/workflows/release.yml:49-61`

**Issue:**

```yaml
        run: |
          if [[ -z "${{ secrets.PRIVATE_KEY }}" ]]; then
          ...
          echo "${{ secrets.PRIVATE_KEY }}" > private_key.pem
          openssl pkeyutl -sign -inkey private_key.pem -out drift.zip.sig -rawin -in drift.zip
          rm -f private_key.pem
```

Two problems.

1. **`${{ }}` expansion into a `run:` body is textual substitution before bash parses the
   script.** Any `` ` ``, `$(`, or unbalanced quote in the secret becomes executable code in a
   job holding `contents: write` and `id-token: write`. This is the pattern GitHub's own
   hardening guidance forbids without exception for secrets. The mitigation is not "trust
   the secret" — it is to never let secret bytes reach the parser.
2. **The cleanup is not exception-safe.** Actions runs `bash -e`, so a non-zero
   `openssl pkeyutl` aborts the step before `rm -f private_key.pem`. The Ed25519 private key
   is left in `dist/` on the runner. `.gitignore` covers `*.pem` and the release step uploads
   two explicit paths, so this is containment-by-luck rather than by design.

**Fix:**

```yaml
      - name: Sign plugin zip
        working-directory: dist
        env:
          PRIVATE_KEY: ${{ secrets.PRIVATE_KEY }}
        run: |
          set -euo pipefail
          if [[ -z "${PRIVATE_KEY}" ]]; then
            echo "Missing PRIVATE_KEY secret."
            exit 1
          fi
          trap 'rm -f private_key.pem' EXIT
          printf '%s\n' "${PRIVATE_KEY}" > private_key.pem
          chmod 600 private_key.pem
          openssl pkeyutl -sign -inkey private_key.pem -out drift.zip.sig -rawin -in drift.zip
```

`env:` keeps the secret out of the script text, `printf '%s'` avoids `echo`'s
implementation-defined escape handling, and `trap ... EXIT` removes the key on every exit path.

### WR-07: `mcp-server.mjs` exits 1 on a single `null` line of stdin [pre-existing]

**File:** `packages/backend/assets/mcp-server.mjs:709-710`, `:690-696`, `:803-811`

**Issue:** `processLine` guards only the parse, not the dispatch:

```js
function processLine(line) {
  if (line.length === 0) return;
  try {
    const pending = handleMessage(JSON.parse(line));
    trackInFlight(pending);
  } catch {
    // invalid JSON, skip
  }
}
```

`JSON.parse("null")` does not throw — it returns `null`. `handleMessage(null)` then hits
`switch (msg.method)` (`:710`) and throws a `TypeError`. Because `handleMessage` is `async`
that becomes a rejected promise, which `processLine`'s `catch` cannot see. `trackInFlight`
attaches only `.finally()` and discards the derived promise (`:692-695`), so the rejection
reaches no handler and Node's default `--unhandled-rejections=throw` kills the process.

Reproduced:

```
$ printf 'null\n' | CAIDO_URL=http://127.0.0.1:1 CAIDO_TOKEN=x node packages/backend/assets/mcp-server.mjs
TypeError: Cannot read properties of null (reading 'method')
    at handleMessage (.../mcp-server.mjs:710:15)
$ echo "exit=$?"
exit=1
```

The same swallow applies to every rejection path that `handleMessage`'s inner
`try/catch` does not cover — notably `await send(...)` in `initialize`, `ping`, `tools/list`,
the `catch (e)` arm at `:790`, and the `default` arm at `:795`. `send()` rejects on stdout
write errors, and EPIPE is routine when a CLI host tears down the pipe. A dead MCP server
mid-conversation is the failure mode `CLAUDE.md:8` calls out as the one that matters.

**Fix:** validate the frame and attach a real rejection handler.

```js
function processLine(line) {
  if (line.length === 0) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // invalid JSON, skip
  }
  if (msg === null || typeof msg !== "object" || Array.isArray(msg)) return;
  trackInFlight(handleMessage(msg));
}

function trackInFlight(promise) {
  inFlightRequests.add(promise);
  promise
    .catch((error) => {
      appendActivityEvent({
        type: "server-error",
        id: createId("event"),
        occurredAt: Date.now(),
        resultSummary: summarizeText(error?.message ?? String(error)),
      });
    })
    .finally(() => {
      inFlightRequests.delete(promise);
      exitWhenIdle();
    });
}
```

### WR-08: `set_environment` values are summarised into the activity log and persisted into the chat DB [pre-existing]

**File:** `packages/backend/assets/mcp-server.mjs:64-68`

**Issue:** `summarizeArguments` special-cases exactly one key:

```js
      if (typeof value === "string") {
        if (key === "raw") return `${key}=${value.length} chars`;
        return `${key}=${summarizeText(value, 60)}`;
      }
```

`raw` is length-only precisely so HTTP bodies are not dumped. `value` gets no such treatment,
so the `set_environment` tool (`:544-551`, `{ environmentId, name, value }`) writes the first
60 characters of the variable value verbatim. Caido environment variables are the canonical
place users park bearer tokens, API keys, and session cookies.

That string then travels the full persistence path:

`mcp-activity-<session>.jsonl` (`:82`) → backend watchdog → `argumentsSummary`
(`index.ts:646`, `:664`) → `ChatMessage.mcpActivities` (`index.ts:2344`, `:2475`, `:2557`) →
`saveJson("chats", ...)` (`index.ts:1788`, `:1812`) → rendered in
`MessageBubble.vue:135-137`.

So a secret written through the MCP bridge is persisted in the Caido project DB and shown in
chat history indefinitely. The `0o700` temp dir protects the JSONL from other local users but
does nothing about the persisted copy. Note that `index.ts:344-347` already redacts
`CAIDO_TOKEN` from debug logs, so the codebase clearly intends secrets not to be logged —
this path just was not covered.

**Fix:** treat `value` like `raw`, and extend the redaction to the obvious siblings.

```js
const OPAQUE_VALUE_KEYS = new Set(["raw", "value", "token", "secret", "password"]);
// ...
      if (typeof value === "string") {
        if (OPAQUE_VALUE_KEYS.has(key)) return `${key}=${value.length} chars`;
        return `${key}=${summarizeText(value, 60)}`;
      }
```

### WR-09: All three storage failure modes collapse into a user-facing message whose remedy cannot fix them

**File:** `packages/frontend/src/stores/settings.ts:34-45`, `:92-114`

**Issue:** `readBrowserStorageItem` funnels absent-`window`, absent-`localStorage`,
throwing-getter, missing-`getItem`, and non-string-return into a single `undefined`.
`syncCaidoSessionToken` maps that to `pushCaidoSessionToken("")` with **no toast and no
`initError`** (`:94-97`). The user's only signal arrives later from the backend
(`index.ts:1698`):

> "No Caido access token is available. Open any Caido page (or reauthenticate) so Drift can
> pick up your session, then retry."

That instruction is correct for "not signed in" and useless for the cases this phase
specifically added tests for — storage disabled by enterprise policy, Safari private mode, a
sandboxed webview origin. The user will loop on a remedy that cannot work.

The asymmetry is visible inside the same function: the malformed-JSON branch *does* toast
(`:107-109`). So "we deliberately stay quiet" is not the established convention here.

Secondary defect in the same block: the catch calls `await pushCaidoSessionToken("")`
*before* `showToast` (`:106-110`). `pushCaidoSessionToken` throws when the RPC returns
`Error` or times out (`:87-89`), so on a slow backend the malformed-token toast is skipped
and the user gets the generic transport message instead.

**Fix:** make the failure mode observable, and toast before the throwing call.

```ts
type StorageRead =
  | { kind: "ok"; value: string }
  | { kind: "missing" }
  | { kind: "unavailable"; detail: string };

function readBrowserStorageItem(key: string): StorageRead {
  let storage: BrowserStorage | undefined;
  try {
    storage = (globalThis as { window?: { localStorage?: BrowserStorage } })
      .window?.localStorage ?? undefined;
  } catch (error) {
    return { kind: "unavailable", detail: String(error) };
  }
  if (storage === undefined) return { kind: "unavailable", detail: "localStorage is not available" };
  if (typeof storage.getItem !== "function") {
    return { kind: "unavailable", detail: "localStorage.getItem is not a function" };
  }
  try {
    const value = storage.getItem(key);
    return typeof value === "string" ? { kind: "ok", value } : { kind: "missing" };
  } catch (error) {
    return { kind: "unavailable", detail: String(error) };
  }
}
```

Then in `syncCaidoSessionToken`, keep pushing `""` for both non-`ok` cases (fail-closed is
right) but `appendInitErrorPrefix("auth:", ...)` for `unavailable` so the readiness panel can
say "browser storage is blocked" instead of "sign in again". Reorder the JSON catch so
`showToast` runs before `await pushCaidoSessionToken("")`.

## Info

### IN-01: Four dead conditionals in `graphqlRaw`, one on the line this phase edited

**File:** `packages/backend/assets/mcp-server.mjs:246-283`
**Issue:** `timeoutMs` is assigned from a ternary whose fallback is
`DEFAULT_GRAPHQL_TIMEOUT_MS` (`:17-20`, itself always a number), so it can never be
`undefined`. Every `timeoutMs !== undefined` test is therefore constant-true: `:251`, `:252`,
`:264`, `:277`. `controller` and `timeoutId` can never be `undefined` either, making
`:264` and `:282` unconditional. Line `:277` is the guard on the statement this phase changed,
so the `{ cause }` fix was applied to a branch whose condition is vestigial.
**Fix:** drop the `!== undefined` tests and the `?:` wrappers; keep only
`if (error?.name === "AbortError")`.

### IN-02: The shim installs onto `globalThis` with no teardown, so it can outlive its environment

**File:** `vitest.setup.ts:70-80`
**Issue:** Vitest's happy-dom teardown deletes only keys in its own `KEYS` list
(`node_modules/vitest/dist/chunks/index.CyBMJtT7.js:322-324`), and `localStorage` is not one
of them — that is the same omission the file's header comment documents. The shim's
`defineProperty` therefore persists on the Node global after teardown. Harmless under the
default `isolate: true`, but with `isolate: false` a DOM test file would leak a working
`localStorage` into subsequent node-environment files, producing exactly the cross-environment
divergence the file exists to prevent.
**Fix:** record whether each property was installed and restore the original descriptor in an
`afterAll` hook, or add a comment asserting the dependency on `isolate: true`.

### IN-03: `Object.defineProperty` is the one unguarded operation in an otherwise defensive file

**File:** `vitest.setup.ts:73-78`
**Issue:** `hasUsableStorage` and `createStorage` both wrap every risky operation in
`try/catch`, but the install itself does not. If a future runtime defines `localStorage` as
non-configurable, `defineProperty` throws inside a setup file and *every* DOM test file errors
out instead of degrading. The descriptor also omits `enumerable`, so it defaults to `false`,
silently changing the property's shape versus both the native and happy-dom originals.
**Fix:** wrap in `try/catch` and pass `enumerable: true`.

### IN-04: The shim's probe adds a Node experimental warning to every DOM test worker

**File:** `vitest.setup.ts:29`
**Issue:** Reading `globalThis.localStorage` on Node >= 25 without `--localstorage-file`
emits `ExperimentalWarning: localStorage is not available because --localstorage-file was not
provided` to stderr. Observed 8 times in one local `vitest run`. Correct behaviour (the throw
is what the probe is detecting) but it is new, permanent noise in every CI log on the two
newest matrix legs.
**Fix:** note it in the file header so it is not later mistaken for a real failure, or set
`process.env.NODE_NO_WARNINGS` narrowly around the probe.

### IN-05: `expect(...).resolves.not.toThrow()` is a near-vacuous matcher shape

**File:** `packages/frontend/src/stores/settings.test.ts:318`
**Issue:** `.resolves` unwraps the promise to `undefined`, and `toThrow` against a
non-function with `fromPromise` set silently no-ops rather than erroring. The assertion does
still prove "the promise does not reject", which is the intent — but it reads as though it
checks something stronger.
**Fix:** `await expect(store.syncCaidoRuntimeContext()).resolves.toBeUndefined();`

### IN-06: Three branches added by this phase have no coverage at all

**File:** `packages/frontend/src/stores/settings.ts:41`, `vitest.setup.ts:70`
**Issue:** Untested: (a) `typeof value === "string" ? value : undefined` — the non-string
`getItem` return; (b) `getItem` throwing *when called* (only the property-getter throw is
covered, `settings.test.ts:311-315`); (c) the shim's node-environment guard — the
`document === undefined` path is never exercised because `__storage-shim.test.ts` is
happy-dom-only, and the node-env tests stub `window` explicitly so they would pass either way.
**Fix:** covered by the second test in CR-01 for (a) and (b); for (c) assert in a
node-environment test that `globalThis.localStorage` was not replaced by the shim.

### IN-07: `writeApprovalDecision` still trusts the parsed JSON's shape [pre-existing]

**File:** `packages/backend/src/index.ts:710-721`
**Issue:** This phase removed the `= {}` initializer (a correct `no-useless-assignment` fix —
behaviour is identical because the `catch` assigns on both throw paths). But if the approvals
file contains a JSON scalar or `null`, `JSON.parse` succeeds, `current` becomes a non-object,
and `current[approvalId] = ...` throws `TypeError`. Reachable only via a truncated or corrupt
write of a file the backend owns, so the impact is low — but the removed initializer was the
only remaining hint that an object is expected.
**Fix:**

```ts
  let current: Record<string, ApprovalDecision> = {};
  try {
    const parsed = JSON.parse(await readFile(approvalsFilePath, "utf-8")) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      current = parsed as Record<string, ApprovalDecision>;
    }
  } catch {
    // absent or corrupt: start fresh
  }
```

(keeping the initializer, which is no longer useless once the assignment is conditional).

### IN-08: Two small `eslint.config.mjs` fragilities

**File:** `eslint.config.mjs:22`, `:55`
**Issue:** (a) `"dist/**"` is fully subsumed by `"**/dist/**"` in the same `ignores` array.
(b) `*.config.ts` matches root level only, so a future `packages/frontend/vite.config.ts`
would silently miss the Node globals block and `no-undef` findings would appear from
`__dirname`/`process`. I verified current coverage is complete — 62 files linted, every source
file included — so this is latent, not live.
**Fix:** drop the redundant pattern and broaden to `"**/*.config.ts"`.

### IN-09: Two consistency nits in files this phase touched

**File:** `packages/backend/src/index.ts:381`, `packages/frontend/src/components/chat/MessageBubble.vue:107-113`, `.github/workflows/ci.yml:30-64`
**Issue:** (a) `index.ts:381` uses raw `console.error` while all ~40 other log sites in the
file use `sdk.console.*` — that message will not reach Caido's plugin log. Pre-existing.
(b) The `vue/no-v-html` suppression is a 7-line block disable (`:107`–`:113`) covering the
`style` and `class` attributes as well as the `v-html`; a second `v-html` added inside that
span would be silently accepted. A narrower `<!-- eslint-disable-next-line vue/no-v-html -->`
immediately above `:111` scopes it to the one attribute. The security reasoning in the comment
is accurate — `markdown-it` is constructed with `html: false` (`:18`) and output passes through
`DOMPurify.sanitize` (`:23`). (c) The commit claimed to "align action majors", but current
majors are `actions/checkout@v7` and `actions/setup-node@v7` while the workflows pin `@v5`;
`pnpm/action-setup@v6` and `upload-artifact@v5` are likewise behind `v6.0.10`/`v7.0.1`. All
pins work today (CI run `31605493233` is green on all four legs) — this is drift, not breakage.

---

_Reviewed: 2026-08-12T14:51:36Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
