# Phase 6: Windows Command Resolution - Research

**Researched:** 2026-08-21
**Domain:** Windows binary discovery (`where.exe`, PATHEXT, version-manager install layouts) inside a
constrained non-Node runtime, plus the user-facing install-hint copy that surfaces when discovery fails
**Confidence:** HIGH on the install-path catalogue (D-12's deliverable — every row below is sourced from an
installer script, a package's own published source, or first-party docs), MEDIUM on `where.exe`'s
undocumented output ordering, LOW/UNSOURCED on `where.exe` latency under Defender (D-04's number)

---

## Summary

The primary deliverable of this research is D-12's **path → source-URL table**, and it does not confirm the
roadmap. **Three of the rows the roadmap and 06-CONTEXT's D-09 sketch carry are wrong against current
upstream installers**, and each was verified against the installer's own source rather than against
recollection:

1. **nvm-windows does not live under `%APPDATA%`.** Its Inno Setup script sets
   `DefaultDirName={localappdata}\nvm`, so `NVM_HOME` defaults to `%LOCALAPPDATA%\nvm`.
2. **nvm-windows' symlink is not `%ProgramFiles%\nodejs`.** The installer defaults `NVM_SYMLINK` to
   `C:\nvm4w\nodejs` and appends `%NVM_SYMLINK%` to `PATH` — which also means `where.exe node` already
   finds an nvm-managed Node, and the version-directory walk is a *fallback*, not the primary route.
3. **fnm does not live under `%LOCALAPPDATA%`.** fnm's base dir is `etcetera`'s `data_dir()`, which on
   Windows maps to `APPDATA`, not `LOCALAPPDATA` — so the modern base is `%APPDATA%\fnm`, with
   `%USERPROFILE%\.fnm` as the legacy fallback fnm still probes. The roadmap's *other* fnm claim — that the
   Windows layout **drops the `bin` segment** — is confirmed, from `commands/exec.rs`.

Two further findings change how the planner should think about the phase rather than just its data. First,
**Volta's Windows shims are `.cmd`, generated with an explicit `.cmd` suffix in `volta-layout`** — so a
Volta user's resolved `node` is a `.cmd`, which Phase 3's P1-CMD proved cannot be spawned directly. The real
`node.exe` is reachable at `%LOCALAPPDATA%\Volta\tools\image\node\<version>\node.exe`, and including that
row lets Phase 6 hand Phase 7 an `.exe` instead of deferring a `cmd.exe /d /s /c` hop. Second, **asdf has no
native Windows support at all** (WSL2 only, and only on a Unix drive), so its win32 row is DROPPED under
D-12 — the POSIX `.asdf/shims` entry stays byte-identical.

On the copy side, D-14 is not merely defensible, it is *overdue*: `github/gh-copilot` was **deprecated on
2025-10-25 and the repository archived on 2025-10-30**, superseded by `@github/copilot`. The current hint
string in `command-resolution.ts:15` is a command that points at an archived, read-only repository on every
platform Drift ships to today.

**Primary recommendation:** Build the win32 candidate catalogue from the *named-root* table in
§ *Windows Install-Location Catalogue* verbatim, drop the three UNSOURCED rows marked there, and treat
`where.exe`'s emission ordering as an implementation detail D-01 deliberately does not depend on — D-01's
extension ranking is implementable exactly as written without it.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Rank ALL `where.exe` output lines by extension; first-line-wins is replaced.**
  Parse every CRLF-split line and order by `WINDOWS_EXECUTABLE_EXTENSIONS` (`.exe` > `.cmd` > `.bat`), with
  `where`'s own PATH order breaking ties within an extension. — Reversibility: reversible.

- **D-02: `getWhichCommand`'s input grows to `{ platform, env }`; the win32 arm returns
  `${SystemRoot}\System32\where.exe`, falling back to the bare `"where.exe"` when the variable is missing or
  empty.** — Reversibility: reversible.

- **D-03: The multi-line parse reads `out.head` and splits on `/\r?\n/`. `renderBoundedBuffer` is still
  forbidden here, and `SPAWN_STDOUT_MAX_CHARS` is unchanged.** Above the cap the tail is dropped; the dropped
  entries are the LOWEST-PATH-priority hits. A dedicated larger buffer was **rejected**. — Reversibility:
  reversible.

- **D-04: The PATH-search spawn timeout becomes platform-aware — 1000 ms on POSIX (unchanged), longer on
  win32.** *Open for the planner, not the user:* the exact win32 number; the code comment must say it is a
  headroom estimate, not a measurement. — Reversibility: reversible.

- **D-05: A hand-rolled, separator-aware `joinPath({ platform, segments })` replaces every `path.join` in the
  candidate builders.** Backslash on win32, forward slash otherwise. The POSIX output must be byte-identical
  to today's — that equality is the CMP-01 proof and should be asserted, not assumed. — Reversibility:
  costly.

- **D-06: `extractHomeDir` gains a drive-letter arm and stays PLATFORM-BLIND — one string in, no injected
  `platform`.** It accepts both `C:\Users\<name>` and `C:/Users/<name>`. — Reversibility: reversible.

- **D-07: Phase 6 dedups win32 candidates with a PURE lowercased, separator-normalized key and does NOT wire
  `normalizePathForCompare`. The unused export still must not be deleted.** This is a deliberate, recorded
  non-claim, not an oversight. — Reversibility: reversible.

- **D-08: `getHomeDirCandidates` widens to accept `Platform | undefined`; on `undefined` it reads BOTH name
  sets — `HOME` and `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`.** `getKnownHomeDirs` stops hardcoding
  `process.env.HOME` and calls it. — Reversibility: reversible.

- **D-09: On win32 the three env vars are NAMED ROOTS with their own suffix lists — not a flat `homeDirs`
  array crossed with one ladder.** POSIX keeps the existing flat `homeDirs` shape and its current suffix
  list, byte-identical. — Reversibility: costly.

- **D-10: The candidate builders split into a PURE path builder and a thin impure I/O filter.**
  `buildCommandCandidatePaths({ platform, command, roots, discoveredVersions })` returns the full ordered
  list with zero I/O; the `stat`/`readdir` stay in a thin caller that feeds it. Injecting
  `deps: { stat, readdir }` was rejected. — Reversibility: costly.

- **D-11: Candidate ordering is LOCATION-MAJOR — walk locations in precedence order, trying `.exe` → `.cmd` →
  `.bat` within each, and short-circuit on the first hit.** — Reversibility: reversible.

- **D-12: The phase researcher verifies EVERY Windows candidate path against upstream installer docs and
  cites the URL. A path that cannot be sourced is DROPPED, not guessed.** — Reversibility: reversible.

- **D-13: `getProviderInstallHint` takes `{ providerId, platform }` — one table, two arms.** The POSIX arm is
  byte-identical to today. On `undefined` the hint shows BOTH spellings. The win32 arm stops at the install
  COMMAND. — Reversibility: reversible.

- **D-14: The `@github/copilot` correction ships on EVERY platform, not just Windows.** — Reversibility:
  reversible.

- **D-15: The hint table moves to `packages/shared/src/` so backend and frontend render the same data. README
  and CHANGELOG stay prose and are NOT wired to it. CHANGELOG must not be retro-edited.** — Reversibility:
  costly.

- **D-16: `NODE_EXECUTABLE_ERROR` (`index.ts:160`) also gets a win32 arm.** The win32 arm names a real
  install route (nodejs.org LTS installer / `winget install OpenJS.NodeJS.LTS`). Listing
  `lastNodeSearchCandidates` in the banner was **rejected**. — Reversibility: reversible.

### Claude's Discretion

The user did not delegate any area wholesale. These are the sub-decisions left explicitly to the planner
within locked decisions:

- The win32 timeout VALUE in D-04 (with the "headroom estimate, not a measurement" comment).
- Where `joinPath` (D-05) and the `where.exe` line-ranking helper (D-01) live — `platform.ts` (pure,
  zero-import, but it would then hold data-adjacent logic) or `command-resolution.ts`. Both satisfy 04-D-01;
  pick one and state why.
- The exact suffix sets per named root in D-09, bounded by D-12's citation requirement.
- How deep the nvm-windows / fnm version-directory walk goes.
- Exact user-facing wording of the D-13/D-16 win32 arms.

### Deferred Ideas (OUT OF SCOPE)

- **`windowsHide: true` on all spawns (UX-04)** — Phase 10. This phase adds a `where.exe` spawn on a hot
  path, so it also adds a console-window flash. Marked at the site, fixed there.
- **Diagnostics surfacing `lastNodeSearchCandidates`** — UX-04, Phase 10.
- **PowerShell execution-policy note in the install guidance** — UX-03, Phase 10.
- **`.cmd`/`.bat` spawn via `cmd.exe /d /s /c` (PRV-02)** — Phase 7. Phase 6 resolves to those paths; it does
  not make them launchable.
- **Binary-path picker accepting `.exe`/`.cmd` (UX-01)** — Phase 7.
- **README prose naming the deprecated Copilot command** — update the sentence in place under D-14; do NOT
  wire README to the shared table (D-15).
- **CHANGELOG.md:75's `gh extension install github/gh-copilot`** — deliberately left alone.
- **Real-machine confirmation from the original reporter (@0xMRK0S)** — Phase 9/10.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **RES-01** | On Windows, Drift locates `node.exe` via `where` plus Windows install locations (`%APPDATA%\npm`, `%USERPROFILE%\.local\bin`, Volta/Bun/pnpm/scoop/nvm-windows, `%ProgramFiles%\nodejs`) | § *Windows Install-Location Catalogue* supplies every named root with a sourced suffix list, and marks three roadmap rows as CORRECTED and three as DROPPED/UNSOURCED. § *Named-Root Table (planner-ready)* is the D-09 input shape. |
| **RES-02** | On Windows, Drift resolves provider CLI binaries to an absolute path with explicit extension (`.exe`/`.cmd`), preferring `.exe`, parsing `where` CRLF output | § *`where.exe` Semantics* documents exit codes, the no-match stderr line, and — critically — that output ORDER across extensions is undocumented, which is why D-01's own ranking is required rather than optional. § *Pitfall 1* covers the `INFO:` line leaking into `out.head`. |
| **RES-03** | Home-dir detection recognizes `C:\Users\<name>` and uses `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` | § *Windows Path Semantics* (case-insensitivity, 8.3, UNC) justifies D-07's pure fold; § *Code Examples* gives the `extractHomeDir` drive-letter arm and the `joinPath` shape; § *LLRT Surface* confirms no `path.win32`/`path.posix` exists to lean on. |
| **UX-02** | "CLI / Node not found" guidance shows correct Windows install commands per provider (including the Copilot `@github/copilot` correction, replacing the deprecated `gh copilot` extension hint) | § *Provider Install Commands* verifies all four providers' current commands with first-party citations, and dates the `gh-copilot` deprecation and archive. § *Existing Duplication Sites* enumerates the four hand-copied places D-15 unifies. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Platform-shaped path spelling (`joinPath`, drive-letter recognition, extension ladder) | Pure decision helper (`platform.ts` / `command-resolution.ts`) | — | Zero I/O, injected `platform`; the only tier the Linux runner can prove a win32 branch from |
| Windows install-location catalogue (which roots, which suffixes) | Pure builder in `command-resolution.ts` (`buildCommandCandidatePaths`) | — | D-10: byte-for-byte assertable from literal inputs; `%APPDATA%\...` cannot exist on the runner |
| Filesystem probing (`stat`, `readdir` version walk) | Thin impure caller in `command-resolution.ts` | — | D-10 keeps this OUT of the pure builder so no fake filesystem can weaken SC-5 |
| PATH search (`where.exe` / `which` spawn, parse, rank) | `index.ts` `resolveCommand`'s `resolveWithCache` resolver | `platform.ts` `getWhichCommand` (which binary + args) | The spawn is I/O and belongs at the seam; the *decision* of which binary is pure and injected |
| Result caching / slow-path amortisation | `resolution-cache.ts` (PERF-03, already shipped) | — | Absorbs D-09's larger candidate set and D-04's longer win32 timeout |
| Install-hint copy (data) | `packages/shared/src/` (D-15) | — | Backend error banner and frontend HelpView must render the same table |
| Install-hint copy (rendering) | `command-resolution.ts` → `formatProviderUnavailableMessage`; `HelpView.vue` | — | Two live surfaces, one source of truth |

---

## Windows Install-Location Catalogue (D-12's deliverable)

**Evidence discipline.** Rows marked **[VERIFIED: source]** were read from the tool's own installer script or
its published source this session, with the file and line quoted. Rows marked **[CITED: url]** come from
first-party documentation prose. Rows marked **[ASSUMED]** or **UNSOURCED** could not be sourced and, per
D-12, **must be dropped by the planner** unless the planner records its own reason to keep them.

### The path → source table

| # | Tool | Windows path | Source | Verdict |
|---|------|--------------|--------|---------|
| P-01 | **npm global** | `%APPDATA%\npm\<cmd>.cmd` (also `.exe`, `.ps1` shims) — executables sit **directly in the prefix**, no `bin\` segment | [CITED: docs.npmjs.com/cli/v11/configuring-npm/folders] — "the default global prefix on Windows is `%AppData%\npm`"; on Windows "executables are placed **directly into `{prefix}`**", where Unix links into `{prefix}/bin` | **KEEP.** Matches the roadmap. Note the missing `bin\` — a `%APPDATA%\npm\bin\` row would be wrong. |
| P-02 | **Node.js MSI (x64)** | `%ProgramFiles%\nodejs\node.exe` | [CITED: learn.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-windows]; corroborated by Phase 3's own P1-WHERE measurement, which returned `C:\Program Files\nodejs\node.exe` as its second line ([03-FINDINGS.md § P1-WHERE](https://github.com/six2dez/drift/actions/runs/31702392047)) | **KEEP.** The Phase 3 measurement is the stronger evidence: this path existed on a real `windows-latest` host. |
| P-03 | **Node.js MSI (x86)** | `%ProgramFiles(x86)%\nodejs\node.exe` | No first-party statement found. The variable is real and standard on 64-bit Windows; a 32-bit Node MSI installs there | **[ASSUMED] — planner's call.** Cost is one `stat`. If kept, note in the comment that it covers a 32-bit Node install on 64-bit Windows and is not sourced. Reading `%ProgramFiles%` from env rather than hardcoding `C:\Program Files` is required either way — see § *Pitfall 4*. |
| P-04 | **nvm-windows root** | `%LOCALAPPDATA%\nvm` (`NVM_HOME`) | **[VERIFIED: coreybutler/nvm-windows `nvm.iss:27`]** — verbatim: `DefaultDirName={localappdata}\{#MyAppShortName}` with `#define MyAppShortName "nvm"` (`nvm.iss:2`); the installer then writes `RegWriteExpandStringValue(..., 'NVM_HOME', ExpandConstant('{app}'))` (`nvm.iss:461,463`) | **CORRECTS THE ROADMAP.** The roadmap and D-09's sketch say `%APPDATA%\nvm`. That is **not** the current default. |
| P-05 | **nvm-windows version dir** | `%LOCALAPPDATA%\nvm\v<version>\node.exe` — `node.exe` sits **directly** in the version dir, no `bin\` | **[VERIFIED: coreybutler/nvm-windows `nvm.go:407`]** — verbatim: `p := filepath.Join(env.root, "v"+version)`; the same `filepath.Join(env.root, "v"+version)` shape recurs at `:713`, `:800`, `:886`, `:935` | **KEEP.** Note the `v` prefix is part of the directory name. |
| P-06 | **nvm-windows symlink** | `C:\nvm4w\nodejs\node.exe` (`NVM_SYMLINK`) — **and it is on `PATH`** | **[VERIFIED: coreybutler/nvm-windows `nvm.iss:251`]** — verbatim: `SymlinkPage.Values[0] := ExpandConstant('C:\nvm4w\nodejs');` and `nvm.iss:477-478` — verbatim: `if Pos('%NVM_SYMLINK%',path) = 0 then begin  path := path+';%NVM_SYMLINK%';` | **CORRECTS THE ROADMAP.** The roadmap says `%ProgramFiles%\nodejs` is the nvm symlink; the installer's own README warns that pointing it there **fails** ("a symlink cannot overwrite a physical directory"). **Consequence for D-11 / the version-walk depth:** because `%NVM_SYMLINK%` is on `PATH`, `where.exe node` already resolves an nvm-managed Node. The version walk is a *fallback for a broken PATH*, not the primary route. |
| P-07 | **nvm-windows legacy `%APPDATA%\nvm`** | — | No source found for any current or historical nvm-windows release defaulting there | **DROP (UNSOURCED).** Under D-12 this row is dropped. If the planner wants a legacy fallback it must record it as an explicit non-claim, not as a sourced path. |
| P-08 | **fnm base dir (modern)** | `%APPDATA%\fnm` | **[VERIFIED: Schniz/fnm `src/directories.rs`]** — verbatim: `let modern = strategy.data_dir().join("fnm"); if modern.exists() { return modern; }`, and **[VERIFIED: etcetera 0.8.0 `base_strategy::Windows`]** whose own doctest asserts `base_strategy.data_dir().strip_prefix(&home_dir) == Ok(Path::new("AppData/Roaming/"))` and maps `APPDATA` → `data_dir()`. fnm pins `etcetera = "0.8.0"` (`Cargo.toml:19`) | **CORRECTS THE ROADMAP.** The roadmap says `%LOCALAPPDATA%\fnm`. On Windows, etcetera's `LOCALAPPDATA` is `cache_dir()`, which fnm uses only for `fnm_multishells`. |
| P-09 | **fnm base dir (legacy)** | `%USERPROFILE%\.fnm` | **[VERIFIED: Schniz/fnm `src/directories.rs`]** — verbatim: `let legacy = strategy.home_dir().join(".fnm"); if legacy.exists() { return legacy; }`; etcetera 0.8.0 maps `USERPROFILE` → `home_dir()` | **KEEP.** fnm itself still probes it, so a Windows user upgraded from an older fnm has this layout. |
| P-10 | **fnm version dir** | `<base>\node-versions\<v>\installation\node.exe` — **no `bin` segment on Windows** | **[VERIFIED: Schniz/fnm `src/config.rs:151-153`]** — verbatim: `pub fn installations_dir(&self) -> std::path::PathBuf { self.base_dir_with_default().join("node-versions") }`; **`src/version.rs:65-68`** — verbatim: `config .installations_dir() .join(v.v_str()) .join("installation")`; **`src/commands/exec.rs:77-81`** — verbatim: `#[cfg(windows)] let bin_path = applicable_version.path().to_path_buf();` / `#[cfg(not(windows))] let bin_path = applicable_version.path().join("bin");` | **CONFIRMS THE ROADMAP'S `bin`-drop NOTE.** The POSIX builder's `.join("installation").join("bin")` must **not** be mirrored on win32. |
| P-11 | **Volta home** | `%LOCALAPPDATA%\Volta` (`VOLTA_HOME`) | **[VERIFIED: volta-cli/volta `crates/volta-core/src/layout/windows.rs`]** — verbatim: `pub(super) fn default_home_dir() -> Fallible<PathBuf> { let mut home = dirs::data_local_dir().ok_or(ErrorKind::NoLocalDataDir)?; home.push("Volta"); Ok(home) }`; corroborated by [CITED: docs.volta.sh/advanced/installers] — "The default `VOLTA_HOME` is set to `%LOCALAPPDATA%\Volta`" | **CORRECTS THE POSIX ANALOGY.** POSIX Volta is `~/.volta`; Windows is **not** `%USERPROFILE%\.volta`. The old-default fallback row is UNSOURCED — drop it. |
| P-12 | **Volta shims** | `%LOCALAPPDATA%\Volta\bin\<cmd>.cmd` — **`.cmd`, not `.exe`** | **[VERIFIED: volta-cli/volta `crates/volta-layout/src/v4.rs:15`]** — verbatim: `"bin": shim_dir {}`; and **`v4.rs:98-101`** — verbatim: `#[cfg(windows)] let toolname = format!("{}{}", toolname, ".cmd"); path_buf!(self.shim_dir.clone(), toolname)` | **KEEP — and flag it.** A Volta-managed `node` or `claude` resolves to a `.cmd`. Phase 3's P1-CMD proved a direct `.cmd` spawn throws `EINVAL` synchronously. Phase 6 may resolve it; Phase 7 (PRV-02) must launch it. |
| P-13 | **Volta node image** | `%LOCALAPPDATA%\Volta\tools\image\node\<version>\node.exe` — no `bin` on Windows | **[VERIFIED: volta-cli/volta `crates/volta-layout/src/v4.rs:24-25`]** — verbatim: `"image": image_dir { "node": node_image_root_dir {}`; and **`v4.rs:115-116`** — verbatim: `#[cfg(windows)] ... pub fn node_image_bin_dir(&self, node: &str) -> PathBuf { self.node_image_dir(node)` | **RECOMMEND ADDING.** Not in the roadmap. This is the row that lets Phase 6 hand Phase 7 a real `node.exe` for a Volta user instead of a `.cmd` — a genuine reduction in Phase 7's `cmd.exe` surface. Needs a `readdir` version walk like nvm/fnm. |
| P-14 | **Volta install root** | `%ProgramFiles%\Volta` (the `volta.exe` binary itself, on the System `Path`) | [CITED: docs.volta.sh/advanced/installers] — "The Windows installer unpacks binaries into `Program Files\Volta` and adds that folder to the System `Path`" | **DROP for this phase.** It holds `volta.exe`, not `node.exe` or a provider CLI. Recording it so a later reader does not re-derive it. |
| P-15 | **Bun** | `%USERPROFILE%\.bun\bin\<cmd>.exe` | [CITED: bun.com/docs/installation] — the Windows PATH fix references `"$env:USERPROFILE\.bun\bin"` | **KEEP.** Same shape as the POSIX `~/.bun/bin` row already in the code. |
| P-16 | **pnpm global bin** | `%LOCALAPPDATA%\pnpm\` | **[VERIFIED: `@pnpm/config@1004.11.0` `lib/dirs.js` `getDataDir`]** — verbatim: `if (opts.env.PNPM_HOME) { return opts.env.PNPM_HOME; } ... if (opts.platform === 'darwin') { return path.join(os.homedir(), 'Library/pnpm'); } if (opts.platform !== 'win32') { return path.join(os.homedir(), '.local/share/pnpm'); } if (opts.env.LOCALAPPDATA) { return path.join(opts.env.LOCALAPPDATA, 'pnpm'); } return path.join(os.homedir(), '.pnpm');` | **KEEP.** This single function also **confirms the two POSIX rows already in `command-resolution.ts:158-159`** (`Library/pnpm`, `.local/share/pnpm`) are correct — a free CMP-01 datapoint. Optional extra row: `%USERPROFILE%\.pnpm` for the no-`LOCALAPPDATA` fallback arm. |
| P-17 | **scoop shims (user)** | `%USERPROFILE%\scoop\shims\` | **[VERIFIED: ScoopInstaller/Install `install.ps1`]** — verbatim: `$SCOOP_DIR = $ScoopDir, $env:SCOOP, "$env:USERPROFILE\scoop" | Where-Object { -not [String]::IsNullOrEmpty($_) } | Select-Object -First 1` and `$SCOOP_SHIMS_DIR = "$SCOOP_DIR\shims"` | **KEEP.** Matches the roadmap. |
| P-18 | **scoop shims (global)** | `%ProgramData%\scoop\shims\` | **[VERIFIED: ScoopInstaller/Install `install.ps1`]** — verbatim: `$SCOOP_GLOBAL_DIR = $ScoopGlobalDir, $env:SCOOP_GLOBAL, "$env:ProgramData\scoop" | ... | Select-Object -First 1` | **Planner's call.** Sourced, so D-12 permits it; it is a machine-wide root not covered by D-09's three user env vars, so it needs its own row like `%ProgramFiles%\nodejs`. |
| P-19 | **Claude Code native installer** | `%USERPROFILE%\.local\bin\claude.exe` | **[VERIFIED: code.claude.com/docs/en/setup, § *Uninstall → Native installation → Windows PowerShell*]** — verbatim: `Remove-Item -Path "$env:USERPROFILE\.local\bin\claude.exe" -Force` and `Remove-Item -Path "$env:USERPROFILE\.local\share\claude" -Recurse -Force` | **KEEP — confirms the roadmap's `%USERPROFILE%\.local\bin`.** Note the extension is `.exe`, so D-11's ladder hits on the first rung here. |
| P-20 | **asdf** | — | [CITED: asdf-vm.com/more/faq.html] — "WSL1 … is not officially supported"; "WSL2 should work using the setup & dependency instructions for you chosen WSL distro" and "is _only_ expected to work properly when the current working directory is a Unix drive and not a bound Windows drive" | **DROP the win32 row entirely.** asdf has no native Windows build. The POSIX `~/.asdf/shims` row (`command-resolution.ts:154`, `:184`) stays byte-identical. |

### Named-Root Table (planner-ready D-09 input)

Derived strictly from the KEEP rows above. `<cmd>` is the bare command name; D-11 walks the extension ladder
inside each location. `<v>` marks a `readdir` version walk.

| Root | Env var | Suffixes, in D-11 precedence order | Rows |
|---|---|---|---|
| npm global | `APPDATA` | `npm\<cmd>` | P-01 |
| fnm (modern) | `APPDATA` | `fnm\node-versions\<v>\installation\<cmd>` | P-08, P-10 |
| Volta | `LOCALAPPDATA` | `Volta\bin\<cmd>`, then `Volta\tools\image\node\<v>\node` (node only) | P-11, P-12, P-13 |
| pnpm | `LOCALAPPDATA` | `pnpm\<cmd>` | P-16 |
| nvm-windows | `LOCALAPPDATA` | `nvm\v<v>\<cmd>` | P-04, P-05 |
| Claude native / user bin | `USERPROFILE` | `.local\bin\<cmd>` | P-19 |
| Bun | `USERPROFILE` | `.bun\bin\<cmd>` | P-15 |
| scoop | `USERPROFILE` | `scoop\shims\<cmd>` | P-17 |
| fnm (legacy) | `USERPROFILE` | `.fnm\node-versions\<v>\installation\<cmd>` | P-09, P-10 |
| pnpm (no-LOCALAPPDATA arm) | `USERPROFILE` | `.pnpm\<cmd>` | P-16 |
| Node MSI | `ProgramFiles` | `nodejs\node` (node only) | P-02 |
| nvm-windows symlink | *(literal)* | `C:\nvm4w\nodejs\<cmd>` | P-06 |
| scoop global | `ProgramData` | `scoop\shims\<cmd>` | P-18 |

Note that `%APPDATA%\.local\bin` and `%APPDATA%\.bun\bin` are exactly the nonsense combinations D-09's
named-root shape exists to prevent — the table above produces none of them. A flat
`homeDirs × one-ladder` cross would produce 13 roots × 3 home dirs ≈ 39 locations, of which ~26 cannot
exist; the named-root shape produces 13.

### Provider Install Commands (UX-02 / D-13 / D-14)

| Provider | Windows command(s) | POSIX command (today, unchanged) | Source | Verdict |
|---|---|---|---|---|
| **Claude Code** | PowerShell: `irm https://claude.ai/install.ps1 \| iex` · CMD: `curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd` · WinGet: `winget install Anthropic.ClaudeCode` · npm: `npm install -g @anthropic-ai/claude-code` | `curl -fsSL https://claude.ai/install.sh \| bash` | **[VERIFIED: code.claude.com/docs/en/setup, § *Install Claude Code*]** — all four quoted verbatim from the tabbed install block | **KEEP.** The POSIX hint at `command-resolution.ts:9` is already correct and must stay byte-identical (D-13). The PowerShell form is the one to lead with; per D-13 the execution-policy caveat is UX-03/Phase 10 and is **not** pulled forward. |
| **Gemini CLI** | `npm install -g @google/gemini-cli` | same | [CITED: registry] `npm view @google/gemini-cli version` → `0.56.0` at time of research | **KEEP, unchanged on both arms.** Note the package-name provenance rule: the name was carried in from the existing codebase and confirmed on the registry, not discovered from Google's docs. Registry existence alone is not `[VERIFIED]` — see § *Package Legitimacy Audit*. |
| **Codex CLI** | `npm install -g @openai/codex` · PowerShell: `powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 \| iex"` | `npm install -g @openai/codex` | [CITED: github.com/openai/codex README]; **the win32 optional-dep caveat is RESOLVED** — `npm view @openai/codex optionalDependencies` returns `'@openai/codex-win32-x64': 'npm:@openai/codex@0.149.0-win32-x64'` and `'@openai/codex-win32-arm64': ...` | **KEEP.** STATE.md's "win32 optional-dep caveat" no longer describes a gap: both win32 arches ship. The hint need not warn about it. The PowerShell installer's `-ExecutionPolicy ByPass` is UX-03 territory — **do not** pull it into the hint (D-13). |
| **GitHub Copilot CLI** | `npm install -g @github/copilot` · WinGet: `winget install GitHub.Copilot` | `npm install -g @github/copilot` (**replacing** `gh extension install github/gh-copilot`) | **[VERIFIED: docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli]** quotes `npm install -g @github/copilot`, `winget install GitHub.Copilot`, `brew install --cask copilot-cli`. Deprecation **[VERIFIED: github.com/github/gh-copilot]** — verbatim: "GitHub Copilot in the CLI has been deprecated on October 25, 2025 in favor of GitHub Copilot CLI"; the repository "was archived by the owner on October 30, 2025, and is now read-only" | **D-14 CONFIRMED, and stronger than the decision assumed.** The current string at `command-resolution.ts:15` points users at an **archived, read-only** repository. This is a live defect on macOS and Linux today, not a Windows-only gap. |
| **Node.js** (D-16's `NODE_EXECUTABLE_ERROR` win32 arm) | `winget install OpenJS.NodeJS.LTS`, or the LTS installer from nodejs.org | *(POSIX arm unchanged: "Restart Caido from an environment where Node.js is available.")* | Package id **[VERIFIED: microsoft/winget-pkgs]** — `manifests/o/OpenJS/NodeJS/` contains an `LTS` directory alongside the per-version ones | **KEEP.** D-16's suggested wording checks out. |

### Existing Duplication Sites (D-15's targets)

| Site | Line(s) | Content | D-15 disposition |
|---|---|---|---|
| `packages/backend/src/command-resolution.ts` | `7-16` (`PROVIDER_INSTALL_HINTS`, keys at `:8`, `:10`, `:12`, `:14`) | The backend hint table, about to gain a second platform arm | **MOVE** to `packages/shared/src/` |
| `packages/frontend/src/views/HelpView.vue` | `207-223` | The same four commands as prose `<li>` items | **WIRE** to the shared table |
| `README.md` | — | **grep for `gh-copilot`, `gh extension`, `@github/copilot`, `claude.ai/install` in `README.md` returns ZERO hits.** README line 35 does name the *probed locations* ("Homebrew, `~/.local/bin`, Volta, asdf, nvm, fnm"), which this phase makes incomplete on Windows | **NO Copilot edit needed** — the deferred "README prose naming the deprecated Copilot command" item is a **no-op**. The line-35 probed-locations sentence is a separate, optional prose accuracy fix the planner may fold in. |
| `CHANGELOG.md` | `75` | Contains `gh extension install github/gh-copilot` | **DO NOT TOUCH** (D-15) |

Recommended new-file home: **`packages/shared/src/cli-providers.ts`**. It already exports `CliProvider`,
`CLI_PROVIDER_DISPLAY_NAMES` and `CLI_PROVIDER_DEFAULT_COMMANDS` keyed by the same four provider ids, and is
re-exported from `packages/shared/src/index.ts:1`. Adding a fifth keyed-by-`CliProvider` record there costs
no new module and gains a compile-time exhaustiveness check the current `Record<string, string>` does not
have.

---

## `where.exe` Semantics (RES-02, D-01/D-02/D-03)

| Property | Answer | Confidence |
|---|---|---|
| Default search scope | "By default, **where** searches the current directory and the paths that are specified in the PATH environment variable." [CITED: learn.microsoft.com/.../windows-commands/where] | HIGH |
| PATHEXT | "If you do not specify a file name extension, the extensions listed in the PATHEXT environment variable are appended to the pattern by default." [CITED: same] | HIGH |
| Multiple matches | Prints **all** matches, one full path per line. Confirmed by first-party measurement: Phase 3's P1-WHERE returned **2 CRLF-split lines** on a real `windows-latest` host. [VERIFIED: `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md` § *P1-WHERE*, [run 31702392047](https://github.com/six2dez/drift/actions/runs/31702392047)] | HIGH — MEASURED |
| Exit codes | `0` on success, `1` on no-match. Documented explicitly only for `/q`: "Returns an exit code (**0** for success, **1** for failure) without displaying the list of matched files" [CITED: learn.microsoft.com]. The same codes apply without `/q` — corroborated by ss64.com/nt/where.html and by the existing `code === 0` guard already in `resolveCommand` | MEDIUM — the `/q` documentation is the only first-party statement |
| No-match message | `INFO: Could not find files for the given pattern(s).` is emitted on **stderr** | **LOW — UNSOURCED as to stream.** Neither the Microsoft Learn page nor ss64 states the stream. See § *Pitfall 1* for why this does not matter given `code === 0` gating, and why it becomes a defect if that gate is ever loosened. |
| **Output ORDER across different extensions** | **Undocumented.** Microsoft Learn does not describe the ordering; ss64 confirms it "always returns the full path to each file found" and is "useful to reveal multiple versions of the same command" but "does not explain the ordering mechanism". Phase 3's measurement returned two lines that were **both `.exe`**, so it discriminates PATH order but **cannot** discriminate PATH-major vs PATHEXT-major | **UNSOURCED — and D-01 does not need it.** |

### The load-bearing consequence for D-01

**D-01 is implementable exactly as written, and the undocumented ordering is the reason it must be, not an
obstacle to it.** D-01 says: rank all lines by `WINDOWS_EXECUTABLE_EXTENSIONS`, using `where`'s emission
order only as a **tie-break within an extension**. That contract needs only two facts, both of which hold:

1. `where` emits every hit (measured, 2 lines).
2. Within a single extension, `where` walks PATH in order (documented: it "searches … the paths that are
   specified in the PATH environment variable").

It never asks *how* `where` interleaves extensions — which is precisely what is undocumented. Had D-01
instead been "trust `where`'s first line to prefer `.exe`", it would rest on an undocumented property, and
SC-2's "preferring `.exe` over `.cmd`" would be an accident of the runner's PATH. Record this in the code
comment: **the ranking exists because `where`'s cross-extension order is not specified.**

### `${SystemRoot}\System32\where.exe` (D-02)

`SYSTEMROOT` and `WINDIR` are both among libuv's eleven back-filled `required_vars` — the list Phase 3
recorded verbatim as `HOMEDRIVE, HOMEPATH, LOGONSERVER, PATH, SYSTEMDRIVE, SYSTEMROOT, TEMP, USERDOMAIN,
USERNAME, USERPROFILE, WINDIR` [VERIFIED: `packages/backend/src/platform.ts:250-256`, quoted in the
`buildSpawnEnv` comment]. So D-02's input is reliably present in a *Node* parent process. **Vehicle
caveat:** that back-fill is libuv's, i.e. Node's; whether Caido's LLRT does the same is unverified in either
direction — which is exactly why D-02's bare-`"where.exe"` fallback arm is load-bearing rather than
defensive padding. The fallback must be reachable and tested, not treated as dead code.

Casing note: `process.env` on Windows is case-insensitive in Node, but D-02's helper takes an injected
`env: Record<string, string | undefined>` and will be unit-tested on **Linux**, where a plain object lookup
is case-**sensitive**. Phase 4's `getHomeDirCandidates` already reads `input.env[name]` with SCREAMING-CASE
names (`platform.ts:232`), so following that convention keeps the two helpers consistent. The planner should
decide whether to check both `SYSTEMROOT` and `SystemRoot` spellings, or to state that Windows' own
case-insensitivity makes the single spelling sufficient on the real platform and the Linux test supplies the
canonical spelling.

---

## Windows Path Semantics (RES-03, D-06/D-07)

| Property | Finding | Consequence for this phase |
|---|---|---|
| **Case-insensitivity** | Windows filesystems are case-insensitive (and case-preserving) by default. `C:\Program Files` and `c:/program files` name the same directory | **Justifies D-07's pure fold.** A lowercased, separator-normalized dedup KEY collapses the two while the ORIGINAL spelling is what gets emitted. This is exactly what `pushUniqueCandidate` (`command-resolution.ts:41-45`) needs, and it needs nothing more. |
| **8.3 short names** | `C:\Users\RUNNER~1` and `C:\Users\runneradmin` are the same directory but are **not** collapsible by any pure string rule — resolving them requires a filesystem call | **Confirms D-07's decline of `normalizePathForCompare`.** The 8.3 case 04-D-04 anticipated arises when `os.tmpdir()` returns the short form (Phase 3 measured exactly that: `os.tmpdir()="C:\\Users\\RUNNER~1\\AppData\\Local\\Temp"` [VERIFIED: 03-FINDINGS § *INFO observations*]). But Phase 6 never compares a tmpdir-derived path against a `USERPROFILE`-derived one — it compares candidate strings inside `pushUniqueCandidate`, where a missed dedup costs one extra `stat`, never a wrong answer. **D-07 is correct.** |
| **Both separators accepted** | Win32 APIs accept `/` and `\` interchangeably in most path positions | **Justifies D-06's shape-sniffing** acceptance of both `C:\Users\<name>` and `C:/Users/<name>`, matching `isAbsolutePath`'s existing `platform: undefined` arm (`platform.ts:107`). Also means D-05's `path.join`-produced mixed spelling (`C:\Users\x/.local/bin/cmd`) is not a runtime break — D-05's stated rationale (evidence, not correctness) is accurate. |
| **UNC and rooted paths** | `\\server\share\...` and `\dir\...` are both absolute on win32 | Already handled — `isAbsolutePath` has an `isRooted` arm (`platform.ts`, the `first === "\\" || first === "/"` check). **`extractHomeDir`'s new drive-letter arm should NOT try to handle UNC**: there is no `C:\Users\<name>` analogue for `\\server\share\home\x`, and inventing one is unsourced guessing. State that as a non-claim. |
| **`%ProgramFiles%` under WOW64** | On 64-bit Windows a **32-bit** process sees `%ProgramFiles%` = `C:\Program Files (x86)`; a 64-bit process sees `C:\Program Files` | If Caido's backend host is 32-bit, `%ProgramFiles%\nodejs` silently resolves to the x86 tree. This is an argument **for** keeping P-03's `%ProgramFiles(x86)%` row despite it being `[ASSUMED]` — it is the arm that survives whichever bitness Caido is. |

---

## LLRT / QuickJS Surface — what this phase may and may not rely on

Read from the version this repo actually pins: `@caido/quickjs-types@0.25.4`.

| API | Declared under LLRT? | Evidence | Consequence |
|---|---|---|---|
| `path.posix` / `path.win32` | **NO** | [VERIFIED: `node_modules/.pnpm/@caido+quickjs-types@0.25.4/.../src/llrt/path.d.ts`] — the module declares a single `const path: path.PlatformPath` with a flat `PlatformPath` interface. `grep -n "posix\|win32" path.d.ts` returns **zero** matches | **Confirms `normalizePosixPath`'s comment** at `command-resolution.ts:60-66` and forecloses the one-line `path.posix.join` fix for D-05. D-05's hand-rolled `joinPath` is not paranoia; it is the only option. |
| `path.sep` / `path.delimiter` | **YES**, but platform-FLAVOURED | [VERIFIED: `path.d.ts:118-124`] — verbatim: `readonly sep: "\\" | "/";` and `readonly delimiter: ";" | ":";` | **Do NOT use `path.sep` inside `joinPath`.** It reports the *host's* flavour, which is the exact bug D-05 exists to eliminate — the Linux runner would emit `/` for a win32 case. `joinPath` must derive its separator from the **injected `platform`**, following `getTempRoot`'s precedent (`platform.ts`, which strips both separators by hand for this reason). |
| `path.join`, `normalize`, `isAbsolute`, `dirname`, `basename`, `extname`, `resolve`, `parse`, `format` | YES (all flat / host-flavoured) | [VERIFIED: `path.d.ts`, `PlatformPath` interface] | All are the *host* flavour. `path.dirname` is still used at `command-resolution.ts:176` for the provider-adjacent node sibling; that call is host-flavoured **by design** (the existing test comment at `command-resolution.test.ts:98-107` records exactly this, and records the CI red that taught it). D-05's sweep should decide explicitly whether `dirname` stays or joins the sweep — the CONTEXT says "every `path.join`", which does not name `dirname`. |
| `os` module | **NOT DECLARED AT ALL** | [VERIFIED: `ls node_modules/.pnpm/@caido+quickjs-types@0.25.4/.../src/llrt/` returns `abort, buffer, child_process, dns, dom-events, events, fs, fs.d.ts, globals, https, index, net, path, process, stream, string_decoder, url` — **no `os.d.ts`**] | Phase 4 already handles this: the single `os` read is lazy, inside `probeRuntime` (`index.ts:487`), and RUN-05 turns its absence into a loud error. **Phase 6 must not add a second `os` read.** `getHomeDirCandidates` takes an injected `env`, and `host?.platform` is the only platform source. |
| `SpawnOptions.windowsHide` | **NOT DECLARED** | [VERIFIED: `.../src/llrt/child_process.d.ts:244-255`] — `interface SpawnOptions extends ProcessEnvOptions` declares only `stdio`, `shell`, `windowsVerbatimArguments` | Confirms UX-04/Phase 10 has a real problem to solve and that it is **not** a one-line fix. Phase 6 should place the `UX-04 / Phase 10` marker at the new `where.exe` spawn site (per 06-CONTEXT § *Specific Ideas*) and say plainly that the option is not in the declared LLRT surface. |
| `process.env` | Available in practice; the codebase reads it defensively through `globalThis` casts | [VERIFIED: `index.ts:470-479` `readParentEnv()`, and `index.ts:1571-1580` `getKnownHomeDirs()`, both using a `globalThis as typeof globalThis & { process?: … }` cast with a `try/catch`] | **D-08's `getKnownHomeDirs` rewrite must keep the defensive cast**, not switch to a bare `process.env`. |

**Vehicle caveat, carried forward per 03-FINDINGS § *Vehicle caveat*.** Everything above is read from
Caido's *published type declarations*, not executed under Caido's LLRT. A published type that omits a
capability is not proof the capability is absent, and a type that declares one is not proof it works —
05-RESEARCH.md § *Pitfall 7* records that lesson from this project's own history. The declarations are the
best available evidence and are treated as such; they are not measurements.

---

## Architecture Patterns

### System Architecture Diagram

```
                      ┌──────────────────────────────────────────┐
   provider status    │  resolveCommand(command)  [index.ts:1469] │
   check / MCP start ─▶│                                          │
                      │  1. isAbsolutePath({value, platform})?    │──yes──▶ fileExists ──▶ path | undefined
                      │     (host?.platform, undefined pre-probe) │              (outside the cache — T-04-25)
                      └───────────────┬──────────────────────────┘
                                      │ no
                                      ▼
                      ┌──────────────────────────────────────────┐
                      │ resolveWithCache(key=`cmd:${command}`)     │  PERF-03: 5 min positive / 30 s negative
                      │   [resolution-cache.ts:17,28]              │  cleared whole on providers[*].command change
                      └───────────────┬──────────────────────────┘
                                      │ miss
              ┌───────────────────────┴────────────────────────┐
              ▼                                                 ▼
  ┌──────────────────────────────┐              ┌────────────────────────────────────┐
  │ PATH SEARCH  (D-01…D-04)      │              │ CANDIDATE WALK  (D-05…D-11)         │
  │                               │              │                                     │
  │ getWhichCommand({platform,env})│              │ getHomeDirCandidates({platform,env}) │
  │   win32 → %SystemRoot%\        │              │   win32 → USERPROFILE/APPDATA/      │
  │           System32\where.exe   │              │            LOCALAPPDATA             │
  │   else  → which                │              │   posix → HOME                       │
  │        ▼                       │              │   undefined → BOTH sets  (D-08)      │
  │  spawn, bounded stdout          │              │        ▼                             │
  │  timeout: 1000 ms posix /       │              │  buildCommandCandidatePaths(...)     │◀── PURE, zero I/O
  │           <headroom> win32 (D-04)│             │    named roots × sourced suffixes    │    (D-10 — the SC-5 seam)
  │        ▼                       │              │    location-major, ext ladder (D-11)  │
  │  out.head.split(/\r?\n/)  (D-03)│             │        ▼                             │
  │        ▼                       │              │  thin impure filter: stat / readdir   │◀── the ONLY I/O
  │  rank by WINDOWS_EXECUTABLE_    │              │    version walk (nvm / fnm / Volta)   │
  │  EXTENSIONS, PATH order breaks  │              │        ▼                             │
  │  ties within an ext  (D-01)     │──────────────▶  pushUniqueCandidate, folded key (D-07)│
  └──────────────────────────────┘  pathResolution └────────────────┬────────────────────┘
                                     is candidate[0]                 │ first fileExists hit
                                                                     ▼
                                                         absolute path + explicit extension
                                                                     │
                                    ┌────────────────────────────────┴─────────────────────┐
                                    ▼                                                       ▼
                        found: Phase 7 branches on the                        NOT found: checkProvider [index.ts:1582]
                        extension (.exe direct vs .cmd                        → formatProviderUnavailableMessage
                        via cmd.exe /d /s /c — PRV-02)                        → getProviderInstallHint({providerId, platform})
                                                                              → shared hint table (D-15)
                                                                                    │
                                                                       ┌────────────┴────────────┐
                                                                       ▼                         ▼
                                                             chat error banner            Settings → CLI Providers
                                                                                          / HelpView.vue
```

### Component Responsibilities

| Component | File | This phase's change |
|---|---|---|
| `getWhichCommand` | `packages/backend/src/platform.ts:166` | Input grows to `{ platform, env }`; win32 arm derives `%SystemRoot%\System32\where.exe` with a bare fallback (D-02). **Currently zero callers** — Phase 6 wires it. |
| `WINDOWS_EXECUTABLE_EXTENSIONS` | `packages/backend/src/platform.ts:182` | **Unchanged.** Verbatim: `export const WINDOWS_EXECUTABLE_EXTENSIONS = [".exe", ".cmd", ".bat"] as const;` — D-01's ranking and D-11's ladder must both read THIS constant. A second hardcoded order anywhere is a defect. |
| `getExecutableNames` | `packages/backend/src/platform.ts:187` | **Unchanged.** Already produces the ladder and already handles an already-extensioned command case-insensitively. D-11's per-location ladder should call it, not re-derive it. |
| `getHomeDirCandidates` | `packages/backend/src/platform.ts:226` | Widens to `Platform | undefined`; unions both name sets on `undefined` (D-08). Current win32 names, verbatim at `:232`: `? ["USERPROFILE", "APPDATA", "LOCALAPPDATA"]`. **Currently zero callers** — Phase 6 wires it. |
| `joinPath` (new) | discretion: `platform.ts` or `command-resolution.ts` | D-05. See § *Where the two new helpers should live* below. |
| `rankWhereOutput` (new) | discretion: same | D-01. |
| `PROVIDER_INSTALL_HINTS` | `packages/backend/src/command-resolution.ts:7-16` | **MOVES** to `packages/shared/src/cli-providers.ts`, gains a platform arm (D-13/D-14/D-15). |
| `extractHomeDir` | `packages/backend/src/command-resolution.ts:83` | Gains a drive-letter arm, stays platform-blind (D-06). |
| `pushUniqueCandidate` | `packages/backend/src/command-resolution.ts:41` | Gains a folded dedup key on win32 (D-07). |
| `collectVersionManagerCommandCandidates` | `packages/backend/src/command-resolution.ts:116` | Splits per D-10; gains the win32 nvm/fnm/Volta version walks. |
| `getCommandExecutableCandidates` | `packages/backend/src/command-resolution.ts:141` | Splits per D-10; win32 arm reads the named-root table. POSIX arm byte-identical. |
| `getNodeExecutableCandidates` | `packages/backend/src/command-resolution.ts:170` | Same, plus the `%ProgramFiles%\nodejs` and Volta-node-image rows. |
| `resolveCommand` | `packages/backend/src/index.ts:1469` | D-01–D-04 all land inside its `resolveWithCache` resolver. Public signature unchanged. |
| `getKnownHomeDirs` | `packages/backend/src/index.ts:1570` | Stops hardcoding `processRef.process?.env?.HOME`, calls `getHomeDirCandidates` (D-08). |
| `NODE_EXECUTABLE_ERROR` | `packages/backend/src/index.ts:160` | Gains a win32 arm (D-16). Current value, verbatim: `"Drift could not locate a Node.js executable to launch the MCP server. Restart Caido from an environment where Node.js is available."` |
| `HelpView.vue` | `packages/frontend/src/views/HelpView.vue:207-223` | Renders from the shared table (D-15). |

### Where the two new helpers should live (Claude's Discretion, D-05 / D-01)

**Recommendation: `joinPath` → `platform.ts`; the `where.exe` line-ranking helper → `platform.ts` as well.**

The argument is `platform.ts`'s own file header, which states two mechanically-checkable properties: zero
I/O and **zero imports** (`grep -c '^import'` returns 0). Both helpers satisfy both. More importantly,
`platform.ts` already owns:

- `getTempRoot`, which strips separators by hand *for exactly D-05's reason* — "the unit tests run on Linux
  where `path` is POSIX-flavoured and would leave a Windows trailing backslash in place, so the win32 case
  would be untestable exactly where it matters";
- `isAbsolutePath`, which recognises win32 path shapes with explicit character tests "never a regex with
  backslashes";
- `WINDOWS_EXECUTABLE_EXTENSIONS`, which the ranking helper must read.

Putting the ranking helper in `command-resolution.ts` would force that module to import the constant from
`platform.ts` — legal, but it splits one ordering decision across two files, which is the "second hardcoded
order" hazard 06-CONTEXT names as a defect.

The counter-argument the CONTEXT raises — "it would then hold data-adjacent logic" — is worth answering
rather than dismissing: **neither helper carries any Windows install DATA.** `joinPath` knows only which
character separates segments; the ranking helper knows only a preference order it reads from an existing
constant. The install-location catalogue (the actual data) stays in `command-resolution.ts`, which is where
D-03's shape/data line puts it. State this reasoning in the plan so the choice is visibly reasoned, per the
discretion item's "pick one and state why".

### Anti-Patterns to Avoid

- **`path.sep` inside `joinPath`.** Host-flavoured; defeats the entire purpose. Derive from injected
  `platform`.
- **`path.posix.join` as the D-05 shortcut.** The namespace does not exist in Caido's LLRT `path.d.ts`.
  Verified above.
- **A second `.exe`/`.cmd`/`.bat` order literal.** Read `WINDOWS_EXECUTABLE_EXTENSIONS`.
- **Extension-major candidate ordering.** Explicitly rejected in D-11 — a stale `node.exe` in a forgotten
  scoop dir would beat the `.cmd` shim the user's version manager actively points at.
- **`renderBoundedBuffer` on the PATH-search stdout.** D-03; the truncation marker survives `.trim()` and
  would be handed to `fileExists`/`spawn` as a path.
- **A larger buffer for this one spawn.** Explicitly rejected in D-03, on the strength of the PERF-04 site-7
  comment already in `index.ts` (verbatim: *"a timeout bounds the exposure WINDOW, not the VOLUME, and
  shipping that reading in one place while rejecting it in the other turns an inconsistency into a
  precedent"*).
- **Injecting `deps: { stat, readdir }` into the pure builder.** Explicitly rejected in D-10 — a drifting
  fake weakens SC-5 silently instead of failing loudly.
- **Claiming a resolved `.cmd` is launchable.** Phase 3's P1-CMD: direct `.cmd` spawn throws `EINVAL`
  synchronously. Phase 6 resolves; Phase 7 launches.
- **A second `os` read.** RUN-05 puts the only one behind `probeRuntime`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Which binary answers "where is this on PATH" | A `platform === "win32" ? "where.exe" : "which"` ternary at the spawn site | `getWhichCommand({ platform, env })` (`platform.ts:166`) | It already exists with a win32 arm, has **zero callers**, and is unit-tested. Wiring it IS the phase's work. |
| The `.exe`/`.cmd`/`.bat` candidate filenames | A local array literal | `getExecutableNames({ command, platform })` (`platform.ts:187`) | Already handles the already-extensioned case-insensitive input (`claude.CMD`) that a naive ladder would turn into `claude.CMD.exe`. |
| Windows home-dir env var names | A local `["USERPROFILE", "APPDATA", "LOCALAPPDATA"]` | `getHomeDirCandidates` (`platform.ts:226`) | Ditto — exists, tested, zero callers. |
| Absolute-path recognition on win32 | `path.isAbsolute` | `isAbsolutePath({ value, platform })` (`platform.ts:107`) | `path.isAbsolute` follows the module's *own* platform; a POSIX-flavoured one returns `false` for `C:\...`. Already the shipped fix. |
| Bounded stdout accumulation | A raw `stdout += d` | `createBoundedBuffer` / `appendBounded`, already wrapping this spawn | PERF-04 site 7; D-03 changes only how `.head` is read. |
| Slow-path amortisation | A new cache | `resolution-cache.ts` — `RESOLUTION_POSITIVE_TTL_MS = 5 * 60 * 1000` (`:17`), `RESOLUTION_NEGATIVE_TTL_MS = 30 * 1000` (`:28`) | Already keyed `cmd:${command}` and cleared whole on a `providers[*].command` change. D-04's slower win32 timeout and D-09's larger candidate set are both absorbed here. |
| Provider-id → display name / default command | Another lookup table | `packages/shared/src/cli-providers.ts` `CliProvider`, `CLI_PROVIDER_DISPLAY_NAMES`, `CLI_PROVIDER_DEFAULT_COMMANDS` | D-15's new hint table belongs beside these, keyed by the same union, so exhaustiveness is compiler-checked. |
| Path comparison / realpath | `realpathSync.native`, or wiring `normalizePathForCompare` | A pure lowercased, separator-folded key inside `pushUniqueCandidate` | D-07, and the `realpathRung` probe already reports the untested rung. Async I/O on a pre-probe hot path buys a saving the resolution cache mostly absorbs. |

**Key insight:** Phase 4 deliberately shipped SHAPE without DATA and left two exported functions with zero
callers. The single largest correctness risk in Phase 6 is *not* getting a Windows path wrong — it is
re-implementing, inside `command-resolution.ts` or `index.ts`, a decision `platform.ts` already makes
correctly and tests. The `noUnusedLocals` + `--max-warnings 0` gate cannot catch that: a duplicated ternary
compiles clean.

---

## Common Pitfalls

### Pitfall 1: `where.exe`'s no-match `INFO:` line reaching the ranker
**What goes wrong:** `INFO: Could not find files for the given pattern(s).` gets treated as a candidate path.
**Why it happens:** The stream it is written to is **undocumented** (see § *`where.exe` Semantics*). If it is
stdout, it lands in `out.head`.
**How to avoid:** Two independent guards, both already partly present. (a) The existing `code === 0` gate —
`where` exits `1` on no-match, so the branch is not taken. (b) D-01's extension ranking: a line not ending in
a known extension is not rankable and must be discarded. Guard (b) is the one that survives a future
loosening of (a), and it is the same mechanism D-03 already relies on to discard a partial final line above
the buffer cap. **Assert both in a test** — feed the helper a literal `INFO:` line and assert it produces no
candidate.
**Warning signs:** A resolved "path" beginning with `INFO:`; a `fileExists` call on a sentence.

### Pitfall 2: Testing the runner instead of the target (the D-05 rationale, restated as a hazard)
**What goes wrong:** A Linux-runner assertion passes while describing a string a Windows box would never
produce.
**Why it happens:** `path.join("C:\\Users\\x", ".local", "bin", cmd)` on a POSIX-flavoured `path` yields
`C:\Users\x/.local/bin/cmd`. Win32 accepts it, so nothing breaks — but the test now asserts the *host's*
spelling.
**How to avoid:** D-05's injected-`platform` `joinPath`, plus D-10's pure builder so the Windows list is
asserted from literal inputs with **no filesystem at all**. And assert the POSIX output byte-identical to
today's `path.join` output — 06-CONTEXT § *Specific Ideas* is explicit that this equality IS the CMP-01 proof
and must not be left to review.
**Warning signs:** A test that constructs its expected value with `path.join`. `command-resolution.test.ts`
does this in four places today (`:39`, `:41`, `:58-64`, `:118-121`) — **legitimately**, because those assert
host-flavoured helpers; the new win32 cases must NOT.
**Precedent:** this exact failure took a real `windows-latest` leg red at
[run 32376894371](https://github.com/six2dez/drift/actions/runs/32376894371), and the two failures had to be
fixed at *different* layers — one was a genuine production defect, the other a test hard-coding a POSIX
literal. `command-resolution.test.ts:98-107` carries that whole story in a comment; read it before writing
the new cases.

### Pitfall 3: A Volta-resolved `node` being a `.cmd`
**What goes wrong:** Phase 6 resolves `node` to `%LOCALAPPDATA%\Volta\bin\node.cmd` and Phase 5's direct
`spawn(nodeExecutable, [script], {env})` throws `EINVAL` synchronously.
**Why it happens:** `volta-layout/src/v4.rs:98-99` appends `.cmd` to every shim filename on Windows —
verified above.
**How to avoid:** Include P-13 (`%LOCALAPPDATA%\Volta\tools\image\node\<version>\node.exe`) in the node
candidate list **at higher precedence than the shim** for the `node` command specifically, so the ladder
finds a real `.exe`. This is a genuine reduction in Phase 7's `cmd.exe` surface and is not in the roadmap.
It does not make Phase 6 responsible for spawning — PRV-02 still owns the `.cmd` case for provider CLIs.
**Warning signs:** `getNodeExecutable`'s `spawnAndWait(candidate, ["--version"])` returning a non-zero code
with an `EINVAL`-shaped error on a Volta machine.

### Pitfall 4: Hardcoding `C:\Program Files` or `C:\Windows`
**What goes wrong:** Resolution fails on any machine where Windows is not on `C:`, or under WOW64 where a
32-bit host sees a different `%ProgramFiles%`.
**Why it happens:** Phase 3 measured `C:\Windows\System32\where.exe`, and it is tempting to paste the literal
— which D-02 explicitly rejected for exactly this reason.
**How to avoid:** Read `SystemRoot` / `ProgramFiles` / `ProgramData` from the injected `env`, with a stated
fallback. Note `ProgramFiles`, `ProgramFiles(x86)` and `ProgramData` are **not** among libuv's eleven
back-filled `required_vars` — they are ordinary inherited variables, present in a normal parent process but
**not measured** by Phase 3's P3-VARS (which covered only `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`). A
missing `ProgramFiles` must degrade to skipping the row, never to a hardcoded literal.
**Warning signs:** A `"C:\\"` literal anywhere except the deliberate, sourced `C:\nvm4w\nodejs` row (P-06),
which is a genuine hardcoded default from the nvm-windows installer and should carry the citation inline.

### Pitfall 5: A silent `where.exe` timeout misreported as "not installed"
**What goes wrong:** `where.exe` under Defender real-time scanning on a cold process-creation path exceeds
1000 ms, `resolve(undefined)` fires, and the user is told the CLI is not on PATH when it is.
**Why it happens:** The current timeout is a POSIX-calibrated `1000` literal at `index.ts:1533`.
**How to avoid:** D-04's platform-aware timeout. **The exact number is UNSOURCED** — see § *Open Questions
Q1* for the two in-repo anchors and the honesty requirement.
**Warning signs:** Intermittent "not found in PATH" for a binary the user can run in their own terminal;
resolution succeeding on a warm cache and failing cold.

### Pitfall 6: Deleting `normalizePathForCompare`
**What goes wrong:** `tsconfig noUnusedLocals` + `eslint --max-warnings 0` turn an unused export into a build
failure, so the "obvious cleanup" is to delete it.
**Why it happens:** 04-D-04 named Phase 6 as its first caller; D-07 declines. A reader who sees only 04-D-04
concludes the export is a bug.
**How to avoid:** D-07 requires the decline be recorded **next to the export**, at `runtime-probe.ts:659`,
not only in this phase's artifacts. The existing precedent for the required comment shape is `genUUID`'s
re-export note at `index.ts` (verbatim: *"This re-export exists only so `noUnusedLocals` … do not force the
deletion the preservation rule forbids… Delete it the moment a caller reappears."*).

### Pitfall 7: Widening `getHomeDirCandidates` and defaulting to POSIX pre-probe
**What goes wrong:** On Windows, every provider status check before MCP start reads only `HOME` — which
Windows does not set — so Settings shows all four CLIs unavailable.
**Why it happens:** `Platform | undefined` invites a `?? "linux"` default.
**How to avoid:** D-08's union-when-unknown. This is the third site applying the rule (`isAbsolutePath`,
D-06, D-08); all three must read alike.
**Warning signs:** `getKnownHomeDirs()` returning `[]` on Windows; a test that passes `platform: undefined`
and expects one name set rather than both.

---

## Code Examples

Skeletons only — every literal below is either quoted from a file read this session or drawn from the
sourced table above. Nothing here is a copy-paste-ready implementation.

### `joinPath` (D-05) — separator from injected platform, never from `path.sep`

```typescript
// packages/backend/src/platform.ts (recommended home — see § Where the two new helpers should live)
//
// Hand-rolled for the same reason getTempRoot strips separators by hand: `path`
// resolves to its POSIX flavour on the Linux runner, and Caido's LLRT `path`
// declares NO `posix`/`win32` namespace at all
// (@caido/quickjs-types@0.25.4 src/llrt/path.d.ts declares a flat PlatformPath
// whose only separator affordance is `sep`, which is itself host-flavoured).
// `path.sep` is therefore forbidden here: it would report the RUNNER's
// separator and make every win32 assertion a test of the runner.
//
// POSIX output must be byte-identical to today's path.join — that equality is
// the CMP-01 proof for the sweep and is asserted, not assumed.
export function joinPath(input: {
  platform: Platform | undefined;
  segments: string[];
}): string {
  const separator = input.platform === "win32" ? "\\" : "/";
  // …join non-empty segments, collapsing a duplicated separator at the seam only.
}
```

### `rankWhereOutput` (D-01) — reads the ONE extension constant

```typescript
// Rank every CRLF-split line by WINDOWS_EXECUTABLE_EXTENSIONS. `where`'s own
// emission order breaks ties WITHIN an extension.
//
// The ranking exists BECAUSE where.exe's cross-extension output order is
// undocumented: Microsoft Learn describes the PATH+PATHEXT search but never the
// order of the printed results, and Phase 3's P1-WHERE measured two lines that
// were BOTH .exe, so it cannot discriminate. Relying on "first line wins" would
// make SC-2's ".exe preference" an accident of the machine's PATH.
// Source: .planning/phases/03-.../03-FINDINGS.md § P1-WHERE, run 31702392047.
//
// On POSIX the ladder has exactly one entry, so this is a no-op and `which`'s
// single-answer semantics are unchanged.
export function rankPathSearchHits(input: {
  lines: string[];
  platform: Platform;
}): string[] {
  // Discard anything not ending in a known extension: that drops where.exe's
  // "INFO: Could not find files…" line AND the partial final line D-03 leaves
  // behind above the buffer cap. Both must never reach fileExists/spawn.
}
```

### `extractHomeDir`'s drive-letter arm (D-06) — platform-blind, both spellings

```typescript
// Stays PLATFORM-BLIND: one string in, no injected platform — matching
// isAbsolutePath's `platform: undefined` arm (platform.ts:107), because
// getKnownHomeDirs is reachable from a provider status check at plugin load,
// BEFORE the RUN-05 probe sets `host`.
//
// Deliberately does NOT handle UNC ("\\\\server\\share\\..."): there is no
// C:\Users\<name> analogue for a share, and inventing one would be a guess.
export function extractHomeDir(candidatePath: string | undefined): string | undefined {
  // existing POSIX arms unchanged: "/Users/<name>", "/home/<name>"
  //
  // new: a drive-qualified user profile in EITHER spelling —
  //   C:\Users\<name>   and   C:/Users/<name>
  // matched by explicit character tests (drive letter, ':', separator), never a
  // regex with backslashes — the readability rule getTempRoot and isAbsolutePath
  // both already follow.
}
```

### The D-10 seam — pure builder, thin impure caller

```typescript
// PURE. Zero I/O. This is the SC-5 seam: the Windows list is byte-for-byte
// assertable from literal inputs on the Linux runner, where
// C:\Users\x\AppData\Roaming\npm cannot exist.
//
// Injecting deps:{stat,readdir} was REJECTED (D-10): tests would then assert
// against a mocked filesystem, so a fake that drifts from real readdir semantics
// weakens the evidence silently instead of failing loudly.
export function buildCommandCandidatePaths(input: {
  platform: Platform | undefined;
  command: string;
  roots: { userProfile?: string; appData?: string; localAppData?: string;
           programFiles?: string; programData?: string; homeDirs: string[] };
  discoveredVersions: { nvmWindows: string[]; fnmModern: string[];
                        fnmLegacy: string[]; voltaNodeImages: string[] };
}): string[] {
  // win32: named roots (D-09) walked in precedence order, each with its own
  //        sourced suffix list; getExecutableNames() ladder inside each
  //        location (D-11, location-major).
  // else:  the EXISTING flat homeDirs shape and suffix list, byte-identical.
}
```

### The D-13 hint table's new home

```typescript
// packages/shared/src/cli-providers.ts — beside CLI_PROVIDER_DISPLAY_NAMES and
// CLI_PROVIDER_DEFAULT_COMMANDS, keyed by the same CliProvider union so
// exhaustiveness is compiler-checked (the current backend table is a loose
// Record<string, string>).
//
// The POSIX arm is BYTE-IDENTICAL to command-resolution.ts:8-16 today, EXCEPT
// copilot-cli — D-14: `gh extension install github/gh-copilot` names a repo
// GitHub deprecated on 2025-10-25 and ARCHIVED on 2025-10-30. Shipping it is a
// live defect on macOS/Linux, not a Windows-only gap.
export const PROVIDER_INSTALL_COMMANDS: Record<CliProvider, {
  posix: string;
  win32: string;
}> = { /* … */ };

// On `undefined` platform (reachable pre-probe) the hint shows BOTH spellings
// rather than guessing — D-08's union-when-unknown rule, third application.
export function getProviderInstallHint(input: {
  providerId: string;
  platform: Platform | undefined;
}): string { /* … */ }
```

---

## Runtime State Inventory

Phase 6 is a resolution/copy phase, not a rename or migration. It nevertheless *reads* runtime state, so the
inventory is answered rather than skipped.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None.** No database, no persisted key, no user-visible ID changes. The `resolution-cache` is in-memory only (`resolution-cache.ts`, module-level Map) | None |
| Live service config | **None.** No `mcp add` registration, no external service config is touched. Gemini/Codex registration is Phase 7 | None |
| OS-registered state | **None** written. **Read** on Windows: `SystemRoot`/`WINDIR` (D-02), `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` (D-08/D-09), and — newly — `ProgramFiles`, `ProgramFiles(x86)`, `ProgramData`. The last three were **not** covered by Phase 3's P3-VARS measurement | Each new variable read must degrade to skipping its row when absent, never to a hardcoded literal (Pitfall 4) |
| Secrets/env vars | **None.** No token, no `DRIFT_*` variable, no secret is read or written by this phase. The `where.exe` spawn inherits the parent block; per 05-D-11 any diagnostic logs command + args + env KEY NAMES only, never values | None — but the D-11 logging rule binds any diagnostic this phase adds |
| Build artifacts | **One, and it is a real risk.** The `resolution-cache` holds a 5-minute positive / 30-second negative entry keyed `cmd:<command>` and `node`. A user who upgrades Drift mid-session keeps stale entries for up to 5 minutes | None required — the cache is process-lifetime and dies with a Caido restart. Worth one sentence in the plan so a verifier testing the new candidate list does not chase a cache hit. **Note the two-key contract at `index.ts` `getCachedNodeExecutable`: `node` is the VALIDATED executable, `cmd:node` is the raw unvalidated PATH hit — do not conflate them.** |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20 | vitest, typecheck, build | ✓ | `.nvmrc` pins `20`; CI pins via `actions/setup-node` | — |
| pnpm 9.x | workspace | ✓ | `packageManager` field pins `9.0.0` | — |
| Vitest 4.0.18 | SC-5's evidence | ✓ | root `vitest.config.ts` present, `setupFiles: ["./vitest.setup.ts"]` | — |
| `windows-latest` CI leg | SC-5's evidence lands here | ✓ | Blocking `Verify (Windows)` job in `.github/workflows/ci.yml`, landed by Phase 5, green on [run 32378434081](https://github.com/six2dez/drift/actions/runs/32378434081) | — |
| A real Windows machine | Confirming the candidate paths exist on real installs | ✗ | — | **No fallback.** PROJECT.md § *Constraints*: "the maintainer cannot test native Windows locally". Every candidate path is sourced-but-unexercised. Real-machine confirmation is Phase 9/10 (@0xMRK0S). |
| Caido LLRT runtime | Confirming `path`/`process.env` behave as the declarations say | ✗ | — | **No fallback.** No standalone LLRT Windows binary exists (03-FINDINGS § *Vehicle caveat*). Type declarations are the ceiling. |

**Missing dependencies with no fallback:** real Windows hardware; the LLRT runtime. Both are pre-existing,
milestone-wide, and already recorded as the residual gap in 03-FINDINGS and in REQUIREMENTS.md's Phase 5
closure notes. **Neither blocks this phase** — D-10's pure-builder split exists specifically so the Windows
data is provable without them.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 (root devDependency) |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `pnpm exec vitest run packages/backend/src/command-resolution.test.ts packages/backend/src/platform.test.ts` |
| Full suite command | `pnpm exec vitest run` |
| Gate commands | `pnpm -r typecheck` and `pnpm lint` (runs `eslint . --max-warnings 0`, never `--fix`) |

Existing shapes the new cases extend:
`packages/backend/src/command-resolution.test.ts` — 123 lines, one `describe("command resolution helpers")`
with 7 `it` blocks; uses real `mkdtemp`/`mkdir` temp dirs plus an `afterEach` `rm` cleanup for the two
version-manager tests.
`packages/backend/src/platform.test.ts` — 333 lines, 8 `describe` blocks, one per exported function
(`getTempRoot`, `isAbsolutePath`, `getSweepRoots`, `getWhichCommand`, `getExecutableNames`,
`getHomeDirCandidates`, `normalizePlatform`, `buildSpawnEnv`), all pure with literal inputs.

**The structural point for SC-5:** `platform.test.ts` is 100% literal-input pure tests and needs no
filesystem. `command-resolution.test.ts` is currently a *mix* — its two version-manager tests create real
directories. **D-10's split is what lets the new Windows cases follow `platform.test.ts`'s shape rather than
`command-resolution.test.ts`'s.** Every win32 assertion should target `buildCommandCandidatePaths` with
literal roots and literal `discoveredVersions`, so the Linux runner asserts the exact strings a Windows box
would produce. That is the whole SC-5 argument, and the planner should state it in the plan.

### Phase Requirements → Test Map

| Req | Behavior | Test type | Automated command | File |
|---|---|---|---|---|
| RES-01 | `buildCommandCandidatePaths({platform:"win32", command:"node", roots:{…literals}})` emits the exact ordered named-root list, backslash-separated | unit | `pnpm exec vitest run packages/backend/src/command-resolution.test.ts -t "windows node candidates"` | ❌ new case |
| RES-01 | `%ProgramFiles%` / `ProgramData` absent from `roots` ⇒ those rows are skipped, not emitted with an empty prefix | unit | same file | ❌ new case |
| RES-01 | The nvm/fnm/Volta version walks emit `<root>\v<v>\node.exe`, `<base>\node-versions\<v>\installation\node.exe` (**no `bin`**), `<home>\tools\image\node\<v>\node.exe` | unit | same file | ❌ new case |
| RES-02 | `rankPathSearchHits` orders `.exe` before `.cmd` before `.bat` across a CRLF-split multi-line input, PATH order within an extension | unit | `platform.test.ts -t "rank"` | ❌ new case |
| RES-02 | `rankPathSearchHits` discards a line that is not extension-terminated — the `INFO: Could not find files…` line and a truncated partial final line | unit | same | ❌ new case |
| RES-02 | `getWhichCommand({platform:"win32", env:{SystemRoot:"D:\\Windows"}})` → `D:\Windows\System32\where.exe`; empty/missing ⇒ bare `where.exe`; POSIX arm byte-identical to today | unit | `platform.test.ts -t "getWhichCommand"` | ✅ describe exists (`:147`), cases to add |
| RES-03 | `extractHomeDir("C:\\Users\\six\\.local\\bin\\claude.exe")` → `C:\Users\six`; the `C:/Users/…` spelling too; `\\\\server\\share\\…` ⇒ `undefined` (explicit non-claim) | unit | `command-resolution.test.ts -t "home director"` | ✅ `it` exists (`:22`), cases to add |
| RES-03 | `getHomeDirCandidates({platform: undefined, env:{HOME, USERPROFILE, APPDATA, LOCALAPPDATA}})` returns **all four** deduped | unit | `platform.test.ts -t "getHomeDirCandidates"` | ✅ describe exists (`:212`), case to add |
| UX-02 | `getProviderInstallHint({providerId:"copilot-cli", platform:"linux"})` contains `@github/copilot` and **does NOT** contain `gh extension install` | unit | `command-resolution.test.ts -t "install hint"` | ⚠️ **`:73` asserts `toContain("gh extension install")` — this existing assertion must be INVERTED by D-14, not merely extended.** Flag it in the plan; a verifier seeing a changed assertion needs the D-14 reason beside it. |
| UX-02 | Every `CliProvider` has both a `posix` and a `win32` hint; win32 Claude hint names `install.ps1`; unknown provider still gets the generic hint | unit | same | ❌ new case |
| **CMP-01** | `joinPath({platform:"linux", segments})` output is **byte-identical** to `path.join(...segments)` for every POSIX suffix currently in `command-resolution.ts:152-160` and `:181-184` | unit | `platform.test.ts` (or wherever `joinPath` lands) | ❌ **new — this is the CMP-01 proof and 06-CONTEXT § *Specific Ideas* forbids leaving it to review** |
| **CMP-01** | `buildCommandCandidatePaths({platform:"linux", …})` reproduces the existing `getCommandExecutableCandidates` order exactly | unit | `command-resolution.test.ts` | ❌ new — the D-10 split's regression net |

### Sampling Rate

- **Per task commit:** `pnpm exec vitest run packages/backend/src/command-resolution.test.ts packages/backend/src/platform.test.ts` (sub-second; both files are pure or temp-dir-local)
- **Per wave merge:** `pnpm exec vitest run && pnpm -r typecheck && pnpm lint`
- **Phase gate:** full suite green on **both** CI legs — `Verify (Node 20/22/24/26)` and the blocking
  `Verify (Windows)` leg — before `/gsd-verify-work 6`. SC-5 says "run green on the Linux CI runner"; the
  Windows leg running the *same* pure tests is a free second data point and costs nothing.

### Wave 0 Gaps

- [ ] No new test files needed — both target files exist. **The gap is the D-10 seam itself:** until
      `buildCommandCandidatePaths` is a pure export, the win32 cases cannot be written at all. Sequence the
      split before the data.
- [ ] `platform.test.ts` has no `describe` for `joinPath` or `rankPathSearchHits` — new blocks, following the
      existing one-describe-per-export convention.
- [ ] `command-resolution.test.ts:73` (`expect(getProviderInstallHint("copilot-cli")).toContain("gh extension install")`) must be inverted — **this is the only existing assertion Phase 6 makes false**, and it must be a deliberate, commented edit rather than a silent one.
- [ ] Framework install: none — Vitest 4.0.18 already present.

---

## Contradictions Found Against Locked Decisions

Per the brief: flag hard evidence that a decision is **wrong**, not merely debatable. **No locked decision is
contradicted.** Three near-misses are recorded so the planner does not mistake them for contradictions:

1. **D-09's illustrative root assignments are wrong; D-09 itself is right.** D-09 sketches
   `APPDATA → npm\, nvm\<ver>\` and `LOCALAPPDATA → fnm\…, Volta\bin\, pnpm\`. Verified: nvm-windows is
   `LOCALAPPDATA`, fnm is `APPDATA`. But D-09 explicitly says *"Roughly (the exact set is D-12's
   deliverable)"*, so the sketch is a placeholder D-12 was commissioned to replace — which is exactly what
   § *Named-Root Table* does. **D-09's structural claim — that the three variables are named roots and not
   peers — is strengthened, not weakened:** `%APPDATA%\fnm` and `%LOCALAPPDATA%\nvm` being *swapped* relative
   to the sketch is the sharpest possible demonstration that a flat cross-product would emit nonsense.
2. **D-16's rejection of `%ProgramFiles%\nodejs` as *the* nvm symlink is not a decision at all.** The
   roadmap's SC-1 lists `%ProgramFiles%\nodejs` and it survives — as the **Node MSI** row (P-02), which
   Phase 3 measured on a real host. Only its attribution to nvm-windows is corrected.
3. **D-04's premise is sound but its evidence is thinner than it reads.** The claim that `where.exe` under
   Defender is "measurably slower than `which`" is intuitive and probably true, but **no measurement of it
   was found in this session, and none exists in this repo.** D-04 already concedes this ("the maintainer
   cannot measure it locally… pick a defensible value"). The planner must not upgrade the phrasing:
   *"measurably slower"* in a code comment would be a claim this project cannot back. See Q1.

---

## Open Questions

1. **What win32 PATH-search timeout value should D-04 use?**
   - *What we know:* the POSIX value is a `1000` literal at `index.ts:1533`. The codebase's other spawn
     helper, `spawnAndWait`, caps at `Math.min(currentSettings.processTimeoutSeconds * 1000, 10000)` — a
     **10 000 ms ceiling** that is the highest timeout already sanctioned in this module. PERF-03's cache
     means a cold resolve is paid once per 5-minute positive TTL / 30-second negative TTL.
   - *What's unclear:* **no measurement of `where.exe` latency under Defender was found**, first-party or
     otherwise. This is the phase's single largest UNSOURCED item.
   - *Recommendation:* pick a value **strictly between the two in-repo anchors** (1 000 ms POSIX floor,
     10 000 ms `spawnAndWait` ceiling) so it is bounded by numbers that already exist in this codebase rather
     than by a guess, and write the comment in 03-FINDINGS' vehicle-caveat voice — e.g. *"headroom estimate,
     not a measurement: no `where.exe`-under-Defender latency figure exists for this project. Bounded below
     by the POSIX 1 000 ms and above by `spawnAndWait`'s 10 000 ms ceiling. Revise on a real-machine report
     (Phase 9/10)."* Note the negative TTL is 30 s: a timeout longer than that would let a cold miss cost
     more than its own cache lifetime, which is a genuine upper bound worth naming.

2. **Does `where.exe` write its no-match `INFO:` line to stdout or stderr?**
   - *What we know:* the message text is well attested; exit code `1` on failure is documented for `/q`.
   - *What's unclear:* the stream. Neither Microsoft Learn nor ss64 says.
   - *Recommendation:* do not attempt to answer it. Make the code correct under **either** answer — the
     `code === 0` gate plus D-01's extension-termination filter — and assert both in tests (Pitfall 1). This
     is cheaper than the answer and does not decay.

3. **How deep should the nvm-windows / fnm / Volta version walks go?** (Claude's Discretion)
   - *What we know:* the existing POSIX walk (`listVersionDirectories`, `command-resolution.ts:105`) sorts
     `readdir` output and `.reverse()`s it — newest-first by lexical sort — then emits **every** version.
     nvm-windows names its dirs `v<version>`, fnm names them by `v_str()`, Volta by bare node version.
   - *What's unclear:* whether emitting every version is affordable on Windows, where `stat` is slowest and
     D-09 already grows the location count.
   - *Recommendation:* **keep the walk but bound the emitted list**, and note that P-06 makes the nvm walk
     largely redundant — `%NVM_SYMLINK%` is on `PATH`, so `where.exe` finds an nvm Node first. Also note the
     lexical `.reverse()` is **not** semver-correct (`v9.0.0` sorts after `v10.0.0`); that is pre-existing
     POSIX behaviour and CMP-01 says leave it alone on POSIX. Whether to reproduce the same imperfect sort on
     win32 for symmetry, or to bound the list to the first N, is a genuine planner call — either way, say
     which and why.

4. **Should the `dirname`-based provider-adjacent node sibling join D-05's sweep?**
   - *What we know:* `command-resolution.ts:176` uses `path.join(path.dirname(commandPath), "node")`. The
     existing test comment (`command-resolution.test.ts:98-107`) records that this is **host-flavoured by
     design** and that "correct on a real Windows host where the command is `C:\...\claude.cmd`".
   - *What's unclear:* D-05 says "every `path.join`", which literally includes this one, but the recorded
     rationale for leaving it host-flavoured is specific and was learned from a real CI red.
   - *Recommendation:* treat this as the one deliberate exception, convert the `join` half to `joinPath` and
     leave `dirname` alone, and **record the exception in the code** so a reader does not "finish the sweep".
     Note the sibling must also gain the extension ladder on win32 (`node.exe`, not bare `node`).

5. **Does `%ProgramFiles(x86)%` earn its row (P-03)?**
   - *What we know:* the variable is standard; no first-party statement ties Node's MSI to it in current
     releases. The historical `nodejs/node#2951` report is from 2015 and long fixed.
   - *What's unclear:* whether Caido's backend host is 32-bit, which would make `%ProgramFiles%` *already*
     point at the x86 tree under WOW64.
   - *Recommendation:* the planner decides. If kept, it must be tagged `[ASSUMED]` in the code comment per
     D-12, with the WOW64 reasoning as the stated justification. If dropped, say so out loud so a later
     reader knows it was considered.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `%ProgramFiles(x86)%\nodejs\node.exe` is a real 32-bit Node MSI location | P-03 | One wasted `stat` per cold resolve. **Low.** But under D-12 an unsourced row must be dropped or explicitly justified — it cannot ship silently. |
| A2 | `where.exe` exits `1` on no-match without `/q` (documented only *with* `/q`) | § *`where.exe` Semantics* | The `code === 0` gate is the primary defence in `resolveCommand`. If `where` exited `0` on no-match, the `INFO:` line would reach the ranker — which is precisely why Pitfall 1 demands the **second**, extension-based guard. Mitigated by design. |
| A3 | `where.exe` under Defender is slower than `which` on POSIX | D-04 rationale | If false, the longer win32 timeout is harmless dead headroom. **Very low risk, but the claim must not be written as measured.** |
| A4 | `%NVM_SYMLINK%` (`C:\nvm4w\nodejs`) being on `PATH` means `where.exe` reliably finds an nvm-managed Node | P-06, Q3 | If a user's PATH is broken, the version walk is the only route — which is why Q3 recommends **keeping** the walk rather than dropping it on this reasoning. |
| A5 | `@google/gemini-cli` is the correct Gemini CLI package (name carried in from existing code + registry confirmation, **not** from Google's own docs) | § *Provider Install Commands* | A wrong package name in an install hint sends a user to the wrong package. **Per the package-name provenance rule this is `[ASSUMED]`, not `[VERIFIED]`, regardless of `npm view` succeeding.** See § *Package Legitimacy Audit*. |
| A6 | `packages/shared/src/cli-providers.ts` is the right home for the D-15 table | § *Existing Duplication Sites* | A recommendation, not a finding. D-15 locks `packages/shared/src/`; the file is the planner's call. |
| A7 | fnm's pinned `etcetera = "0.8.0"` (`Cargo.toml:19`) has the same Windows `data_dir()` → `APPDATA` mapping as the doctest I read | P-08 | The doctest was read from etcetera's `master`; the docs.rs 0.8.0 page independently confirms the same mapping. Two sources agree, so the risk is low — but it is a two-hop inference (fnm → etcetera → Windows known folder), not a single reading of fnm's own output. |
| A8 | Caido's LLRT `path`/`child_process` behave as `@caido/quickjs-types@0.25.4` declares | § *LLRT Surface* | The milestone-wide vehicle caveat. Every Phase 3–5 claim carries the same residual. Closes only on a real Windows Caido install (Phase 9/10). |

---

## Package Legitimacy Audit

This phase installs **no new packages**. The audit covers the four provider CLIs and Node that the *install
hint copy* names — a user reading Drift's error banner will run these commands, so a wrong name here is a
supply-chain hazard Drift creates for its own users.

| Package | Registry | Version seen | Discovered from | Verdict | Disposition |
|---|---|---|---|---|---|
| `@anthropic-ai/claude-code` | npm | 2.1.238 | **First-party docs** (code.claude.com/docs/en/setup, § *Install with npm*) | **OK** | Approved — `[VERIFIED]`: authoritative source **and** registry |
| `@github/copilot` | npm | 1.0.80 | **First-party docs** (docs.github.com/.../install-copilot-cli) | **OK** | Approved — `[VERIFIED]` |
| `@openai/codex` | npm | 0.149.0 | **First-party repo README** (github.com/openai/codex) | **OK** | Approved — `[VERIFIED]`. `optionalDependencies` include `@openai/codex-win32-x64` and `@openai/codex-win32-arm64`, both scoped to the same publisher |
| `@google/gemini-cli` | npm | 0.56.0 | **Existing Drift codebase + registry lookup only** — not confirmed against Google's own documentation this session | **OK** (registry) | **`[ASSUMED]`.** Registry existence alone does not confer VERIFIED — a slopsquatted package also passes `npm view`. The name is unchanged from what Drift already ships, so this is not a *new* exposure, but the planner should confirm it against Google's docs before the string goes into the shared table. |
| `OpenJS.NodeJS.LTS` | winget | — | **microsoft/winget-pkgs** — `manifests/o/OpenJS/NodeJS/LTS/` directory exists alongside the per-version manifests | **OK** | Approved — `[VERIFIED]` for D-16's win32 arm |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.
**Packages tagged `[ASSUMED]`:** `@google/gemini-cli` — one cheap doc check closes it; no `checkpoint:human-verify` task is warranted for a string Drift already ships, but the planner should not upgrade its tag without doing that check.

**Deprecated command being removed:** `gh extension install github/gh-copilot` — the target repository is
**archived and read-only since 2025-10-30**. This is the strongest single justification for D-14.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact on this phase |
|---|---|---|---|
| `gh extension install github/gh-copilot` | `npm install -g @github/copilot` (or `winget install GitHub.Copilot`) | Deprecated **2025-10-25**; repo archived **2025-10-30** | D-14. The current hint points at an archived repo on **every** platform. |
| nvm-windows installing to `%APPDATA%\nvm`, symlinking `C:\Program Files\nodejs` | `%LOCALAPPDATA%\nvm` (`NVM_HOME`), symlink `C:\nvm4w\nodejs` (`NVM_SYMLINK`, added to PATH) | Not dated in this session; the current `nvm.iss` on `master` is the evidence | P-04, P-06 — corrects two roadmap rows |
| fnm at `~/.fnm` on all platforms | `data_dir()/fnm` = `%APPDATA%\fnm` on Windows, with `~/.fnm` kept as an existence-checked legacy fallback | Not dated; `default_base_dir`'s modern/legacy structure is the evidence | P-08, P-09 — corrects one roadmap row; the legacy arm means **both** must be candidates |
| Volta at `%USERPROFILE%\.volta` (the POSIX analogy) | `%LOCALAPPDATA%\Volta` (`VOLTA_HOME`), binary at `%ProgramFiles%\Volta` | Not dated; `layout/windows.rs` + docs.volta.sh are the evidence | P-11. The old-default fallback row is UNSOURCED and per D-12 is dropped. |
| Codex CLI with no win32 npm artifact | `@openai/codex` ships `win32-x64` and `win32-arm64` optional deps | Present at 0.149.0 | **STATE.md's "win32 optional-dep caveat" is stale.** The hint needs no warning. |
| Claude Code POSIX-only install script | Windows PowerShell (`install.ps1`), Windows CMD (`install.cmd`), WinGet (`Anthropic.ClaudeCode`), plus npm | — | D-13's win32 arm has four real options; recommend leading with the PowerShell one-liner |

**Deprecated / outdated:**
- `gh extension install github/gh-copilot` — archived; replaced by `@github/copilot`.
- asdf on native Windows — never existed. WSL2 only, and "only expected to work properly when the current
  working directory is a Unix drive". The win32 row is dropped; the POSIX row stays.

---

## Sources

### Primary (HIGH confidence — installer scripts and published package source, read this session)

- `coreybutler/nvm-windows` — `nvm.iss` (lines 1-10, 27, 251, 445-478) and `nvm.go` (line 407) — NVM_HOME / NVM_SYMLINK defaults and version-directory layout
- `Schniz/fnm` — `src/directories.rs` (`default_base_dir`), `src/config.rs:151-153` (`installations_dir`), `src/version.rs:59-70` (`installation_path`), `src/commands/exec.rs:77-81` (the win32 `bin`-drop), `Cargo.toml:19` (etcetera pin)
- `lunacookies/etcetera` — `src/base_strategy/windows.rs` doctest, and https://docs.rs/etcetera/0.8.0/etcetera/base_strategy/struct.Windows.html — `data_dir()` → `APPDATA`, `cache_dir()` → `LOCALAPPDATA`
- `volta-cli/volta` — `crates/volta-core/src/layout/windows.rs` (`default_home_dir`), `crates/volta-layout/src/v4.rs` (lines 15, 24-25, 98-101, 115-116) — shim dir, the `.cmd` suffix, the image dir
- `@pnpm/config@1004.11.0` — `lib/dirs.js` `getDataDir` — the per-platform PNPM_HOME table, which also confirms the two POSIX rows already in Drift
- `ScoopInstaller/Install` — `install.ps1` — `$SCOOP_DIR`, `$SCOOP_SHIMS_DIR`, `$SCOOP_GLOBAL_DIR`
- `microsoft/winget-pkgs` — `manifests/o/OpenJS/NodeJS/` — confirms the `LTS` package id
- `@caido/quickjs-types@0.25.4` — `src/llrt/path.d.ts`, `src/llrt/child_process.d.ts`, and the absence of `src/llrt/os.d.ts`
- **In-repo, read this session:** `packages/backend/src/platform.ts`, `command-resolution.ts`, `command-resolution.test.ts`, `resolution-cache.ts`, `index.ts` (lines 160, 265-300, 470-560, 1469-1600, 2439-2530), `packages/shared/src/cli-providers.ts`, `packages/frontend/src/views/HelpView.vue:200-230`, `vitest.config.ts`, `.planning/config.json`, `README.md`, `CHANGELOG.md`

### Primary (HIGH confidence — first-party documentation)

- https://code.claude.com/docs/en/setup — Windows install commands and, in the *Uninstall* section, the verbatim Windows native-install path
- https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli — current Copilot CLI install commands
- https://github.com/github/gh-copilot — deprecation date (2025-10-25) and archive date (2025-10-30)
- https://docs.npmjs.com/cli/v11/configuring-npm/folders — Windows global prefix, and executables landing directly in `{prefix}`
- https://docs.volta.sh/advanced/installers — `VOLTA_HOME` = `%LOCALAPPDATA%\Volta`, binaries in `Program Files\Volta`
- https://bun.com/docs/installation — `$env:USERPROFILE\.bun\bin`
- https://asdf-vm.com/more/faq.html — no native Windows; WSL2 caveats
- https://github.com/openai/codex — install commands
- https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/where — search scope, PATHEXT, `/q` exit codes

### Primary (HIGH confidence — this project's own measured record)

- `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md` — § *P1-WHERE* (2 CRLF lines, absolute-path invocation), § *P1-CMD* (`.cmd` EINVAL sync), § *P3-VARS*, § *Vehicle caveat*. [run 31702392047](https://github.com/six2dez/drift/actions/runs/31702392047)
- [run 32376894371](https://github.com/six2dez/drift/actions/runs/32376894371) — the real `windows-latest` red that produced `normalizePosixPath` and the host-flavoured-test lesson
- [run 32378434081](https://github.com/six2dez/drift/actions/runs/32378434081) — the green blocking `Verify (Windows)` leg SC-5's evidence lands on

### Secondary (MEDIUM confidence)

- https://learn.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-windows — `C:\Program Files\nodejs`
- https://pnpm.io/cli/config — Windows pnpm config under `~/AppData/Local/pnpm/config/`, corroborating the source-verified `getDataDir`
- https://ss64.com/nt/where.html — corroborates `where`'s exit codes; explicitly does **not** document output ordering

### Tertiary (LOW confidence — flagged, not relied upon)

- Web-search summary asserting the `INFO:` no-match line goes to **stderr** — no first-party confirmation found; treated as UNSOURCED and designed around (Pitfall 1)
- `%ProgramFiles(x86)%\nodejs` as a Node MSI location — `[ASSUMED]` (A1)

---

## Metadata

**Confidence breakdown:**

- **Windows install-location catalogue (D-12's deliverable): HIGH.** 14 of 20 rows read directly from the
  installer script or the tool's own published source, with the line quoted verbatim; 4 more from first-party
  docs; 1 dropped as unsourced; 1 flagged `[ASSUMED]`.
- **Provider install commands (UX-02): HIGH.** Three of four from first-party docs; the fourth
  (`@google/gemini-cli`) is unchanged-from-shipping and registry-confirmed but `[ASSUMED]` per the provenance
  rule.
- **`where.exe` semantics: MEDIUM.** Search scope, PATHEXT and multi-line output are documented and/or
  measured; exit codes are documented only for `/q`; the no-match stream and the cross-extension output order
  are **not documented at all** — and § *`where.exe` Semantics* shows D-01 does not depend on the latter.
- **LLRT surface: MEDIUM.** Read from the pinned type declarations, not executed. Carries the milestone-wide
  vehicle caveat.
- **D-04's timeout value: LOW / UNSOURCED.** No latency measurement found. Two in-repo anchors offered
  instead of a guess.
- **Architecture / test strategy: HIGH.** Derived from files read this session, with line numbers.

**Research date:** 2026-08-21
**Valid until:** ~2026-09-20 for the install-path catalogue (version-manager layouts move — the nvm-windows
and Volta corrections in this document are themselves evidence of that). The `where.exe` semantics, the LLRT
declarations, and the Phase 3 measurements do not decay on that timescale.
