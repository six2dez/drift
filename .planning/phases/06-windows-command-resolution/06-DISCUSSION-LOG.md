# Phase 6: Windows Command Resolution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-21
**Phase:** 06-windows-command-resolution
**Areas discussed:** where.exe contract, Windows path shapes, Catalogue + tests, UX-02 copy

Four areas offered, all four selected. 16 questions, 16 answers, zero "Other" responses —
the recommended option was chosen every time.

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| where.exe contract | RES-02 — first-line-wins vs rank-by-extension, absolute-path spawn, exit semantics | ✓ |
| Windows path shapes | RES-03 — `extractHomeDir` drive letters, `path.join` flavour, 8.3 dedup | ✓ |
| Catalogue + tests | RES-01 + SC-5 — install locations, precedence, provability on the Linux runner | ✓ |
| UX-02 copy | Platform-aware hints, the deprecated Copilot command, four duplicated copies | ✓ |

---

## where.exe contract

### Q1 — Which output line wins?

| Option | Description | Selected |
|--------|-------------|----------|
| Rank all lines by extension | Parse every CRLF line, sort by `.exe` > `.cmd` > `.bat`, PATH order breaks ties | ✓ |
| First line wins, unchanged | Keep `out.head.split("\n", 1)[0]`, swap only the binary name | |
| First line, but re-probe the ladder | Use `where`'s first line as a directory hint, then stat the ladder there | |

**User's choice:** Rank all lines by extension → **D-01**
**Notes:** First-line-wins would satisfy SC-2 only by accident of PATH ordering, making the
criterion unprovable. Re-probing was rejected as up to 3 extra stats per resolve for a result
`where` already computed.

### Q2 — How is `where.exe`'s absolute path produced?

| Option | Description | Selected |
|--------|-------------|----------|
| Derive from %SystemRoot%, bare fallback | Extend `getWhichCommand` to `{ platform, env }` | ✓ |
| Hardcode `C:\Windows\System32\where.exe` | Matches the measured string verbatim, no signature change | |
| Keep bare `"where.exe"` | Smallest diff, relies on PATH | |

**User's choice:** Derive from %SystemRoot% → **D-02**
**Notes:** Hardcoding breaks on non-C: or non-default Windows roots and fails as a misleading
"not found in PATH". `SYSTEMROOT`/`WINDIR` are on libuv's eleven back-filled vars, so the input
is reliable.

### Q3 — How does the multi-line parse read the bounded buffer?

| Option | Description | Selected |
|--------|-------------|----------|
| Split `out.head` on `/\r?\n/`, keep the cap | Head only, never `renderBoundedBuffer`, no new constant | ✓ |
| Dedicated larger buffer for this spawn | Removes truncation entirely | |
| Parse head, and log when truncation is hit | Same as first, plus a diagnostic line | |

**User's choice:** Split `out.head`, keep the cap → **D-03**
**Notes:** Phase 5's PERF-04 site-7 comment already rejected per-site bounded-buffer exemptions;
reopening it would turn a closed principle into a negotiation. Truncation drops the
lowest-PATH-priority hits, which the ranking does not need.

### Q4 — Keep the 1000 ms PATH-search timeout on Windows?

| Option | Description | Selected |
|--------|-------------|----------|
| Platform-aware timeout, longer on win32 | 1000 ms on POSIX unchanged; more headroom on Windows | ✓ |
| Keep 1000 ms everywhere | One number, one code path | |
| Keep 1 s, but distinguish timeout from not-found | Fix diagnosability rather than guess a number | |

**User's choice:** Platform-aware timeout → **D-04**
**Notes:** A silent timeout is indistinguishable from "not installed". The exact win32 value is
left to the planner with an explicit "headroom estimate, not a measurement" comment, since the
maintainer cannot measure it locally.

---

## Windows path shapes

### Q1 — What happens to `path.join` in the candidate builders?

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-rolled separator-aware join | `joinPath({ platform, segments })` replaces every `path.join` | ✓ |
| Keep `path.join`, accept mixed separators | Win32 APIs accept forward slashes; smallest diff | |
| Only join where the flavour bites | Hand-roll the new Windows arms, leave POSIX lines alone | |

**User's choice:** Hand-rolled separator-aware join → **D-05**
**Notes:** The motive is evidence, not runtime breakage — with `path.join` the candidate strings
depend on the HOST, so a Linux-runner assertion cannot state what Windows produces and SC-5
degrades into testing the runner.

