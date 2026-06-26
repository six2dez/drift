# Coding Conventions

**Analysis Date:** 2026-06-26

## Naming Patterns

**Files:**
- kebab-case for all TypeScript source files: `provider-launch.ts`, `mcp-runtime.ts`, `command-resolution.ts`, `claude-print.ts`
- PascalCase for Vue single-file components: `ChatInput.vue`, `MessageBubble.vue`, `ApprovalDialog.vue`
- Test files mirror their source: `provider-launch.test.ts` sits next to `provider-launch.ts`

**Functions:**
- camelCase throughout: `buildClaudeLaunchArgs`, `escapeSqliteLiteral`, `collectVersionManagerCommandCandidates`
- Verb-noun prefix convention: `build*`, `create*`, `get*`, `normalize*`, `resolve*`, `render*`
- Boolean predicates: `is*` or `has*` — `hasCaidoContextChanged`, `isFileNotFound`

**Variables:**
- camelCase: `mcpTempDir`, `sessionCaidoToken`, `currentSettings`
- Module-level mutable state uses `let`; stable references use `const`
- Module-level constants: SCREAMING_SNAKE_CASE — `CLAUDE_DISALLOWED_TOOLS`, `NODE_EXECUTABLE_ERROR`, `DEFAULT_CHAT_TITLE`

**Types and Interfaces:**
- PascalCase: `ClaudeLaunchInput`, `McpPermissionGroups`, `PersistenceDbHandle`
- Discriminated union members use string literal `kind` field: `{ kind: "Ok" }` / `{ kind: "Error" }`
- `type` preferred over `interface` for object shapes; `interface` appears only in `persistence.ts` for duck-typed handle

## Code Style

**Formatting:**
- Prettier 3.8.1 (`prettier` in root devDependencies)
- Run: `pnpm format` — formats `packages/**/src/**/*.{vue,ts,js,json}`
- No `.prettierrc` committed — default Prettier settings apply (2-space indent, double quotes)

**Linting:**
- ESLint present (`pnpm lint` calls `eslint ./packages/**/src --fix`)
- No project-level ESLint config file; relies on default rules
- `pnpm typecheck` runs `tsc --noEmit` (backend) and `vue-tsc --noEmit` (frontend)

**Section headers in large files:**
- `index.ts` uses ASCII box headers to delimit logical sections:
  ```typescript
  // ── Types (inline to avoid Zod which crashes QuickJS) ──────────────
  // ── Persistence ─────────────────────────────────────────────────────
  // ── API: Settings ───────────────────────────────────────────────────
  ```
- Use this style when adding new top-level sections to `packages/backend/src/index.ts`

## Backend Constraints (QuickJS Runtime)

The Caido backend runs in a constrained **QuickJS** environment. This imposes hard rules:

**No Zod:** Zod crashes QuickJS. All runtime validation is done with hand-written type guards. See the comment at `packages/backend/src/index.ts:68`:
```typescript
// ── Types (inline to avoid Zod which crashes QuickJS) ──────────────
type CaidoValidationResult = ...
```

**No `crypto` module:** UUID generation uses a hand-rolled implementation in `packages/backend/src/index.ts:829`:
```typescript
/** Generate UUID v4 without crypto module */
function genUUID(): string {
  const hex = "0123456789abcdef";
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
    } else if (i === 14) {
      uuid += "4";
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4 | 8)];
    } else {
      uuid += hex[(Math.random() * 16 | 0)];
    }
  }
  return uuid;
}
```
Do not replace this with `crypto.randomUUID()` — it is unavailable in QuickJS.

**No parameterized SQLite queries:** The Caido SQLite binding does not expose parameterized query support. SQL strings are built manually with `escapeSqliteLiteral` in `packages/backend/src/index.ts:193`:
```typescript
function escapeSqliteLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
```
The inputs are constrained at call sites: `key` is always a hardcoded string (`"settings"` or `"chats"`), and `value` is the JSON payload. New SQL calls must follow the same constraint and document it.

