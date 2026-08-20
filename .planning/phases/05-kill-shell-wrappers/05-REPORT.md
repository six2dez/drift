# Phase 5 — Kill Shell Wrappers: Phase Report

**Written:** 2026-08-20
**Phase:** 05-kill-shell-wrappers
**Plans:** 05-01 … 05-06
**Validation contract:** `05-VALIDATION.md` (status `validated`, rows V-1 … V-19 green)

---

> **Read the next section before any other.** It is first on purpose. This phase's most
> convincing artifact — an integration test that spawns the production spec against the real
> MCP server, green on a real `windows-latest` runner — is also the one most likely to attract
> more confidence than it earns. What follows is what this phase does **not** claim.

---

## 1. What this phase does NOT claim

### 1.1 The caveat, in full

This phase proves the **spec**, the **server** and the **spawn contract** on Windows — but
not index.ts's wiring of them, and not a real Claude CLI reading a config file and connecting.

Stated once more without the compression, because that sentence is the one that gets quoted:

> This phase proves the spec, the server and the spawn contract on Windows.
> It does not prove index.ts's wiring of them.
> It is not a real Claude CLI reading a config file and connecting.

Both halves matter and neither may be dropped when this is quoted. The first half is real: the
production `buildMcpServerSpec` output spawns a real `node` against the real
`packages/backend/assets/mcp-server.mjs` on `windows-latest`, `--validate-auth` returns
`{ok:true}`, and `tools/list` + `get_environment` + `search_history` all succeed over stdio
JSON-RPC. The second half is equally real: `packages/backend/src/index.ts` cannot be imported
under vitest — `vitest.config.ts` declares no `caido:plugin` alias and no test file imports it —
so **not one line** of the orchestrator that calls `buildMcpServerSpec` in production is executed
by any test in this repository.

This is `05-CONTEXT.md` **D-08**, carried in Phase 3's *vehicle caveat* voice, unsoftened.

### 1.2 The five non-claims, by row ID

Every row below is bucket **N** in `05-VALIDATION.md` — not provable in CI on any runner
available to this project. They are reproduced here with their reason and their closing
condition so a later reader can check this list against the contract rather than trust that it
is complete.

