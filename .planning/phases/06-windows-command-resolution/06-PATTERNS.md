# Phase 6: Windows Command Resolution - Pattern Map

**Mapped:** 2026-08-21
**Files analyzed:** 8 (2 new-ish surfaces, 6 modified)
**Analogs found:** 8 / 8 — every file in this phase has an in-repo analog, most of them in the SAME file

**Read this first:** Phase 6 creates almost no new files. It extends six existing ones. So "the analog"
is usually a sibling function in the same module, and the pattern to copy is that sibling's *shape and
comment discipline*, not a distant file. That makes the excerpts below unusually load-bearing: a planner
who copies the sibling verbatim gets the house style for free.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/backend/src/platform.ts` — `joinPath` (new, D-05) | utility (pure decision helper) | transform | `getTempRoot` (`platform.ts:65-81`) — same module, same "strip/join separators by hand" problem | **exact** |
| `packages/backend/src/platform.ts` — `rankPathSearchHits` (new, D-01) | utility (pure decision helper) | transform | `getExecutableNames` (`platform.ts:187-217`) — same module, reads the same `WINDOWS_EXECUTABLE_EXTENSIONS` constant | **exact** |
| `packages/backend/src/platform.ts` — `getWhichCommand` (modify, D-02) | utility (pure decision helper) | transform | `getHomeDirCandidates` (`platform.ts:226-242`) — the existing `input.env[NAME]?.trim()` reader | **exact** |
| `packages/backend/src/platform.ts` — `getHomeDirCandidates` (modify, D-08) | utility (pure decision helper) | transform | `isAbsolutePath` (`platform.ts:107-134`) — the three-state `win32 / undefined / POSIX` arm | **exact** |
| `packages/backend/src/command-resolution.ts` — `extractHomeDir` (modify, D-06) | utility (pure) | transform | `isAbsolutePath`'s drive-letter character tests (`platform.ts:117-123`) | **exact** |
| `packages/backend/src/command-resolution.ts` — `pushUniqueCandidate` (modify, D-07) | utility (pure) | transform | `pushUniqueCandidate` itself (`:41-45`) + `getHomeDirCandidates`'s `[...new Set()]` dedup | **exact** |
| `packages/backend/src/command-resolution.ts` — `buildCommandCandidatePaths` (new, D-10) | service (pure builder) | batch/transform | `getCommandExecutableCandidates` (`:141-168`) — the function being split | **exact** |
| `packages/backend/src/command-resolution.ts` — thin impure filter (D-10) | service (I/O) | file-I/O | `collectVersionManagerCommandCandidates` (`:116-139`) + `listVersionDirectories` (`:101-114`) | **exact** |
| `packages/shared/src/cli-providers.ts` — `PROVIDER_INSTALL_COMMANDS` (new, D-15) | config/data | request-response (rendered copy) | `CLI_PROVIDER_DISPLAY_NAMES` / `CLI_PROVIDER_DEFAULT_COMMANDS` (`:10-22`) — same file, same key union | **exact** |
| `packages/backend/src/command-resolution.ts` — `getProviderInstallHint` (modify, D-13) | utility (pure) | request-response | itself (`:18-23`) + `formatProviderUnavailableMessage` (`:25-30`) | **exact** |
| `packages/backend/src/index.ts` — `resolveCommand` resolver (modify, D-01..D-04) | service (spawn seam) | request-response + streaming stdout | itself (`:1478-1567`), and `spawnAndWait`'s bounded-buffer block (`index.ts:~2420`) | **exact** |
| `packages/backend/src/index.ts` — `getKnownHomeDirs` (modify, D-08) | utility (env read) | transform | itself (`:1570-1580`) + `readParentEnv()` (`index.ts:470-479`) — the defensive `globalThis` cast | **exact** |
| `packages/backend/src/index.ts` — `NODE_EXECUTABLE_ERROR` (modify, D-16) | config (user-facing string) | — | `NO_CAIDO_TOKEN_MESSAGE` / `MCP_RUNTIME_NOT_RUNNING_MESSAGE` (`:160-167`) | **role-match** |
| `packages/backend/src/runtime-probe.ts` — preservation comment (D-07) | comment only | — | the `export { genUUID }` preservation note (`index.ts:1460-1465`) | **exact** |
| `packages/frontend/src/views/HelpView.vue` (modify, D-15) | component | request-response | `CliStatus.vue` / `stores/settings.ts` — the `from "shared"` import convention | **role-match** |
| `packages/backend/src/platform.test.ts` (extend) | test | — | itself — 8 `describe` blocks, one per export, 100% literal inputs | **exact** |
| `packages/backend/src/command-resolution.test.ts` (extend) | test | — | `platform.test.ts` (for the NEW win32 cases) — deliberately **not** its own temp-dir tests | **exact (cross-file)** |

---

## Pattern Assignments

### `packages/backend/src/platform.ts` — new pure exports `joinPath` (D-05) and `rankPathSearchHits` (D-01)

**Analog:** `getTempRoot` (`platform.ts:65-81`) and `getExecutableNames` (`platform.ts:187-217`)

**The module contract to obey — file header, `platform.ts:1-16`** (read this before adding anything):

```typescript
// Pure OS-decision helpers for the native-Windows port. Two properties are
// load-bearing here and both are mechanically checkable: this module performs
// ZERO I/O, and it carries ZERO import statements — `grep -c '^import'` over
// this file returns 0, which is the machine form of the "no I/O" claim (SC-1).
// `platform` is therefore always an INJECTED parameter, never read from `os` or
// `process`: D-02 puts the single `os` read in index.ts behind the RUN-05 probe.
...
// Not imported, deliberately: `os` (D-02, above) and `path`. None of the exports
// below needs `path`, and `getTempRoot` strips separators with explicit string
// logic *because* `path` resolves to its POSIX flavour on the Linux runner and
// would not strip a Windows-shaped trailing backslash. An unused import is also a
// hard build failure here (tsconfig `noUnusedLocals` → TS6133; `pnpm lint` runs
// at `--max-warnings 0`), so the zero-import property is self-enforcing.
```

**Separator-by-hand pattern — copy from `getTempRoot`** (`platform.ts:58-81`). This is the exact
precedent D-05's `joinPath` generalises; note the comment states WHY `path.normalize`/`path.join` is
refused, and that the guard reasoning ("stop at length 1", "a bare drive") is spelled out inline:

```typescript
// The strip is explicit string logic, never `path.normalize`/`path.join`: the
// unit tests run on Linux where `path` is POSIX-flavoured and would leave a
// Windows trailing backslash in place, so the win32 case would be untestable
// exactly where it matters. It is also separator-agnostic on purpose — both
// spellings are stripped on all three platforms, since the runtime rather than
// the OS decides which one comes back.
export function getTempRoot(input: {
  platform: Platform;
  tmpdir: string;
}): string {
  let root = input.tmpdir.trim();
  // Guarded so a root is never reduced to nothing: stop at length 1 (so "/"
  // stays "/") and stop when the remainder is a bare drive (so "C:\" stays
  // "C:\", which is a real path, while "C:" alone is drive-relative and is not).
  while (root.length > 1) {
    const last = root[root.length - 1];
    if (last !== "/" && last !== "\\") break;
    const remaining = root.slice(0, -1);
    if (remaining.endsWith(":")) break;
    root = remaining;
  }
  return root;
}
```

**Reading the ONE extension constant — copy from `getExecutableNames`** (`platform.ts:182-217`).
`rankPathSearchHits` must read this same constant; a second hardcoded order is a defect (06-CONTEXT
§ Reusable Assets). Note the case-insensitive `lowered.endsWith(extension)` idiom — the ranker's
"discard anything not extension-terminated" guard should reuse it verbatim:

```typescript
export const WINDOWS_EXECUTABLE_EXTENSIONS = [".exe", ".cmd", ".bat"] as const;

