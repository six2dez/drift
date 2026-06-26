# Testing Patterns

**Analysis Date:** 2026-06-26

## Test Framework

**Runner:**
- vitest 4.0.18 (root `devDependencies`)
- Config: `/Users/six2dez/Tools/drift/vitest.config.ts` (single root config for the entire monorepo)

**Assertion Library:**
- vitest built-in: `expect`, `describe`, `it`, `beforeEach`, `afterEach`, `vi`

**Additional test utilities:**
- `@vue/test-utils` ^2.4.6 — Vue component mounting
- `happy-dom` ^20.8.9 — DOM environment for Vue component tests

**Run Commands:**
```bash
pnpm vitest              # Run all tests (interactive)
pnpm vitest run          # Run all tests once (CI mode)
pnpm vitest --reporter=verbose  # Verbose output
```
Note: there is no `test` script in `package.json`. Vitest is invoked directly. Add `"test": "vitest run"` if a shorthand is needed.

## Test File Organization

**Location:**
- Co-located: every `*.test.ts` sits in the same directory as the source file it tests
- No separate `__tests__` or `test/` directories

**Naming:**
- `<source-name>.test.ts` for single-file coverage: `provider-launch.test.ts`, `mcp-runtime.test.ts`
- `<source-name>.<facet>.test.ts` for multi-file coverage of one module: `mcp-server.allowlist.test.ts`, `mcp-server.context.test.ts`, `mcp-server.transport.test.ts`, `ChatView.mount.test.ts`, `ChatView.cancel.test.ts`

**Full test file inventory (22 files):**
```
packages/backend/src/
  claude-print.test.ts        — pure state-machine unit tests
  command-resolution.test.ts  — path-probing unit tests (uses real tmp dirs)
  mcp-runtime.test.ts         — context/policy unit tests
  mcp-self-test.test.ts       — self-test result shaping
  mcp-server.allowlist.test.ts — integration: spawns real mcp-server.mjs
  mcp-server.context.test.ts  — integration: spawns mcp-server.mjs + mock HTTP
  mcp-server.transport.test.ts — integration: spawns mcp-server.mjs, tests drain/timeout
  persistence.test.ts         — duck-typed DB handle validator
  provider-launch.test.ts     — per-provider argv snapshot tests

packages/frontend/src/
  chat-context.test.ts        — queue helpers and HTTP context extraction
  components/chat/
    ApprovalDialog.test.ts
    AttachmentPreview.test.ts
    ChatInput.test.ts
    ChatSidebar.test.ts
    MessageBubble.test.ts
    MessageList.test.ts
  stores/
    approvals.test.ts
    chat.test.ts
    settings.test.ts
  utils/
    http-parse.test.ts
  views/
    ChatView.cancel.test.ts   — logic-only cancel-race guard test (no mount)
    ChatView.mount.test.ts    — full mount test with happy-dom
```

## Environment Configuration

`vitest.config.ts` routes specific test globs to `happy-dom`, leaving everything else in Node:

```typescript
test: {
  environmentMatchGlobs: [
    ["packages/frontend/src/views/**/*.test.ts", "happy-dom"],
    ["packages/frontend/src/components/**/*.test.ts", "happy-dom"],
  ],
},
```

Frontend store tests and utility tests run in the default Node environment (no DOM needed).

## Test Structure

**Backend pure-unit suite:**
```typescript
import { describe, expect, it } from "vitest";
import { buildClaudeLaunchArgs, CLAUDE_DISALLOWED_TOOLS } from "./provider-launch";

describe("buildClaudeLaunchArgs", () => {
  it("produces the base Claude flags without --resume or --mcp-config when MCP is absent", () => {
    const args = buildClaudeLaunchArgs({
      allowedToolNames: ["search_history"],
      resumeSessionId: undefined,
      mcpConfigPath: undefined,
      hasMcpAttached: false,
    });
    expect(args).toEqual(["-p", "--verbose", ...]);
  });
});
```

**Frontend Pinia store suite:**
```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const mockSdk = {
  backend: { getChats: vi.fn(), saveChat: vi.fn(), ... },
  window: { showToast: vi.fn() },
};
vi.mock("../plugins/sdk", () => ({ useSDK: () => mockSdk }));

import { useChatStore } from "./chat";

describe("chat store persistence", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockSdk.backend.getChats.mockReset();
  });

  it("surfaces chat load failures", async () => {
    mockSdk.backend.getChats.mockResolvedValue({ kind: "Error", error: "storage unavailable" });
    const store = useChatStore();
    await store.loadChats();
    expect(store.initError).toBe("storage unavailable");
  });
});
```