| Row | Requirement | The non-claim | Why it is not provable here | What closes it |
|---|---|---|---|---|
| **V-20** | RUN-04 | That a **real Windows Defender lock** is survived on real hardware | An AV write-then-exec race is not inducible on any CI runner, deterministically or otherwise (`04-RESEARCH.md`'s verdict, unchanged by this phase) | Real-machine confirmation from the original Windows reporter, **Phase 9/10**. RUN-04 is satisfied *structurally* here — see §4.3 — and `mcpFirstWriteAttempts` / `mcpTempWriteAttempts` in `getDiagnostics` are what make a real lock legible in a bug report |
| **V-21** | SC-2 | That index.ts's **wiring** of `buildMcpServerSpec` / the direct spawn into the three orchestration sites is correct | `index.ts` is not test-reachable: no `caido:plugin` alias in `vitest.config.ts`, no test file imports it. The `caido:plugin` alias was **deliberately deferred** to Phase 9 because it drags a 4,000-line module of module-level singletons with no inter-test reset into the test process — during the very phase rewriting its launch path | The static gates in §3, plus **a human reading the diff** (§7). The higher-fidelity close is Phase 9's `caido:plugin` alias |
| **V-22** | RUN-02 | That the **env contract holds under LLRT**, where Rust's `make_envp` writes the supplied map verbatim with no libuv back-fill | The Node vehicle back-fills eleven `required_vars` on Windows. A regression to a bare drift-only `env` dict — dropping `buildSpawnEnv`'s parent spread — would pass V-2, V-12 **and** V-16, and break only on the machine of the user who filed the bug | Nothing in this repo. The mitigation is the **vehicle-independent static Gate 4** (§3), which is the *only* evidence for the phase's central claim on this axis. Truly closed only by Phase 9/10 on a real Windows Caido install |
| **V-23** | RUN-01 | That any of this works under the **real Caido LLRT runtime at all** | There is no standalone LLRT Windows binary, and headless Caido needs a paid plan. **Every Windows result in this phase was measured on Node, not on Caido's runtime.** Source analysis (`05-RESEARCH.md` § L-1 … L-5) raised confidence; it did not close the gap | A real Windows Caido install, **Phase 9/10** |
| **V-24** | PRV-01 | That a **real Claude CLI** reads `mcp-<chatId>.json` and connects on Windows | **Out of scope — this is Phase 7's PRV-01.** Phase 5 claims the *health check* only | **Phase 7.** Do **not** let V-12/V-16/V-17's green be reported as this. That specific misreading is the reason this section leads the document |

### 1.3 The one that will be misread if anything is

The integration spawn test going green on `windows-latest` is **not** "Claude works on Windows".

It is: *a Node process, started from the same spec object index.ts will hand to `spawn`, talked
to the MCP server over stdio and got correct answers, on a Windows runner.* Between that and a
user's working Claude Code session on their own Windows machine sit at least three unclosed
things — index.ts's wiring (V-21), Caido's LLRT rather than Node (V-22/V-23), and the Claude CLI
itself (V-24, Phase 7). Each is named above with its owner.

---

## 2. Flagged assumptions — surfaced, not resolved

Three edge-coverage rows raised during planning could not be classified by the automated probe:
no category-specific probe (adjacency / empty / ordering / idempotency / concurrency) applied to
them. They are carried here **as flagged assumptions**. None was auto-resolved with a backstop
and none was dropped.

**Reconciliation, recorded explicitly:** the planning input for plan 05-01 described **four**
unclassified rows; the coverage report it produced contains **three**. All three are carried
below. The discrepancy is recorded rather than reconciled away — the count in the planning input
is not reproducible from the artifacts on disk, and inventing a fourth row to make the arithmetic
agree would be worse than stating the mismatch.

### FA-1 — RUN-01: "no POSIX dependency" is a claim about *absence*

- **Why no probe applied:** the requirement asserts that a class of thing does not exist
  (`chmod`, `#!/bin/bash`, `.sh` execution on a Windows-reachable path). Absence has no
  adjacency, no empty case and no ordering.
- **The manual reading:** absence is only ever as good as the search that looked for it. A gate
  that greps for a symbol is blind to a synonym, to a computed path, and — as this phase learned
  four separate times — to a comment.
- **Evidence produced against it:** Gates 1, 2 and 6 (§3), run over a **comment-stripped** view
  precisely because a comment naming a deleted symbol twice inflated an exact-count gate in
  05-04 and twice more in 05-05. Gate 6's four symbols measure **0 on the raw file**, which is
  stronger than the comment-stripped form the criterion permits. What remains unaddressed: none
  of these gates can see a POSIX dependency that arrives under a name nobody thought to grep for.

### FA-2 — RUN-02: the env contract's *negative* half is untestable on the vehicle

- **Why no probe applied:** the interesting property is not "does the child get the variables"
  (provable, and proven) but "does the child get them *because Drift merged the parent block*
  rather than because libuv back-filled them". No input-shaped probe distinguishes those.
- **The manual reading:** this is V-22 seen from the coverage side. On Node the two are
  indistinguishable by construction.
- **Evidence produced against it:** Gate 4, run **two-sided** — the raw `env:` count must be
  non-zero (so the allow-list filter cannot pass vacuously against a file with no spawn sites at
  all) **and** the filter must print nothing. It is the only vehicle-independent control the
  phase has for its central claim, and it is why that gate is not optional garnish.

### FA-3 — HLT-01: "succeeds for the Claude path" spans a boundary no single test crosses

- **Why no probe applied:** the requirement names `validateCaidoAuth`, which lives in `index.ts`;
  the proof lives in a spawn test that imports the spec module. No probe category spans that
  seam.
- **The manual reading:** `index.ts`'s `validateCaidoAuth(spec)` is a thin wrapper —
  `spawnAndWait(spec.command, ["--validate-auth"], { env: spec.env })` — over inputs that *are*
  proven. The residual risk is that the wrapper is mis-wired, not that the mechanism is wrong.
- **Evidence produced against it:** V-12 green locally and V-16 green on `windows-latest`, plus
  Gate 3's site inventory showing `validateCaidoAuth` has exactly one definition and two call
  sites and **neither passes a path** — both pass `spec.value`. The seam itself is V-21, and it
  is closed here only by a human read (§7).

---

## 3. The nine phase-wide static gates — executed, with raw output

Run on the working tree at `4b70d85`. Every number below is the literal output of the command
shown. None is inferred from a diff — Phase 4 recorded two exact-count gates that read zero
instead of one because a formatter wrapped an argument, while typecheck, lint and the whole
suite stayed green.

The comment-stripped view is `sed -e 's://.*::' packages/backend/src/index.ts`.

### Gate 1 — shell literals (V-5) → **1**

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c '\.sh'
1
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -n '\.sh'
1082:  return path.join(mcpTempDir, "mcp-wrapper.sh");
```

The single survivor is `getMcpWrapperPath`'s own literal — the POSIX Gemini/Codex wrapper D-01
keeps alive until Phase 7. The ladder across the phase was **5 → 3 → 2 → 1**.

### Gate 2 — chmod discrimination (V-6) → **1 spawn, 15 whole-file**

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c 'spawnAndWait("chmod"'
1
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -n 'spawnAndWait("chmod"'
1372:  const chmodResult = await spawnAndWait("chmod", ["+x", tempWrapperPath]);
$ grep -c 'chmod' packages/backend/src/index.ts
15
```

**The whole-file count of 15 is deliberately non-zero, and that is the correct result.**
`enforceOwnerOnlyDir` reaches `chmod` through the `fs/promises` **namespace**, not a shell
spawn; it re-asserts `0o700` on the token-bearing temp dir and feeds a fail-closed check. A plan
whose compliance evidence was `grep -c chmod` → `0` would have deleted a POSIX security control
and called it success. Proven untouched against the pre-phase commit:

```
$ git show cd22833:packages/backend/src/index.ts | awk '/^async function enforceOwnerOnlyDir/,/^}$/' > /tmp/e_base.txt
$ awk '/^async function enforceOwnerOnlyDir/,/^}$/' packages/backend/src/index.ts > /tmp/e_now.txt
$ diff /tmp/e_base.txt /tmp/e_now.txt
  DIFF: EMPTY — byte-identical (25 lines)
```

### Gate 3 — site inventory (V-7) → **matches the expected set exactly**

```
$ grep -n "writeMcpWrapper(\|validateCaidoAuth(\|tryRegisterMcpForProviders(\|callMcpMethod(\|writeChatMcpConfig(" packages/backend/src/index.ts
824:async function writeChatMcpConfig(
1354:async function writeMcpWrapper(spec: McpServerSpec): Promise<string | undefined> {
1386:async function validateCaidoAuth(spec: McpServerSpec): Promise<CaidoValidationResult> {
1755:  const validation = await validateCaidoAuth(spec.value);
1762:  await tryRegisterMcpForProviders(spec.value, sdk);
1987:async function callMcpMethod(
2226:    const toolsList = await callMcpMethod(spec.value, {
2260:      const response = await callMcpMethod(spec.value, {
2589:async function tryRegisterMcpForProviders(spec: McpServerSpec, sdk: BackendSDK): Promise<void> {
2592:      ? await writeMcpWrapper(spec)
2860:  const validation = await validateCaidoAuth(spec.value);
2875:  await tryRegisterMcpForProviders(spec.value, sdk);
3071:          const cfgFile = await writeChatMcpConfig(
3120:          const cfgFile = await writeChatMcpConfig(
```

| Symbol | Expected | Measured | Note |
|---|---|---|---|
| `writeMcpWrapper` | 1 def + 1 call | `1354` def, `2592` call | the one call is inside `tryRegisterMcpForProviders`, behind the win32 guard |
| `validateCaidoAuth` | 1 def + 2 calls | `1386` def, `1755` + `2860` | `refreshActiveMcpRuntime` and `startMcpServer`. **Neither passes a path** — both pass `spec.value` |
| `tryRegisterMcpForProviders` | 1 def + 2 calls | `2589` def, `1762` + `2875` | the same two orchestration sites |
| `callMcpMethod` | 1 def + 2 calls | `1987` def, `2226` + `2260` | both inside `runSharedMcpSelfTest` |
| `writeChatMcpConfig` | 1 def + 2 calls | `824` def, `3071` + `3120` | Claude and Copilot — one projection, two callers |

`refreshActiveMcpRuntime` is the site the original context document's narrative list **missed**.
It is reached from a settings save and from `syncCaidoSessionToken`, which the frontend polls as
keep-alive. Left unconverted, the first token refresh on Windows would have torn down a working
MCP runtime through its `cleanupMcpRuntime` call.

### Gate 4 — the parent-spread gate (V-22), two-sided → **raw 4, filter empty**

Half 1 — the raw count must be non-zero, so the filter cannot pass vacuously:

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -cE '(^|[[:space:],{(])env:'
4
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -nE '(^|[[:space:],{(])env:'
1388:    env: spec.env,
1998:      env: spec.env,
2405:        : spawnWithEnv(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env: options.env });
3412:        env: buildSpawnEnv({
```

Half 2 — the three-entry allow-list filter must print nothing:

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -E '(^|[[:space:],{(])env:' \
    | grep -v 'env: spec\.env' | grep -v 'env: buildSpawnEnv(' | grep -v 'env: options\.env'
[no output — exit 1]
```

**Both halves required.** The filter alone passes vacuously on a file with no env sites at all,
which is exactly what a careless deletion would produce.

### Gate 5 — dated deletion notices → **4**

```
$ grep -rn 'DELETED IN PHASE [0-9]\+ (' .github/workflows packages/backend/src | wc -l
4
.github/workflows/windows-llrt-probe.yml:1:# TEMPORARY — DELETED IN PHASE 9 (D-02).
packages/backend/src/index.ts:860:// TEMPORARY — DELETED IN PHASE 7 (PRV-03).
packages/backend/src/index.ts:967:// TEMPORARY — DELETED IN PHASE 7 (PRV-03).
packages/backend/src/index.ts:1334:// DELETED IN PHASE 7 (PRV-03).
```

This gate stays a **raw** count for the opposite reason Gates 1/2/6 are stripped: here the
comments *are* the subject, so stripping them would make it vacuously pass forever.

### Gate 6 — the launch indirection is gone → **0, 0, 0, 0**

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c 'launchCommand'         → 0
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c 'launchArgs'            → 0
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c 'launchScriptPreview'   → 0
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c 'writeLaunchScript'     → 0
```

All four are **also 0 on the raw file** — stronger than the criterion requires. This is threat
T-05-20 (severity *critical*) discharged: after the conversion `launchCommand !== resolved` is
permanently false, so `finalize()`'s guard could not have been kept "for safety" — kept alone it
becomes an unconditional `rm(resolved)`, and `resolved` is the absolute path of the user's
`claude` / `gemini` / `codex` / `copilot` binary. Guard and removal died together in one commit.

### Gate 7 — the CMP-01 compatibility tripwire (V-11) → **no change, passes**

```
$ git diff --stat cd22833 -- packages/backend/src/provider-launch.ts packages/backend/src/provider-launch.test.ts
[empty]
$ pnpm exec vitest run packages/backend/src/provider-launch.test.ts
Test Files  1 passed (1)
Tests       11 passed (11)
```

### Gate 8 — line endings (V-15) → **both present**

```
$ grep -q 'eol=lf' .gitattributes     → PRESENT
$ grep -q 'text=auto' .gitattributes  → PRESENT
```

### Gate 9 — the whole suite and both static checks (V-14) → **green**

```
$ pnpm -r typecheck   → exit 0   (shared tsc, backend tsc, frontend vue-tsc)
$ pnpm lint           → exit 0   (eslint . --max-warnings 0)
$ pnpm exec vitest run
Test Files  31 passed (31)
Tests       290 passed (290)
Duration    824ms
```

**Test count: 263 pre-phase → 290 post-phase. Zero tests were removed as obsolete.** Verified
mechanically rather than asserted: `git diff --diff-filter=D --name-only cd22833..HEAD -- '*.test.ts'`
returns nothing, and `git diff cd22833..HEAD -- '*.test.ts' | grep -E '^-\s*(it|test)\('` returns
exactly one line, which is one half of an in-place **rename**:

```
-  it("marks os.platform and os.tmpdir as gating and realpath and windowsEnv as reported only", …
+  it("marks os.platform and os.tmpdir as gating and realpath, windowsEnv and parentEnv as reported only", …
```

The `+27` breaks down as 05-01's 15 new cases and 05-03's 12. There is nothing to enumerate under
"removed as obsolete", and saying so explicitly is the point of the criterion.

---

## 4. The two gate corrections — declared, never retuned

Retuning a threshold to make it pass is prohibited. Both corrections below are declared with
their reason, in the validation contract and here.

### 4.1 V-5 — the published gate was VACUOUS, and its expected value changes 2 → 1

The published form was `test "$(grep -c '\.sh"' packages/backend/src/index.ts)" -eq 2`. It has
two independent defects.

**It was already satisfied before any work was done.** Measured on the pre-phase commit:

```
$ git show cd22833:packages/backend/src/index.ts | grep -c '\.sh"'
2
$ git show cd22833:packages/backend/src/index.ts | grep -n '\.sh"'
923:  return path.join(mcpTempDir, "mcp-wrapper.sh");
1184:  const wrapperPath = path.join(mcpTempDir, options?.name ?? "mcp-wrapper.sh");
```

The pattern counts only occurrences terminated by a double quote, so it was blind to the three
template-literal forms that were the actual deletion targets. The comment-stripped, quote-agnostic
form returns **5** on that same pre-phase tree:

```
$ git show cd22833:packages/backend/src/index.ts | sed -e 's://.*::' | grep -n '\.sh'
923, 1184, 1720 (mcp-self-test-<id>.sh), 2734 (mcp-wrapper-<sid>.sh), 2885 (provider-launch-<sid>.sh)
```

A gate that passes on the tree it exists to discriminate against proves nothing.

**Its expected value is 1, not 2.** `writeMcpWrapper`'s inline `"mcp-wrapper.sh"` join (`:1184`
pre-phase) was replaced by a call to `getMcpWrapperPath()`, leaving that one function as the
single source of truth for the surviving wrapper path. One literal, one owner.

A third, incidental reason the published form could not stand: it now returns **1** on the
shipped tree, so it would fail against its own published expectation of 2.

### 4.2 V-6 — CLOSED, not corrected

`.planning/WINDOWS.md` item 2 was opened at the close of 05-04, when the measured
`spawnAndWait("chmod"` count was 2 against a published expectation of 1. Plan 05-05 deleted
`writeLaunchScript` and took it to **1**. The published expected value is therefore **factually
correct** at the phase boundary and was left at 1. The only change is that the gate now runs over
the comment-stripped view, so a rationale comment naming the call cannot inflate it — the exact
defect that bit twice in 05-04 and twice again in 05-05.

### 4.3 The `redactDebugText` count — reconciled, not inherited

`.planning/WINDOWS.md` item 3 recorded that 05-05's acceptance criterion referenced a post-05-04
`redactDebugText` count that 05-04's summary never recorded, and that the count mechanically drops
because the same task deletes one of its two call sites. Reconciled here by measurement:

```
pre-phase (cd22833): 4        now: 3
912:  function redactDebugText(text: string): string {
3224: // …redactDebugText's JSON arm already covers it.   (comment)
3232: `Claude MCP config content:\n${redactDebugText(await readFile(...))}`
```

The property the criterion actually guards — that the redactor is neither deleted nor narrowed —
is asserted **directly** instead. Both `.replace` arms are byte-identical to the pre-phase tree:

```
$ diff <(pre-phase arms) <(current arms)
    .replace(/(CAIDO_TOKEN=)'[^']*'/g, "$1'[redacted]'")
    .replace(/("CAIDO_TOKEN"\s*:\s*)"[^"]*"/g, "$1\"[redacted]\"");
  ARMS BYTE-IDENTICAL
```

The shell arm survives deliberately, because the POSIX wrapper whose `export CAIDO_TOKEN='…'`
lines it redacts also survives. Narrowing a redactor as cosmetic cleanup fails **open**, and the
failure mode is a token in a support bundle.

---

## 5. The Windows CI evidence

Recorded **after** reading the real runs, never pre-filled. Every claim carries its run URL, its
per-step conclusions and the log line proving the mechanism. A green tick is not a claim.

### 5.1 The log-extraction pipeline was validated before it was trusted

Three separate Phase 3 plans hit a silently-empty log pipeline, which reads identically to a
proof that failed. `gh run view --log` prefixes every line with `<job>\t<step>\t<timestamp> `,
and the timestamp is separated from the content by a **space**, not a tab, so it survives a bare
`cut -f3-`. BSD `sed` interprets neither `\t` in a character class nor `\x1b`.

The pipeline used throughout this section:

```
cut -f3- | perl -pe 's/\x1b\[[0-9;]*m//g' | perl -pe 's/^\xef\xbb\xbf//' \
         | perl -pe 's/^\d{4}-\d{2}-\d{2}T[\d:.]+Z //'
```

Validated against an **independently-known nonzero expected count** before any claim was drawn
through it. The `Set up job` step prints exactly one `Current runner version:` line, so an
anchored grep must return exactly 1:

```
$ grep -c '^Current runner version:' <raw log>          → 0     ← the silent-empty failure mode
$ <raw log> | <pipeline> | grep -c '^Current runner version:'  → 1     ← expected nonzero
$ <raw log> | <pipeline> | grep '^Current runner version:'
Current runner version: '2.336.0'
```

This validation was re-run against **each** of the three job logs quoted below, not just the
first.

### 5.2 The first run was RED, and it was read rather than retried

**[Run 32376894371](https://github.com/six2dez/drift/actions/runs/32376894371)** — `Verify (Windows)`
**failure**, 2026-08-20, head `aa56d94`.

| # | Step | Conclusion |
|---|---|---|
| 1–4 | Set up job, Checkout, Setup pnpm, Setup Node | success |
| 5 | Gate: no secret material in CI configuration | success |
| 6 | Install dependencies | success |
| 7 | Typecheck | success |
| 8 | Lint | success |
| **9** | **Test** | **failure** |
| 10 | Build | skipped |

**Neither of the two candidate causes named in advance was the cause.** `05-RESEARCH.md`
§ *Verifying D-09's Measurement* named spawn timing on a slower Windows runner and pnpm's deep
tree against the Windows path-length limit (assumption A3). Install, typecheck and lint all
concluded `success`, and the spawn integration tests **passed**:

```
✓ packages/backend/src/mcp-server-spec.spawn.test.ts (2 tests) 681ms
    ✓ authenticates against a stub Caido via --validate-auth 453ms
```

The real cause was two failures in `command-resolution.test.ts` — a file this phase had **not
touched** (`git diff --stat cd22833..HEAD` over it is empty). Both were platform-flavoured `path`
behaviour, and they were at **two different layers**:

```
FAIL packages/backend/src/command-resolution.test.ts > extracts home directories from macOS and Linux-style paths
AssertionError: expected undefined to be '/Users/six2dez' // Object.is equality

FAIL packages/backend/src/command-resolution.test.ts > builds node candidates from known homes and provider-adjacent paths
AssertionError: expected [ '/usr/local/bin/node', …(6) ] to include '/Users/six2dez/.local/bin/node'
```

**Failure 1 was a production-code defect.** `extractHomeDir` classified POSIX prefixes but
normalised with `path.normalize`, which is platform-**flavoured**: on a win32 host it rewrites
`/Users/x/…` to `\Users\x\…`, so both prefix arms were dead and every input returned `undefined`.
Fixed in the code with a self-contained POSIX segment collapse. `path.posix.normalize` was
rejected deliberately — Caido's LLRT `path` surface exposes **no `posix` namespace**
(`@caido/quickjs-types/src/llrt/path.d.ts` declares a flat surface whose only separator
affordance is `sep`), and reaching for an API the shipping runtime lacks is the same class of
error as trusting a published type that omits a capability (§ Pitfall 7). POSIX behaviour was
proven **identical over 28 inputs** spanning `.`, `..`, doubled and trailing separators —
**zero divergences** — so CMP-01 holds. Teaching the function about `C:\Users\<name>` is **RES-03
and stays Phase 6's**; nothing here claims it.

**Failure 2 was a test defect.** `getNodeExecutableCandidates` derives a sibling `node` with
`path.join(path.dirname(cmd), "node")`, which is host-flavoured **by design** and correct on a
real Windows host where the command is `C:\…\claude.cmd`. The assertion hard-coded a POSIX
literal that could only hold when `path` was POSIX. The fixture now uses a **second** temp dir —
deliberately not `homeDir`, because `getNodeExecutableCandidates` already emits
`<homeDir>/.local/bin/node` from its `homeDirs` loop and an assertion underneath `homeDir` would
still pass with the provider loop deleted. Falsifiability re-proven by removing that loop: the
test fails.

Getting this distinction right is the whole of CI-03. Weakening assertion 1 would have hidden a
real bug; "fixing" the code for assertion 2 would have broken correct Windows behaviour.

### 5.3 The authoritative green run

**[Run 32378434081](https://github.com/six2dez/drift/actions/runs/32378434081)** — 2026-08-20,
head `4b70d85`, run conclusion **success**.

| Job | Conclusion |
|---|---|
| **Verify (Windows)** | **success** (84 s, 14:09:25Z → 14:10:49Z) |
| Verify (Node 20) | success |
| Verify (Node 22) | success |
| Verify (Node 24) | success |
| Verify (Node 26) | success |

`Verify (Windows)` per-step conclusions, by name:

| # | Step | Conclusion |
|---|---|---|
| 1 | Set up job | success |
| 2 | Checkout | success |
| 3 | Setup pnpm | success |
| 4 | Setup Node | success |
| 5 | Gate: no secret material in CI configuration | success |
| 6 | Install dependencies | success |
| 7 | Typecheck | success |
| 8 | Lint | success |
| 9 | Test | success |
| 10 | Build | success |
| 18–21 | Post Setup Node, Post Setup pnpm, Post Checkout, Complete job | success |

**The proving log lines, quoted verbatim from that run:**

The secret gate — proof it *executed*, not merely that the step was green (threat T-05-27):

```
Gate passed: no Caido token reference and no GitHub secrets expression in .github/workflows/ci.yml or .github/workflows/windows-llrt-probe.yml
```

The Test step — **this one line carries V-16, V-17 and V-19**:

```
 Test Files  31 passed (31)
      Tests  290 passed (290)
```

31 files and 290 tests match the local post-phase count in §3 **exactly**. Recorded separately,
because "green" and "ran" are different claims: the two integration cases were **executed, not
skipped**. `grep -icE 'skipped|todo'` over the whole Test step returns **0**, and the spawn file
reports its full case count:

```
 ✓ packages/backend/src/mcp-server-spec.spawn.test.ts (2 tests) 570ms
     ✓ authenticates against a stub Caido via --validate-auth 364ms
```

The Build step — **V-18**, with the artifact named by path rather than by `caido-dev`'s prose:

```
[*] Plugin package zip file created successfully
-rw-r--r-- 1 runneradmin 197121 2487350 Aug 20 14:10 dist/plugin_package.zip
```

`caido-dev`'s own success line names no path, so on its own it proves *a* zip, not the one
`release.yml` signs. The `test -f dist/plugin_package.zip && ls -l` was added to this step in
plan 05-06 for exactly that reason — it is what turns V-18 from a tick into a claim.

### 5.4 `timeout-minutes` — measured, and the obvious rationale was wrong

`timeout-minutes` moved from the provisional **20** to **6**, derived from three measured runs of
the `Verify (Windows)` job, all 2026-08-20:

| Run | pnpm store cache | Duration |
|---|---|---|
| [32377727473](https://github.com/six2dez/drift/actions/runs/32377727473) | **cold** — `pnpm cache is not found` | **87 s** |
| [32378144861](https://github.com/six2dez/drift/actions/runs/32378144861) | **warm** — `Cache restored successfully` | **91 s** |
| [32378434081](https://github.com/six2dez/drift/actions/runs/32378434081) | warm | **84 s** |

**Note which way round that came out.** The warm run was *slower* than the cold one. The pnpm
store cache is therefore **not** the dominant term and a cold cache is **not** the worst case —
install is roughly 8 s of a ~90 s job either way. The first draft of the comment in `ci.yml`
asserted "cold is the pessimistic install case"; the second measurement disproved it and the
comment was corrected rather than left standing. 6 minutes is ~4× the measured ~90 s.

What this ceiling does **not** guard, stated at the value so nobody later raises it for the wrong
reason: a slow spawn fails its own test timeout (15 000 ms in `mcp-server-spec.spawn.test.ts`,
5 000 ms in the transport tests) long before the job timeout fires. It bounds a hang, nothing else.

### 5.5 Scratch-branch hygiene (threat T-05-26)

No `git add -A` appears anywhere in this plan's command history; every stage was a targeted
`git add <path>`. The one untracked file in the tree — `.planning/milestone.lock`, the
orchestrator's session lock carrying a pid and session id — was never staged and never published,
the same call plan 05-02 made.

Teardown proven, not assumed. `git ls-remote` exits 0 whether or not its glob matched, so the
output was captured into a variable and discriminated with `test -z`, alongside the full
**unfiltered** listing so an empty match is provably empty rather than a mistyped pattern:

```
$ GLOB=$(git ls-remote --heads origin 'scratch/*')
---BEGIN---
---END---
RESULT: EMPTY by test -z — no scratch branch survives
(bare exit status of ls-remote, which is 0 either way and proves nothing: 0)

$ git ls-remote --heads origin
0cd81f3c0cf31bb4f7c4916bf595ec07a358b628	refs/heads/fix/security-hotfixes
2d8cf16004b40a30dfd7721d99f2bf3e2b19e270	refs/heads/main
```

---

## 6. Forward-looking notes — surfaced here, acted on elsewhere

### 6.1 Phase 7 — the surviving wrapper's persisted registrations

`registerMcpWithCli` runs `mcp add drift -- <wrapper>` for Gemini and Codex, and that entry is
persisted in **those CLIs' own config files**, outside Drift's control and outside Drift's temp
dir. A user who upgrades across this phase boundary can therefore be left with a `drift` MCP
entry in `~/.gemini` or `~/.codex` pointing at a `.sh` path that no longer exists. Phase 7
(PRV-03), which deletes the wrapper, must also `mcp remove` any stale entry a Phase-≤5 Drift left
behind — deleting the wrapper without that is a worse end state than leaving it.

### 6.2 Phase 2 — SEC-02's stakes are raised, and Phase 5 does not absorb it

`chatId` is interpolated directly into `mcp-${chatId}.json` and `copilot-mcp-${chatId}.json`.
**After this phase, Claude's file carries the literal Caido session token** (D-10), where before
it carried only a path to a wrapper. Validating `sessionId` / `chatId` against a strict character
set before path interpolation is **SEC-02, owned by Phase 2**, which is still *Not started*. The
consequence of a traversal-shaped `chatId` moved from "writes a config pointing at a wrapper" to
"writes the session token to an attacker-chosen path". Phase 2's planner should treat this as a
**severity bump on an existing finding**, not as a new one.

For the record on the same axis, D-10's accounting is a net **reduction**: the self-test
`mcp-self-test-<id>.sh` and the Claude session wrapper `mcp-wrapper-<sid>.sh` both stopped
existing, so the phase removes two token-bearing file classes and relocates one.

### 6.3 Phase 10 — UX-04 is **not** partially satisfied by anything here

UX-04 asks for `windowsHide: true` on all spawns. `05-RESEARCH.md` § L-3 enumerates LLRT's
supported `spawn` options exhaustively and **`windowsHide` is not among them** — the runtime does
not parse the option at all. Nothing in this phase moved that, and no spawn converted here should
be read as partially satisfying UX-04. Phase 10 owns it and starts from zero on this point.

### 6.4 A behaviour decision worth Phase 7's attention

The converted provider spawn injects `driftVars` **only when the MCP runtime is attached**:

```
const injectedDriftVars: Record<string, string> =
  runtimeFiles === undefined ? {} : runtimeEnv;
```

The plan text read `driftVars: runtimeEnv` unconditionally. The condition above is
character-for-character the one that used to gate the launch script's existence, so this preserves
pre-conversion behaviour exactly. Unconditional injection would have newly handed the live Caido
session token to a provider child with **no MCP server to reach** — a blast-radius increase for no
capability, in the phase whose D-10 accounting is a net reduction, and it would have broken D-04's
"behaviourally identical on POSIX" claim, which is the argument that the existing macOS/Linux
suite exercises the converted path at all.

---

## 7. Human reads

*(Filled in at the blocking checkpoint — see §7.1 and §7.2 below.)*

---

## 8. What this phase DOES claim

Deliberately last.

- **The MCP health path runs through one keystone.** `requireMcpServerSpec()` is reached from all
  three orchestration sites — `startMcpServer`, `refreshActiveMcpRuntime` and
  `runSharedMcpSelfTest` — plus both config writers. Gate 3.
- **`node` is spawned directly, with `env`.** No `chmod`, no `#!/bin/bash`, no `.sh` on any
  Windows-reachable path. Gates 1, 2, 6.
- **The token reaches the server through the spawn `env` option and the config-JSON `env` field**,
  never a shell `export`, on the Claude and self-test paths. Gate 4, V-2/V-3/V-4.
- **The launch-script indirection is gone as one set**, guard and removal together. Gate 6.
- **The surviving POSIX wrapper is unreachable on win32**, with a skip reason that names the
  provider and Phase 7 verbatim, in-product and in the README. V-8, V-9.
- **A blocking `windows-latest` leg exists with a real green run behind it**, carrying the D-10
  no-secret-material gate in its three-arm form. §5.3.
- **macOS/Linux behaviour is preserved.** 290 tests green, `provider-launch.ts` and
  `provider-launch.test.ts` byte-unchanged, `enforceOwnerOnlyDir` byte-identical. Gates 7, 2, 9.

Each of those is bounded by §1. Read them together or not at all.

---

*Phase: 05-kill-shell-wrappers*
*Report written: 2026-08-20*