export function getExecutableNames(input: {
  command: string;
  platform: Platform;
}): string[] {
  const command = input.command.trim();
  if (command === "") return [];
  if (input.platform !== "win32") return [command];

  // Already extensioned (case-insensitively — "claude.CMD" is what a real
  // %PATH% entry can look like): take it as given rather than producing
  // "claude.CMD.exe".
  const lowered = command.toLowerCase();
  if (
    WINDOWS_EXECUTABLE_EXTENSIONS.some((extension) =>
      lowered.endsWith(extension),
    )
  ) {
    return [command];
  }
  ...
  return [
    ...new Set([
      ...WINDOWS_EXECUTABLE_EXTENSIONS.map(
        (extension) => `${command}${extension}`,
      ),
      command,
    ]),
  ];
}
```

**Evidence-carrying comment pattern — `getWhichCommand`** (`platform.ts:154-165`). This is the house
style RESEARCH calls out: a named source document AND a run URL, plus an explicit hand-off note:

```typescript
// "where.exe", not a bare "where": Phase 3's P1-WHERE measured it on a real
// windows-latest host. Two facts from that measurement belong to Phase 6 and are
// deliberately NOT implemented here — recorded so Phase 6 does not re-derive
// them (source:
// .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md,
// § P1-WHERE):
//   1. the measured invocation was by ABSOLUTE path,
//      C:\Windows\System32\where.exe;
//   2. the output was 2 CRLF-split lines, so the parse must split on /\r?\n/ —
//      multi-line output is confirmed real, not hypothetical.
```

> **Planner note:** when D-02 implements item 1 and D-01/D-03 implement item 2, this comment's
> "deliberately NOT implemented here" clause becomes false and must be rewritten, not left standing.

---

### `packages/backend/src/platform.ts` — `getWhichCommand` gains `env` (D-02)

**Analog:** `getHomeDirCandidates` (`platform.ts:226-242`) — the only existing `env` reader in the module.

**Current signature to extend** (`platform.ts:166-174`) — the `{ ...input }` object param 04-D-01
licenses growing:

```typescript
export function getWhichCommand(input: { platform: Platform }): {
  command: string;
  args: (cmd: string) => string[];
} {
  if (input.platform === "win32") {
    return { command: "where.exe", args: (cmd: string) => [cmd] };
  }
  return { command: "which", args: (cmd: string) => [cmd] };
}
```

**Env-read pattern to copy** (`platform.ts:226-241`) — SCREAMING-CASE literal name, `?.trim()`,
skip on `undefined`-or-empty. D-02's "missing or empty ⇒ bare `where.exe`" fallback is exactly this
guard, and RESEARCH § `${SystemRoot}` flags that the Linux test makes the object lookup
case-**sensitive**, so pick and state a spelling:

```typescript
export function getHomeDirCandidates(input: {
  platform: Platform;
  env: Record<string, string | undefined>;
}): string[] {
  const names =
    input.platform === "win32"
      ? ["USERPROFILE", "APPDATA", "LOCALAPPDATA"]
      : ["HOME"];

  const candidates: string[] = [];
  for (const name of names) {
    const value = input.env[name]?.trim();
    if (value === undefined || value === "") continue;
    candidates.push(value);
  }
  return [...new Set(candidates)];
}
```

---

### `packages/backend/src/platform.ts` — `getHomeDirCandidates` widens to `Platform | undefined` (D-08)

**Analog:** `isAbsolutePath` (`platform.ts:107-134`) — the union-when-unknown precedent D-06, D-08 and
D-13 all cite.

**Three-state arm to copy** (`platform.ts:96-133`) — note the rationale sentence ("a wrong guess costs
one failed stat"), which D-08's version must restate in its own terms ("the wrong platform's names are
simply absent"), and the explicit-character-tests rule:

```typescript
// `platform` is INJECTED like everything else here, so both branches are
// provable from the Linux runner. `undefined` means the RUN-05 probe has not run
// yet (resolveCommand is reachable from a provider status check before MCP
// start), and it accepts EITHER spelling on purpose: ... when the
// platform is unknown the stat is both the cheaper answer and the one that fails
// safe — a wrong guess costs one failed stat and then falls through.
//
// Explicit character tests, never a regex with backslashes, for the same reason
// getTempRoot strips separators by hand: the win32 spellings must stay readable
// and testable on a POSIX host.
export function isAbsolutePath(input: {
  value: string;
  platform: Platform | undefined;
}): boolean {
  ...
  // "C:\", "C:/" — a drive-qualified root. A bare "C:" is drive-RELATIVE and is
  // deliberately excluded, matching getTempRoot's treatment of the same string.
  const driveLetter =
    (first >= "A" && first <= "Z") || (first >= "a" && first <= "z");
  const third = value[2] ?? "";
  const isDriveAbsolute =
    driveLetter && value[1] === ":" && (third === "\\" || third === "/");
  ...
  if (input.platform === "win32") return isDriveAbsolute || isRooted;
  if (input.platform === undefined) {
    return isPosixAbsolute || isDriveAbsolute || isRooted;
  }
  return isPosixAbsolute;
}
```

> **Planner note:** `platform.ts:219-222`'s comment on `getHomeDirCandidates` currently says the
> install-location arrays "stay in Phase 6's `command-resolution.ts`, which this phase does not touch."
> The second clause is Phase 4's voice and must be updated when Phase 6 wires it.

---

### `packages/backend/src/command-resolution.ts` — `extractHomeDir` drive-letter arm (D-06)

**Analog:** its own `normalizePosixPath` neighbour (`:47-99`) for the comment shape;
`isAbsolutePath`'s character tests (above) for the drive detection.

**The comment template D-05 and D-06 both extend** (`command-resolution.ts:47-67`) — a *measured* CI
failure with the run number and the literal assertion text, plus the explicit "this does NOT do X, X is
Phase 6" hand-off:

```typescript
// Collapse "." and ".." against a POSIX "/" separator, with no dependence on
// the host platform. This exists because `path.normalize` is platform-FLAVOURED:
// on a win32 host it rewrites "/Users/six2dez/.local/bin/claude" to
// "\\Users\\six2dez\\.local\\bin\\claude", so neither prefix arm in
// extractHomeDir below can ever match ...
//
// MEASURED, not precautionary — this is what took the first real `windows-latest`
// leg red, on run 32376894337's sibling CI run 32376894371 (2026-08-20):
//   AssertionError: expected undefined to be '/Users/six2dez'
//
// `path.posix.normalize` would be the one-line fix on Node and is deliberately
// NOT used: Caido's LLRT `path` surface exposes no `posix` namespace at all ...
// Phase 4's platform.ts sets the precedent this follows: a pure path decision
// imports nothing.
//
// This does NOT teach the function about "C:\\Users\\<name>". That is RES-03
// and it belongs to Phase 6.
```

> **Planner note:** that last paragraph is Phase 6's to-do list item and must be deleted/rewritten when
> D-06 lands, or the file will assert something false about itself.

**Current body to extend** (`command-resolution.ts:83-99`) — note it is platform-blind by signature
(one string in), which D-06 locks:

```typescript
export function extractHomeDir(candidatePath: string | undefined): string | undefined {
  const normalized = candidatePath?.trim();
  if (normalized === undefined || normalized === "") return undefined;
  const resolved = normalizePosixPath(normalized);

  if (resolved.startsWith("/Users/")) {
    const parts = resolved.split("/").filter(Boolean);
    if (parts.length >= 2) return `/${parts[0]}/${parts[1]}`;
  }

  if (resolved.startsWith("/home/")) { /* same shape */ }

  return undefined;
}
```

---

### `packages/backend/src/command-resolution.ts` — `pushUniqueCandidate` folded dedup key (D-07)

**Analog:** itself (`:41-45`). The change is one added key computation; the trim-and-skip-empty guard
and the "emit the ORIGINAL spelling" property must survive:

```typescript
export function pushUniqueCandidate(candidates: string[], candidate: string | undefined): void {
  const normalized = candidate?.trim();
  if (normalized === undefined || normalized === "") return;
  if (!candidates.includes(normalized)) candidates.push(normalized);
}
```

---

### `packages/backend/src/command-resolution.ts` — the D-10 split

**Analog for the PURE builder:** `getCommandExecutableCandidates` (`:141-168`) — the function being
split. Copy its accumulate-into-`candidates` + `pushUniqueCandidate` shape; delete every `path.join`
per D-05 and the `await` per D-10:

```typescript
export async function getCommandExecutableCandidates(input: {
  command: string;
  pathResolution?: string;
  homeDirs: string[];
}): Promise<string[]> {
  const candidates: string[] = [];
  pushUniqueCandidate(candidates, input.pathResolution);

  pushUniqueCandidate(candidates, path.join("/opt/homebrew/bin", input.command));
  pushUniqueCandidate(candidates, path.join("/usr/local/bin", input.command));
  pushUniqueCandidate(candidates, path.join("/usr/bin", input.command));
  pushUniqueCandidate(candidates, path.join("/bin", input.command));

  for (const homeDir of [...new Set(input.homeDirs)]) {
    pushUniqueCandidate(candidates, path.join(homeDir, ".local", "bin", input.command));
    pushUniqueCandidate(candidates, path.join(homeDir, ".volta", "bin", input.command));
    pushUniqueCandidate(candidates, path.join(homeDir, ".asdf", "shims", input.command));
    pushUniqueCandidate(candidates, path.join(homeDir, ".npm-global", "bin", input.command));
    pushUniqueCandidate(candidates, path.join(homeDir, ".bun", "bin", input.command));
    pushUniqueCandidate(candidates, path.join(homeDir, "Library", "pnpm", input.command));
    pushUniqueCandidate(candidates, path.join(homeDir, ".local", "share", "pnpm", input.command));
    for (const candidate of await collectVersionManagerCommandCandidates(homeDir, input.command)) {
      pushUniqueCandidate(candidates, candidate);
    }
  }

  return candidates;
}
```

> **This exact list (`:149-161`) is the CMP-01 byte-identity target.** 06-CONTEXT § Specific Ideas
> requires asserting `joinPath({platform:"linux"})` reproduces each of these strings.
> `getNodeExecutableCandidates` (`:170-199`) is the same shape with `execPath` first and a
> `path.dirname` sibling walk at `:182` — RESEARCH § LLRT Surface flags that `dirname` is
> host-flavoured **by design** and D-05's "every `path.join`" sweep does not name it. Decide explicitly.

**Analog for the THIN IMPURE filter:** `collectVersionManagerCommandCandidates` (`:116-139`) +
`listVersionDirectories` (`:101-114`) + `pathExists` (`:32-39`). This is the `stat`/`readdir` idiom the
Windows nvm/fnm/Volta version walks copy — note the reverse-sorted version list and the silent
per-entry catch:

```typescript
async function pathExists(candidatePath: string): Promise<boolean> {
  try { await stat(candidatePath); return true; } catch { return false; }
}

