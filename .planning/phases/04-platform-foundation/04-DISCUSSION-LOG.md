# Phase 4: Platform Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-14
**Phase:** 04-platform-foundation
**Areas offered:** platform.ts surface, Probe fail policy, Temp dir & sweep, Perf budgets
**Areas discussed:** platform.ts surface, Probe fail policy
**Areas declined:** Temp dir & sweep, Perf budgets

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| platform.ts surface | Descriptor vs discrete functions; where `os.platform()`/`os.tmpdir()` get called given the module must stay I/O-free | ✓ |
| Probe fail policy | Hard-fail vs degrade; which primitives count as required; what version string, given `sdk.meta` exposes none | ✓ |
| Temp dir & sweep | Legacy `/tmp` sweep on POSIX after upgrade; MAX_PATH shortening vs guessability | |
| Perf budgets | Buffer caps + truncation marker; cache TTL + negative caching; activity offset-read mechanism | |

**Notes:** Two of four selected. Before the question, three verified code facts were surfaced that
change the phase's shape: `mcp-server.mjs` is *already* copied once at MCP start (`index.ts:1719`),
so SC-3's "not per turn" is already satisfied; the backend imports `os` nowhere today; and `sdk.meta`
exposes no Caido version, so SC-4's version requirement has no source. A sequencing flag was also
raised — Phase 2 is still `Not started` and its SEC-02 lands on the same filenames SC-3 shortens.

---

## platform.ts surface

### Q1 — module surface shape

| Option | Description | Selected |
|--------|-------------|----------|
| Discrete pure functions | Matches `command-resolution.ts`'s `getCommandExecutableCandidates({...input})` convention; each independently unit-testable; callers pull only the subset they have inputs for | ✓ |
| One frozen descriptor | `createPlatformProfile()` derives everything once; one snapshot test could prove the whole POSIX surface byte-identical; but every caller must supply all inputs for the one field it needs | |
| Functions + thin profile | Discrete primitives plus a thin composition helper for the one caller that wants everything | |

**User's choice:** Discrete pure functions.
**Notes:** Presented as side-by-side code previews. The signatures shown in the preview are the
agreed shape and were copied verbatim into CONTEXT.md D-01 — the planner should write them as given
rather than re-deriving. The aggregate helper was rejected outright, not deferred.

### Q2 — where the host facts are read and cached

| Option | Description | Selected |
|--------|-------------|----------|
| Lazily, inside the probe | The RUN-05 probe is the only code that touches `os`, wrapped in try/catch, cached to a module-level `let`; a missing `os` degrades to a loud MCP-start error and the probe becomes authoritative | ✓ |
| Module const at plugin init | Cheapest, one point, no staleness — but if LLRT lacks `os`, the throw lands during module evaluation and the whole plugin dies, chat and settings included; RUN-05 never speaks | |
| Call `os` at each site | No cache to invalidate, but scatters the `os` dependency and leaves the probe unable to guarantee the sites it validated are the sites that run | |

**User's choice:** Lazily, inside the probe.
**Notes:** The deciding argument was blast radius on failure, not cost. Follow-on ordering issue
raised immediately and carried into the probe area: `getSessionDebugLogPath` (`index.ts:337`) and the
orphan sweep both need `host`, and the sweep currently runs *before* the copy inside `startMcpServer`.

### Q3 — the Phase 4 / Phase 6 boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 4 = shape, Phase 6 = data | Phase 4 ships all four functions with POSIX byte-identical + tested, plus platform-invariant primitives (`which` vs `where` name, `.exe`/`.cmd` list, which env vars to read). Phase 6 fills install-location arrays, `where` CRLF parse, UX-02 copy | ✓ |
| Phase 4 lands Windows data too | Phase 6 shrinks to `where.exe` plumbing + UX-02; fewer round-trips, but Phase 4 absorbs RES-01/RES-03 and traceability stops matching what shipped where | |
| Phase 4 = temp root only | Smallest Phase 4, but Phase 5 then has no platform module for its node-path decisions and must reach into `command-resolution.ts` directly | |

**User's choice:** Phase 4 = shape, Phase 6 = data.
**Notes:** The question existed because SC-1's four coverage areas ("temp root, which/where selection,
home dirs, executable candidate names") literally overlap Phase 6's RES-02/RES-03. The chosen line
keeps requirement traceability honest.

