---
phase: 7
slug: provider-spawn-registration
status: secured
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
block_on: high
created: 2026-08-24
audited_at_head: 61df672
register_authored_at_plan_time: true
---

# Phase 7 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time across five `<threat_model>` blocks (34 rows) and
> verified against the shipped code by `gsd-security-auditor` in two passes.

---

## What this phase changed about credential exposure

Stated first because it is the phase's defining security fact. Before Phase 7, the Caido
session token lived in a `0o600` shell wrapper inside a `0o700` Drift-created temp
directory that `sweepOrphanedMcpTempDirs` swept on every start. SC-7 deleted that wrapper.
The token now reaches Gemini and Codex through their own persistent configuration files:

| CLI | What is written | Where | Swept by Drift? |
|---|---|---|---|
| Gemini | `${CAIDO_TOKEN}` **reference** — no token bytes | `~/.gemini/settings.json` (`user` + `project` scopes) | Yes, both scopes, at MCP-server start |
| Codex | The **literal token** | `~/.codex/config.toml` (unscoped) | Yes, at MCP-server start |

The Codex literal is a deliberate, user-approved trade — see Accepted Risks AR-01. Codex
performs no `${VAR}` expansion anywhere on its read path, so a reference would be delivered
verbatim as the token, always.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Drift backend → `cmd.exe` | Windows `.cmd` shims cannot be spawned directly (CVE-2024-27980); an interpreter is invoked with an escaped command line | Provider argv, `%TEMP%` paths, tool allowlists — and on the registration path, the Caido token |
| Drift backend → external CLI config | `gemini`/`codex mcp add` persist a server entry into the user's home directory | Caido session token (Codex: literal; Gemini: reference) |
| Drift backend → MCP server child | `node.exe mcp-server.mjs` spawned with a structured `env` | Caido token, tool policy, per-session activity/approval paths |
| External CLI → MCP server child | The CLI spawns Drift's registered server and supplies its environment | Gemini forwards its env (approval channel works); Codex `env_clear()`s (channel unavailable) |
| MCP server → Caido GraphQL | Bearer-authenticated HTTP | Caido token, live proxy history |

---

## Threat Register

34 rows across five plans. All closed. Severity/disposition as authored at plan time.

