# Phase 6: Windows Command Resolution - Context

**Gathered:** 2026-08-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Fill in the **resolution data layer** for native Windows so `node.exe` and the four provider CLIs
are reliably locatable on real machines, and correct the "CLI / Node not found" guidance that a
user reads when they are not.

Phase 4 shipped the SHAPE (`platform.ts`'s four pure functions, the `where.exe` binary name, the
`.exe`/`.cmd`/`.bat` ladder, the home-dir variable NAMES). **Phase 6 fills the DATA and wires the
call sites that still hardcode POSIX** — this is 04-D-03's line, restated: extend the same
functions, do not restructure them.

Requirements: **RES-01, RES-02, RES-03, UX-02.**

**Explicitly NOT this phase:**

- **`.cmd`/`.bat` SPAWN.** Phase 3's P1-CMD measured direct `.cmd` spawn throwing `EINVAL`
  synchronously from Node's CVE-2024-27980 guard. Phase 6 may *resolve to* a `.cmd` path; making
  it launchable via `cmd.exe /d /s /c` is **PRV-02, Phase 7**. Nothing here may claim provider
  spawn works on Windows.
- **`windowsHide: true` on spawns** — UX-04, Phase 10. Note the seam honestly: this phase ADDS a
  Windows spawn (`where.exe`) on a hot path, so it also adds a console-window flash that Phase 10
  removes. See Deferred Ideas.
- **The binary-path picker accepting `.exe`/`.cmd`** — UX-01, Phase 7.
- **Windows install/prereq docs and the PowerShell execution-policy note** — UX-03, Phase 10.
  D-13 deliberately stops at the install COMMAND and does not pull that copy forward.
- **Diagnostics surfacing the searched-location list** — UX-04, Phase 10 (D-16 rejected pulling it
  into the error banner).

### Four code facts verified during this discussion — planners must not re-derive them

1. **`resolveCommand` still spawns the literal string `"which"`** (`packages/backend/src/index.ts`,
   inside the `resolveWithCache` resolver). `getWhichCommand` from Phase 4 has **zero callers**.
   Wiring it is Phase 6 work, not Phase 4 leftovers.
2. **`getHomeDirCandidates` also has zero callers.** `getKnownHomeDirs` (`index.ts:1570`) still
   hardcodes `processRef.process?.env?.HOME`. On Windows that variable is not set, so today every
   home-derived candidate is empty there.
