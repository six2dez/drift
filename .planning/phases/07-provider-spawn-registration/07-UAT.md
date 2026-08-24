---
status: partial
phase: 07-provider-spawn-registration
source: 07-01-SUMMARY.md, 07-02-SUMMARY.md, 07-03-SUMMARY.md, 07-04-SUMMARY.md, 07-05-SUMMARY.md
started: 2026-08-24T11:30:00Z
updated: 2026-08-24T11:45:00Z
---

## Current Test

[testing complete — 2 items blocked on hardware, owned by Phase 10]

## Tests

### 1. Real Claude Code chat turn on native Windows (SC-1 / PRV-01)
expected: Claude Code launches on Windows, the Drift MCP server attaches, and at least one Drift tool returns live Caido data
result: blocked
blocked_by: physical-device
reason: >-
  Requires a native Windows machine, which the maintainer does not have. SC-1's own
  wording is "confirmed on the reporter's machine where possible", and the phase never
  treated it as a gate. Now formally owned by ROADMAP Phase 10 SC-5 (added 2026-08-24,
  commit 645df99) — before that edit it appeared in no phase's success criteria at all.

### 2. Real-machine Gemini confirmation on Windows (SC-5 / PRV-04)
expected: `gemini mcp add` writes the drift entry to `~/.gemini/settings.json`, a turn attaches, and an approval prompt reaches the Drift chat — proving env inheritance actually delivered DRIFT_APPROVALS_FILE / DRIFT_ACTIVITY_FILE
result: blocked
blocked_by: physical-device
reason: >-
  Requires native Windows. Gemini's approval-channel verdict is source-read out of
  gemini-cli (`mcp-client.ts`, `environmentSanitization.ts`); no installed binary was
  ever measured, and the code itself names an open upstream PR
  (google-gemini/gemini-cli#28863) moving toward more sanitization. Now owned by
  ROADMAP Phase 10 SC-6 (commit 645df99).

### 3. Read the Codex limitation sentence on the rendered provider card (SC-4 / D-08)
expected: >-
  Settings → CLI Providers → Codex shows an amber (not red) dot with its resolved path,
  and a limitation sentence that reads as "registered, but limited" on its own.
  Runnable on macOS — no Windows required.
result: pass
reported: "looks right"
provenance: >-
  Reported by the maintainer in response to the build-and-inspect instruction, which
  named the amber-dot check, the resolved path, the sentence to read on its own, and
  the comparison against a never-registered provider.

  This SUPERSEDES the relayed text-only approval recorded at the 07-05 checkpoint
  (commit c677fe7), which explicitly asserted that nobody had built the plugin or
  looked at the rendered card. Recorded at the strength given: a maintainer report
  of the rendered card, not a transcript or screenshot. The distinction is kept
  because this phase's whole discipline is that evidence is described at exactly
  its own strength.

## Summary

total: 3
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 2

## Gaps

<!-- none yet -->