**Available standard modules in backend:** `fs/promises`, `child_process`, `buffer`, `path` — all used in `packages/backend/src/index.ts`. No third-party runtime dependencies.

## The Result Pattern

The `Result<T>` discriminated union is defined in `packages/shared/src/result.ts` and used as the return type for every backend RPC handler:

```typescript
export type Result<TOk = void, TErr = string> =
  | { kind: "Ok"; value: TOk }
  | { kind: "Error"; error: TErr };

export const Result = {
  ok: <TOk>(value: TOk): Result<TOk> => ({ kind: "Ok", value }),
  err: <TOk = never, TErr = string>(error: TErr): Result<TOk, TErr> => ({ kind: "Error", error }),
  isOk: ...,
  isErr: ...,
};
```

The backend `index.ts` re-declares a local version (same shape, different namespace) to avoid importing shared in the QuickJS context:
```typescript
type Result<T> = { kind: "Ok"; value: T } | { kind: "Error"; error: string };
function ok<T>(value: T): Result<T> { return { kind: "Ok", value }; }
function err<T>(error: string): Result<T> { return { kind: "Error", error }; }
```

Frontend stores call `result.kind === "Ok"` / `result.kind === "Error"` directly (no shared helpers needed).

## Security-Conscious File Permissions

Temp files that carry sensitive data (Caido tokens, MCP configs) must use restricted permissions. See `packages/backend/src/index.ts:262`:

```typescript
async function writeTemp(dir: string, name: string, content: string): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 });  // Directory: owner-only rwx
  await writeFile(fp, content, { mode: 0o600 });       // File: owner-only rw
  return fp;
}
```

- **Directories holding sensitive temp files:** `0o700` (rwx owner only)
- **Sensitive temp files (MCP config, context file):** `0o600` (rw owner only)
- **Executable launch scripts and wrappers:** `0o700` (rwx owner only)

Do not use default permissions (`0o644`) for any file written to the MCP temp directory.

## Pure Helpers Split for Testability

Side-effect-free logic is extracted into standalone modules so it can be unit tested without mocking I/O. The pattern is: extract the pure decision logic, leave I/O in `index.ts` as the orchestrator.

| Pure helper module | What it owns | `index.ts` owns |
|---|---|---|
| `packages/backend/src/provider-launch.ts` | CLI argument arrays for each provider | spawning the process |
| `packages/backend/src/mcp-runtime.ts` | MCP context normalization, policy building, serialization | writing files, publishing events |
| `packages/backend/src/command-resolution.ts` | Candidate path lists for NVM/fnm/volta/asdf | calling `which`, checking file existence |
| `packages/backend/src/claude-print.ts` | Claude `--print` stream state machine | buffering stdin chunks from child process |
| `packages/backend/src/persistence.ts` | Duck-typed DB handle validator | SQL execution |

When adding new backend logic: if it can be expressed as a pure transformation (input → output, no I/O), extract it into its own file with a corresponding `.test.ts`. Only orchestration goes in `index.ts`.

## Import Organization

**Backend (`packages/backend/src/`):**
```typescript
// 1. Node built-ins
import { readFile, writeFile } from "fs/promises";
import path from "path";
// 2. Caido/plugin types
import type { DefineAPI, SDK } from "caido:plugin";
// 3. Shared package
import { type Settings, DEFAULT_SETTINGS } from "shared";
// 4. Local modules
import { buildClaudeLaunchArgs } from "./provider-launch";
```
Type-only imports always use the `type` keyword.

**Frontend (`packages/frontend/src/`):**
```typescript
// 1. Vue core
import { defineStore } from "pinia";
import { ref, computed } from "vue";
// 2. Shared types
import type { ChatMessage, StoredChat } from "shared";
// 3. Local stores / composables / utils
import { useSDK } from "../plugins/sdk";
import { useApprovalsStore } from "./approvals";
```

