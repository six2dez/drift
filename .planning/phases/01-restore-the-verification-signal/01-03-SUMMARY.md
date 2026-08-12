---
phase: 01-restore-the-verification-signal
plan: 03
subsystem: testing
tags: [eslint, eslint-flat-config, typescript-eslint, eslint-plugin-vue, prettier, vitest-eslint-plugin, pnpm, linting, supply-chain]

# Dependency graph
requires: []
provides:
  - "ESLint 10.8.1 toolchain installed as 8 exact-pinned root devDependencies with pnpm-lock.yaml in the same commit"
  - "Root eslint.config.mjs flat config covering TypeScript, Vue SFCs, .mjs, and test files"
  - "`pnpm lint` = `eslint . --max-warnings 0` with zero --fix on the CI path; --fix isolated to `pnpm lint:fix`"
  - "Repo-wide lint surface: 60 files, including packages/backend/assets/mcp-server.mjs which the old glob never reached"
  - "Measured residual baseline for plan 01-04: 4 errors, 3 warnings across 5 of 60 files"
  - "`pnpm format` glob widened to reach root-level *.{ts,mjs} config files"
affects: [01-04, 01-05, 999.10, 999.11]

# Tech tracking
tech-stack:
  added:
    - "eslint 10.8.1"
    - "@eslint/js 10.0.1"
    - "typescript-eslint 8.67.0"
    - "eslint-plugin-vue 10.10.0"
    - "vue-eslint-parser 10.4.1"
    - "eslint-config-prettier 10.1.8"
    - "globals 17.11.0"
    - "@vitest/eslint-plugin 1.6.27"
  patterns:
    - "Single root flat config; per-package differences are files:-scoped entries in one array"
    - "eslint-config-prettier/flat as the final config entry so linter and formatter cannot disagree"
    - "vue-eslint-parser stays top-level for .vue; TS parser nested under parserOptions.parser"
    - "Auto-fix segregated into a separate script name so CI can never invoke it"

key-files:
  created:
    - eslint.config.mjs
  modified:
    - package.json
    - pnpm-lock.yaml
    - caido.config.ts
    - CLAUDE.md
    - .planning/codebase/STACK.md
    - .planning/codebase/CONVENTIONS.md

key-decisions:
  - "Exact pins (-E) for all 8 new devDependencies, overriding RESEARCH's ^ ranges — house convention is 11/11 exact-pinned at the root"
  - "--max-warnings 0 shipped on day one rather than after 01-04 clears the debt: the measured residual is small and a ratchet with slack is a ratchet that slips"
  - "vue/no-v-html deliberately left enabled; MessageBubble.vue gets a justified inline disable in plan 01-04 so the rule stays a tripwire"
  - "Type-aware linting (recommendedTypeChecked) deliberately deferred to backlog 999.10 — measured 49 errors, 33 of them parse errors"
  - "globals' publish-time `prepare` script assessed as inert for registry installs rather than treated as an audit contradiction (evidence recorded below)"

patterns-established:
  - "Lint scripts: `lint` is the gate (never fixes), `lint:fix` is the local convenience entry point"
  - "Any doc claim about tooling reach must be updated in the same commit that changes that reach"

requirements-completed: []  # SIG-02 is INTENTIONALLY NOT closed here — see "Requirement Status" below.

# Metrics
duration: 13min
completed: 2026-08-12
---

# Phase 1 Plan 03: Install a Real ESLint 10 Toolchain Summary

