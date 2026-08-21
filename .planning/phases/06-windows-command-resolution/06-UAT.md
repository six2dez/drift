---
status: testing
phase: 06-windows-command-resolution
source: [06-VERIFICATION.md]
started: 2026-08-21T15:00:00Z
updated: 2026-08-21T15:00:00Z
---

## Current Test

number: 1
name: Real-machine catalogue existence — each supported Windows installer layout resolves
expected: |
  On a real Windows machine carrying each supported installer layout (npm-global, Claude native,
  Volta, pnpm, Bun, scoop user + machine, nvm-windows, fnm modern + legacy, Node MSI), the
  candidate the resolver selects is the path that actually exists on disk. No supported layout
  resolves to `undefined`.
awaiting: user response

## Tests

### 1. Real-machine catalogue existence
expected: The candidate the resolver selects is the path that actually exists; no supported layout resolves to `undefined`.
why_human: The phase proves the catalogue's SPELLING (byte-exact, from literal inputs, on Linux), never its EXISTENCE. `windows-latest` carries none of these layouts and the maintainer has no Windows machine (PROJECT.md § Constraints). A wrong path fails as a silent `stat` miss, never an error. Closes on the Phase 9/10 real-machine report. **NOT CLAIMED BY THIS PHASE.**
result: [pending]

### 2. Cold `where.exe` latency vs the 5000 ms headroom estimate
expected: A cold PATH search (process creation included, real-time antivirus enabled) completes well inside `WIN32_PATH_SEARCH_TIMEOUT_MS = 5000`, or the constant is revised with the measured figure.
why_human: WINDOWS.md entry 8 is deliberately OPEN. The number is an explicit headroom estimate bounded by three values this codebase already accepts (1000 ms POSIX floor, 10 s self-test ceiling, 30 s negative TTL), and the source comment says so verbatim: *"This is a headroom estimate, not a measurement, and nothing later may cite it as evidence."* **NOT CLAIMED BY THIS PHASE.**
result: [pending]

### 3. `where.exe` cross-extension output order and no-match stream
expected: Either answer is acceptable — the ranker's explicit sort plus the two independent guards (exit-code gate + extension-termination filter) are correct under every ordering. Record (a) the cross-extension output order and (b) which stream carries the no-match informational line.
why_human: Undocumented by Microsoft and by ss64; Phase 3's measurement could not discriminate (both measured lines carried the same extension). Resolved by DESIGN, not by evidence — this is a confidence upgrade, not a blocker.
result: [pending]

### 4. MAINTAINER DECISION (security) — disposition of two non-admin-writable candidate roots
expected: |
  Decide the disposition of `%ProgramData%\scoop\shims` (`command-resolution.ts:553`) and
  `C:\nvm4w\nodejs` (`NVM_WINDOWS_SYMLINK_DIR`, `:24` / `:614` / `:965`). One of:
  (a) drop the ProgramData row and gate the nvm4w row on `NVM_HOME`/`NVM_SYMLINK` presence, or
  (b) keep them with an explicit recorded non-claim beside each row naming the `CAIDO_TOKEN` exposure.
  Silence is not one of the options under this module's own cite-or-drop discipline.
why_human: Judgment call on a security/coverage trade-off. Verified in code — neither row carries a security note, while every other catalogue row is under the user's own trust domain or admin-only. A binary resolved from either row is spawned with `CAIDO_URL`/`CAIDO_TOKEN` in its environment (`buildSpawnEnv` at `index.ts:3640`; `spec.env` at `:2159`). Directly touches PROJECT.md's stated token-handling constraint. See 06-REVIEW.md CR-02.
result: [pending]

### 5. MAINTAINER DECISION (ownership) — two remaining unguarded Promise-executor spawns
expected: |
  Decide whether the provider spawn at `index.ts:3640` and the PATH-search spawn at `index.ts:1600`
  are closed in Phase 6 or handed to Phase 7 with a recorded marker. Either mirror the one-guard
  shape `spawnAndWait` already carries at both sites, or add a recorded non-claim + greppable
  marker naming the owning phase — matching how this phase handled every other deferral
  (UX-04, PRV-02, D-07).
why_human: The verifier judges this a Phase 6 defect **in kind** — this phase created the reachability and already accepted that ownership at `spawnAndWait` — but **not a phase-goal blocker**. The `.cmd`-EINVAL trigger is structurally deferrable to Phase 7 SC-2 (which routes through `cmd.exe` and never trips the CVE guard). What no later phase covers is the residual: any other synchronous throw still rejects the RPC and leaves token-bearing `mcp-<chatId>.json` on disk because `finalize` never runs. The fix-vs-defer call belongs to the maintainer. See 06-REVIEW.md CR-01/WR-01 and 06-VERIFICATION.md § Verifier Assessment.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