| Threat ID | Category | Component | Sev | Disposition | Mitigation (verified) | Status |
|---|---|---|---|---|---|---|
| T-07-01 (01) | EoP | `spawn-plan.ts` | critical | mitigate | cross-spawn escaping ported verbatim; metachar set incl. space/`%`/`,`; backslash-doubling + quote wrap + caret pass; `windowsVerbatimArguments: true`. `grep -rn "shell: *true" packages/` → 0 hits | closed |
| T-07-02 (01) | EoP | `spawn-plan.ts` | medium | mitigate | `/d /s /c` returned in the plan, not chosen per call site — `/d` disables the per-user AutoRun key | closed |
| T-07-03 (01) | Tampering | spawn sites | high | mitigate | `windowsVerbatimArguments` required on `SpawnWithEnv`; literal key delivered at all spawn sites | closed |
| T-07-04 (01) | InfoDisc | debug log | low | **accept** | `lastSpawnArgs` records the provider launch only; the `codex mcp add --env CAIDO_TOKEN=…` argv is never recorded — see AR-02 | closed |
| T-07-05 (01) | Spoofing | provider binary | low | **accept** | No shim signature/content validation shipped, as declared — see AR-03 | closed |
| T-07-09 (02) | EoP | `cli-providers.ts` | high | mitigate | Refusal branch first; `Object.values().includes` (no prototype chain); `__proto__`/`constructor`/`toString` asserted | closed |
| T-07-10 (02) | InfoDisc | `mcp-server.mjs` | medium | mitigate | Refusal names key NAMES only; no env or path interpolation | closed |
| T-07-11 (02) | InfoDisc | provider card | medium | mitigate | All 9 `skippedMcpCliReasons.set` sites value-free; card renders via `{{ }}`, not `v-html` | closed |
| T-07-12 (02) | Spoofing | capability table | medium | mitigate | Unconditional refusal upgrade + upstream re-check note | closed |
| T-07-03 (03/04) | InfoDisc | CLI config files | high | mitigate | Startup sweep before registration; cleanup removal; security line + paste-able command. Boundary recorded in AR-01 | closed |
| T-07-04 (03) | InfoDisc | Gemini registration | high | mitigate | Gemini receives `CAIDO_TOKEN_REFERENCE`; asserted by argv literal search | closed |
| T-07-05 (03/04) | InfoDisc | registration log | high | mitigate | Three scalars; zero `result.stderr` reads on any registration/removal path | closed |
| T-07-06 (03) | Spoofing | `${CAIDO_TOKEN}` guard | high | mitigate | Pure predicate, both directions asserted. **Structural backstop, not a live gate** — see UF-2 | closed |
| T-07-07 (03) | Tampering | Gemini `--env` parser | medium | mitigate | The reference contains no `=`, so it never traverses gemini's `split('=')` truncation | closed |
| T-07-09 (03) | EoP | tool policy | high | mitigate | Shared `excludeSensitiveToolNames`; `DRIFT_ALLOWLIST_ACTIVE` stays `"1"`; Codex channel `kind:"None"` | closed |
| T-07-13 (03) | Tampering | registration env | high | mitigate | D-03's per-session keys stripped **structurally**, not by trusting the caller; over-supplied input asserted | closed |
| T-07-14 (03/04) | EoP | `cmd.exe` resolution | high | mitigate | `selectComspec` at all 5 `buildSpawnPlan` sites; count + `comspec` pinned by source gate; exercised on real Windows | closed |
| T-07-15 (04) | InfoDisc | removal scopes | high | mitigate | Removal scopes read from `MCP_CLI_WRITE_SCOPE` — write scope cannot diverge from remove scope | closed |
| T-07-16 (04) | DoS | sweep loop | medium | mitigate | Per-iteration try/catch; `spawnAndWait` always resolves | closed |
| T-07-17 (04) | InfoDisc | process tree | high | **transfer** | Phase 8 owns LIF-01; seams marked in code. Roadmap ownership verified | closed |
| T-07-18 (05) | InfoDisc | scratch branches | high | mitigate | Both CI-proof branches absent from remote; the surviving `scratch/ci-06-07-phase-close` is an ancestor of HEAD | closed |
| T-07-19 (05) | Repudiation | CI evidence | medium | mitigate | Run URLs + per-leg/per-step conclusions recorded; WR-08 gate ships and has executed | closed |
| T-07-20 (05) | Spoofing | phase claims | high | mitigate | Vehicle caveat, source-verified Gemini row, residual recorded | closed |
| T-07-21 (05) | Repudiation | checkpoint | low | mitigate | RELAYED provenance recorded | closed |
| T-07-22 (04) | Repudiation | sweep reporting | medium | mitigate | `classifyMcpRemoveExit` — only `failed` reaches the formatter; a clean start writes nothing | closed |
| **T-07-08** | Repudiation | reason map | **high** | mitigate | **Closed on re-audit.** The compound path (failed pre-clean + failed `mcp add`) composed rather than overwrote as of `0d34f53`; every outstanding scope named, not just the first | closed |
| T-07-SC (×5) | Tampering | supply chain | high | mitigate | `git diff 4203dbd..HEAD -- package.json pnpm-lock.yaml packages/*/package.json` is **empty** — no dependency added all phase | closed |