3. **`command-resolution.ts` calls `path.join` throughout the candidate builders** while its own
   `extractHomeDir` refuses `path.normalize` on the stated grounds that `path` is
   platform-FLAVOURED — a real `windows-latest` red at
   [run 32376894371](https://github.com/six2dez/drift/actions/runs/32376894371). The module is
   currently inconsistent with its own recorded lesson.
4. **`normalizePathForCompare` (`runtime-probe.ts:659`) has no production caller.** 04-D-04 named
   Phase 6 as its first. On inspection Phase 6 does not need it — see D-07, which says so out loud
   rather than manufacturing a caller.

</domain>

<decisions>
## Implementation Decisions

### The `where.exe` resolution contract (RES-02)

- **D-01:** Rank ALL `where.exe` output lines by extension; first-line-wins is replaced.
  Parse every CRLF-split line and order by `WINDOWS_EXECUTABLE_EXTENSIONS` (`.exe` > `.cmd` >
  `.bat`), with `where`'s own PATH order breaking ties within an extension.

  This is what makes SC-2's "preferring `.exe` over `.cmd`" an implemented behaviour rather than an
  accident of PATH ordering. `where` prints every PATH×PATHEXT hit in PATH order, so on a machine
  where `claude.cmd` sits earlier in PATH than `claude.exe`, today's
  `out.head.split("\n", 1)[0]` returns the `.cmd` — and Phase 7 then has to route it through
  `cmd.exe /c` for no reason. Ranking costs one pure helper and no extra filesystem walk, because
  `where` already did the PATH search. On POSIX the ladder has exactly one entry, so the ranking
  arm is a no-op and `which`'s single-answer semantics are unchanged.
  — **Reversibility:** reversible — one pure function and one call site.

- **D-02:** `getWhichCommand`'s input grows to `{ platform, env }`; the win32 arm returns
  `${SystemRoot}\System32\where.exe`, falling back to the bare `"where.exe"` when the variable is
  missing or empty.

  Phase 3's P1-WHERE measured the absolute-path invocation
  (`C:\Windows\System32\where.exe`). Hardcoding that literal was rejected: it breaks on any machine
  where Windows is not on `C:` or lives under a non-default root, and it fails as
  "not found in PATH" for a fully working CLI. `SYSTEMROOT` and `WINDIR` are both on libuv's eleven
  back-filled `required_vars`, so the input is reliably present. Adding a field to an `{ ...input }`
  object is exactly the extension 04-D-03 licenses; both arms stay unit-testable on Linux with a
  literal `env`.
  — **Reversibility:** reversible.

- **D-03:** The multi-line parse reads `out.head` and splits on `/\r?\n/`. `renderBoundedBuffer` is
  still forbidden here, and `SPAWN_STDOUT_MAX_CHARS` is unchanged.

  The existing comment's invariant holds unmodified: above the cap the rendered form splices
  `\n…[drift: truncated N bytes]…\n` between head and tail, the marker survives `.trim()`, and the
  result would be handed to `fileExists`/`spawn` as a path. A path consumer must never see the
  truncation marker.

  Above the cap the tail is dropped. That is acceptable and should be stated in the code comment:
  the dropped entries are the LOWEST-PATH-priority hits, so ranking still sees the ones that matter.
  A partial final line in the head is discarded naturally by the extension check, since it will not
  end in a known extension. A dedicated larger buffer for this spawn was **rejected** — Phase 5's
  PERF-04 site-7 comment argues against exactly that per-site exemption, and reopening it on
  convenience grounds would turn a closed principle back into a negotiation.
  — **Reversibility:** reversible.

- **D-04:** The PATH-search spawn timeout becomes platform-aware — 1000 ms on POSIX (unchanged),
  longer on win32.

  On Windows the spawn is `where.exe` under Defender real-time scanning on a cold
  process-creation path, measurably slower than `which`. A silent timeout there is
  indistinguishable from "not installed": the user is told the CLI is not on PATH when it is.
  PERF-03's resolution cache means the slow path is paid once per positive TTL, not per check.
  The POSIX arm must stay byte-identical (CMP-01).

  **Open for the planner, not the user:** the exact win32 number. The maintainer cannot measure it
  locally, so pick a defensible value and say in the code comment that it is a headroom estimate,
  not a measurement — the same discipline 03-FINDINGS applies to its vehicle caveat.
  — **Reversibility:** reversible.

### Windows path shapes without a win32 `path` (RES-03)

- **D-05:** A hand-rolled, separator-aware `joinPath({ platform, segments })` replaces every
  `path.join` in the candidate builders. Backslash on win32, forward slash otherwise.

  This applies the module's own recorded lesson consistently instead of to one function. Under a
  POSIX-flavoured `path`, `path.join("C:\\Users\\x", ".local", "bin", cmd)` yields
  `C:\Users\x/.local/bin/cmd`. Win32 APIs do accept that, so it is not a runtime break — the reason
  to fix it is EVIDENCE: with `path.join` the candidate strings differ by HOST rather than by
  target platform, so a Linux-runner assertion cannot state what a Windows box will produce, and
  SC-5 degrades into testing the runner. Caido's LLRT `path` flavour is unverified in both
  directions, so which spelling ships is genuinely unknown today.

  The POSIX output must be byte-identical to today's — that equality is the CMP-01 proof and should
  be asserted, not assumed.
  — **Reversibility:** costly — it is a mechanical sweep of ~20 call sites in one module, so undoing
  it touches all of them; nothing outside the module depends on it.

- **D-06:** `extractHomeDir` gains a drive-letter arm and stays PLATFORM-BLIND — one string in, no
  injected `platform`. It accepts both `C:\Users\<name>` and `C:/Users/<name>`.

  This matches `isAbsolutePath`'s existing `platform: undefined` arm (accept either spelling; a
  wrong guess costs one failed `stat`) and keeps working before the RUN-05 probe has run — which
  matters concretely: `getKnownHomeDirs` is reachable from a provider status check at plugin load,
  before `host` is set. Injecting `platform` was rejected because every pre-probe call site would
  pass `undefined` anyway, so the function would need a shape-sniffing undefined arm regardless,
  with more ceremony around it.
  — **Reversibility:** reversible.