async function listVersionDirectories(root: string): Promise<string[]> {
  const entries = (await readdir(root)).sort().reverse();
  const versions: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    try {
      const entryStat = await stat(path.join(root, entry));
      if (entryStat.isDirectory()) versions.push(entry);
    } catch {
      // Ignore broken or transient entries while probing candidate paths.
    }
  }
  return versions;
}

export async function collectVersionManagerCommandCandidates(
  homeDir: string,
  command: string,
): Promise<string[]> {
  const candidates: string[] = [];
  const nvmDir = path.join(homeDir, ".nvm", "versions", "node");
  if (await pathExists(nvmDir)) {
    const versions = await listVersionDirectories(nvmDir);
    for (const version of versions) {
      pushUniqueCandidate(candidates, path.join(nvmDir, version, "bin", command));
    }
  }
  ...
}
```

---

### `packages/shared/src/cli-providers.ts` — `PROVIDER_INSTALL_COMMANDS` (D-15)

**Analog:** `CLI_PROVIDER_DISPLAY_NAMES` / `CLI_PROVIDER_DEFAULT_COMMANDS` in the **same file**
(`:1-22`). RESEARCH § Existing Duplication Sites recommends this exact home. Copy the
`const`-object-plus-derived-union and the `Record<CliProvider, …>` keying — that is what buys the
compile-time exhaustiveness the current `Record<string, string>` backend table lacks:

```typescript
export const CliProvider = {
  Claude: "claude-cli",
  Gemini: "gemini-cli",
  Codex: "codex-cli",
  Copilot: "copilot-cli",
} as const;

