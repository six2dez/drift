---
phase: 1
slug: restore-the-verification-signal
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-12
---

# Phase 1 — Validation Strategy

> Per-phase validation contract. Derived from `01-RESEARCH.md` → `## Validation Architecture`.
>
> **The Nyquist argument for this phase:** the defect being fixed is *version-conditional*. Sampling at one Node version — at any frequency — cannot detect it. The minimum honest sampling rate for SIG-01 is **one run per Node major per merge**, and the CI matrix is what makes that affordable. This phase's own failure mode is that it certifies itself green on a Node version where the bug does not exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (root config, single project — no workspace/projects) — already installed, no Wave 0 framework install needed |
| **Config file** | `vitest.config.ts` (repo root) — gains `setupFiles`, loses the dead `environmentMatchGlobs` block |
| **Setup file** | `vitest.setup.ts` (repo root) — **new, Wave 0** |
| **Environments** | `node` by default; `happy-dom` per file via `// @vitest-environment happy-dom` docblock (7 files) |
| **Quick run command** | `pnpm exec vitest run <path>` |
| **Full suite command** | `pnpm exec vitest run` (22 files, 125 tests, ~1 s) |
| **Lint command** | `pnpm exec eslint . --max-warnings 0` (59 files) |
| **Typecheck command** | `pnpm -r typecheck` (tsc ×2 + vue-tsc) |
| **Estimated runtime** | ~1 s suite; ~5 s lint; ~15 s typecheck |

**Local Node binaries available for cross-version runs:**

| Version | Path | Reproduces the bug? |
|---------|------|---------------------|
| 22.23.2 | `/opt/homebrew/opt/node@22/bin` | No — regression guard |
| 24.13.0 | `~/.nvm/versions/node/v24.13.0/bin` | No — regression guard |
| 26.7.0 | `/opt/homebrew/bin/node` (default) | **Yes** |
| 20.x | not installed locally | CI matrix leg only |

---

## Sampling Rate

- **Per task commit:** `pnpm exec vitest run <touched file>` + `pnpm exec eslint <touched file>` (sub-second).
- **Per wave merge:** `pnpm -r typecheck && pnpm exec eslint . --max-warnings 0 && pnpm exec vitest run` on the **default Node (26)** — the version that reproduces the bug, so the fast loop is also the sensitive loop.
- **Phase gate:** full suite on **all four** Node majors (locally on 22/24/26, CI for 20) → `pnpm build` → the SIG-03f revert-proof on a scratch branch → `/gsd-verify-work`.
- **Max feedback latency:** ~1 s local, ~3 min for a full CI matrix run.

---

## Per-Task Verification Map

24 assertions. `Exists?` marks what the suite can already prove versus what Wave 0 must add.

