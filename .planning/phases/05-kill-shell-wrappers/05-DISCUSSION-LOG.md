# Phase 5: Kill Shell Wrappers - Discussion Log

**Date:** 2026-08-20
**Mode:** discuss (default, interactive)

> Human reference only — audits and retrospectives. Downstream agents (researcher, planner,
> executor) read `05-CONTEXT.md`, not this file.

---

## Area selection

**Presented (multi-select):** Gemini/Codex fallout · Provider launch script · Windows CI evidence ·
Token on disk
**Selected:** all four.

Two items were stated up front as defaults rather than asked, and neither was contested:
`buildMcpServerSpec()` lands in a pure module (not `index.ts`), and RUN-04 is satisfied
structurally by deleting the wrappers it targets.

---

## Area 1 — Gemini/Codex fallout

### Q1. Deleting `mcp-wrapper.sh` strands Gemini/Codex without their env. How should Phase 5 handle them?

| Option | |
|---|---|
| **POSIX wrapper survives** *(recommended)* | Platform-guard; win32 skips registration with a stated reason. SC-1 softens to "Claude/self-test path". |
| Pull Phase 7's `--env` forward | SC-1 literally true, but lands roadmap-flagged research-required work unverified. |
| Fail them closed | Literal SC-1 compliance bought with a real macOS/Linux regression. |
| You decide | — |

**Selected: POSIX wrapper survives.**
Decisive fact: `registerMcpWithCli` (`index.ts:2249`) registers the wrapper, whose `export` lines
are the sole env carrier for those two CLIs — deletion without `--env` is a live CMP-01 regression.

### Q2. What guarantees the last `.sh` actually dies in Phase 7?

| Option | |
|---|---|
| **Both: fence + re-target** *(recommended)* | Roadmap SC-1 amendment + explicit Phase 7 criterion, **and** a dated `DELETED IN PHASE 7 (PRV-03)` code header + win32-unreachability test. |
| Roadmap re-target only | Traceability honest, but the code looks permanent to a reader. |
| Code fence only | Visible in code, but the deletion is owned by no phase. |
| You decide | — |

**Selected: Both.**
Precedent cited: `windows-llrt-probe.yml`'s own header — *"the due date is named literally because
an undated 'temporary' comment becomes permanent"* — and the RUN-04 re-target at Phase 4's close.

### Q3. On Windows, Gemini and Codex register no MCP at all. How should that surface?

| Option | |
|---|---|
| **In-product + README** *(recommended)* | Reuse `skippedMcpCliReasons` (`index.ts:2240`) + a README line; same shape Phase 7 SC-4 already demands. |
| Diagnostics only | Information exists, but only for someone already suspicious. |
| Hide the providers on win32 | Unambiguous, but frontend work with no other reason to happen here. |
| You decide | — |

**Selected: In-product + README.**

---

## Area 2 — Provider launch script

Framing offered before the question: because Q1 kept `renderExportExecScript`/`shellQuote` alive,
converting `provider-launch-<sessionId>.sh` now buys the deletion of `writeLaunchScript` **alone** —
a smaller prize than SC-1 implies.

### Q1. Does Phase 5 convert `provider-launch-<sessionId>.sh`?

| Option | |
|---|---|
| **Convert on all platforms** *(recommended)* | Behaviourally identical on POSIX, so fully exercised by the existing suite; hands Phase 7 a clean seam. |
| Convert on win32 only | Consistent with the Q1 guard pattern, but creates a Windows-only arm no CI reaches. |
| Leave entirely to Phase 7 | Phase stays tight; SC-1 softens twice in one phase. |
| You decide | — |

**Selected: Convert on all platforms.**

### Q2. How to handle the unverified "is `process.env` complete under LLRT?" risk?

Source: `research/ARCHITECTURE.md` § *Pattern 1*, flagged MEDIUM confidence.

| Option | |
|---|---|
| **Report via the probe** *(recommended)* | PATH-presence + key count as reported-not-gating, per Phase 4's D-06 rule. Fallback is real: the MCP server is spawned by absolute path. |
| Gate MCP start on PATH | Loudest, but refuses to start where the health check demonstrably works. |
| Ignore for now | Least code — and the same shape of unmeasured assumption that caused this milestone. |
| You decide | — |

**Selected: Report via the probe.**

### Verified rather than asked

- `finalize()`'s cleanup is guarded by `if (launchCommand !== resolved)` (`index.ts:3308`); after
  the conversion that is permanently false, so the branch must be deleted with the indirection —
  a bare `rm(launchCommand)` would delete the user's `claude` binary.