export type CliProvider = (typeof CliProvider)[keyof typeof CliProvider];

export const CLI_PROVIDER_DISPLAY_NAMES: Record<CliProvider, string> = {
  [CliProvider.Claude]: "Claude Code",
  ...
};

export const CLI_PROVIDER_DEFAULT_COMMANDS: Record<CliProvider, string> = {
  [CliProvider.Claude]: "claude",
  ...
};
```

**Barrel re-export** — `packages/shared/src/index.ts:1` is `export * from "./cli-providers";`, so a new
export in this file needs **no** barrel edit.

**The table being moved** (`command-resolution.ts:4-16`) — the POSIX arm must be byte-identical
except `copilot-cli` (D-14). Preserve the "…, or set the absolute binary path in Settings → CLI
Providers." suffix and the comment naming both surfaces:

```typescript
// Actionable install / resolution hint per provider. These surface inside the
// chat error banner and in Settings → CLI Providers so a user who hits
// "CLI not found" does not have to guess which package to install.
const PROVIDER_INSTALL_HINTS: Record<string, string> = {
  "claude-cli":
    "Install Claude Code with `curl -fsSL https://claude.ai/install.sh | bash`, or set the absolute binary path in Settings → CLI Providers.",
  "gemini-cli":
    "Install Gemini CLI with `npm install -g @google/gemini-cli`, or set the absolute binary path in Settings → CLI Providers.",
  "codex-cli":
    "Install Codex CLI with `npm install -g @openai/codex`, or set the absolute binary path in Settings → CLI Providers.",
  "copilot-cli":
    "Install GitHub Copilot CLI with `gh extension install github/gh-copilot`, or set the absolute binary path in Settings → CLI Providers.",   // ← D-14 replaces this string
};
```

**The renderers that stay in the backend** (`command-resolution.ts:18-30`) — `getProviderInstallHint`
grows to `{ providerId, platform }` per D-13; the generic-fallback `??` arm and
`formatProviderUnavailableMessage`'s `` `${cause}. ${hint}` `` composition are unchanged:

```typescript
export function getProviderInstallHint(providerId: string): string {
  return (
    PROVIDER_INSTALL_HINTS[providerId] ??
    "Install the CLI for this provider, or set the absolute binary path in Settings → CLI Providers."
  );
}