| ID | Behaviour to prove | Req | Type | Automated command | Exists? | Status |
|----|--------------------|-----|------|-------------------|---------|--------|
| SIG-01a | Full suite green on the Node version that reproduces the bug | SIG-01 | integration | `pnpm exec vitest run` **on Node 26** | suite exists; 5 red today | ⬜ pending |
| SIG-01b | Full suite green on Node 22 | SIG-01 | integration | `PATH="/opt/homebrew/opt/node@22/bin:$PATH" pnpm exec vitest run` | ✅ green today — regression guard | ⬜ pending |
| SIG-01c | Full suite green on Node 24 | SIG-01 | integration | `PATH="$HOME/.nvm/versions/node/v24.13.0/bin:$PATH" pnpm exec vitest run` | ✅ green today — regression guard | ⬜ pending |
| SIG-01d | Full suite green on Node 20 | SIG-01 | integration | CI matrix leg only | ✅ green today (current CI) | ⬜ pending |
| SIG-01e | Guard returns `""` when `window.localStorage` is **absent** | SIG-01 | unit | `pnpm exec vitest run packages/frontend/src/stores/settings.test.ts -t "absent browser storage"` | ❌ Wave 0 | ⬜ pending |
| SIG-01f | Guard returns `""` when reading `localStorage` **throws** | SIG-01 | unit | `… -t "throwing localStorage"` | ❌ Wave 0 | ⬜ pending |
| SIG-01g | Guard returns `""` when storage exists but has **no `getItem`** | SIG-01 | unit | `… -t "without getItem"` | ❌ Wave 0 | ⬜ pending |
| SIG-01h | The existing happy path (real token in storage) still works | SIG-01 | unit | `pnpm exec vitest run packages/frontend/src/stores/settings.test.ts` | ✅ exists (`vi.stubGlobal`) | ⬜ pending |
| SIG-01i | Shim is **inert** when storage already works | SIG-01 | unit | `pnpm exec vitest run packages/frontend/src/__storage-shim.test.ts` — round-trip **and** assert the instance is happy-dom's, not the in-memory fallback, under Node ≤ 24 | ❌ Wave 0 | ⬜ pending |
| SIG-02a | ESLint is installed and executable | SIG-02 | smoke | `pnpm exec eslint --version` → `10.x` | ❌ Wave 0 | ⬜ pending |
| SIG-02b | Config loads with no `MODULE_TYPELESS_PACKAGE_JSON` warning | SIG-02 | smoke | `pnpm lint 2>&1 \| grep -c MODULE_TYPELESS` → `0` | ❌ Wave 0 | ⬜ pending |
| SIG-02c | Lint covers the whole repo, not a stale glob | SIG-02 | smoke | `pnpm exec eslint . -f json` → **59** files; must include `packages/backend/assets/mcp-server.mjs` | ❌ Wave 0 | ⬜ pending |
| SIG-02d | Zero errors and zero warnings | SIG-02 | integration | `pnpm exec eslint . --max-warnings 0` → exit `0` | ❌ Wave 0 | ⬜ pending |
| SIG-02e | The CI lint invocation contains no `--fix` | SIG-02 | static | `grep -c -- "--fix" .github/workflows/ci.yml` → `0`; `node -p "require('./package.json').scripts.lint"` must not contain `--fix` | ❌ Wave 0 | ⬜ pending |
| SIG-02f | A deliberate error actually fails the command | SIG-02 | negative | Insert `const unused = 1;` in a temp file → `pnpm lint` exits `1` → revert | ❌ Wave 0 (manual, one-shot) | ⬜ pending |
| SIG-03a | Workflow triggers on **every** branch | SIG-03 | static | parsed YAML: `on.push` has no `branches` key **and** `on.pull_request` has no `branches` key | ❌ Wave 0 | ⬜ pending |
| SIG-03b | Matrix contains 20, 22, 24 **and 26** | SIG-03 | static | parsed YAML `jobs.verify.strategy.matrix.node` deep-equals `['20','22','24','26']` | ❌ Wave 0 | ⬜ pending |
| SIG-03c | `fail-fast: false` | SIG-03 | static | parsed YAML `jobs.verify.strategy['fail-fast'] === false` | ❌ Wave 0 | ⬜ pending |
| SIG-03d | Step order is typecheck → lint → test → build | SIG-03 | static | ordered `run` commands match the expected sequence | ❌ Wave 0 | ⬜ pending |
| SIG-03e | A lint failure fails the job in reality | SIG-03 | integration | push a branch with one deliberate lint error → **all four legs red** → revert | ❌ Wave 0 (manual, one-shot) | ⬜ pending |
| **SIG-03f** | **The Node 26 leg would have caught the original bug** | SIG-03 | integration | on a scratch branch revert **only** the `settings.ts` guard and the shim → Node 26 leg **red** while 20/22/24 stay **green** | ❌ Wave 0 — **the single most important proof in this phase** | ⬜ pending |
| SIG-03g | Artifact upload does not 409 | SIG-03 | integration | first matrix run completes; `drift-plugin` artifact present exactly once | ❌ Wave 0 (observational) | ⬜ pending |
| CMP-inv | No POSIX regression, no spawn-path edits | CMP-01/02 | static | `git diff --name-only` shows no change to `renderExportExecScript` / `writeMcpWrapper` / `writeLaunchScript` / `shellQuote` / `chmod` call sites | ❌ Wave 0 | ⬜ pending |
| V2-inv | Fail-closed token behaviour preserved | SIG-01 (ASVS V2) | static + unit | guard returning `""` must still make `startMcpServer` abort — never proceed unauthenticated; assert the existing empty-token abort is untouched | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## What would constitute a false pass

The dominant risk in this phase is self-certification.