**ESLint 10.8.1 flat config at the repo root replaces a `pnpm lint` script that named an uninstalled binary and carried `--fix` — the lint surface went from a stale `packages/**/src` glob to 60 files repo-wide, including the 829-line `mcp-server.mjs` it never reached.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-08-12T13:24:00Z
- **Completed:** 2026-08-12T13:37:00Z
- **Tasks:** 2 of 2
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- **The linter is real.** `pnpm exec eslint --version` prints `v10.8.1`. Before this plan, `pnpm lint` invoked a binary the repo did not have installed.
- **The false-pass channel is closed.** `scripts.lint` is `eslint . --max-warnings 0` with no `--fix` anywhere on it. `--fix` exists only in `scripts["lint:fix"]`, which CI never calls. This was the plan's actual danger: in CI the old script would have rewritten source in the runner's checkout, reported success, and discarded the changes.
- **The lint surface is provably repo-wide.** 60 files linted, confirmed to include `packages/backend/assets/mcp-server.mjs` (829 lines, invisible to the old `./packages/**/src` glob) and `eslint.config.mjs` itself.
- **No reparse overhead.** Config named `eslint.config.mjs`, so `MODULE_TYPELESS_PACKAGE_JSON` count is 0.
- **Eight stale documentation claims corrected** — four about ESLint, four about Prettier (the latter invalidated by this plan's own glob widening).

## Task Commits

1. **Task 1: Install the ESLint stack exact-pinned and rewrite the package scripts** — `d67e034` (chore)
2. **Task 2: Write eslint.config.mjs, prove the lint surface, correct the stale ESLint docs** — `320da35` (feat)

## Files Created/Modified

- `eslint.config.mjs` — **created.** Root flat config: `js.recommended` + `tseslint.recommended` + `vue flat/recommended`, `files:`-scoped globals per package, `@vitest/eslint-plugin` on `**/*.test.ts`, `eslint-config-prettier/flat` last.
- `package.json` — 8 exact-pinned devDependencies added; `lint` / `lint:fix` / `format` scripts rewritten.
- `pnpm-lock.yaml` — resolved tree for the 8 new devDependencies (+76 packages). Committed in the same commit as `package.json`.
- `caido.config.ts` — whitespace-only Prettier reformat (one over-long `description:` line wrapped), now that the widened glob reaches it.
- `CLAUDE.md` — 4 stale claims corrected (2 ESLint, 2 Prettier).
- `.planning/codebase/STACK.md` — same 2 claims corrected in the codebase map source.
- `.planning/codebase/CONVENTIONS.md` — same 2 claims corrected in the codebase map source.

## Verification Evidence

| Check | Result |
|---|---|
| `pnpm exec eslint --version` | `v10.8.1` |
| `node -p "require('./package.json').scripts.lint"` | `eslint . --max-warnings 0` |
| `node -p "require('./package.json').scripts['lint:fix']"` | `eslint . --fix` |
| Exact pins on all 8 packages | `pins OK` |
| devDependencies sorted + zero range specifiers | `sorted+exact OK` |
| `pnpm lint 2>&1 \| grep -c MODULE_TYPELESS` (SIG-02b) | `0` |
| Linted-file count (SIG-02c) | **60** (threshold ≥ 59) |
| `mcp-server.mjs` and `eslint.config.mjs` in linted set | both present |
| `grep -c -- "--fix" eslint.config.mjs` (SIG-02e, config half) | `0` |
| `grep -c 'vue/no-v-html' eslint.config.mjs` | `0` (rule left enabled) |
| `grep -c 'parserOptions: { parser: tseslint.parser }'` | `1` |
| `grep -c 'vitest.configs.recommended'` | `1` |
| Last non-empty line before `);` | `prettier,` |
| `test -f eslint.config.js` | fails (correct — `.mjs` only) |
| `pnpm exec prettier --check caido.config.ts eslint.config.mjs` | exit `0` |
| `pnpm typecheck` | passes (shared, backend, frontend) |
| `pnpm lint` exit code | `1` — **expected**; residual debt is plan 01-04's scope |
| `git status --porcelain` (full) vs path-scoped to the 7 plan files | identical — nothing outside `files_modified` changed |

**Plugin scoping proven, not assumed:** `eslint --print-config` on `claude-print.test.ts` resolves 17 `vitest/*` rules with `vitest/no-focused-tests` at error level; the same command on `index.ts` resolves 0 `vitest/*` rules. The `{ files: [...], ...vitest.configs.recommended }` spread does not clobber the `files` key.

## Baseline for Plan 01-04

`pnpm lint` currently exits `1`. **4 errors, 3 warnings, across 5 of 60 files.** Of these, 1 error and 2 warnings are auto-fixable.

| Severity | Location | Rule |
|---|---|---|
| ERROR | `packages/backend/assets/mcp-server.mjs:278:7` | `preserve-caught-error` — no `cause` attached to the rethrown error |
| ERROR | `packages/backend/src/index.ts:710:7` | `no-useless-assignment` — dead initialiser for `current` |
| ERROR | `packages/frontend/src/stores/settings.ts:78:9` | `no-useless-assignment` — dead initialiser for `token` (same function as the SIG-01 guard in plan 01-01) |
| ERROR | `packages/backend/src/claude-print.test.ts:217:9` | `prefer-const` — `let state` → `const state` |
| WARNING | `packages/frontend/src/components/chat/MessageBubble.vue:105:7` | `vue/no-v-html` — keep the rule; needs the closed inline disable pair |
| WARNING | `packages/frontend/src/components/chat/MessageBubble.vue:106:7` | `vue/attributes-order` — `style` before `v-html` |
| WARNING | `packages/frontend/src/components/chat/MessageBubble.vue:107:7` | `vue/attributes-order` — `class` before `v-html` |

The 4 errors match RESEARCH's `## Measured Lint Debt` table exactly, file and line.

**Warning-count reconciliation (important for 01-04):** RESEARCH reports "4 errors, 20 warnings" but states that figure was measured with *the config in Pattern 3 minus the two `vue/*-hyphenation` overrides*. This plan shipped those overrides plus the test-file `vue/one-component-per-file` override, which suppress 11 + 3 + 3 = 17 of the 20 by configuration. **3 warnings is the correct post-config baseline, not a discrepancy.** Plan 01-04 needs to close 4 errors + 3 warnings, not 4 + 20.

## Requirement Status

**SIG-02 is deliberately left open.** REQUIREMENTS.md defines it as: *"`pnpm lint` invokes a real, installed ESLint with a committed flat config for TypeScript and Vue, **passes with `--max-warnings 0`**, and carries no `--fix` on the CI path; **CI fails on lint errors**."*

| Sub-criterion | Status | Owner |
|---|---|---|
| SIG-02a — real, installed ESLint 10 | ✅ satisfied here | 01-03 |
| SIG-02b — committed flat config, loads warning-free | ✅ satisfied here | 01-03 |
| SIG-02c — lint surface is repo-wide (≥ 59 files) | ✅ satisfied here | 01-03 |
| SIG-02e — no `--fix` in `package.json` | ✅ satisfied here | 01-03 |
| SIG-02d — passes with `--max-warnings 0` | ❌ open (4 errors, 3 warnings) | **01-04** |
| SIG-02e — no `--fix` in `ci.yml`; CI fails on lint errors | ❌ open | **01-05** |

`requirements-completed` is therefore an empty list. Marking SIG-02 done here would assert a green gate that does not exist — the exact defect class this phase was created to eliminate. REQUIREMENTS.md was intentionally not modified (it is also touched by sibling wave-1 plans, so an edit here would manufacture a merge conflict for zero benefit).

## Decisions Made

1. **Exact pins over RESEARCH's `^` ranges.** All 11 pre-existing root devDependencies are exact-pinned with no caret; carets appear only in `packages/frontend/package.json`. Installed with `-E`. House convention wins, as 01-PATTERNS.md recommended.
2. **`--max-warnings 0` on day one.** Measured residual with the tuned rule config is small and fully enumerated above, so there is nothing to grandfather. Placing it in the script rather than only in the CI invocation gives local and CI runs one source of truth.
3. **Comment placement in `eslint.config.mjs`.** RESEARCH Pattern 3 puts the "MUST be last" note as a trailing comment on the `prettier,` line. Moved above the line instead, so the acceptance assertion "last non-empty line before `);` is `prettier,`" is literally satisfiable.
4. **`vue/no-v-html` and `--fix` are absent from the config file entirely** (not merely un-disabled), so the two `grep -c ... = 0` tripwires stay meaningful rather than being defeated by a passing mention in a comment.

## Deviations from Plan

None — plan executed as written. No deviation rules were triggered; no bugs, missing functionality, or blocking issues were encountered.

## Issues Encountered

**1. `globals@17.11.0` ships a `prepare` lifecycle script — investigated, assessed inert, not a halt.**

The plan's supply-chain gate says to stop if the install output mentions a lifecycle script for any of the eight packages, because RESEARCH's audit recorded `postinstall: none` for all eight. pnpm's install output mentioned none. An independent check of the installed `package.json` files was run anyway, and it found `globals` declares `"prepare": "npm run build"`.

Assessed as **not contradicting the audit**, on four pieces of evidence:

- The audit column was specifically `postinstall`. `globals` has no `postinstall`, no `preinstall`, and no `install` script. The record is accurate as written.
- `prepare` is a publish-time / git-dependency script. npm and pnpm do not run a dependency's `prepare` when installing a resolved registry tarball, which is how `globals` was installed (`pnpm why globals` → direct root devDependency, registry source).
- It is **structurally unrunnable** from the published tarball. The installed package contains only `globals.json`, `index.d.ts`, `index.js`, `license`, `package.json`, `readme.md`. There is no `scripts/` directory, so the `generate-data.mjs` / `generate-types.mjs` targets the script chains to do not exist, and `run-s` is not a dependency (`globals` has zero dependencies).
- `pnpm-lock.yaml` contains no `requiresBuild` entries, confirming pnpm resolved nothing as needing a build step.

Verified per-package: all eight report `lifecycle=none` except `globals` (`prepare` only). **No lifecycle script executed during this install.**

Recommendation for future audits: record the full lifecycle set (`preinstall`, `install`, `postinstall`, `prepare`) rather than `postinstall` alone, so this reconciliation does not have to be redone.

**2. `node_modules` absent in the parallel-execution worktree.** Expected — `node_modules/` is gitignored and worktrees start bare. Ran `pnpm install --frozen-lockfile` first to establish a clean baseline (lockfile untouched, `git status` clean) before `pnpm add`, so the lockfile diff contains only the 8 new packages and their tree.

## Known Stubs

None. No placeholder values, empty returns, or unwired data paths were introduced.

## Threat Flags

None. This plan adds no network endpoints, auth paths, file-access patterns, or schema changes. The only new trust boundary — npm registry into `node_modules` — was already enumerated in the plan's threat register (T-01-SC, T-01-13) and is addressed in "Issues Encountered" above.

Threat register dispositions, all `mitigate`, all applied:

- **T-01-SC / T-01-13** (malicious package or postinstall) — exact pins, lockfile in the same commit, install output inspected, per-package lifecycle check run, no build scripts executed.
- **T-01-09** (`--fix` on a CI-reachable path) — asserted `0` occurrences in both `scripts.lint` and `eslint.config.mjs`.
- **T-01-10** (ESLint exiting `0` after linting zero files) — asserted 60 files with `mcp-server.mjs` named explicitly, not just a non-`2` exit code.
- **T-01-11** (silencing a security-relevant rule) — `vue/no-v-html` is enabled and actively firing on `MessageBubble.vue:105`. The only two rules disabled are non-security formatting rules whose every finding is PrimeVue's camelCase public API.
- **T-01-12** (lockfile drift) — `pnpm-lock.yaml` and `package.json` are in commit `d67e034` together.

## Next Phase Readiness

**Ready for plan 01-04** (clear the residual debt) — the exact 4 errors and 3 warnings are enumerated above with file:line and rule, and the warning-count reconciliation removes the ambiguity between RESEARCH's pre-override figure and the shipped config.

**Ready for plan 01-05** (CI wiring) — `pnpm lint` is a single self-contained gate (`eslint . --max-warnings 0`); the workflow needs no extra flags, and adding `--fix` at the CI call site is the one thing 01-05 must not do.

**Coordination notes:**

- `vitest.setup.ts` and `vitest.config.ts` are already covered by this plan's config entries (`*.config.ts`, `vitest.setup.ts` get Node globals) and by the widened `format` glob, but were deliberately **not** written to here — plan 01-02 owns them in this same wave. Once 01-02 lands, `vitest.setup.ts` and `packages/frontend/src/__storage-shim.test.ts` join the lint set, taking the settled count to ~62. Plan 01-04 task 3 re-asserts it.
- `settings.ts:78` carries one of the 4 errors and is also touched by plan 01-01's SIG-01 guard in this same wave. Plan 01-04 folds the fix in, as planned.
- `.nvmrc` (`20`), `engines.node` (`>=20`), and the `build` / `watch` / `typecheck` scripts were left untouched, as specified.

---
*Phase: 01-restore-the-verification-signal*
*Completed: 2026-08-12*