export function formatProviderUnavailableMessage(
  providerId: string,
  cause: string,
): string {
  return `${cause}. ${getProviderInstallHint(providerId)}`;
}
```

---

### `packages/frontend/src/views/HelpView.vue` — render from the shared table (D-15)

**Analog:** `packages/frontend/src/components/chat/CliStatus.vue:8` and
`packages/frontend/src/stores/settings.ts:10` — the frontend's `from "shared"` import convention
(bare `"shared"`, not a relative path; `import type` when types only).

**Current hardcoded block** (`HelpView.vue:206-223`) — four `<li>` items to become a `v-for` over the
shared record. The component currently imports only `Card` from `primevue/card` (`:1-3`), so this adds
the first `shared` import to the file:

```html
<ul class="mt-1 text-xs text-surface-300 list-disc pl-5 space-y-0.5">
  <li>
    <span class="font-medium text-surface-100">Claude Code:</span>
    <span class="font-mono">curl -fsSL https://claude.ai/install.sh | bash</span>
  </li>
  ...
  <li>
    <span class="font-medium text-surface-100">Copilot CLI:</span>
    <span class="font-mono">gh extension install github/gh-copilot</span>
  </li>
</ul>
```

`CLI_PROVIDER_DISPLAY_NAMES` supplies the bold label, so the `v-for` needs no second literal list.

---

### `packages/backend/src/index.ts` — `resolveCommand`'s resolver (D-01 – D-04)

**Analog:** itself. All four decisions edit this block in place; the public signature does not change.

**The absolute-path fast path above the cache** (`index.ts:1471-1484`) — unchanged by this phase, but
it is the precedent for how `host?.platform` is threaded and commented:

```typescript
  // isAbsolutePath, not path.isAbsolute: the `path` module's flavour is not
  // source-verified for Caido's LLRT ... The platform comes from the RUN-05 probe
  // and is `undefined` before it runs, which the helper handles by accepting
  // either spelling.
  if (isAbsolutePath({ value: command, platform: host?.platform })) {
    return await fileExists(command) ? command : undefined;
  }