- **D-07:** Phase 6 dedups win32 candidates with a PURE lowercased, separator-normalized key and
  does NOT wire `normalizePathForCompare`. The unused export still must not be deleted.

  04-D-04 expected Phase 6 to be its first caller, citing the 8.3-versus-long-form case
  (`C:\Users\RUNNER~1` from `os.tmpdir()` versus `C:\Users\runneradmin` from `USERPROFILE`).
  On inspection that case does not arise here: the only thing Phase 6 compares is candidate strings
  in `pushUniqueCandidate`, where a missed dedup costs an extra `stat`, never a wrong answer.
  Windows paths are case-insensitive, so folding case and separator collapses `C:\Program Files`
  and `c:/program files` into one key while the ORIGINAL spelling is what gets emitted.

  **This is a deliberate, recorded non-claim, not an oversight.** Realpath-ing home dirs would put
  async I/O on a pre-probe hot path, lean on a `realpathSync.native` rung untested under LLRT, and
  be unexercisable on the Linux runner — to buy a saving the resolution cache mostly absorbs.
  04-D-04's "do not clean up the unused export" still binds: the export stays.
  — **Reversibility:** reversible.

- **D-08:** `getHomeDirCandidates` widens to accept `Platform | undefined`; on `undefined` it reads
  BOTH name sets — `HOME` and `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`. `getKnownHomeDirs` stops
  hardcoding `process.env.HOME` and calls it.

  Whichever variables are actually set decide the answer, since the wrong platform's names are
  simply absent. This is the third place the same union-when-unknown rule now applies
  (`isAbsolutePath`, D-06, here), so all three read alike. Defaulting to POSIX pre-probe was
  **rejected** with the sharpest reason available: on Windows it means every provider status check
  before MCP start reads only `HOME`, which Windows does not set, so Settings shows all four CLIs
  unavailable — which is very close to the symptom this milestone exists to fix. Gating resolution
  on the probe was rejected as a POSIX regression (CMP-01): pre-probe checks would lose the
  version-manager and install-location fallbacks on every platform.
  — **Reversibility:** reversible.

### The Windows install-location catalogue (RES-01) and its evidence (SC-5)