**Path aliases:** None configured. All imports use relative paths (`./`, `../`) or workspace package names (`shared`, `backend`).

## Error Handling

**Backend RPC handlers:** Return `Result<T>`. Caller checks `kind`:
```typescript
async function getSettings(_sdk: BackendSDK): Promise<Result<Settings>> {
  await dataReady;
  return ok(currentSettings);
}
```

**Transient / best-effort failures:** `catch { /* ignore */ }` or `.catch(() => undefined)`:
```typescript
try { proc.kill("SIGKILL"); } catch { /* ignore */ }
// or:
void rm(tempPath, { force: true }).catch(() => undefined);
```

**Significant errors:** Logged with the `[drift]` prefix and published as an `err(...)` return:
```typescript
sdk.console.error(`[drift] Failed to refresh MCP context after project change: ${String(error)}`);
```

**Persistence failures:** Captured by `recordPersistenceIssue()` in `packages/backend/src/index.ts:409`, which sets module-level diagnostic fields (`lastPersistenceScope`, `lastPersistenceMessage`, `lastPersistenceTimestamp`) surfaced in the support bundle.

**JSON parsing:** Always `JSON.parse(raw) as T` with a surrounding try/catch — never assume valid JSON from external sources.

## Shell Security

Launch scripts and MCP wrappers use a POSIX `#!/bin/bash` header and `exec`-style invocation. The `shellQuote()` helper in `packages/backend/src/index.ts:398` uses single-quote escaping:
```typescript
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}
```
All values embedded in shell scripts must pass through `shellQuote`. The `renderExportExecScript` function generates `export KEY=VALUE` lines using `shellQuote` for every env var value, and `exec` as the final command.

## Logging

**Backend:** `sdk.console.error(...)` for errors, `sdk.console.log(...)` for informational traces — always prefixed `[drift]`:
```typescript
sdk.console.error(`[drift] ${message}`);
```

**Debug logging:** Gated on `currentSettings.debugLogging`. Per-session debug log files written to `/tmp/drift-session-${sessionId}.log` via `appendSessionDebugLog()`. Token values are redacted via `redactDebugText()` before writing.

**Frontend:** No logging helpers; errors surface via Pinia store `initError` / `persistenceError` refs and `sdk.window.showToast(...)` for user-facing alerts.

## Comments

**Explain "why", not "what":** Long block comments above non-obvious implementations are the norm. Examples: the `dataReady` gate explanation at `index.ts:96`, the self-test poll pump at `index.ts:1115`, the `DRIFT_ALLOWLIST_ACTIVE` semantics at `index.ts:592`.

**Top-of-file purpose comments:** Pure helper files open with a description of what they own and what the caller is responsible for. See `packages/backend/src/provider-launch.ts:1`:
```typescript
// Pure helpers that build provider-specific CLI launch arguments. The caller
// owns all side effects (writing MCP wrappers/configs, resolving binaries,
// handling auth token failures) and just passes the finalized paths in.
```

**Inline justification for constraints:** Every deliberate limitation has a comment:
```typescript
// key is always a hardcoded constant ("settings" | "chats") ...
// The Caido SQLite binding does not expose parameterized queries on this handle,
// so we escape manually ...
```

## Module Design

**Exports:** Named exports only — no default exports in `.ts` files. Vue components use `export default defineComponent(...)` as required by Vue SFC conventions.

**Shared package (`packages/shared/src/`):** Pure types and constants only. No I/O, no side effects. Re-exported through `packages/shared/src/index.ts`.

**Backend:** One `index.ts` as the Caido plugin entry point (3000+ lines), with logic extracted into co-located pure modules. Do not add new impure logic to the pure modules.

**Frontend:** Pinia stores (`packages/frontend/src/stores/`) use the composition-function style:
```typescript
export const useChatStore = defineStore("chat", () => {
  const chats = ref<StoredChat[]>([]);
  // ...
  return { chats, ... };
});
```

---

*Convention analysis: 2026-06-26*