**Vue component suite (happy-dom):**
```typescript
// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import ChatInput from "./ChatInput.vue";

// PrimeVue components are stubbed with local defineComponent stubs — not
// global.components — to avoid importing the full PrimeVue registry.
const ButtonStub = defineComponent({ props: { label: String }, ... });

it("disables the send button when the session is running", () => {
  const wrapper = mount(ChatInput, {
    props: { disabled: true },
    global: { components: { Button: ButtonStub } },
  });
  expect(wrapper.find("button").attributes("disabled")).toBeDefined();
});
```

## The Pure-Helper Split Enables Unit Testing

The deliberate architecture of extracting side-effect-free logic into separate modules is what makes unit testing possible. `packages/backend/src/index.ts` is 3000+ lines of orchestration code that cannot be unit tested (it requires the Caido SDK, spawns processes, and writes files). The extracted pure modules have no such requirements:

| Module | How tests work |
|---|---|
| `provider-launch.ts` | Pass input structs, assert exact `string[]` argv output |
| `mcp-runtime.ts` | Pass `Partial<*>` objects, assert normalized output structs |
| `command-resolution.ts` | Create real `mkdtemp` dirs for NVM/fnm probing; assert candidate arrays |
| `claude-print.ts` | Feed raw JSON chunk strings through the state machine, assert state fields |
| `persistence.ts` | Pass duck-typed objects with `vi.fn()` methods, assert accepted/rejected |

When extending backend behavior: if you add pure logic, add it to the appropriate pure module and write unit tests. If it requires I/O, add it to `index.ts` and accept it will not be directly unit tested.

## Mocking

**Framework:** `vi` from vitest

**Module-level mocking (SDK):**
```typescript
vi.mock("../plugins/sdk", () => ({
  useSDK: () => mockSdk,
}));
// Import the store AFTER the mock declaration — vitest hoists vi.mock() calls
import { useChatStore } from "./chat";
```

**Individual function mocking:**
```typescript
const mockSdk = {
  backend: {
    getChats: vi.fn().mockResolvedValue({ kind: "Ok", value: [] }),
    saveChat: vi.fn(),
  },
};
// Reset between tests:
mockSdk.backend.getChats.mockReset();
```

**Fake timers for timeout tests:**
```typescript
it("times out chat loading", async () => {
  vi.useFakeTimers();
  try {
    mockSdk.backend.getChats.mockImplementation(() => new Promise(() => undefined));
    const loadPromise = store.loadChats();
    await vi.advanceTimersByTimeAsync(INIT_REQUEST_TIMEOUT_MS + 1);
    await loadPromise;
    expect(store.initError).toContain("timed out");
  } finally {
    vi.useRealTimers();
  }
});
```

**What is mocked:** The Caido SDK (`useSDK`), external backend RPC calls, DOM timers. Never mocked: the pure helper modules themselves.

**What is NOT mocked:** The real `mcp-server.mjs` asset (integration tests spawn it as a real subprocess), the `fs/promises` calls in `command-resolution.test.ts` (it creates real temp directories).

## MCP Server Integration Tests

Three test files spawn the real embedded MCP server script (`packages/backend/assets/mcp-server.mjs`) as a child process over stdio:

**`mcp-server.allowlist.test.ts`** — verifies server-side tool enforcement:
- `DRIFT_ALLOWLIST_ACTIVE` + `DRIFT_ALLOWED_TOOLS` env vars control visible/callable tools
- Verifies deny-all when `DRIFT_ALLOWED_TOOLS` is empty with the active flag
- Verifies expose-all when the flag is absent (backward compat)

**`mcp-server.context.test.ts`** — verifies context tools against a mock Caido HTTP server:
- Starts a real `http.createServer` mock on port 0 that handles GraphQL queries
- Exercises `get_current_context`, `list_projects`, `select_project`, `clear_context_override`
- Verifies project override persists to the context file and clears `historyScopeId`

**`mcp-server.transport.test.ts`** — verifies stdin drain and hung-server timeout:
- `startDelayedCaidoServer` — responds after 150ms; verifies tool call completes after stdin closes
- `startHungCaidoServer` — never responds; verifies `isError: true` with `DRIFT_GRAPHQL_TIMEOUT_MS` override

**Shared subprocess pattern (replicated in all three):**
```typescript
const proc = spawn(process.execPath, [scriptPath], {
  env: { ...process.env, CAIDO_TOKEN: "session-token", ...env },
  stdio: ["pipe", "pipe", "pipe"],
});
// Write initialize → notifications/initialized → request → stdin.end()
// Parse newline-delimited JSON from stdout, match by response id
// 5-second SIGKILL timeout on no response
```

## Fixtures and Factories

**Temp directory pattern (command-resolution, mcp-server tests):**
```typescript
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "drift-mcp-context-"));
  tempDirs.push(dir);
  return dir;
}
```
`tempDirs.splice(0)` atomically clears the list while returning the old values, preventing double-cleanup if afterEach runs multiple times.