### Q4 — where `realpathSync.native` normalisation lives

| Option | Description | Selected |
|--------|-------------|----------|
| Ship helper + probe it | Impure `normalizePathForCompare()` outside `platform.ts` with a guarded ladder `realpathSync.native` → `fs/promises.realpath` → `path.resolve`; realpath availability joins the probe's measured set | ✓ |
| Async realpath only | Stays inside the already-imported `fs/promises`, no new `node:fs` sync surface in LLRT; but 8.3 expansion is less certain, every site becomes async, SC-10's wording needs amending | |
| Defer to Phase 6 | Document the rule + a test fixture proving the two spellings differ, ship no helper; requires amending SC-10 to a documentation criterion | |

**User's choice:** Ship helper + probe it.
**Notes:** Stated openly in the question that **no Phase 4 code actually needs the helper yet** — the
orphan sweep compares two paths both derived from the same cached `host.tmpdir`, so they are
string-identical by construction. Accepted anyway because SC-10 names it as a Phase 4 criterion and
Phase 6 is where it bites. CONTEXT.md carries an explicit "do not clean up the unused export" note.

### Continue check

| Option | Description | Selected |
|--------|-------------|----------|
| Next area | Move to Probe fail policy | ✓ |
| More questions | `Platform` type union, `getWhichCommand` return shape, POSIX byte-identity test strategy, rewiring `command-resolution.ts`'s exports | |

**Notes:** The remaining items were named as planner-shaped before the check, and recorded under
Claude's Discretion rather than dropped.

---

## Probe fail policy

### Q1 — failure policy

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-fail everywhere | One code path, one message. If `os` is genuinely absent the POSIX path cannot reach `os.tmpdir()` either, so falling back to `/tmp` would ship a build whose Windows path is dead while POSIX quietly works | ✓ |
| Degrade to `/tmp` on POSIX | Zero POSIX regression by construction; but two code paths, and a real LLRT gap ships silently green on the platforms most users run | |
| Warn everywhere, never block | Maximally non-disruptive; but RUN-05's "fails loud with an actionable message" is not met and the user still gets the cryptic downstream error | |

**User's choice:** Hard-fail everywhere.
**Notes:** Question was framed around the CMP-01/CMP-02 regression risk explicitly, since a naive
hard-fail reading looks like it violates the milestone invariant. The counter-argument accepted was
that the silent-POSIX-success case *is* the failure mode this milestone exists to kill.

### Q2 — what gates versus what reports

