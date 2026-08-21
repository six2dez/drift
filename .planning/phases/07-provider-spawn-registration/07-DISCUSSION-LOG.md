# Phase 7: Provider Spawn & Registration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-21
**Phase:** 7-Provider Spawn & Registration
**Areas discussed:** Gemini/Codex approval gap (PRV-05 / SC-4)

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Gemini/Codex approval gap | Registration is global (once at MCP start); activity+approvals files are per-session. Real fix vs. disable sensitive tools and state it. | ✓ |
| `.cmd` spawn strategy | `cmd.exe /d /s /c` argv with `shell:false` vs the underlying `node.exe` entry; which of the three EINVAL-exposed sites get it. | |
| Token hygiene + guaranteed `mcp remove` | Literal token vs `${CAIDO_TOKEN}` vs `DRIFT_TOKEN_FILE`; the token landing outside `%TEMP%`; a crashed session's entry never removed. | |
| PRV-01 evidence + Gemini gating | What proves "Claude end-to-end on Windows" in CI; how Gemini's best-effort status is gated. | |

**User's choice:** Gemini/Codex approval gap only.
**Notes:** The three unselected areas were offered and declined, not delegated. CONTEXT.md records
them under Claude's Discretion with a starting read and an explicit note that they remain live for
research and planning — including the D-03 coupling that the PRV-05 decision imposes on PRV-03.

---

## Gemini/Codex approval gap — Q1: which SC-4 exit

| Option | Description | Selected |
|--------|-------------|----------|
| Real channel, fall back to disable | Aim for parity; if the mechanism can't be confirmed for a CLI, disable that CLI's sensitive tools and state it in-product + README. | ✓ |
| Real channel, no fallback | Commit to parity for both CLIs — puts PRV-05 on the critical path next to PRV-01. | |
| Disable sensitive tools, state it | Take SC-4's second exit outright; read-only Drift tools for both, parity deferred to v2. | |

**User's choice:** Real channel, fall back to disable.
**Notes:** Became D-01. The fallback is decided **per CLI**, not globally — Gemini and Codex can
reach different verdicts.

---

## Gemini/Codex approval gap — Q2: which mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Env inheritance — verify, then rely | Drift already injects the full `runtimeEnv` into the CLI process at `index.ts:3479`; if the CLIs forward env to the stdio server they spawn, PRV-05 costs one confirmation test. | ✓ |
| Session-pointer file, re-read per call | Mirror the shipping `DRIFT_CONTEXT_FILE` pattern; immune to CLI env behaviour, but adds a `.mjs` indirection and a concurrent-sessions race question. | |
| Re-register per turn | `mcp remove` + `mcp add` with per-session `--env` before every turn; two extra spawns per turn and a stale token entry on a mid-turn crash. | |
| You decide | Delegate the verify-then-fallback ordering to research and planning. | |

**User's choice:** Env inheritance — verify, then rely.
**Notes:** Became D-02. The pointer file is explicitly **not** pre-authorised as a fallback — if
inheritance is falsified, reconsidering it is a new decision. The rejection rationale for
re-register-per-turn is recorded because it trades a PRV-05 problem for a PRV-03 one.

---

## Gemini/Codex approval gap — Q3: how the fallback fires

| Option | Description | Selected |
|--------|-------------|----------|
| Static per-provider flag + better error | A capability flag in `shared/` drives the tool policy and the stated limitation; independently, `mcp-server.mjs:623`'s throw becomes actionable. | ✓ |
| Static per-provider flag only | One table, fully testable as a pure predicate — but a wrong verdict reproduces today's unexplained error. | |
| Runtime detection only | Keep sensitive tools on and let the existing throw carry a clear message; user learns the limitation by hitting it mid-turn. | |

**User's choice:** Static per-provider flag + better error.
**Notes:** Became D-04. The `.mjs` message upgrade is unconditional — it is the safety net for a
wrong flag verdict and worth fixing even where every flag is right.

---

## Gemini/Codex approval gap — Q4: what evidence sets the flag

| Option | Description | Selected |
|--------|-------------|----------|
| Automated half + cited upstream half | A test proves Drift's half sharing the production builder (05-D-08's shape); the CLI's forwarding half is settled by an upstream citation per CLI (06-D-12's requirement). | ✓ |
| Add a real-run confirmation | The above plus a manual run of a sensitive tool through each CLI on macOS. | |
| Real-run only | One observed run per CLI; fastest, but nothing in CI defends it. | |