- `platform.ts:262`'s **T-04-04** comment already forbids rendering `buildSpawnEnv` output into a
  log, so the launch-script debug preview cannot become an env dump.

---

## Area 3 — Windows CI evidence

Gap established first: SC-2 names `validateCaidoAuth` (`index.ts:1208`) and the self-test, both in
a 4,003-line `index.ts` that imports `caido:plugin`; no test file imports it and `vitest.config.ts`
declares no alias. The only `windows-latest` job installs no dependencies and is stamped
*DELETED IN PHASE 9*.

### Q1. Where does SC-2's Windows evidence actually run?

| Option | |
|---|---|
| **Pull CI-01 forward** *(recommended)* | Permanent `windows-latest` build+vitest job in `ci.yml` now; Phase 9 narrows to making it required and green for the right reasons. |
| Extend the LLRT probe | Reuses a vehicle stamped for deletion, in a job nobody must look at. |
| New temporary workflow | Clean separation; same continuity problem, third Windows workflow. |
| You decide | — |

**Selected: Pull CI-01 forward.**

### Q2. What executes on the Windows runner, given `index.ts` is unimportable?

| Option | |
|---|---|
| **Pure spec + spawn test** *(recommended)* | Integration test imports the **production** builder and spawns `spec.command`/`args`/`env` against a local HTTP stub, the shape `mcp-server.transport.test.ts` already uses. Caveat recorded verbatim. |
| Make `index.ts` importable | Highest fidelity; drags 4,003 lines of untested module-level singletons into the test process mid-rewrite. |
| Both, sequenced | Best coverage; puts an open-ended spike on the critical path. |
| You decide | — |

**Selected: Pure spec + spawn test.** The rejected option was carried to Deferred Ideas rather than
dropped.

### Q3. How far does Phase 5 go on CI-03's CRLF work?

Measured before asking: no `toMatchSnapshot`/`toMatchInlineSnapshot` anywhere in the repo; exactly
one test reads a file and it writes that file itself; no `.gitattributes` exists.

| Option | |
|---|---|
| **Blocking, land `.gitattributes`** *(recommended)* | Cheap per the measurement; re-target CI-03 into Phase 5. |
| Blocking but narrow | Honestly green, but leaves the rest of the suite unguarded on Windows. |
| Non-blocking until Phase 9 | The exact weakness rejected one layer up in Q1. |
| You decide | — |

**Selected: Blocking, land `.gitattributes`.**

---

## Area 4 — Token on disk

### Q1. How does `CAIDO_TOKEN` reach the MCP server through Claude's `mcp-<chatId>.json`?

| Option | |
|---|---|
| **Literal, as Copilot does** *(recommended)* | Byte-identical to `copilot-mcp-<chatId>.json` today; no new exposure class, same dir/lifetime/cleanup. |
| `${CAIDO_TOKEN}` indirection now | Token never touches the file, but failure mode is a silently unauthenticated MCP server. |
| `DRIFT_TOKEN_FILE` for everyone | Right end state (Phase 7 wants it for Codex); a new mechanism built in the phase whose job is deleting mechanisms. |
| You decide | — |

**Selected: Literal, as Copilot does.**

### Q2. What replaces the debug log's redacted wrapper-content dump (`index.ts:2910`)?

| Option | |
|---|---|
| **Command + args + key names** *(recommended)* | Already the rule, per `platform.ts:262`'s T-04-04 comment. Config-content dump stays; its JSON redaction arm already covers it. |
| Dump the redacted config only | Goes blind for providers whose env arrives only via `spawn`. |
| Dump the full env, redacted | Contradicts T-04-04; a regex redactor over a whole environment fails open. |
| You decide | — |

**Selected: Command + args + key names.**

### Verified rather than asked

- `callMcpMethod` writes a third token-bearing script, `mcp-self-test-<id>.sh` (`index.ts:1719`),
  which `spawnNode` removes entirely — a net reduction in token blast radius.

---

## Closing gate

**Asked:** which gray areas remain unclear?
**Answer:** *I'm ready for context.*

Offered and not taken, recorded instead under Claude's Discretion: whether `buildMcpRuntimeEnv`
moves into the pure spec module; the surviving wrapper's naming/lifecycle; and the plan split
(roadmap's provisional 2 is now clearly low).

## Deferred ideas raised during discussion

- `caido:plugin` vitest alias to make `index.ts` importable — natural home Phase 9.
- Everything already owned by Phases 6–10 (PRV-02, PRV-03, PRV-05, HRD-01) was named and pushed
  back rather than absorbed.

## Scope creep redirected

None. Every candidate that reached outside the phase boundary was an existing later-phase
requirement, so it was cited by ID and deferred rather than argued.
