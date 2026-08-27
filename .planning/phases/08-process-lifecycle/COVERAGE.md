---
phase: 08-process-lifecycle
kind: api-coverage-declaration
form: reasoned-no-external-api
created: 2026-08-27
authored_by: plan 08-10
supersedes: "08-UAT.md frontmatter gate_overrides → api-coverage.verify-pre (2026-08-24)"
---

# Phase 8 — API coverage declaration

## The declaration

**Phase 8 integrates no external API. It terminates processes. There is no capability surface to
enumerate, so this phase's coverage artifact is a reasoned declaration rather than a matrix.**

## The one-line reason

Every "API" this phase touches is an **operating-system process primitive** invoked through
`child_process.spawn` — `taskkill.exe`, `kill`, `pgrep`, `where.exe`, `cmd.exe` — and OS process
primitives are not an integrated external service with a capability surface a coverage matrix
could enumerate: there is no vendor, no versioned endpoint set, no authentication, and no
subset-of-features question to answer.

## The detector output this replaces, and why it fired

The `api-coverage.verify-pre` gate returned `detected: true` at verify time and was recorded as a
**false positive** in `08-UAT.md`'s `gate_overrides` block on 2026-08-24. This file restates that
reasoning in the accepted form, so the gate passes on a **reason** rather than on an **override**.

The detector matched this sentence, from `08-SECURITY.md` **AR-01**:

> The correct primitive is a Windows **Job Object** with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`,
> which requires Win32 API calls neither Caido's LLRT nor Node exposes without a native addon —
> banned by the QuickJS runtime constraint (`CLAUDE.md` § *Backend Constraints*)

That is a sentence stating that a Win32 API is **NOT available** and **NOT used**. It is an
explanation of an accepted residual, and the words that tripped the detector are the words
naming the thing the phase deliberately does not do.

Two corroborating facts, recorded because they are what make this a false positive rather than a
judgement call:

1. **The same detector returned `detected: false` at plan time.** It fires now only because the
   executed plans added prose containing the word — prose about the API's *absence*.
2. **No dependency was added anywhere in the phase.** `git diff` over `package.json` and
   `pnpm-lock.yaml` across plans 08-01…08-10 is empty; `08-RESEARCH.md` § *Package Legitimacy
   Audit* is present and empty ("audited, empty", not "skipped"). Threat **T-08-SC** is closed on
   that basis and was re-checked across the five gap plans on 2026-08-27.

## What would invalidate this declaration

Any future Phase 8 work that reaches a **network service** or a **vendor SDK** — for example, a
native addon exposing Win32 Job Objects (the AR-01 remediation), or a telemetry endpoint for
lifecycle events. Either would introduce a real capability surface, and this declaration would
have to be replaced by an actual coverage matrix rather than amended.
