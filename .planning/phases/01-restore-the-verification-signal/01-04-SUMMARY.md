---
phase: 01-restore-the-verification-signal
plan: 04
subsystem: testing
tags: [eslint, lint-debt, vue, no-v-html, dompurify, vitest, cross-version, node-26, prettier, verification-gate]

# Dependency graph
requires: ["01-01", "01-02", "01-03"]
provides:
  - "`pnpm lint` exits 0 at --max-warnings 0 across 62 files: 0 errors, 0 warnings"
  - "Negative lint proof: the gate is measured exiting 1 on a real error and leaving no trace"
  - "Full suite green with identical counts (23 files / 131 tests) on Node 22.23.2, 24.13.0 and 26.7.0"
  - "vue/no-v-html stays globally enabled; the single legitimate use carries a closed element-scoped disable/enable pair"
  - "CMP-inv and V2-inv both hold against the working tree — Phase 5-8 spawn path byte-untouched"
affects: [01-05, 01-06, 999.11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Element-scoped `eslint-disable` / `eslint-enable` pair in Vue templates, placed outside the start tag, with the rationale in its own separate HTML comment (never the `--description` form)"
    - "Negative-control probe as a first-class gate step: a lint/test gate is not believed until it is observed failing"
    - "Cross-version suite invoked via `node node_modules/vitest/vitest.mjs` so the package-manager shim cannot silently resolve a different Node"

key-files:
  created: []
  modified:
    - packages/backend/assets/mcp-server.mjs
    - packages/backend/src/index.ts
    - packages/backend/src/claude-print.test.ts
    - packages/frontend/src/components/chat/MessageBubble.vue

key-decisions:
  - "Only `claude-print.test.ts:217` converted to const — the file's three other `let state` declarations are genuinely reassigned, so the plan's literal grep-count-0 acceptance criterion is unsatisfiable and was replaced with a line-scoped assertion plus ESLint's own verdict"
  - "SIG-01 and SIG-02 deliberately NOT closed: SIG-01 requires Node 20 (CI-only, plan 01-06) and SIG-02 requires 'CI fails on lint errors' (plan 01-05, concurrent). REQUIREMENTS.md intentionally untouched, following the 01-03 precedent"
  - "Rationale for the v-html disable verified against the live `<script setup>` before being written, not assumed from the plan text"

patterns-established:
  - "A suppression comment must state a fact that was checked at the moment of writing; if the fact cannot be verified, the finding is real and the suppression is not written"

requirements-completed: []  # SIG-01 and SIG-02 both have halves owned by concurrent/later plans — see "Requirement Status"

# Metrics
duration: 12min
completed: 2026-08-12
---

# Phase 1 Plan 04: Close the Lint Debt and Prove the Gate Summary

**The repo now lints clean at `--max-warnings 0` across 62 files and the suite is green with identical counts on Node 22, 24 and 26 — and both claims are backed by negative controls rather than by a zero that could equally mean the checker never ran.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3 of 3
- **Files modified:** 4 (0 created, 4 modified)

## Accomplishments

- **Lint debt closed at the source.** 3 errors + 3 warnings → 0/0, with no rule-off entries added to `eslint.config.mjs` and no blanket suppressions.
- **The gate is proven to bite.** A deliberate `const unused = 1;` probe made `pnpm lint` exit `1` naming `@typescript-eslint/no-unused-vars`; after deletion the gate returned to `0` with no git trace. Without this step, "0 problems" and "linted nothing" are the same observation.
- **The Node 26 regression is confirmed dead.** `ChatView.mount.test.ts` — the file that carried all 5 failures — passes on all three legs. All three report **23 files / 131 tests / 0 failed**, identical counts, so the legs provably exercise the same code paths.
- **The XSS sink kept its tripwire.** `vue/no-v-html` remains enabled globally; only the one legitimate element is suppressed, and the suppression is closed by a matching `eslint-enable` so the rest of the file stays covered.
- **The Phase 5-8 spawn path is byte-untouched.** The entire phase's change to `packages/backend/src/index.ts` is 2 diff lines.

## Task Commits

1. **Task 1: Clear the three remaining lint errors** — `ae249dc` (fix)
2. **Task 2: MessageBubble attribute order + element-scoped vue/no-v-html disable** — `06e2e18` (fix)
3. **Task 3: Phase-local green gate** — verification only, no files modified, no commit

## Files Modified

- `packages/backend/assets/mcp-server.mjs` — `:278` now `throw new Error(\`GraphQL request timed out after ${timeoutMs}ms\`, { cause: error });`. Message string byte-identical; the bare `throw error;` at `:280` untouched.
- `packages/backend/src/index.ts` — `:710` dead initialiser dropped: `let current: Record<string, ApprovalDecision>;`.
- `packages/backend/src/claude-print.test.ts` — `:217` `let state` → `const state`.
- `packages/frontend/src/components/chat/MessageBubble.vue` — `style`/`class` reordered above `v-html`; closed `eslint-disable` / `eslint-enable vue/no-v-html` pair added outside the start tag with a verified rationale.

## Verification Evidence

### Task 1

| Check | Result |
|---|---|
| `eslint` on the 3 files `--max-warnings 0` | exit `0` |
| `grep -c 'cause: error' mcp-server.mjs` | `1` |
| `grep -c 'GraphQL request timed out after' mcp-server.mjs` | `1` (message unchanged) |
| `grep -c '^\s*throw error;' mcp-server.mjs` | `2` — unchanged from pre-edit baseline `2` |
| `grep -v '^\s*//' index.ts \| grep -c 'let current: ... = {}'` | `0` |
| `pnpm exec vitest run packages/backend` | **9 files / 47 tests / 0 failed** (all 3 `mcp-server.*.test.ts` green) |
| `pnpm -r typecheck` | exit `0` (definite-assignment still satisfied) |
| Token counts in `index.ts` | `renderExportExecScript`=4, `writeMcpWrapper`=4, `writeLaunchScript`=3, `shellQuote`=3, `chmod`=4 — all at baseline |

### Task 2

| Check | Result |
|---|---|
| `eslint MessageBubble.vue --max-warnings 0` | exit `0` |
| `pnpm --filter frontend typecheck` (`vue-tsc --noEmit`) — parse proof 1 | exit `0` |
| `vitest run MessageBubble.test.ts` (mounts the SFC) — parse proof 2 | **1 file / 7 tests / 0 failed** |
| `grep -c 'eslint-disable vue/no-v-html'` | `1` |
| `grep -c 'eslint-enable vue/no-v-html'` | `1` |
| `grep -cE 'eslint-disable([[:space:]]+--[^-]\|[[:space:]]*(-->\|\*/\|$))'` | `0` (no blanket disable) |
| `grep -cE 'eslint-disable[[:space:]]+--[[:space:]]'` | `0` (no description form) |
| `grep -c 'vue/no-v-html' eslint.config.mjs` | `0` (rule still globally enabled) |
| `grep -c 'vue/comment-directive' eslint.config.mjs` | `0` (not disabled to make this work) |
| Attribute order | `style` `:109`, `class` `:110`, both **below** `v-html` `:111` |
| Diff vs `2c169d0` | `-1` removed (≤3), `+6` added (≤9) |

**Rationale verified before writing, not assumed.** `md = new MarkdownIt({ html: false, linkify: true, breaks: true })` at `:18` and `renderedHtml` returns `DOMPurify.sanitize(md.render(...))` at `:23`. Both facts hold in the current code, so the suppression is not silencing a real finding.

### Task 3 — the green gate

| Step | Check | Result |
|---|---|---|
| A | `pnpm lint` | exit **`0`** |
| SIG-02d | `eslint . --max-warnings 0 --format json` | **62 files, errorCount `0`, warningCount `0`** |
| SIG-02c | Linted-file count ≥ 59 | **62** ✅ — set includes `mcp-server.mjs`, `eslint.config.mjs`, `vitest.setup.ts`, `__storage-shim.test.ts` (all `true`) |
| B / SIG-02f | `pnpm lint` **with** probe | exit **`1`**, named `@typescript-eslint/no-unused-vars` |
| B / SIG-02f | `pnpm lint` **after** deleting probe | exit **`0`** |
| B / SIG-02f | `git status --porcelain -- __lint-negative-probe.ts` | *(empty — no trace)* |
| C / SIG-01a | Node **26.7.0** `pnpm exec vitest run` | **23 files / 131 tests / 0 failed** |
| C / SIG-01b | Node **22.23.2** direct vitest | **23 files / 131 tests / 0 failed** |
| C / SIG-01c | Node **24.13.0** direct vitest | **23 files / 131 tests / 0 failed** |
| C | Counts identical across all three legs | ✅ yes |
| C | `grep -rcE '(describe\|it\|test)\.only' ... \| wc -l` | `0` |
| D | `pnpm build` | exit `0`; `dist/drift.zip` present (601,585 bytes) |
| E | `pnpm -r typecheck` | exit `0` |
| F | `prettier --check` on the 5 phase-owned files | exit `0` — "All matched files use Prettier code style!" |

**No sweep happened.** `pnpm format` / `prettier --write` were never run. `git diff 2c169d0 --name-only -- packages/` lists **exactly the seven expected paths**:

```
packages/backend/assets/mcp-server.mjs
packages/backend/src/claude-print.test.ts
packages/backend/src/index.ts
packages/frontend/src/__storage-shim.test.ts
packages/frontend/src/components/chat/MessageBubble.vue
packages/frontend/src/stores/settings.test.ts
packages/frontend/src/stores/settings.ts
```

### G — invariants (working-tree form, single-commit `git diff 2c169d0 -- <path>`)

**CMP-inv — both greps produced no output:**

```
$ git diff 2c169d0 --name-only | grep -E 'provider-launch\.ts|command-resolution\.ts'
(no output)

$ git diff 2c169d0 -- packages/backend/src/ | grep -E '^[-+]' | grep -v '^[-+][-+]' \
    | grep -E 'renderExportExecScript|writeMcpWrapper|writeLaunchScript|shellQuote|chmod'
(no output)
```

`git diff 2c169d0 --name-only | grep -cE 'provider-launch\.ts|command-resolution\.ts|mcp-runtime\.ts|persistence\.ts'` → `0`.

**V2-inv — all five conditions hold:**

| Assertion | Result |
|---|---|
| `grep -c 'async function startMcpServer'` | `1` (anchor unique) |
| `grep -A 10 ... \| grep -c 'caidoToken === ""'` | `1` |
| `grep -A 10 ... \| grep -c 'setMcpAuthStatus("invalid", message)'` | `1` |
| `grep -A 10 ... \| grep -c 'return err(message)'` | `1` |
| `grep -c 'No Caido access token is available' index.ts` | `6` — unchanged baseline |
| `git diff 2c169d0 -- index.ts \| grep -E '^[-+]' \| grep -v '^[-+][-+]' \| wc -l` | `2` |

The fail-closed empty-token abort is structurally intact and the phase's only `index.ts` change is the single `no-useless-assignment` line.

## Deviations from Plan

### 1. [Plan-spec defect] Task 1's `let state` acceptance criterion is unsatisfiable as literally written

- **Found during:** Task 1
- **Criterion:** `grep -c 'let state = consumeClaudePrintChunk' packages/backend/src/claude-print.test.ts` returns `0`.
- **Issue:** The file contains **four** such declarations — `:109`, `:148`, `:217`, `:264`. Only `:217` is flagged by `prefer-const`. The other three are genuinely reassigned (`state = consumeClaudePrintChunk(...)` at `:128`, `:166`, `:185`, `:297`), so converting them to `const` would be a TypeScript error ("Cannot assign to 'state' because it is a constant") and would break three passing tests. Driving the count to `0` is impossible without breaking the suite.
- **Resolution:** Followed the plan's **action** text, which is correct and explicitly anticipates this ("only if `state` is never reassigned inside that `it` block … if it is reassigned, the correct fix is different and you should report rather than force it"). Converted `:217` only. The AC apparently assumed a single declaration in the file.
- **Substitute assertion (satisfiable, and strictly stronger):** `sed -n '217p'` → `    const state = consumeClaudePrintChunk(`, **and** ESLint reports `0` `prefer-const` findings repo-wide. ESLint's scope analysis is the authoritative check here — it is what identified `:217` as the only convertible site in the first place.
- **Residual count:** `grep -c 'let state = consumeClaudePrintChunk'` → `3` (expected and correct).
- **Files modified:** none beyond the planned one-line change. **Commit:** `ae249dc`

### 2. [Rule 3 - Blocking] `rm` is shell-aliased to interactive mode

- **Found during:** Task 3 step B
- **Issue:** `rm <probe>` emitted a confirmation prompt and left the file on disk, which would have falsely failed the "probe leaves no trace" assertion.
- **Fix:** Used the unaliased binary `/bin/rm -f`. Verified deletion with `ls` (No such file) and `git status --porcelain -- __lint-negative-probe.ts` (empty).
- **Files modified:** none.

### Not a deviation — baseline was 3 errors, not 4

The plan and the wave-1 handoff both predicted this: `packages/frontend/src/stores/settings.ts:78` was already cleared by plan `01-01`, so the measured starting point was **3 errors / 3 warnings**, exactly matching the plan's Task 1 note. `settings.ts` was not touched.

## Requirement Status

**Neither SIG-01 nor SIG-02 is closed by this plan**, despite both appearing in the plan frontmatter's `requirements:` field. That field records which requirements a plan *contributes to*; closure needs the whole requirement to be true.

| Requirement | Text (REQUIREMENTS.md) | Status after this plan |
|---|---|---|
| **SIG-01** | green on Node **20**, 22, 24 and **26** + guarded `localStorage` access | Node 22/24/26 legs proven green here. **Node 20 has no local binary** — it is CI-only, observed on the matrix leg in plan `01-06`. |
| **SIG-02** | real ESLint + flat config + **passes `--max-warnings 0`** + no `--fix` on CI path + **CI fails on lint errors** | The `--max-warnings 0` half (SIG-02d) is satisfied here. The **"CI fails on lint errors"** half is owned by plan `01-05`, running concurrently in this same wave. |

`requirements-completed` is therefore `[]`, following the precedent plan `01-03` set for exactly this reason. Marking either requirement done here would assert a green gate that does not yet exist — the specific defect class this phase was created to eliminate.

**REQUIREMENTS.md was intentionally not modified.** It is touched by sibling plans in this wave; editing it from a worktree would manufacture a merge conflict for zero benefit.

## Issues Encountered

**`node_modules` absent in the worktree.** Expected (gitignored, worktrees start bare). Ran `pnpm install --frozen-lockfile` first — completed in 2.5s with ESLint 10.8.1 and the rest of the wave-1 toolchain resolved from the committed lockfile. Lockfile untouched; no `git status` entry.

## Known Stubs

None. No placeholder values, empty returns, or unwired data paths were introduced. The one suppression added (`vue/no-v-html`) is element-scoped, closed by a matching `eslint-enable`, and justified by two verified runtime sanitizers.

## Threat Flags

None. This plan adds no network endpoints, auth paths, file-access patterns, or schema changes. No new security-relevant surface was introduced — the only edits are one error-cause attachment, two dead-code removals, and an attribute reorder plus comments.

Threat register dispositions, all `mitigate`, all applied:

- **T-01-14** (`vue/no-v-html`) — rule left enabled at config level (`grep` = `0` in `eslint.config.mjs`); single use wrapped in a closed disable/enable pair; rationale verified against `html: false` at `:18` and `DOMPurify.sanitize` at `:23`; blanket and `--description` forms both asserted absent.
- **T-01-14b** (unparseable SFC passing grep-only checks) — both parse proofs green: `vue-tsc --noEmit` exit `0` and the `mount()`ing test 7/7 passed.
- **T-01-15** (`pnpm lint` falsely reporting 0) — negative probe forced exit `1` before the clean result was believed.
- **T-01-16** (`preserve-caught-error` altering MCP semantics) — only `{ cause: error }` appended; message byte-identical; `throw error;` count unchanged at `2`; all three `mcp-server.*.test.ts` green.
- **T-01-17 / T-01-17b** (scope-fence breach / Prettier sweep) — CMP-inv clean against the working tree; token counts at baseline; `pnpm format` never run; only 7 expected paths changed under `packages/`.
- **T-01-18** (token guard failing open) — V2-inv structurally re-confirmed; abort-string count `6`; total `index.ts` change is 2 diff lines.
- **T-01-19** (committed `it.only`) — `no-focused-tests` active and `.only` grep returns `0`; absolute count of 131 tests asserted.
- **T-01-SC** — this plan installed nothing new (`--frozen-lockfile` only).

## Next Phase Readiness

**Ready for plan `01-05` (CI wiring).** `pnpm lint` is a single self-contained gate — `eslint . --max-warnings 0` — that exits `0` on this tree and is measured exiting `1` on a real error. The workflow needs no extra flags; adding `--fix` at the CI call site is the one thing `01-05` must not do. Once `01-05` lands, **SIG-02 is closable**.

**Ready for plan `01-06` (matrix).** Node 22/24/26 are proven green locally with identical counts, so any CI-only failure on those legs is an environment difference, not a code difference. Node 20 remains the single unobserved leg and is `01-06`'s job; once green, **SIG-01 is closable**.

**Carried forward:** the repo-wide Prettier sweep stays parked at ROADMAP `### Phase 999.11` — 46 files under `packages/**/src` are not Prettier-clean, and sweeping them would rewrite the five fenced spawn-path identifiers that Phases 5-8 own.

## Self-Check: PASSED

| Claim | Result |
|---|---|
| `packages/backend/assets/mcp-server.mjs` | FOUND |
| `packages/backend/src/index.ts` | FOUND |
| `packages/backend/src/claude-print.test.ts` | FOUND |
| `packages/frontend/src/components/chat/MessageBubble.vue` | FOUND |
| `.planning/phases/01-restore-the-verification-signal/01-04-SUMMARY.md` | FOUND |
| commit `ae249dc` (Task 1) | FOUND |
| commit `06e2e18` (Task 2) | FOUND |
| `__lint-negative-probe.ts` absent (probe left no trace) | CONFIRMED ABSENT |
| Working tree clean before SUMMARY commit | CONFIRMED |

---
*Phase: 01-restore-the-verification-signal*
*Completed: 2026-08-12*