**Context file factory (mcp-server.context.test.ts, transport.test.ts):**
```typescript
await writeFile(contextFile, JSON.stringify({
  uiContext: { projectId: "ui-project", filterId: "filter-1", ... },
  overrideContext: { projectId: "" },
}));
```

**Mock Caido server factory:**
```typescript
async function startMockCaidoServer() {
  const server = createServer((req, res) => { /* GraphQL handler */ });
  await new Promise<void>((resolve) => { server.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}`, graphqlCalls };
}
```
Always uses port `0` (OS-assigned) to avoid port conflicts.

## Provider Launch Snapshot Tests

`packages/backend/src/provider-launch.test.ts` uses exact `toEqual` array comparisons to lock in the full argument vector for each CLI provider. This serves as a regression gate: a change to any flag or its ordering breaks a test before it ships.

```typescript
it("produces the base Claude flags without --resume or --mcp-config when MCP is absent", () => {
  const args = buildClaudeLaunchArgs({
    allowedToolNames: ["search_history", "get_current_context"],
    resumeSessionId: undefined,
    mcpConfigPath: undefined,
    hasMcpAttached: false,
  });
  expect(args).toEqual([
    "-p", "--verbose", "--output-format", "stream-json",
    "--disable-slash-commands", "--append-system-prompt", "...",
    "--disallowedTools", CLAUDE_DISALLOWED_TOOLS,
    "--allowedTools", "mcp__drift__search_history,mcp__drift__get_current_context",
  ]);
});
```

## Coverage

**Requirements:** None enforced — no `coverage` block in `vitest.config.ts` and no `--coverage` flag in any script.

**View Coverage:**
```bash
pnpm vitest run --coverage   # requires @vitest/coverage-v8
```

## Test Types

**Unit Tests (pure logic, no I/O):**
- Backend: `provider-launch.test.ts`, `mcp-runtime.test.ts`, `mcp-self-test.test.ts`, `claude-print.test.ts`, `persistence.test.ts`
- Frontend: `chat-context.test.ts`, `http-parse.test.ts`, store tests, `ChatView.cancel.test.ts`

**Integration Tests (spawn real processes or bind sockets):**
- `mcp-server.allowlist.test.ts`, `mcp-server.context.test.ts`, `mcp-server.transport.test.ts`
- `command-resolution.test.ts` (creates real temp filesystem trees for NVM/fnm)

**Component Tests (happy-dom):**
- All files under `packages/frontend/src/components/**/*.test.ts`
- `packages/frontend/src/views/ChatView.mount.test.ts`

**E2E Tests:** None. No browser automation or Caido plugin loading is tested.

## Common Async Patterns

**Awaiting store actions:**
```typescript
const store = useChatStore();
await store.loadChats();
expect(store.chats).toEqual([]);
```

**Deferred promise for mount tests:**
```typescript
function createDeferred(): DeferredResult {
  let resolveFn: (value: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((resolve) => { resolveFn = resolve; });
  return { promise, resolve: resolveFn };
}
```
Used in `ChatView.mount.test.ts` to control when backend RPC calls resolve.

**Error testing (Result pattern):**
```typescript
mockSdk.backend.getChats.mockResolvedValue({ kind: "Error", error: "storage unavailable" });
await store.loadChats();
expect(store.initError).toBe("storage unavailable");
```

## Known Coverage Gaps

**`renderExportExecScript` and `shellQuote` (untestable):**
- Both functions live in `packages/backend/src/index.ts` and are not exported
- Shell script generation and POSIX quoting are not directly unit tested
- Impact: a bug in single-quote escaping would not be caught before deployment
- Fix: extract `renderExportExecScript` and `shellQuote` to a dedicated `shell-utils.ts` pure module

**POSIX-only launch scripts:**
- `renderExportExecScript` generates `#!/bin/bash` scripts with POSIX `export`/`exec`
- No Windows path handling exists in `command-resolution.ts` (all `/`-separated paths)
- No tests run under Windows; the plugin is macOS/Linux-only by design
- Gap: if cross-platform support is ever added, `command-resolution.test.ts` has no Windows path coverage

**`index.ts` orchestration (3000+ lines, untestable):**
- The Caido plugin entry point cannot be unit tested (requires SDK, spawns processes, writes files)
- MCP server integration tests cover the MCP layer indirectly
- Process lifecycle, session state machine, watchdog timers, and support bundle generation have no test coverage
- Mitigation: keep extracting pure logic into dedicated modules as new features are added

**No coverage gate:**
- `vitest.config.ts` has no `coverage` threshold configuration
- A regression in an extracted module shows up as a test failure, but gaps in `index.ts` are invisible

---

*Testing analysis: 2026-06-26*