*Status: open · closed · open — below `high` threshold (non-blocking)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| **AR-01** | T-07-03 (03/04) | **A live Caido session token rests in `~/.codex/config.toml` between sessions**, outside the swept temp root and outside the per-user `%TEMP%` ACL baseline. Accepted at a blocking `checkpoint:decision` as option `literal-plus-guarantees`, **conditional on** two mitigations, both verified present: an unconditional dual-CLI startup sweep, and a failed removal surfaced as a security event carrying a paste-able remediation command. **This deviates from ROADMAP SC-3**, which authorises only a `${VAR}` reference or a `DRIFT_TOKEN_FILE` indirection for Codex; research proved the reference impossible there, and the user was separately offered an SC-3 amendment and declined it. **True boundary of the residual:** UF-1 (the sweep runs only when the MCP server starts) and UF-3 (the file's mode at rest was never derived). | six2dez | 2026-08-24 |
| **AR-02** | T-07-04 (01) | `lastSpawnArgs` records the `cmd.exe` form of the provider launch. No credential travels that path — the token-bearing `mcp add` argv is never recorded. | six2dez (via phase plan) | 2026-08-24 |
| **AR-03** | T-07-05 (01) | No signature or content validation of a resolved provider binary. Drift spawns what the user's PATH and settings point at, as it always has. | six2dez (via phase plan) | 2026-08-24 |
| **AR-04** | T-07-17 | Process-tree kill transferred to Phase 8 (LIF-01). Until then, a cancelled turn can leave a token-bearing MCP child alive. Ownership verified in ROADMAP § Phase 8. | six2dez (via roadmap) | 2026-08-24 |

---

## Unregistered flags — carried to Phase 8

Found during audit, outside the plan-time register. **None is blocking**; all are recorded
here so they enter Phase 8 as threats rather than as folklore.

| Flag | Sev | Summary | Why not fixed here |
|---|---|---|---|
| **UF-3** | — | **Register first.** The token's *readability at rest* in `~/.codex/config.toml` was never derived. The `literal-plus-guarantees` acceptance reasoned entirely about the residual's **lifetime**; `CLAUDE.md` names `0o600`/`0o700` as the standing constraint the phase moved the token out from under. Codex writes that file under its own umask; on a shared POSIX host this is owner-only vs group/world-readable. | Needs investigation Drift does not own (Codex writes the file). A `chmod` after registration is a real option and a real decision. |
| **UF-2 + WR-07** | — | Gemini's `${CAIDO_TOKEN}` expands at **turn** time from the CLI child's env; every shipped guard sits one lifecycle stage to the left. The `injectedDriftVars = runtimeFiles === undefined ? {} : runtimeEnv` branch ships a persisted reference into an env with no such variable → `""` → the MCP server omits the `Authorization` header. **Fail-closed** (no disclosure), which is why it is a flag. WR-07's test title also overstates what it asserts. | Register as one item; the untested branch is the same object both concern, and WR-07 already proposes the `buildProviderSpawnEnv` extraction that fixes both. |
| **UF-4** | — | `windowsVerbatimArguments` is required on `SpawnWithEnv` but **optional** on `spawnAndWait`, which all four registration/removal spawns use. Correct today at every site by inspection; nothing structural stops a sixth call from dropping it. Identical shape to CR-01. | Source-gate obligation for Phase 8, which adds `taskkill` spawn sites on the same path. |
| **UF-5** | low | `unregisterMcpFromCli` and `sweepStaleMcpCliRegistrations` still `set` the reason inside the per-scope loop, so two failing Gemini scopes show only the last on the card. Console and diagnostics carry both; the surviving line is the shadowing `project` scope. `formatMcpRemoveFailures` is the ready-made fix. | Low severity; the security line and a working command still reach the user. |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-24 (pass 1, `345b4f5`) | 34 | 33 | 1 (T-07-08, high — blocking) | gsd-security-auditor |
| 2026-08-24 (pass 2, `61df672`) | 34 | 34 | 0 | gsd-security-auditor |

**Between passes:** T-07-08 fixed in `0d34f53` (compose rather than overwrite; every outstanding
scope named). UF-1 fixed across `0d34f53` and `61df672` — the README's sweep-reachability claim
appeared in **two** paragraphs from the same commit, and correcting only the cited one left the
other asserting a property the code does not have.

**Note on this phase's dominant defect class**, recorded because it recurred four times: a check
aimed one argument, one lifecycle stage, or one sentence away from the hazard it names. CR-01
(every gate aimed at the argv, none at `file`), the orchestrator's sweep verification (checked the
plan's list of gates, not the README's promise), UF-2 (guard one lifecycle stage left of the
expansion), and UF-1 twice over. Every instance was caught by reading code against the *claim*,
never by an automated gate.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] Unregistered flags carried to Phase 8 with a named first item (UF-3)