- **D-09:** On win32 the three env vars are NAMED ROOTS with their own suffix lists — not a flat
  `homeDirs` array crossed with one ladder.

  `USERPROFILE`, `APPDATA` and `LOCALAPPDATA` are not peers. `%APPDATA%\npm\claude.cmd` is real;
  `%APPDATA%\.local\bin\claude.exe` is nonsense. nvm-windows lives under `APPDATA`, fnm under
  `LOCALAPPDATA`. Roughly (the exact set is D-12's deliverable):
  `APPDATA` → `npm\`, `nvm\<ver>\`; `LOCALAPPDATA` → `fnm\node-versions\<v>\installation\`,
  `Volta\bin\`, `pnpm\`; `USERPROFILE` → `.local\bin\`, `.bun\bin\`, `scoop\shims\`;
  plus machine-wide `%ProgramFiles%\nodejs`.

  Every emitted path is then one a real installer produces, so the candidate count stays small and
  each entry is defensible in review. The flat-array alternative produces roughly 3× the candidates,
  most of them paths that cannot exist — each costing a `stat` — and leaves a reviewer unable to
  distinguish an intentional candidate from a cartesian-product artifact.

  **POSIX keeps the existing flat `homeDirs` shape** and its current suffix list, byte-identical.
  — **Reversibility:** costly — it changes the input shape of the candidate builders, so every
  caller and every test that constructs those inputs moves with it.

- **D-10:** The candidate builders split into a PURE path builder and a thin impure I/O filter.
  `buildCommandCandidatePaths({ platform, command, roots, discoveredVersions })` returns the full
  ordered list with zero I/O; the `stat`/`readdir` stay in a thin caller that feeds it.

  This is the load-bearing decision of the phase, because SC-5 requires the Windows cases green on
  the **Linux** runner and `C:\Users\x\AppData\Roaming\npm` cannot exist there. With the split, the
  Windows list is byte-for-byte assertable from literal inputs — the same property that makes
  `platform.ts` provable, applied to the module that holds the actual data, and following 04-D-01's
  `{ ...input }` convention. Injecting `deps: { stat, readdir }` instead was rejected: tests would
  then assert against a mocked filesystem, so a fake that drifts from real `readdir` semantics
  silently weakens the SC-5 evidence rather than loudly failing.
  — **Reversibility:** costly — it re-splits two exported functions; the seam is what the SC-5
  tests are written against, so undoing it invalidates that evidence.

- **D-11:** Candidate ordering is LOCATION-MAJOR — walk locations in precedence order, trying
  `.exe` → `.cmd` → `.bat` within each, and short-circuit on the first hit.

  An explicitly-installed binary in `%APPDATA%\npm` is a stronger signal than a `.exe` in a
  location the user never installed to, and real installs put exactly one spelling per directory,
  so the ladder rarely fires twice. SC-2's "`.exe` preference" is carried by D-01's `where.exe`
  ranking, which is where the two spellings genuinely compete for the same PATH.

  Extension-major was rejected because a stale `node.exe` in a forgotten scoop directory would beat
  the `.cmd` shim the user's version manager actively points at. Collecting all survivors and
  ranking them was rejected because it forfeits short-circuiting: every cold resolve would pay the
  full walk on the platform where `stat` is slowest.
  — **Reversibility:** reversible.

- **D-12:** The phase researcher verifies EVERY Windows candidate path against upstream installer
  docs and cites the URL. A path that cannot be sourced is DROPPED, not guessed.

  The roadmap flags "Research: NO for Windows install paths" but attaches a build-time note to
  re-verify Volta/fnm/nvm-windows against current installer docs — and those layouts have moved
  (Volta to `%LOCALAPPDATA%\Volta`, fnm's Windows layout drops the `bin` segment, nvm-windows uses
  a symlink at `%ProgramFiles%\nodejs`). `workflow.research: true` is already on, so
  `/gsd-plan-phase 6` spawns the researcher regardless; this decision only sets its deliverable and
  its evidence bar.

  The bar matches this project's existing discipline — 03-FINDINGS cites run URLs, not
  recollection. Shipping the roadmap list unverified was rejected because a wrong path fails as a
  silent `stat` miss, never an error, so the real-machine feedback loop (Phase 9/10) only fires if
  that user happens to run that exact version manager.
  — **Reversibility:** reversible.

### "CLI / Node not found" guidance (UX-02)

- **D-13:** `getProviderInstallHint` takes `{ providerId, platform }` — one table, two arms. The
  POSIX arm is byte-identical to today, so CMP-01 is provable by inspection. Callers pass
  `host?.platform`; on `undefined` (reachable pre-probe) the hint shows BOTH spellings rather than
  guessing, matching D-08's union-when-unknown rule. The module stays pure — no I/O is added.

  The win32 arm stops at the install COMMAND. The PowerShell execution-policy caveat is UX-03,
  Phase 10, and is deliberately not pulled forward.
  — **Reversibility:** reversible.

- **D-14:** The `@github/copilot` correction ships on EVERY platform, not just Windows.

  `gh extension install github/gh-copilot` is the deprecated CLI; the current one is
  `npm install -g @github/copilot`. UX-02's own wording is "**replacing** the deprecated
  `gh copilot` extension hint" — replacement, not a Windows-only addition. Shipping the right
  command on Windows while knowingly leaving the wrong one on macOS/Linux would be a deliberate
  defect against the entire current user base. CMP-01 protects POSIX *behaviour*; a corrected
  error string is not a behaviour regression.
  — **Reversibility:** reversible.

- **D-15:** The hint table moves to `packages/shared/src/` so backend and frontend render the same
  data. README and CHANGELOG stay prose and are NOT wired to it.

  The commands are hand-copied in four places today (`command-resolution.ts:7-16`,
  `HelpView.vue:207-223`, `README.md:38`, `CHANGELOG.md:75`) and the backend table is about to gain
  a second platform arm, doubling the drift surface. `shared` already holds
  `MCP_TOOL_DEFINITIONS` and `Settings`, so the table has an established home.

  The two LIVE surfaces — the error banner and HelpView — are the ones that can lie to a user
  mid-session, and they are the ones unified. **CHANGELOG must not be retro-edited**: it is a
  historical record of what 0.1.0 shipped. README is human narrative; update its prose in place if
  it names the deprecated command.
  — **Reversibility:** costly — it crosses the package boundary, so unwinding it means re-inlining
  the table in two packages.

- **D-16:** `NODE_EXECUTABLE_ERROR` (`index.ts:160`) also gets a win32 arm.

  UX-02 says "**CLI / Node** not found", so the Node message is in scope. Today it reads "Restart
  Caido from an environment where Node.js is available" — POSIX shell framing that does not map to
  how a Windows user launches Caido. The win32 arm names a real install route (nodejs.org LTS
  installer / `winget install OpenJS.NodeJS.LTS`).

  This is the exact message the original reporter would have read, so the phase that fixes Node
  resolution on Windows shipping a POSIX-shaped Node error would put the wrong sign on the fix.
  Listing `lastNodeSearchCandidates` in the banner was **rejected** — that is UX-04, Phase 10, and
  a ~15-entry path list is too much for an error banner.
  — **Reversibility:** reversible.

### Claude's Discretion

The user did not delegate any area wholesale. These are the sub-decisions left explicitly to the
planner within locked decisions:

- The win32 timeout VALUE in D-04 (with the "headroom estimate, not a measurement" comment).
- Where `joinPath` (D-05) and the `where.exe` line-ranking helper (D-01) live — `platform.ts` (pure,
  zero-import, but it would then hold data-adjacent logic) or `command-resolution.ts`. Both satisfy
  04-D-01; pick one and state why.
- The exact suffix sets per named root in D-09, bounded by D-12's citation requirement.
- How deep the nvm-windows / fnm version-directory walk goes.
- Exact user-facing wording of the D-13/D-16 win32 arms.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 4's substrate — the shape this phase fills

- `.planning/phases/04-platform-foundation/04-CONTEXT.md` — **D-01** (`platform.ts`'s
  `{ ...input }` convention, and the rejected `createPlatformProfile()` aggregate), **D-02** (`os`
  read exactly once behind the probe, cached in `host` — why `host?.platform` is `undefined`
  pre-probe, which D-06/D-08/D-13 all turn on), **D-03** (the SHAPE-versus-DATA line that defines
  this phase's entire scope — read it verbatim before planning), **D-04** (`normalizePathForCompare`
  and its "Phase 6 is its first caller" expectation, which **D-07 above formally declines** — read
  both together or the unused export looks like a bug).

### Phase 3's measured verdict — binding, cite this and never the CI artifacts

- `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md` — the artifacts expire
  2026-09-12; this committed document is the citation. Four results bind Phase 6:
  1. § *P1-WHERE* — `where.exe` resolved by ABSOLUTE path, output was **2 CRLF-split lines**
     (`C:\hostedtoolcache\...\node.exe` and `C:\Program Files\nodejs\node.exe`). Multi-line output
     is confirmed real. Source of D-01, D-02, D-03.
     [run 31702392047](https://github.com/six2dez/drift/actions/runs/31702392047)
  2. § *P1-CMD* — direct `.cmd` spawn throws `EINVAL` **synchronously**. Phase 6 may resolve to a
     `.cmd`; it must not claim it is launchable. Phase 7 owns the fix.
  3. § *P3-VARS* — `USERPROFILE`, `APPDATA`, `LOCALAPPDATA` all present and non-empty in the parent
     process on windows-latest. Source of D-08, D-09.
  4. § *Vehicle caveat* — the platform is measured, the runtime is inferred. **Carry this discipline
     verbatim into any claim this phase makes**, including D-04's timeout comment.

### Phase 5's precedents this phase must not reopen

- `.planning/phases/05-kill-shell-wrappers/05-CONTEXT.md` — **D-07/D-09** (the `windows-latest` CI
  leg is blocking-for-merge from day one and is where SC-5's evidence lands), **D-11** (log command
  and args and env KEY NAMES, never values — binds any diagnostic this phase adds).
- `packages/backend/src/index.ts`, the PERF-04 site-7 comment inside `resolveCommand` — the
  argument against per-site bounded-buffer exemptions that **D-03 upholds**. Read before proposing
  a larger buffer.

### Requirements and roadmap

- `.planning/REQUIREMENTS.md` — **RES-01, RES-02, RES-03, UX-02** are this phase. Also read the
  § *Re-targeted to Phase 5 at the close of Phase 4* note, whose closing paragraph states that
  teaching `extractHomeDir` about `C:\Users\<name>` was explicitly **not** claimed by Phase 5 and
  remains RES-03 here.
- `.planning/ROADMAP.md` § *Phase 6* (the five success criteria and the build-time re-verification
  note D-12 implements), § *Phase 7* (the PRV-02 `.cmd`-spawn boundary and UX-01 picker),
  § *Phase 10* (UX-03 docs and UX-04 diagnostics — the two copy/diagnostic boundaries D-13 and D-16
  stop at).
- `.planning/PROJECT.md` § *Constraints* — the LLRT constraint, "the maintainer cannot test native
  Windows locally", and the no-POSIX-regressions rule that D-05/D-09/D-13 each carry a stated proof
  for.

### Codebase ground truth — the exact sites this phase edits

- `packages/backend/src/command-resolution.ts` — `PROVIDER_INSTALL_HINTS` **:7-16** (D-13/D-14/D-15),
  `normalizePosixPath` **:68** and its comment citing the real CI red (the precedent D-05 extends),
  `extractHomeDir` **:83** (D-06), `pushUniqueCandidate` **:41** (D-07),
  `collectVersionManagerCommandCandidates` **:116** (D-09/D-10/D-12),
  `getCommandExecutableCandidates` **:141** and `getNodeExecutableCandidates` **:170** (D-09/D-10/D-11).
- `packages/backend/src/platform.ts` — `getWhichCommand` **:166** (D-02, currently zero callers),
  `WINDOWS_EXECUTABLE_EXTENSIONS` **:182** and `getExecutableNames` **:187** (D-01/D-11),
  `getHomeDirCandidates` **:226** (D-08, currently zero callers), `isAbsolutePath` **:107** (the
  `platform: undefined` precedent D-06 and D-08 follow). **The zero-import property is
  self-enforcing and load-bearing** — see the file header before adding anything here.
- `packages/backend/src/index.ts` — `NODE_EXECUTABLE_ERROR` **:160** (D-16), `resolveCommand`
  **:1469** (D-01/D-02/D-03/D-04 all land inside it), `getKnownHomeDirs` **:1570** (D-08),
  `checkProvider` **:1582** (the not-found message string), `getNodeExecutable` **:2439** and
  `lastNodeSearchCandidates` (D-16's rejected option), `getCachedNodeExecutable` **:2508** (the
  `node` vs `cmd:node` two-key contract — do not conflate them).
- `packages/backend/src/resolution-cache.ts` — the PERF-03 cache D-04 leans on for the slow-path
  amortisation, and `buildProviderCommandSignature`'s `MISSING_COMMAND_PLACEHOLDER` defensive
  reading of `providers[*].command`.
- `packages/backend/src/runtime-probe.ts:659` — `normalizePathForCompare`, the export **D-07
  declines to call and forbids deleting**.
- `packages/backend/src/command-resolution.test.ts` and `platform.test.ts` — the existing test
  shapes SC-5's Windows cases extend.
- `packages/frontend/src/views/HelpView.vue:207-223` — the duplicated install list D-15 unifies.
- `.planning/codebase/ARCHITECTURE.md` § *POSIX Surface — Every Place That Must Change for Windows*
  — the original landmine table; the `command-resolution.ts` rows are this phase's.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`platform.ts`'s four pure functions** — already shipped, already unit-tested, three of them with
  win32 arms and **two with zero production callers**. Phase 6 mostly WIRES what Phase 4 built.
- **`WINDOWS_EXECUTABLE_EXTENSIONS` (`platform.ts:182`)** — the single ordered `.exe`/`.cmd`/`.bat`
  list. D-01's ranking and D-11's per-location ladder must both read it; a second hardcoded order
  anywhere is a defect.
- **`isAbsolutePath` (`platform.ts:107`)** — the pattern for a three-state platform arm
  (win32 / undefined / POSIX). D-06 and D-08 copy its undefined behaviour deliberately.
- **`createBoundedBuffer` / `appendBounded`** — already wrapping the resolution spawn's stdout;
  D-03 changes only how `.head` is read.
- **`resolution-cache.ts`** — bounded 5 min positive / 30 s negative, cleared whole on any
  `providers[*].command` change. Absorbs the cost of D-09's larger candidate set and D-04's slower
  win32 timeout.
- **`normalizePosixPath` (`command-resolution.ts:68`)** — the worked example of "a pure path
  decision imports nothing", with a CI failure cited in its comment. D-05 generalises it.

### Established Patterns

- **Pure helper + injected `platform`, `{ ...input }` object params.** Every win32 branch must be
  provable from the Linux runner, because the maintainer cannot test Windows locally. Anything
  left un-injected is unverifiable by construction.
- **`path` is platform-FLAVOURED and its LLRT flavour is unverified.** Never `path.normalize`,
  `path.posix`, or (after D-05) `path.join` in the candidate builders.
- **Comments carry the EVIDENCE, not just the intent** — a run URL, a measured log line, or an
  explicit "estimate, not a measurement". `command-resolution.ts:54-56` and `platform.ts:249-257`
  are the house style.
- **Recorded non-claims.** Phase 5 wrote down what it did NOT prove. D-07 and the § *Explicitly NOT
  this phase* list continue that; the verifier should expect them.
- **`tsconfig noUnusedLocals` + `eslint --max-warnings 0`** turn an unused export into a build
  failure — which is why `normalizePathForCompare` needed a preservation note and why D-07 must
  restate it.

### Integration Points

- `resolveCommand` (`index.ts:1469`) — the single hot seam. D-01 through D-04 all land inside its
  `resolveWithCache` resolver; the function's public signature does not change.
- `getKnownHomeDirs` (`index.ts:1570`) → `getHomeDirCandidates` — the D-08 wiring; feeds both
  `getCommandExecutableCandidates` and `getNodeExecutableCandidates`.
- `checkProvider` / `formatProviderUnavailableMessage` → the chat error banner and
  Settings → CLI Providers — where D-13/D-14/D-16's copy actually surfaces.
- `packages/shared/src/` → both packages — the new home for the D-15 hint table.
- Phase 7 consumes this phase's OUTPUT: a resolved absolute path with an explicit extension is
  precisely what `buildSpawnSpec`'s `cmd.exe /d /s /c` branch will branch on.

</code_context>

<specifics>
## Specific Ideas

- D-07 should read as an explicit, reasoned **decline** of 04-D-04's expectation — not as silence.
  A later reader finding `normalizePathForCompare` still uncalled must find the reason next to it.
- The POSIX output of D-05's `joinPath` should be asserted byte-identical to the current
  `path.join` output. That equality IS the CMP-01 proof for the sweep; do not leave it to review.
- D-12's citations belong in RESEARCH.md as a path→URL table, so the planner can drop any row that
  arrives without a source rather than negotiating it mid-plan.
- D-04's win32 timeout comment should say plainly that the number is headroom, not a measurement —
  the same shape as 03-FINDINGS' vehicle caveat, so nobody later cites it as evidence.
- The console-window flash D-02's `where.exe` spawn introduces should be noted at the spawn site
  with a `UX-04 / Phase 10` marker, so Phase 10 can grep for it rather than re-inventory the spawns.

</specifics>

<deferred>
## Deferred Ideas

- **`windowsHide: true` on all spawns (UX-04)** — Phase 10. This phase adds a `where.exe` spawn on a
  hot path, so it also adds a console-window flash. Marked at the site, fixed there.
- **Diagnostics surfacing `lastNodeSearchCandidates`** — UX-04, Phase 10. Rejected for the error
  banner in D-16; it is genuinely useful in the diagnostics/support-bundle surface.
- **PowerShell execution-policy note in the install guidance** — UX-03, Phase 10.
- **`.cmd`/`.bat` spawn via `cmd.exe /d /s /c` (PRV-02)** — Phase 7. Phase 6 resolves to those
  paths; it does not make them launchable.
- **Binary-path picker accepting `.exe`/`.cmd` (UX-01)** — Phase 7. A user pinning an absolute
  `C:\...\claude.cmd` reaches `resolveCommand`'s absolute-path arm, which D-06's shape-sniffing
  already handles, but the picker's own validation is Phase 7's.
- **README prose naming the deprecated Copilot command** — update the sentence in place under D-14;
  do NOT wire README to the shared table (D-15).
- **CHANGELOG.md:75's `gh extension install github/gh-copilot`** — deliberately left alone. It is a
  historical record of what 0.1.0 shipped and must not be retro-edited.
- **Real-machine confirmation from the original reporter (@0xMRK0S)** — Phase 9/10. It is what
  finally closes the residual "measured on Node, inferred for LLRT" gap that D-04 and D-12 both
  reason around.

</deferred>

---

*Phase: 06-windows-command-resolution*
*Context gathered: 2026-08-21*
