---
phase: 8
slug: process-lifecycle
status: not-run
measured: none — the hardware checkpoint was waived on 2026-08-24 and no readings were taken
vehicle: "none — built and bundled, never executed against a real Caido install"
probe_commit: 68199fa
assumptions:
  A1: OPEN
  A6: OPEN
---

# Phase 8 Wave-0 spike — A1 and A6, NOT measured

**This file records a spike that was built but never run.** It is not a results
document. Every result field below reads OPEN, and that is the finding.

A1 and A6 are the two highest-risk assumptions in `08-RESEARCH.md`. Neither is closable
by CI: every CI leg runs Node rather than Caido's LLRT, and no CI leg executes a provider
CLI binary (`08-VALIDATION.md` § *Vehicle caveat* items 2 and 3). A temporary diagnostics
probe was written, type-checked, linted and bundled into `dist/plugin_package.zip` to close
them on the maintainer's own macOS hardware for the cost of one build and one chat turn.

The probe was never executed. On 2026-08-24 the maintainer waived the `checkpoint:human-verify`
that would have run it, replying `approved` and `continue` without supplying any of the six
readings, after being asked for them explicitly and told that this file is built from them.
That is a recorded maintainer decision, not an oversight or an executor omission. **No reading
was taken, so no reading is written here.** Nothing in this file is inferred, estimated or
reconstructed — a fabricated A1 confirmation is the precise failure the spike existed to
prevent, and it would have silently invalidated every downstream plan in the phase.

The falsified expectation is kept in place rather than deleted, per the house style at
`packages/backend/src/spawn-plan.ts:46-80`: deleting the expectation would hide the fact that
a measurement was planned, budgeted and then not taken.

---

## A1 — does the shipped Caido LLRT honour `detached: true`?

| Field | Value |
|---|---|
| Caido version | **not recorded — spike not run** |
| `spikeProcessKillType` | **not recorded — spike not run** |
| `spikeDetachedGroupKill` | **not recorded — spike not run** |
| **Verdict** | **OPEN — not measured** |

A1 rests entirely on source analysis: `caido/dependency-llrt`, branch `caido`, commit
`a5b021c51d1521f32018d3f3f2e70291df50501d`, `modules/llrt_child_process/src/lib.rs:448, 462,
512-521`, which calls `command.process_group(0)` on unix for a detached spawn. That source was
read; it was never executed under the runtime a user actually runs.

---

## A6 — is the CLI's MCP child in the CLI's process group?

| Field | Value |
|---|---|
| `node …mcp-server.mjs` pgid | **not recorded — spike not run** |
| `claude` pid | **not recorded — spike not run** |
| Matched? | **not determined** |
| **Verdict** | **OPEN — not measured** |

A6 was rated *"medium-high, and untested"* in `08-RESEARCH.md` § *Assumptions Log* before this
plan, and it is unchanged by this plan. If any provider CLI calls `setsid()` on its own MCP
child, a process-group signal misses it and LIF-02 is not closed by process groups alone.

---

## Control — the LIF-02 defect, reproduced

| Field | Value |
|---|---|
| `pgrep -f mcp-server.mjs \| wc -l` before Stop | **not recorded — spike not run** |
| `pgrep -f mcp-server.mjs \| wc -l` after Stop | **not recorded — spike not run** |
| **Verdict** | **OPEN — the defect was never observed on real hardware** |

The after-Stop count was to be the number plan 08-05's closing human-verify drives to zero.
That closing checkpoint now has **no measured baseline to compare against**; it will have to
establish its own before/after on the day, or accept that it is demonstrating a fix to a
defect this phase never observed directly.

---

## How to run this spike later

The probe code is **not in HEAD** — task T-08-03 removed it, as its own plan required, because
it spawns fixture processes on every `getDiagnostics` call and must not ship. To re-run it,
build from the commit that carries it:

```
git checkout 68199fa -- packages/backend/src/index.ts
pnpm build
```

Then restore HEAD's version afterwards with `git checkout HEAD -- packages/backend/src/index.ts`.
`index.ts` at HEAD is byte-equivalent to its pre-spike state apart from a three-line breadcrumb
comment above `getDiagnostics`, so the checkout is clean in both directions.

The procedure below is preserved verbatim so it can be executed later without reconstruction.

### Step 1 — install

1. `pnpm build`
2. Install `dist/plugin_package.zip` into Caido (or point Caido at the dev build) and restart Caido.
3. Note the Caido version string from Caido's own About/Settings. It goes in the A1 table above,
   because A1 is a claim about *the LLRT fork this specific Caido ships*.

### Step 2 — readings 1 and 2 (A1)

Open Drift → Settings → the Copy-diagnostics action, and record the three `spike*` fields.

- `spikeProcessKillType` — expected `function`. Anything else means the liveness probe in
  `08-RESEARCH.md` § *Q5* is not available on that build, and plan 08-03's deferred-rung guard
  needs a redesign.