```

**The `resolveWithCache` wrapper** (`index.ts:1490-1497`) — D-04's slow win32 timeout is amortised
here. The `now` / `clock` two-read contract must be preserved untouched:

```typescript
  return await resolveWithCache(resolutionCache, {
    key: `cmd:${command}`,
    now: Date.now(),
    clock: () => Date.now(),
    bypass: options?.bypassCache,
    resolve: async () => {
```

**The spawn + bounded buffer + timeout block** (`index.ts:1498-1553`) — the exact site D-01/D-02/D-03/
D-04 edit. `spawn("which", [command])` becomes `getWhichCommand({platform, env})`; `1000` becomes
platform-aware; `out.head.split("\n", 1)[0]` becomes `/\r?\n/` + `rankPathSearchHits`:

```typescript
      const pathResolution = await new Promise<string | undefined>((resolve) => {
        const child = spawn("which", [command]);                       // ← D-02 wires getWhichCommand
        // PERF-04 site 7 — ... Bounded rather than EXCLUDED: the tempting
        // exemption ("it is only `which`, the output is one short path, and the
        // 1-second timeout below caps it") is the same argument this phase
        // explicitly rejects for callMcpMethod — a timeout bounds the exposure
        // WINDOW, not the VOLUME, and shipping that reading in one place while
        // rejecting it in the other turns an inconsistency into a precedent.
        let out = createBoundedBuffer({
          maxChars: SPAWN_STDOUT_MAX_CHARS,
          retention: "head",
        });
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { child.kill("SIGKILL"); } catch { /* ignore */ }
          resolve(undefined);
        }, 1000);                                                      // ← D-04 platform-aware
        child.stdout?.on("data", (d: Buffer) => { out = appendBounded(out, d.toString()); });
        child.on("close", (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          // The HEAD's FIRST LINE, never renderBoundedBuffer. Above the cap the
          // rendered value splices `\n…[drift: truncated N bytes]…\n` BETWEEN
          // head and tail; the marker begins with a newline, so it survives
          // `.trim()`, and the result — head + marker — would be returned as a
          // resolved executable path and handed to fileExists/spawn.
          //
          // Taking one line is also correct on its own terms rather than merely
          // safe: `which` prints one path per line and only the first is the
          // resolution (Phase 3's P1-WHERE measured where.exe printing two).
          const resolved = out.head.split("\n", 1)[0]?.trim() ?? "";    // ← D-01/D-03 replace this line
          resolve(code === 0 && resolved !== "" ? resolved : undefined);
        });
        child.on("error", () => { /* settle undefined */ });
      });
```

> **Planner notes on this block.** (a) The PERF-04 comment is the argument D-03 upholds — keep it and
> extend it with D-03's "the dropped tail entries are the LOWEST-PATH-priority hits" sentence rather
> than replacing it. (b) The `code === 0` gate is Pitfall 1's first guard; keep it. (c) 06-CONTEXT
> § Specific Ideas requires a `UX-04 / Phase 10` marker at this spawn for the console-window flash.

**The candidate walk below it** (`index.ts:1555-1563`) — the D-10 thin-caller seam:

```typescript
      const candidates = await getCommandExecutableCandidates({
        command,
        pathResolution,
        homeDirs: getKnownHomeDirs(),
      });

      for (const candidate of candidates) {
        if (await fileExists(candidate)) return candidate;
      }

      return undefined;
```

---

### `packages/backend/src/index.ts` — `getKnownHomeDirs` (D-08)

**Analog:** itself (`:1570-1580`). RESEARCH § LLRT Surface is explicit that the defensive `globalThis`
cast must survive the rewrite — do NOT switch to a bare `process.env`. The same cast idiom appears at
`readParentEnv()` (`index.ts:470-479`) and in `getNodeExecutable` (`index.ts:2439-2441`):

```typescript
function getKnownHomeDirs(): string[] {
  const processRef = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };

  return [
    processRef.process?.env?.HOME,                                     // ← D-08 replaces with getHomeDirCandidates
    extractHomeDir(pluginPath),
    ...Object.values(currentSettings.providers).map((provider) => extractHomeDir(provider.command)),
  ].filter((value): value is string => typeof value === "string" && value.trim() !== "");
}
```

---

### `packages/backend/src/index.ts` — `NODE_EXECUTABLE_ERROR` win32 arm (D-16)

**Analog:** the sibling message constants at `index.ts:160-167`. Note `NO_CAIDO_TOKEN_MESSAGE` carries
a comment explaining *why* it is centralised — a platform-armed version of `NODE_EXECUTABLE_ERROR`
needs the same:

```typescript
const NODE_EXECUTABLE_ERROR =
  "Drift could not locate a Node.js executable to launch the MCP server. Restart Caido from an environment where Node.js is available.";
// The one no-token sentence, previously spelled out at four call sites. It is a
// user-facing string that requireMcpServerSpec now produces, so the sites that
// used to compose it read it from here instead of drifting apart.
const NO_CAIDO_TOKEN_MESSAGE =
  "No Caido access token is available. Open any Caido page (or reauthenticate) so Drift can pick up your session, then retry.";
```

**Consumer** (`index.ts:~2525`, `requireNodeExecutable`) — a bare `err(NODE_EXECUTABLE_ERROR)`. If the
constant becomes a function of `platform`, this is the call site that must thread `host?.platform`:

```typescript
  const nodeExecutable = await getCachedNodeExecutable();
  if (nodeExecutable === undefined) return err(NODE_EXECUTABLE_ERROR);
  return ok(nodeExecutable);