**User's choice:** Automated half + cited upstream half.
**Notes:** Became D-05, with a Phase 3-voiced vehicle caveat: this proves Drift *supplies* the
variables and the CLI *documents* forwarding them — not that a specific installed version did so.
The rejected real-run option was carried to Deferred Ideas as a companion to the Phase 9/10
reporter confirmation.

---

## Gemini/Codex approval gap — Q5: inconclusive-evidence default

| Option | Description | Selected |
|--------|-------------|----------|
| Fail closed — sensitive tools off | Matches `planMcpCliRegistration`'s `Skip`-on-undefined-platform and the `.mjs` allowlist's empty-means-deny. | ✓ |
| Fail open — sensitive tools on | Assume inheritance works unless disproven; the upgraded error carries the bad case. | |

**User's choice:** Fail closed.
**Notes:** Became D-06. Third instance of an existing house pattern, not a new rule.

---

## Gemini/Codex approval gap — Q6: activity-trace scope

| Option | Description | Selected |
|--------|-------------|----------|
| Both — they share one channel | `waitForApproval` refuses when *either* file is empty, and the approval request is itself an activity event. | ✓ |
| Approvals only; trace best-effort | Narrow what SC-4 must prove — but given the shared mechanism, likely narrows nothing real. | |

**User's choice:** Both.
**Notes:** Became D-07. Settled by a code fact rather than a preference.

---

## Gemini/Codex approval gap — Q7: where the limitation is stated

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse `skippedMcpCliReasons` + README | The shape 05-D-03 already landed for the Windows registration skip; SC-4 and 05-D-03 then speak in one voice. | ✓ |
| New per-provider capability notice | A distinct UI element for "registered, but sensitive tools unavailable" — clearer, but new frontend surface. | |

**User's choice:** Reuse `skippedMcpCliReasons` + README.
**Notes:** Became D-08. Flagged to the user after the choice, and recorded as a locked consequence:
the map today reaches **only** `getDiagnostics` (`index.ts:4473`), never the provider card — and
05-D-03 itself rejected diagnostics-only. Wiring it to `getProviderStatuses` and `SettingsView.vue`
is work this phase inherits. Second consequence: the map's meaning widens from "not registered" to
also "registered but limited", with no kind discriminator, so the sentences must disambiguate
themselves. The rejected alternative is what makes that requirement binding.

---

## Claude's Discretion

The user delegated no area wholesale. Two categories are recorded in CONTEXT.md:

**Offered and declined — open, not settled.** `.cmd` spawn strategy (PRV-02), token hygiene and the
guaranteed `mcp remove` (PRV-03 / SC-3), PRV-01 evidence and Gemini's SC-5 gating. CONTEXT.md gives
each a starting read plus the facts surfaced during this discussion — notably that the `EINVAL`
surface is three spawn sites and that `unregisterMcpFromCli` never removes a crashed session's entry.

**Sub-decisions inside locked decisions.** Where D-04's flag lives in `packages/shared/src`; the
exact wording of D-04's and D-08's user-facing strings; whether D-05's test extends
`mcp-server-spec.spawn.test.ts` or lands standalone; the plan split (roadmap's 3 is provisional).

## Deferred Ideas

- A manual real-run confirmation of env pass-through per CLI on macOS — companion to the Phase 9/10
  reporter confirmation.
- A session-pointer file re-read per call in `mcp-server.mjs` — only if D-05 falsifies inheritance;
  carries an open concurrent-sessions race question.
- A distinct per-provider capability notice in the frontend — the fix if D-08's widened
  `skippedMcpCliReasons` meaning proves confusing.
- `icacls` ACL hardening (HRD-01) — v2, and it would not cover the Gemini/Codex token, which lands
  outside `%TEMP%`.
- Aliasing `caido:plugin` in `vitest.config.ts` — Phase 9.
- Phase 2's SEC-02 (`sessionId`/`chatId` path validation) — this phase raises its stakes without
  absorbing it.
- `windowsHide: true` (UX-04) — Phase 10; PRV-02 adds another console flash.
- Process-tree kill (LIF-01) — Phase 8; PRV-02's `cmd.exe` branch adds a tree level.