- `spikeDetachedGroupKill` — **this is A1.** It is exactly one of:
  - `grandchild-died (detached honoured)` → A1 closed favourably; the phase proceeds as planned.
  - `grandchild-survived (detached NOT honoured)` → the phase's POSIX mechanism is falsified.
    **STOP**, do not run plan 08-02, re-plan the phase.
  - `inconclusive (no fixture output)`, `skipped (node executable not resolved)`, or
    `error: <constructor name>` → **also a halt.** An unclear A1 is not a pass. Record verbatim.

### Step 3 — readings 3 and 4 (A6)

> **CORRECTION (2026-08-27, during UAT — this step was unrunnable as first written).**
> The original command was:
>
> ```
> ps -eo pid,ppid,pgid,comm | grep -E 'mcp-server|claude'
> ```
>
> `ps -eo comm` prints the **executable name**, not the command line. The MCP server runs
> as `node <tmp>/mcp-server.mjs`, so its `comm` is `node` — the `mcp-server` alternation
> can never match, and the command returns only `claude` rows however many MCP servers are
> alive. Run against a real install it produced nine `claude` rows and no MCP row at all.
> The fix is `args` (full command line) instead of `comm`, plus an anchor that distinguishes
> the **Drift-spawned** CLI from the maintainer's own `claude` sessions — Drift attaches via
> `--mcp-config` (see CLAUDE.md § *Per-Provider MCP Attachment Strategy*), the user's own
> sessions do not.
>
> The same broken spelling was propagated to `08-RESEARCH.md` § *Validation Architecture*
> (Wave 0 item 5), `08-01-PLAN.md` (incl. an acceptance criterion), `08-05-PLAN.md` ×3 and
> `08-VERIFICATION.md`. Those are historical records of what was planned; **this file is the
> procedure meant to stay runnable, so it is corrected here.** Nobody caught it through
> research → plan → plan-check → execute → verify because nobody executed it — the same
> class as the three pass-by-accident gates this phase did catch.

Start a Claude Code chat turn in Drift with the MCP attached, and while it is still running:

```
ps -eo pid,ppid,pgid,args | grep -E 'mcp-server\.mjs|--mcp-config' | grep -v grep
```

Record the **pgid** of the `node …mcp-server.mjs` row and the **pid** of the `claude` row
carrying `--mcp-config` (that is Drift's child; unadorned `claude` rows are unrelated
sessions).
Equal → A6 closed favourably: the MCP child sits in the CLI's group, so a group signal reaches
it. Different → the CLI calls `setsid()` on its own child; LIF-02 is **not** closed by process
groups alone. Report and stop.

### Step 4 — reading 5 (the LIF-02 control)

With that same turn still running:

```
pgrep -f mcp-server.mjs | wc -l
```

Click Stop in the Drift chat, wait ~3 seconds, then run it again:

```
pgrep -f mcp-server.mjs | wc -l
```

Record both counts. A non-zero count **after** Stop is the LIF-02 defect reproduced on real
hardware. Clean up any survivor by pid before continuing.

Do not summarise, interpret or round any of the five readings. Record what the terminal said.

---

## What this spike does NOT close

Everything. Stated unsoftened, because the whole point of a spike record is that a later reader
can tell measured ground from assumed ground:

- **It closes nothing at all.** A1 and A6 are exactly as open as they were before Phase 8 began.
  This file adds no evidence; it documents the absence of evidence and the decision that caused it.
- Had it run, it would still have measured **one** Caido build, on **one** platform, with **one**
  provider CLI. It would have said nothing about Windows, nothing about Gemini, Codex or Copilot,
  and nothing about a future Caido that rebases its LLRT fork.
- `08-VALIDATION.md` § *Vehicle caveat* remains the standing list of what this phase's evidence
  does not cover. Items 2 and 3 there — "it will not prove Caido's LLRT" and "it will not prove
  that any real CLI's MCP child is in the killed group" — now apply **in full**, with the Wave 0
  partial closure they each name as mitigation not taken.

### The consequence, plainly

The phase's POSIX mechanism for LIF-02 rests on source analysis of `caido/dependency-llrt@caido`
at the pinned commit `a5b021c`, and on nothing that was ever executed. If the Caido build users
actually run ships a fork that differs — an older one without the `detached` branch, or one that
handles it differently — then the group kill signals a process group that was never created,
LIF-02 is not closed, and **every CI leg stays green while it happens**, because every CI leg runs
Node and Node honours the option. That is finding L-4 of `05-RESEARCH.md` recurring: green CI is
not evidence about a runtime CI never exercises. Plan 08-02's decision OQ-2 — keep the single-pid
signal alongside the group signal, explicitly as defence against A1 — is now the phase's **only**
protection against this, and it degrades a total regression into a partial one rather than
preventing it.