```

---

### `packages/backend/src/runtime-probe.ts` — the D-07 preservation comment

**Analog:** the `export { genUUID }` preservation note at `index.ts:1460-1465`. This is the exact
comment shape D-07 requires beside `normalizePathForCompare` (`runtime-probe.ts:659`), per RESEARCH
§ Pitfall 6:

```typescript
// This re-export exists only so `noUnusedLocals` (tsconfig) and
// `@typescript-eslint/no-unused-vars` (eslint --max-warnings 0) do not force the
// deletion the preservation rule forbids. It is a bookkeeping statement, not an
// API: nothing imports index.ts. Delete it the moment a caller reappears.
export { genUUID };
```

**And the comment that must be corrected** (`runtime-probe.ts:645-650`) — it currently asserts Phase 6
will call it, which D-07 declines:

```typescript
// Why the ladder exists at all: Phase 3 measured os.tmpdir() returning the 8.3
// short form `C:\Users\RUNNER~1\AppData\Local\Temp` while USERPROFILE returned
// the long form `C:\Users\runneradmin` ... (03-FINDINGS.md § P0-TMP). Phase 6 compares exactly those
// two paths, which is where the mismatch bites.
```

> **Planner note:** "Phase 6 compares exactly those two paths" is now FALSE. D-07 must correct this
> sentence in place, not merely add a note elsewhere.

---

### Tests — `platform.test.ts` (the shape to follow) vs `command-resolution.test.ts` (the shape to avoid)

**Analog for ALL new win32 cases:** `platform.test.ts`. Its header states the SC-5 argument verbatim
and warns that `describe`/`it` titles are a verification contract:

```typescript
import { describe, expect, it } from "vitest";
import { buildSpawnEnv, getExecutableNames, getHomeDirCandidates, getSweepRoots,
         getTempRoot, getWhichCommand, isAbsolutePath, normalizePlatform } from "./platform";

// Every Windows branch below is exercised with `platform` passed as a literal,
// which is the entire point of `platform.ts` being pure: the maintainer cannot
// run native Windows, so this suite is the win32 proof and it runs on the Linux
// CI runner. The describe/it titles are a CONTRACT with 04-VALIDATION.md, which
// addresses each row by `-t "<name>"` — renaming one silently unhooks a
// requirement from its verification.

describe("getTempRoot", () => {
  it("strips the trailing backslash GetTempPath2 returns on Windows", () => {
    expect(getTempRoot({ platform: "win32", tmpdir: "C:\\Users\\x\\AppData\\Local\\Temp\\" }))
      .toBe("C:\\Users\\x\\AppData\\Local\\Temp");
  });
```

**Literal-`toEqual`-on-the-whole-array pattern** (`platform.test.ts:222-240`) — this is exactly what
D-10's `buildCommandCandidatePaths` win32 cases must do: assert the ENTIRE ordered list, not
`toContain`:

```typescript
  it("reads USERPROFILE, APPDATA and LOCALAPPDATA in that order on win32", () => {
    expect(
      getHomeDirCandidates({
        platform: "win32",
        env: {
          HOME: "/home/six",
          USERPROFILE: "C:\\Users\\six",
          APPDATA: "C:\\Users\\six\\AppData\\Roaming",
          LOCALAPPDATA: "C:\\Users\\six\\AppData\\Local",
        },
      }),
    ).toEqual([
      "C:\\Users\\six",
      "C:\\Users\\six\\AppData\\Roaming",
      "C:\\Users\\six\\AppData\\Local",
    ]);
  });
```

**The shape the new win32 cases must NOT follow** — `command-resolution.test.ts:29-45` builds real
temp dirs and asserts with `path.join`, which is host-flavoured:

```typescript
  it("collects version manager command candidates", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "drift-home-"));
    tempDirs.push(homeDir);
    await mkdir(path.join(homeDir, ".nvm", "versions", "node", "v22.1.0", "bin"), { recursive: true });
    ...
    expect(candidates).toContain(
      path.join(homeDir, ".nvm", "versions", "node", "v22.1.0", "bin", "claude"),
    );
  });
```

**But read the comment that licenses `path.join` where it IS correct** (`command-resolution.test.ts:94-107`)
— RESEARCH § Pitfall 2 says read this before writing any new case:

```typescript
    // It is built with path.join rather than written as a "/Users/..." literal
    // because getNodeExecutableCandidates derives the sibling with
    // path.join(path.dirname(cmd), "node") — host-flavoured by design, and
    // correct on a real Windows host where the command is "C:\...\claude.cmd".
    // The POSIX literal this replaced could only ever hold when `path` was
    // POSIX, so it failed the first real windows-latest run (CI run
    // 32376894371, 2026-08-20) for the test's reasons, not the code's:
    //   expected [ '/usr/local/bin/node', …(6) ] to include '/Users/six2dez/.local/bin/node'