### Q2 — How is `extractHomeDir`'s Windows arm gated?

| Option | Description | Selected |
|--------|-------------|----------|
| Shape-sniff, stay platform-blind | Add a drive-letter arm, keep the one-string signature | ✓ |
| Inject platform, branch explicitly | Strictest, but every pre-probe caller passes `undefined` | |
| Shape-sniff, plus %USERPROFILE% takes priority | Extraction becomes a fallback rather than a peer | |

**User's choice:** Shape-sniff, stay platform-blind → **D-06**
**Notes:** Mirrors `isAbsolutePath`'s existing `platform: undefined` arm and keeps working before
the RUN-05 probe — which matters, since `getKnownHomeDirs` is reachable at plugin load.

### Q3 — Does Phase 6 wire `normalizePathForCompare`?

| Option | Description | Selected |
|--------|-------------|----------|
| Pure case/separator fold; leave realpath unused | Dedup on a lowercased, separator-normalized key | ✓ |
| Wire `normalizePathForCompare` into home-dir dedup | Honours 04-D-04 literally | |
| No extra dedup — accept duplicate stats | Zero new code, zero new risk | |

**User's choice:** Pure fold, decline the realpath wiring → **D-07**
**Notes:** A prior phase's expectation is declined explicitly rather than satisfied by
manufacturing a caller. 04-D-04's "do not delete the unused export" still binds.

### Q4 — What platform does `getKnownHomeDirs` pass pre-probe?

| Option | Description | Selected |
|--------|-------------|----------|
| Union both name sets when platform is unknown | Widen to `Platform \| undefined`; read HOME and the three Windows vars | ✓ |
| Default to POSIX pre-probe | Keeps the Phase 4 signature untouched | |
| Gate home-dir resolution on the probe | Cleanest invariant | |

**User's choice:** Union both name sets → **D-08**
**Notes:** Defaulting to POSIX would show all four CLIs unavailable on Windows until the probe
runs — close to the originally reported symptom. Gating on the probe is a POSIX regression.

---

## Catalogue + tests

### Q1 — How are the three Windows env roots modelled?

| Option | Description | Selected |
|--------|-------------|----------|
| Named env roots, each with its own suffix list | `{ userProfile, appData, localAppData }`, real paths only | ✓ |
| Keep the flat homeDirs array, win32 suffix list | Minimal structural change, ~3× the candidates | |
| Named roots, and drop the version-manager walks on win32 | Fewest filesystem ops | |

**User's choice:** Named env roots → **D-09**
**Notes:** The three vars are not peers — `%APPDATA%\npm` is real, `%APPDATA%\.local\bin` is
nonsense. Dropping the version-manager walks was rejected as recreating the reported bug for
nvm-windows users.

### Q2 — How do the Windows arms become provable on the Linux runner?

| Option | Description | Selected |
|--------|-------------|----------|
| Split pure path-building from the I/O filter | `buildCommandCandidatePaths({ ... })`, zero I/O | ✓ |
| Inject fs deps into the existing async functions | The `normalizePathForCompare` precedent | |
| Both — pure builder, plus injected deps for the version walk | Strongest coverage, two seams | |

**User's choice:** Split pure from impure → **D-10**
**Notes:** Injected fakes would make SC-5's evidence only as good as the fake's fidelity to real
`readdir` semantics — a fake that drifts weakens the proof silently.

### Q3 — Location-major or extension-major ordering?

| Option | Description | Selected |
|--------|-------------|----------|
| Location-major: per location, `.exe` → `.cmd` → `.bat` | Install location outranks extension; short-circuits | ✓ |
| Extension-major: every location for `.exe`, then `.cmd` | Reads SC-2 literally | |
| Location-major, then rank the whole resolved set | Both properties, but forfeits short-circuiting | |

**User's choice:** Location-major → **D-11**
**Notes:** Extension-major would let a stale `node.exe` in a forgotten scoop directory beat the
shim the user's version manager actively points at. SC-2's preference is carried by D-01, where
the two spellings genuinely compete.

### Q4 — Who verifies the install-path catalogue?