| Req | False-pass mechanism | Counter-measure |
|-----|---------------------|-----------------|
| SIG-01 | Suite green because it ran on Node ≤ 24, where the bug does not exist. **This is the default outcome of following the original ROADMAP matrix literally.** | Mandatory Node 26 leg (SIG-01a, SIG-03b) + the SIG-03f revert-proof |
| SIG-01 | Guard "verified" only by the absence of a crash in ChatView tests — no test asserts guard behaviour directly | SIG-01e/f/g, including the *throwing* getter case |
| SIG-01 | Suite green because the shim silently masks a real product regression | Guard has unit tests independent of the shim; SIG-01i asserts the shim is inert when storage works |
| SIG-01 | A committed `it.only` / `describe.only` reduces the suite to one test and everything is "green" | `@vitest/eslint-plugin` `no-focused-tests`; also assert total count is **125+** |
| SIG-02 | `--fix` rewrites code in CI, reports clean, changes are discarded | SIG-02e greps **both** `package.json` and the workflow |
| SIG-02 | ESLint exits 0 because it linted **zero** files (bad glob / over-broad `ignores`) | SIG-02c asserts the linted-file count is 59 and names `mcp-server.mjs` explicitly |
| SIG-02 | Warnings exist but exit code is 0 (ESLint does not fail on warnings by default — measured) | `--max-warnings 0` |
| SIG-02 | Debt "handled" by disabling the rules that produced it | Rule-off decisions enumerated with per-rule rationale in `01-RESEARCH.md` → `## Measured Lint Debt`; `vue/no-v-html` stays **on** with a justified inline disable |
| SIG-03 | Workflow file edited but never exercised — a workflow only runs from the branch it exists on | SIG-03e pushes a scratch branch and observes four red legs |
| SIG-03 | `fail-fast: true` cancels the Node 26 leg the moment another fails, so its result is never recorded | SIG-03c |
| SIG-03 | Job renamed → GitHub branch protection's required check no longer matches → merges proceed unguarded | Manual settings update (assumption A7); tracked in STATE.md Blockers |
| SIG-03 | Only the `push` trigger is unfiltered; fork PRs still skip CI | SIG-03a checks **both** triggers |

---

## Wave 0 Requirements

- [ ] `vitest.setup.ts` — Web Storage shim (SIG-01). **Trap:** an unguarded shim calling `new Storage()` breaks 15 of 22 test files with `Illegal constructor` — Node's native `Storage` is not constructible.
- [ ] `vitest.config.ts` — remove dead `environmentMatchGlobs`, add `setupFiles` (SIG-01)
- [ ] `packages/frontend/src/stores/settings.test.ts` — three guard cases: absent / throwing / no-`getItem` (SIG-01e/f/g)
- [ ] `packages/frontend/src/__storage-shim.test.ts` — shim inertness + round-trip (SIG-01i)
- [ ] `eslint.config.mjs` — flat config (SIG-02)
- [ ] `package.json` — 8 devDependencies, `lint` / `lint:fix` split, committed `pnpm-lock.yaml` (SIG-02)
- [ ] `.github/workflows/ci.yml` — triggers, matrix, `fail-fast`, lint step, action majors, single-leg artifact (SIG-03)
- [ ] `.github/workflows/release.yml` — add the lint step (consistency)
- [ ] Framework install: **none** — Vitest 4.0.18 already present and working

---

## Manual-Only Verifications

| Behaviour | Requirement | Why Manual | Test Instructions |
|-----------|-------------|------------|-------------------|
| A lint failure turns all four CI legs red | SIG-03e | A workflow only runs from the branch it lives on — cannot be proven locally | Push a scratch branch with one deliberate lint error; observe four red legs; revert |
| The Node 26 leg would have caught the original bug | SIG-03f | Requires reverting the fix on a real CI run | Scratch branch: revert **only** the guard and the shim; Node 26 must go red while 20/22/24 stay green |
| Branch-protection required-check names updated | SIG-03 (A7) | Lives in GitHub repo settings, not in git | After the first matrix run, update required checks from `Typecheck, test, build` to the four `Verify (Node N)` names |
| Node 20 leg actually passes | SIG-01d | No Node 20 binary available locally | Observe the CI matrix leg |

---

## Validation Sign-Off

- [ ] All 24 assertions have an automated command or an explicit manual entry
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers every ❌ reference above
- [ ] No watch-mode flags anywhere in the CI path
- [ ] No `--fix` on the CI path (SIG-02e)
- [ ] Feedback latency < 5 s locally
- [ ] SIG-03f revert-proof executed and recorded — **this phase is not done without it**
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