```

**The assertion D-14 INVERTS** (`command-resolution.test.ts:68-73`) — RESEARCH flags this explicitly:
a verifier seeing a flipped assertion needs the D-14 reason next to it.

```typescript
  it("returns an actionable install hint for every known provider", () => {
    expect(getProviderInstallHint("claude-cli")).toContain("claude.ai/install.sh");
    expect(getProviderInstallHint("gemini-cli")).toContain("@google/gemini-cli");
    expect(getProviderInstallHint("codex-cli")).toContain("@openai/codex");
    expect(getProviderInstallHint("copilot-cli")).toContain("gh extension install");  // ← D-14 inverts
  });
```

**Also note** every `getProviderInstallHint(...)` call in this test file is single-arg and becomes
`{ providerId, platform }` under D-13 — 5 call sites at `:69-72`, `:76`, plus
`formatProviderUnavailableMessage` at `:82`.

---

## Shared Patterns

### Evidence-carrying comments (applies to EVERY file this phase touches)

**Sources:** `command-resolution.ts:54-56` (a measured CI red with run number + literal assertion text),
`platform.ts:154-165` (a named findings doc + section), `platform.ts:246-257` (a run URL + a verbatim
quoted variable list).

```typescript
// MEASURED, not precautionary — this is what took the first real `windows-latest`
// leg red, on run 32376894337's sibling CI run 32376894371 (2026-08-20):
//   AssertionError: expected undefined to be '/Users/six2dez'
```

```typescript
// ... which are precisely
// what the Windows nvm/fnm candidate paths need. So `{ ...driftVars }` alone is
// a defect on EITHER platform, not a Windows-only one. Source:
// .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md and
// https://github.com/six2dez/drift/actions/runs/31780073574
```

Every Windows install-location row this phase adds needs a citation from RESEARCH's P-01…P-20 table.
D-04's timeout comment needs the inverse form — an explicit "headroom estimate, not a measurement".

### Recorded non-claims and to-do hand-offs

**Source:** `command-resolution.ts:66-67`, `platform.ts:156-165`, `platform.ts:219-222`.
Pattern: state in the code what the function deliberately does NOT do and which phase owns it.
Three such comments in this codebase are about to become FALSE and must be corrected by this phase:

| File:line | Stale claim | Fixed by |
|---|---|---|
| `command-resolution.ts:66-67` | "This does NOT teach the function about `C:\Users\<name>`. That is … Phase 6." | D-06 |
| `platform.ts:156-165` | Items 1 and 2 "deliberately NOT implemented here" | D-01/D-02/D-03 |
| `platform.ts:219-222` | "…stay in Phase 6's `command-resolution.ts`, which this phase does not touch." | D-08/D-09 |
| `runtime-probe.ts:648-650` | "Phase 6 compares exactly those two paths" | D-07 (declines) |

### Unused-export preservation

**Source:** `index.ts:1460-1465` (`export { genUUID }`).
**Apply to:** `runtime-probe.ts:659` `normalizePathForCompare` (D-07).
`tsconfig noUnusedLocals` + `eslint --max-warnings 0` make an unused export a hard build failure, so the
preservation reason must live beside the export.

### Defensive `globalThis` process cast

**Source:** `index.ts:470-479` (`readParentEnv`), `index.ts:1571-1573` (`getKnownHomeDirs`),
`index.ts:2439-2441` (`getNodeExecutable`).
**Apply to:** every env/`process` read this phase touches. Never a bare `process.env`.

```typescript
  const processRef = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
```

### `{ ...input }` object params with injected `platform`

**Source:** every export in `platform.ts`. **Apply to:** `joinPath`, `rankPathSearchHits`,
`buildCommandCandidatePaths`, `getProviderInstallHint`, `getWhichCommand`.
The one deliberate exception is `extractHomeDir`, which D-06 keeps platform-blind with a positional
string param — matching its current signature.

### `pushUniqueCandidate` accumulator

**Source:** `command-resolution.ts:41-45`, used at 20 call sites in `:147-196`.
**Apply to:** the D-10 pure builder and its impure caller. Never a raw `candidates.push`.

---

## No Analog Found

None. Every file in this phase extends an existing module with a same-file or same-package sibling.

The nearest thing to a gap is the **`joinPath` CMP-01 byte-identity test** (RESEARCH § Phase Requirements
→ Test Map marks it ❌ new): no existing test asserts one helper's output equals another
implementation's output. The closest structural precedent is `platform.test.ts`'s literal `toEqual`
assertions; the planner will need to write the `path.join`-vs-`joinPath` comparison loop fresh over the
POSIX suffix list at `command-resolution.ts:149-161` and `:185-192`.

---

## Metadata

**Analog search scope:** `packages/backend/src/`, `packages/shared/src/`, `packages/frontend/src/views/`,
`packages/frontend/src/components/chat/`, `packages/frontend/src/stores/`
**Files scanned:** 12 read in full or in targeted ranges (`platform.ts`, `command-resolution.ts`,
`platform.test.ts`, `command-resolution.test.ts`, `resolution-cache.ts`, `runtime-probe.ts`,
`index.ts` (4 ranges), `shared/cli-providers.ts`, `shared/index.ts`, `HelpView.vue`), plus grep sweeps
for `from "shared"` across both frontend and backend
**Pattern extraction date:** 2026-08-21