| Option | Description | Selected |
|--------|-------------|----------|
| Researcher verifies each path against upstream docs, cites URLs | Unsourced paths are dropped | ✓ |
| Planner cites docs inline in PLAN.md | Fewer artifacts | |
| Ship the roadmap's list as-is, correct on reporter feedback | Fastest | |

**User's choice:** Researcher verifies with citations → **D-12**
**Notes:** `workflow.research: true` is already on, so the researcher runs regardless — this only
sets its deliverable and evidence bar. A wrong path fails as a silent `stat` miss, so the
real-machine feedback loop would rarely catch it.

---

## UX-02 copy

### Q1 — How does platform reach the install hint?

| Option | Description | Selected |
|--------|-------------|----------|
| Add platform to the input, one table with two arms | `{ providerId, platform }`; POSIX arm byte-identical | ✓ |
| Keep one platform-neutral hint per provider | Link to docs instead of a command | |
| Platform arm, plus a Windows-specific caveat line | Adds the PowerShell execution-policy note | |

**User's choice:** Two arms, platform injected → **D-13**
**Notes:** On `undefined` the hint shows both spellings rather than guessing, matching D-08. The
execution-policy caveat stays in UX-03 / Phase 10.

### Q2 — Scope of the `@github/copilot` correction?

| Option | Description | Selected |
|--------|-------------|----------|
| Fix on every platform | UX-02 says "replacing", not "adding" | ✓ |
| Windows arm only, leave POSIX untouched | Strictest CMP-01 reading | |
| Fix everywhere, and keep a deprecation pointer | Helps users who installed the old extension | |

**User's choice:** Fix on every platform → **D-14**
**Notes:** Shipping the correct command on Windows while knowingly leaving the wrong one on
macOS/Linux would be a deliberate defect against the entire current user base. CMP-01 protects
behaviour; a corrected error string is not a behaviour regression.

### Q3 — How much of the four-way duplication gets unified?

| Option | Description | Selected |
|--------|-------------|----------|
| Backend + frontend share one table; docs stay prose | Table moves to `packages/shared/src/` | ✓ |
| Fix all four in place, no shared module | Smallest blast radius | |
| Backend only; frontend links to Help rather than listing | No package boundary crossed | |

**User's choice:** Shared table for the two live surfaces → **D-15**
**Notes:** The error banner and HelpView are the surfaces that can lie to a user mid-session.
CHANGELOG is explicitly excluded — it records what 0.1.0 shipped and must not be retro-edited.

### Q4 — Is `NODE_EXECUTABLE_ERROR` in scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Both messages get a win32 arm | Provider hints *and* the Node error | ✓ |
| Provider hints only; leave the Node message alone | Narrowest RES-01/RES-02 reading | |
| Both, plus name the locations that were searched | Uses `lastNodeSearchCandidates` | |

**User's choice:** Both messages → **D-16**
**Notes:** UX-02 literally says "CLI / **Node** not found". This is the exact message the original
Windows reporter would have read. Listing the searched locations is UX-04 / Phase 10.

---

## Claude's Discretion

No area was delegated wholesale. Sub-decisions left to the planner inside locked decisions:

- The win32 timeout value (D-04), with a mandatory "headroom estimate, not a measurement" comment.
- Whether `joinPath` (D-05) and the line-ranking helper (D-01) live in `platform.ts` or
  `command-resolution.ts` — both satisfy 04-D-01; pick one and state why.
- The exact suffix sets per named root (D-09), bounded by D-12's citation requirement.
- Depth of the nvm-windows / fnm version-directory walk.
- Exact user-facing wording of the D-13 / D-16 win32 arms.

## Deferred Ideas

- `windowsHide: true` on all spawns — UX-04, Phase 10. This phase adds the `where.exe` spawn that
  causes the console flash; the site is marked, not fixed.
- `lastNodeSearchCandidates` in diagnostics — UX-04, Phase 10 (rejected for the error banner).
- PowerShell execution-policy note — UX-03, Phase 10.
- `.cmd`/`.bat` spawn via `cmd.exe /d /s /c` (PRV-02) — Phase 7.
- Binary-path picker accepting `.exe`/`.cmd` (UX-01) — Phase 7.
- README prose naming the deprecated Copilot command — update in place, not wired to the table.
- `CHANGELOG.md:75` — deliberately left alone as a historical record.
- Real-machine confirmation from @0xMRK0S — Phase 9/10.
