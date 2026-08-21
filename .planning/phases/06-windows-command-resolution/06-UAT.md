---
status: partial
phase: 06-windows-command-resolution
source: [06-VERIFICATION.md]
started: 2026-08-21T15:00:00Z
updated: 2026-08-21T16:20:00Z
---

## Current Test

[testing paused — 3 items outstanding, all blocked on physical-device]

## Tests

### 1. Real-machine catalogue existence
expected: The candidate the resolver selects is the path that actually exists; no supported layout resolves to `undefined`.
why_human: The phase proves the catalogue's SPELLING (byte-exact, from literal inputs, on Linux), never its EXISTENCE. `windows-latest` carries none of these layouts and the maintainer has no Windows machine (PROJECT.md § Constraints). A wrong path fails as a silent `stat` miss, never an error. Closes on the Phase 9/10 real-machine report. **NOT CLAIMED BY THIS PHASE.**
result: blocked
blocked_by: physical-device
reason: No Windows machine available to the maintainer (PROJECT.md § Constraints). Closes on the Phase 9/10 real-machine report from the original reporter (@0xMRK0S). Recorded 2026-08-21 by maintainer decision — deliberately NOT marked pass, because the claim is unverified rather than verified.

### 2. Cold `where.exe` latency vs the 5000 ms headroom estimate
expected: A cold PATH search (process creation included, real-time antivirus enabled) completes well inside `WIN32_PATH_SEARCH_TIMEOUT_MS = 5000`, or the constant is revised with the measured figure.
why_human: WINDOWS.md entry 8 is deliberately OPEN. The number is an explicit headroom estimate bounded by three values this codebase already accepts (1000 ms POSIX floor, 10 s self-test ceiling, 30 s negative TTL), and the source comment says so verbatim: *"This is a headroom estimate, not a measurement, and nothing later may cite it as evidence."* **NOT CLAIMED BY THIS PHASE.**
result: blocked
blocked_by: physical-device
reason: Requires a real Windows host with real-time antivirus enabled to time a cold `where.exe` spawn. WINDOWS.md entry 8 stays open by design. Recorded 2026-08-21 by maintainer decision.

### 3. `where.exe` cross-extension output order and no-match stream
expected: Either answer is acceptable — the ranker's explicit sort plus the two independent guards (exit-code gate + extension-termination filter) are correct under every ordering. Record (a) the cross-extension output order and (b) which stream carries the no-match informational line.
why_human: Undocumented by Microsoft and by ss64; Phase 3's measurement could not discriminate (both measured lines carried the same extension). Resolved by DESIGN, not by evidence — this is a confidence upgrade, not a blocker.
result: blocked
blocked_by: physical-device
reason: Requires a real Windows host to observe `where.exe`'s cross-extension output order and no-match stream. The design is correct under every ordering (explicit sort + exit-code gate + extension-termination filter), so this is a confidence upgrade only. Recorded 2026-08-21 by maintainer decision.

### 4. MAINTAINER DECISION (security) — disposition of two non-admin-writable candidate roots
expected: |
  Decide the disposition of `%ProgramData%\scoop\shims` (`command-resolution.ts:553`) and
  `C:\nvm4w\nodejs` (`NVM_WINDOWS_SYMLINK_DIR`, `:24` / `:614` / `:965`). One of:
  (a) drop the ProgramData row and gate the nvm4w row on `NVM_HOME`/`NVM_SYMLINK` presence, or
  (b) keep them with an explicit recorded non-claim beside each row naming the `CAIDO_TOKEN` exposure.
  Silence is not one of the options under this module's own cite-or-drop discipline.
why_human: Judgment call on a security/coverage trade-off. Verified in code — neither row carries a security note, while every other catalogue row is under the user's own trust domain or admin-only. A binary resolved from either row is spawned with `CAIDO_URL`/`CAIDO_TOKEN` in its environment (`buildSpawnEnv` at `index.ts:3640`; `spec.env` at `:2159`). Directly touches PROJECT.md's stated token-handling constraint. See 06-REVIEW.md CR-02.
result: pass
decided: "Option (a) — drop the ProgramData row; gate the nvm4w row on env presence."
resolved_by: commit f18be4d
detail: |
  `%ProgramData%\scoop\shims` removed (left as a commented row so its absence reads as a decision),
  with a SECURITY non-claim beside the dropped-rows list naming the CAIDO_TOKEN exposure and
  recording why ordering-it-last was rejected — a fallback row only wins when the CLI is absent,
  which is exactly the case a planted binary exploits. `C:\nvm4w\nodejs` is now gated on a pure
  `isNvmWindowsInstalled({ env })` in platform.ts, applied at BOTH node-builder emission sites
  (either alone leaves the row reachable through the other). The gate arrives as an injected
  `nvmWindowsInstalled` input, so all three builders stay I/O-free and platform.ts keeps zero
  imports. A CMP-01 case was added proving byte-identical POSIX output with the gate switched ON —
  not hypothetical, since WSLENV forwarding can export NVM_HOME into a Linux process.

### 5. MAINTAINER DECISION (ownership) — two remaining unguarded Promise-executor spawns
expected: |
  Decide whether the provider spawn at `index.ts:3640` and the PATH-search spawn at `index.ts:1600`
  are closed in Phase 6 or handed to Phase 7 with a recorded marker. Either mirror the one-guard
  shape `spawnAndWait` already carries at both sites, or add a recorded non-claim + greppable
  marker naming the owning phase — matching how this phase handled every other deferral
  (UX-04, PRV-02, D-07).
why_human: The verifier judges this a Phase 6 defect **in kind** — this phase created the reachability and already accepted that ownership at `spawnAndWait` — but **not a phase-goal blocker**. The `.cmd`-EINVAL trigger is structurally deferrable to Phase 7 SC-2 (which routes through `cmd.exe` and never trips the CVE guard). What no later phase covers is the residual: any other synchronous throw still rejects the RPC and leaves token-bearing `mcp-<chatId>.json` on disk because `finalize` never runs. The fix-vs-defer call belongs to the maintainer. See 06-REVIEW.md CR-01/WR-01 and 06-VERIFICATION.md § Verifier Assessment.
result: pass
decided: "Close in Phase 6 — mirror the guard at BOTH sites."
resolved_by: commit 44c957f
detail: |
  Both sites now carry `spawnAndWait`'s existing guard shape — no new idiom. The provider spawn's
  catch arm does NOT call `finalize` as 06-REVIEW.md CR-01 suggested: `finalize` is a `const`
  declared lower in the same executor, so at the spawn it sits in its temporal dead zone, and
  calling it would throw a ReferenceError synchronously and reject the very promise the guard
  exists to keep resolving. The review's own stated fallback was used instead — the `rm` cleanup
  hoisted inline, mirroring finalize's two rm blocks exactly (runtimeFiles + the token-bearing
  claudeMcpConfigPath), plus the `spawn_error` session state and the debug-log dispose. The reason
  is recorded in-source so it is not "simplified" back. The PATH-search catch arm resolves
  undefined; `child.on("error")` is untouched byte-for-byte. Comments cite 03-FINDINGS § P1-CMD and
  carry the PRV-02 marker. CMP-01 asserted, not assumed: on POSIX the spawn does not throw, so
  neither catch arm is entered.

## Summary

total: 5
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 3

## Gaps

<!-- No failed truths. The two maintainer-decision items resolved into shipped code (44c957f,
     f18be4d) rather than gaps. The three blocked items are the phase's own recorded non-claims —
     they are NOT gaps to close by replanning; they close on the Phase 9/10 real-machine report. -->
