---
phase: 6
slug: windows-command-resolution
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-21
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `06-RESEARCH.md` § *Validation Architecture*. The planner fills the
> Per-Task Verification Map once task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (root devDependency — already present) |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `pnpm exec vitest run packages/backend/src/command-resolution.test.ts packages/backend/src/platform.test.ts` |
| **Full suite command** | `pnpm exec vitest run` |
| **Gate commands** | `pnpm -r typecheck` and `pnpm lint` (`eslint . --max-warnings 0`, never `--fix`) |
| **Estimated runtime** | Quick: sub-second (both files pure or temp-dir-local). Full suite: seconds. |

**The SC-5 structural argument** — `platform.test.ts` is 100% literal-input pure tests needing no
filesystem; `command-resolution.test.ts` is currently a *mix* (its two version-manager tests create
real directories). **D-10's pure/impure split is what lets the new Windows cases follow
`platform.test.ts`'s shape instead.** Every win32 assertion targets `buildCommandCandidatePaths` with
literal roots and literal `discoveredVersions`, so the Linux runner asserts the exact strings a
Windows box would produce. `C:\...` need never exist for the test to be real evidence.

---

## Sampling Rate

- **After every task commit:** `pnpm exec vitest run packages/backend/src/command-resolution.test.ts packages/backend/src/platform.test.ts`
- **After every plan wave:** `pnpm exec vitest run && pnpm -r typecheck && pnpm lint`
- **Before `/gsd-verify-work 6`:** full suite green on **both** CI legs — `Verify (Node 20/22/24/26)`
  and the blocking `Verify (Windows)` leg. SC-5 only requires the Linux runner; the Windows leg runs
  the same pure tests as a free second data point.
- **Max feedback latency:** < 5 seconds for the quick command.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(planner fills once task IDs exist — source rows below)* | | | | | | | | | ⬜ pending |

### Requirement → behavior source rows (from RESEARCH § Validation Architecture)

| Req | Behavior to assert | Test file | New? |
|---|---|---|---|
| RES-01 | `buildCommandCandidatePaths({platform:"win32", command:"node", roots:{…literals}})` emits the exact ordered named-root list, backslash-separated | `command-resolution.test.ts` | ❌ new |
| RES-01 | `%ProgramFiles%` / `ProgramData` absent from `roots` ⇒ those rows are skipped, never emitted with an empty prefix | `command-resolution.test.ts` | ❌ new |
| RES-01 | nvm/fnm/Volta version walks emit `<root>\v<v>\node.exe`, `<base>\node-versions\<v>\installation\node.exe` (**no `bin`**), `<home>\tools\image\node\<v>\node.exe` | `command-resolution.test.ts` | ❌ new |
| RES-02 | `rankPathSearchHits` orders `.exe` → `.cmd` → `.bat` across CRLF-split input; PATH order within an extension | `platform.test.ts` | ❌ new |
| RES-02 | `rankPathSearchHits` discards non-extension-terminated lines — the `INFO: Could not find files…` line and a truncated partial final line | `platform.test.ts` | ❌ new |
| RES-02 | `getWhichCommand({platform:"win32", env:{SystemRoot:"D:\\Windows"}})` → `D:\Windows\System32\where.exe`; empty/missing ⇒ bare `where.exe`; POSIX arm byte-identical | `platform.test.ts:147` | ✅ describe exists |
| RES-03 | `extractHomeDir("C:\\Users\\six\\.local\\bin\\claude.exe")` → `C:\Users\six`; the `C:/Users/…` spelling too; `\\server\share\…` ⇒ `undefined` (explicit non-claim) | `command-resolution.test.ts:22` | ✅ `it` exists |
| RES-03 | `getHomeDirCandidates({platform: undefined, env:{HOME, USERPROFILE, APPDATA, LOCALAPPDATA}})` returns all four, deduped | `platform.test.ts:212` | ✅ describe exists |
| UX-02 | `getProviderInstallHint({providerId:"copilot-cli", platform:"linux"})` contains `@github/copilot` and does **NOT** contain `gh extension install` | `command-resolution.test.ts:73` | ⚠️ **inverts an existing assertion** |
| UX-02 | Every provider has both a `posix` and a `win32` hint; unknown provider still gets the generic hint | `command-resolution.test.ts` | ❌ new |
| **CMP-01** | `joinPath({platform:"linux", segments})` is **byte-identical** to `path.join(...segments)` for every POSIX suffix at `command-resolution.ts:149-161` and `:185-195` | `platform.test.ts` | ❌ new — **the CMP-01 proof** |
| **CMP-01** | `buildCommandCandidatePaths({platform:"linux", …})` reproduces the existing `getCommandExecutableCandidates` order exactly | `command-resolution.test.ts` | ❌ new — the D-10 split's regression net |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **No new test files needed** — both target files already exist.
- [ ] **The real Wave 0 gap is the D-10 seam itself:** until `buildCommandCandidatePaths` is a pure
      export, the win32 cases cannot be written at all. **Sequence the split before the data.**
- [ ] `platform.test.ts` has no `describe` for `joinPath` or `rankPathSearchHits` — new blocks
      following the existing one-describe-per-export convention.
- [ ] `command-resolution.test.ts:73` asserts `toContain("gh extension install")`. **This is the only
      existing assertion Phase 6 makes false.** It must be a deliberate, commented inversion citing
      D-14 — never a silent edit. A verifier seeing a changed assertion needs the reason beside it.
- [ ] Framework install: none — Vitest 4.0.18 already present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Windows resolution of `node.exe` and a provider CLI | RES-01, RES-02 | The maintainer cannot test native Windows locally (PROJECT.md § Constraints). CI proves the pure logic; only a real machine proves the catalogue matches a real install. | Deferred to the reporter check in Phase 9/10 — **not claimed by this phase.** |
| `where.exe` latency under Defender (the D-04 number) | RES-02 | No latency measurement exists anywhere; the chosen win32 timeout is headroom, not evidence. | Not verifiable in CI. The code comment must say the number is an estimate, not a measurement. |

All other phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
