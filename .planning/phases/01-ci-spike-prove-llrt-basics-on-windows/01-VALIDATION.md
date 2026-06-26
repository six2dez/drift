---
phase: 1
slug: ci-spike-prove-llrt-basics-on-windows
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-26
---

# Phase 1 — Validation Strategy

> Per-phase validation contract. This phase IS validation: it adds a `windows-latest` CI job whose probe empirically answers the 7 LLRT/Windows assertions. There is no src code to unit-test; the probe's PASS/FAIL output is the verification.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | GitHub Actions (`windows-latest`) running a self-contained Node.js probe — no vitest/src changes in this phase |
| **Config file** | `.github/workflows/windows-llrt-probe.yml` |
| **Quick run command** | `node scripts/windows-llrt-probe.mjs` (runs on any OS; full fidelity only on Windows) |
| **Full suite command** | The `windows-llrt-probe` job on `windows-latest` (push / workflow_dispatch) |
| **Estimated runtime** | ~1–2 min (runner spin-up + probe) |

---

## Sampling Rate

- **After the probe-script commit:** run `node scripts/windows-llrt-probe.mjs` locally for a syntax/logic sanity check (results are partial off-Windows).
- **Authoritative run:** the `windows-latest` CI job on push — this is the only place the Windows-specific assertions are real.
- **Before phase verification:** the CI job must complete and the P0 assertions (env passthrough, `os.tmpdir`) must be PASS (non-zero exit otherwise).
- **Max feedback latency:** ~120 s (one CI run).

---

## Per-Task Verification Map

| Assertion | Prio | Requirement | Secure Behavior | Test Type | Automated Check | Status |
|-----------|------|-------------|-----------------|-----------|-----------------|--------|
| `spawn(node,[script],{env})` child sees `SENTINEL` | P0 | CI-02 | Probe uses a dummy `SENTINEL`, never the real Caido token, in CI logs | CI probe | non-zero exit on FAIL | ⬜ pending |
| `os.tmpdir()` drive-lettered + exists; `os.platform()==="win32"` | P0 | CI-02 | N/A | CI probe | non-zero exit on FAIL | ⬜ pending |
| `spawn("dummy.cmd")` behavior (EINVAL / runs / hangs) recorded | P1 | CI-02 | N/A | CI probe | informational record | ⬜ pending |
| `where.exe node` spawnable + CRLF parse → `.exe` | P1 | CI-02 | N/A | CI probe | informational record | ⬜ pending |
| bare `"os"` import resolves | P2 | CI-02 | N/A | CI probe + LLRT source analysis | informational record | ⬜ pending |
| `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` non-empty | P3 | CI-02 | N/A | CI probe | informational record | ⬜ pending |
| `crypto.randomUUID` available | P3 | CI-02 | N/A | CI probe | informational record | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers this phase — the probe is self-contained Node (no framework install). No Wave 0 test stubs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full LLRT-on-Windows runtime fidelity | CI-02 | No standalone LLRT Windows binary exists and Caido headless needs a paid plan — the Node probe + LLRT-source analysis is a faithful approximation, not the literal Caido runtime | Optional: original reporter (@0xMRK0S) or a real Windows Caido confirms a later phase's build; this phase records the residual risk rather than eliminating it |

---

## Validation Sign-Off

- [ ] Probe asserts all 7 primitives and emits machine-parseable `PASS`/`FAIL: <reason>` lines
- [ ] P0 assertions (env passthrough, `os.tmpdir`) gate the job exit code
- [ ] `windows-latest` CI job is green (or its FAILs are documented and fed back to Phase 2)
- [ ] No real Caido token printed in CI logs (dummy `SENTINEL` only)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