| Option | Description | Selected |
|--------|-------------|----------|
| Gate what has no fallback | `os.platform()` + `os.tmpdir()` gate; realpath reports (the SC-10 ladder already degrades); Windows env vars report (Phase 6's, platform-conditional). All results land in the message and `getDiagnostics` regardless | ✓ |
| Gate the full Phases 4-8 set | Fails as early and completely as possible; but blocks MCP for capabilities with no shipped consumer, and gating realpath contradicts having built it a fallback ladder | |
| Gate `os.tmpdir()` only | Narrowest gate; but an unrecognised `os.platform()` sails through and every branch takes the POSIX arm — on Windows that is the current bug reintroduced one layer up | |

**User's choice:** Gate what has no fallback.
**Notes:** Yielded a reusable rule rather than a list, which is what went into CONTEXT.md D-06 as a
table. The rule survives new primitives being added later.

### Q3 — probe depth for `os.tmpdir()`

| Option | Description | Selected |
|--------|-------------|----------|
| Probe wraps the real first write | `startMcpServer` already does `mkdir(0o700)` + `writeFile(mcp-server.mjs)`; make that the assertion. Zero extra I/O, catches the actual failure, and RUN-04's retry ladder + RUN-05's probe become one mechanism | ✓ |
| Separate canary file | Clean separation, deterministic to unit-test; but doubles startup temp I/O and the canary can itself trip the AV race it exists to detect — a false negative on exactly the machines that matter | |
| String + stat only | Cheapest, matches Phase 3's P0-TMP wording; but a read-only or Defender-locked temp dir sails through and dies at the copy with the cryptic error RUN-05 exists to replace | |

**User's choice:** Probe wraps the real first write.
**Notes:** The strongest structural outcome of the session — it collapses RUN-04 and RUN-05 into a
single mechanism instead of two features that happen to touch the same directory.

### Q4 — message content and the missing version

| Option | Description | Selected |
|--------|-------------|----------|
| Best-effort version block | `process.version`/`versions`, `os.platform()`+`os.release()`, and Drift's manifest version, each guarded, `"unavailable"` on failure; surfaces in MCP status, `sdk.console`, `getDiagnostics` | ✓ |
| Drift plugin version only | Always available, zero guarded reads; but says nothing about *which runtime* failed — and the runtime is the whole unknown | |
| Amend SC-4, drop the version | Honest about the SDK exposing none, smallest surface; but a bug report arrives without the one field that would identify the runtime | |

**User's choice:** Best-effort version block.
**Notes:** This question only existed because `sdk.meta` was checked directly during the scout and
found to expose only `db()`, `path()`, `assetsPath()`. CONTEXT.md D-08 records the SC-4 wording gap
explicitly so a later verifier does not read it as an omission.

### Final check

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context | Write CONTEXT.md; unselected areas recorded as Claude's Discretion with stated defaults | ✓ |
| Discuss the legacy `/tmp` sweep | The one skipped item with a security rather than tuning consequence | |
| More on probe fail policy | Retry backoff shape, probe-result caching across restarts, Linux-runner test strategy, status-panel rendering | |
| Explore more gray areas | POSIX byte-identity proof, whether Phase 4 absorbs SEC-02, Phase 2 sequencing | |

**Notes:** The legacy-`/tmp` consequence was stated in full before this question — that switching to
`os.tmpdir()` moves macOS to `/var/folders/…`, so token-bearing `drift-mcp-*` dirs left by shipped
0.1.0 would never be swept again. The user chose "ready for context" **with the ship-it default
explicitly on the table**, so it is recorded as a discussed-and-agreed default, not an unexamined gap.

---

## Claude's Discretion

Reviewed and declined, each with a default recorded in CONTEXT.md:

- **Legacy `/tmp` sweep arm on POSIX** — default: ship it. The only declined item with a security
  consequence; the consequence was stated before the decline.
- **Temp-path / filename shortening for MAX_PATH (SC-3)** — planner's scheme, with a floor on the
  random component's entropy (`genUUID` is `Math.random`-based).
- **PERF-04 buffer bounds** — cap, keep-head/keep-tail, truncation marker; two sites with possibly
  different policies (the `stdout`/`stderr` accumulators vs `claude-print.ts`'s line buffer, where the
  hazard is a never-terminated line, not total volume).
- **PERF-03 resolution cache** — TTL, and whether not-found results are cached; the trade-off in both
  directions was recorded.
- **PERF-02 activity-file offset read** — `open()`+`read()` vs stream, partial-line buffering,
  offset > size reset.
- **`getSessionDebugLogPath` when `host` is unset** — default: return `undefined`. `debugLogging` is
  opt-in, so skipping beats reintroducing a hardcoded `/tmp`.
- **Small `platform.ts` details** — narrow `Platform` union vs `NodeJS.Platform`; whether
  `getWhichCommand` returns a spawn spec or a binary name.

## Deferred Ideas

- **Phase 2 still `Not started`** — SEC-02 lands on the same filenames SC-3 shortens. Phase 4 does not
  absorb it; Phase 2's validation must be re-checked against the new scheme.
- **`genUUID` → `crypto.randomUUID`** — blocked by Phase 3's P3-UUID (Node-vehicle, zero LLRT
  confirmation either way). Keep the hex loop.
- **`icacls` ACL hardening (HRD-01)** — already v2 in STATE.md; POSIX modes are ignored on Windows and
  that is the accepted trade-off.
- **Event-driven `sendCliMessage` refactor (backlog 999.1)** — would delete the 250 ms heartbeat
  PERF-02 optimises; stays sequenced after the port.
- **Repo-wide Prettier sweep (backlog 999.11)** — collides with the Phase 5-8 byte-stability fence.
- **Real-machine confirmation from @0xMRK0S** — Phase 9/10; what finally closes the LLRT residual risk
  every decision here infers around.
