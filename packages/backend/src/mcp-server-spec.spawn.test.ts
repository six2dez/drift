import { spawn } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { createServer } from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";

import { MCP_TOOL_NAMES } from "./mcp-runtime";
import { buildMcpDriftVars, buildMcpServerSpec } from "./mcp-server-spec";

// D-08's integration proof, and the only place in this phase where the spec is
// executed rather than inspected. It imports the SAME `buildMcpServerSpec` that
// `index.ts` calls and spawns a real `node` against the real
// `assets/mcp-server.mjs` — no build step, no fixture copy of the server, and
// deliberately no local re-derivation of `command`, `args` or `env`. A second
// copy of the spec-building logic inside this file would make the test agree
// with itself instead of with production, which is the whole point of sharing
// the builder.
//
// The skeleton (temp dir + `afterEach` rm, the loopback HTTP stub on an
// ephemeral port, the newline-drain loop, the timeout-plus-SIGKILL guard) is
// lifted from `mcp-server.transport.test.ts`, which already runs cross-platform
// via `os.tmpdir()` and `process.execPath`.
//
// WHAT THIS FILE PROVES, AND WHAT IT DOES NOT — read this before citing a green
// run of it. In Phase 3's vehicle-caveat voice, because the distinction is the
// whole reason the caveat exists:
//
//   It proves the spec, the server and the spawn contract.
//
// It does NOT prove `index.ts`'s WIRING of them: `index.ts` cannot be imported
// under vitest (no `caido:plugin` alias), so no test here executes a single line
// of the orchestrator that will call `buildMcpServerSpec` in production. Nor is
// a green run here evidence that a real Claude CLI connects to Drift on Windows
// — that is PRV-01 and it belongs to Phase 7. And the environment contract it
// exercises is the NODE one: libuv back-fills eleven `required_vars` on Windows,
// so a regression to a bare drift-only `env` dict would pass every assertion in
// this file while breaking under Caido's LLRT (finding L-4). The gate for that
// is static, not this file.

// One constant, referenced by every case, so a future raise cannot apply to one
// of them only. 15 s rather than the transport test's 5 s because Windows
// runners are materially slower at process creation and Defender scans a
// freshly written script — the correct response to that is a bigger budget, not
// a retry, which would convert a real hang into a flake that passes on the
// second attempt.
const SPAWN_TIMEOUT_MS = 15000;

const FIXTURE_TOKEN = "drift-spawn-test-token";

type JsonRpcResponse = {
  id?: number;
  result?: {
    tools?: Array<{ name?: string }>;
    isError?: boolean;
  };
  error?: { message?: string };
};

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function createTempContextFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "drift-mcp-spec-"));
  tempDirs.push(dir);
  const contextFile = path.join(dir, "mcp-context.json");
  await writeFile(
    contextFile,
    JSON.stringify({
      uiContext: {
        projectId: "",
        filterId: "",
        filterName: "",
        filterQuery: "",
        historyQuery: "",
        historyScopeId: "",
      },
      overrideContext: {
        projectId: "",
      },
    }),
  );
  return contextFile;
}

// Loopback-only, ephemeral port, torn down in the case that started it
// (T-05-05). Answers the two GraphQL shapes this file drives: `requests` (both
// `--validate-auth` and `search_history`) and `environments` (`get_environment`).
async function startCaidoStub() {
  const server = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/graphql") {
      res.statusCode = 404;
      res.end();
      return;
    }

    let body = "";
    req.setEncoding("utf-8");
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => {
      const payload = JSON.parse(body) as { query: string };
      res.setHeader("Content-Type", "application/json");
      if (payload.query.includes("environments")) {
        res.end(
          JSON.stringify({
            data: {
              environments: [{ id: "env-1", name: "Default", variables: [] }],
            },
          }),
        );
        return;
      }
      if (payload.query.includes("requests")) {
        res.end(JSON.stringify({ data: { requests: { edges: [] } } }));
        return;
      }
      res.end(JSON.stringify({ data: {} }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to bind the Caido stub server.");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

// The single construction site. Every case in this file launches from what this
// returns, so "the test used the production builder" is a property of the file
// rather than a habit of each case.
function buildSpecForStub(input: { caidoUrl: string; contextFile: string }) {
  return buildMcpServerSpec({
    nodeExecutable: process.execPath,
    mcpScriptPath: fileURLToPath(
      new URL("../assets/mcp-server.mjs", import.meta.url),
    ),
    driftVars: buildMcpDriftVars({
      caidoUrl: input.caidoUrl,
      caidoToken: FIXTURE_TOKEN,
      contextFilePath: input.contextFile,
      // Every tool, which is what `runSharedMcpSelfTest` does too (it builds a
      // policy with all six groups enabled). Narrowing this would make the
      // tool-discovery assertion below unfalsifiable in the wrong direction:
      // `mcp-server.mjs:613` filters `tools/list` by the allowlist, so a subset
      // here would be indistinguishable from a server that lost tools.
      allowedToolNames: [...MCP_TOOL_NAMES],
      confirmationRequiredToolNames: [],
      confirmSensitiveActions: false,
    }),
    parentEnv: process.env,
    identityFallback: { platform: "darwin", homeDir: undefined },
  });
}

describe("mcp-server-spec spawn", () => {
  it("authenticates against a stub Caido via --validate-auth", async () => {
    const contextFile = await createTempContextFile();
    const caido = await startCaidoStub();
    const spec = buildSpecForStub({
      caidoUrl: caido.url,
      contextFile,
    });

    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        const proc = spawn(spec.command, [...spec.args, "--validate-auth"], {
          env: spec.env,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let out = "";
        let stderr = "";
        const timeout = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          reject(new Error(`Timed out waiting for --validate-auth. ${stderr}`));
        }, SPAWN_TIMEOUT_MS);

        proc.stdout.setEncoding("utf-8");
        proc.stdout.on("data", (chunk: string) => {
          out += chunk;
        });
        proc.stderr.setEncoding("utf-8");
        proc.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });
        proc.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        proc.on("close", () => {
          clearTimeout(timeout);
          resolve(out);
        });
      });

      expect(JSON.parse(stdout.trim()) as { ok: boolean }).toMatchObject({
        ok: true,
      });
    } finally {
      await caido.close();
    }
  });

  it("drives all three self-test methods over stdio JSON-RPC", async () => {
    const contextFile = await createTempContextFile();
    const caido = await startCaidoStub();
    const spec = buildSpecForStub({
      caidoUrl: caido.url,
      contextFile,
    });

    try {
      const responses = await new Promise<Map<number, JsonRpcResponse>>(
        (resolve, reject) => {
          const proc = spawn(spec.command, spec.args, {
            env: spec.env,
            stdio: ["pipe", "pipe", "pipe"],
          });

          const seen = new Map<number, JsonRpcResponse>();
          let stdoutBuffer = "";
          let stderr = "";
          const timeout = setTimeout(() => {
            try {
              proc.kill("SIGKILL");
            } catch {
              /* ignore */
            }
            reject(
              new Error(
                `Timed out waiting for the self-test responses. Saw ids [${[...seen.keys()].join(",")}]. ${stderr}`,
              ),
            );
          }, SPAWN_TIMEOUT_MS);

          proc.stdout.setEncoding("utf-8");
          proc.stdout.on("data", (chunk: string) => {
            stdoutBuffer += chunk;
            let newlineIndex = stdoutBuffer.indexOf("\n");
            while (newlineIndex !== -1) {
              const line = stdoutBuffer.slice(0, newlineIndex).trim();
              stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
              newlineIndex = stdoutBuffer.indexOf("\n");
              if (line === "") continue;
              const parsed = JSON.parse(line) as JsonRpcResponse;
              // Correlate by id — the server answers concurrently and makes no
              // promise about ordering.
              if (parsed.id !== undefined) seen.set(parsed.id, parsed);
              if (seen.has(2) && seen.has(3) && seen.has(4)) {
                clearTimeout(timeout);
                resolve(seen);
              }
            }
          });

          proc.stderr.setEncoding("utf-8");
          proc.stderr.on("data", (chunk: string) => {
            stderr += chunk;
          });

          proc.on("error", (error) => {
            clearTimeout(timeout);
            reject(error);
          });

          proc.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "drift-spec-spawn-test", version: "1.0.0" },
              },
            })}\n`,
          );
          proc.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              method: "notifications/initialized",
              params: {},
            })}\n`,
          );
          proc.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/list",
              params: {},
            })}\n`,
          );
          proc.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 3,
              method: "tools/call",
              params: { name: "get_environment", arguments: {} },
            })}\n`,
          );
          proc.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 4,
              method: "tools/call",
              params: { name: "search_history", arguments: { limit: 1 } },
            })}\n`,
          );
          proc.stdin.end();
        },
      );

      // Tool discovery, asserted against the SHARED constant rather than a
      // restated list — a change to `MCP_TOOL_DEFINITIONS` must not be able to
      // silently narrow what this case demands.
      const discovered = (responses.get(2)?.result?.tools ?? []).map(
        (tool) => tool.name,
      );
      for (const name of MCP_TOOL_NAMES) {
        expect(discovered).toContain(name);
      }

      expect(responses.get(3)?.result?.isError).not.toBe(true);
      expect(responses.get(4)?.result?.isError).not.toBe(true);
    } finally {
      await caido.close();
    }
  });
});

// D-05's DRIFT HALF, and only that half — read the vehicle caveat at the top of
// this file before citing it. Drift can prove that it SUPPLIES the two
// per-session variables to the CLI child it spawns; whether a specific
// installed `gemini` then forwards them to the stdio MCP server it starts is
// the CLI's half, and that is settled by a source CITATION in
// `packages/shared/src/cli-providers.ts`, never by a test here.
//
// Both directions are asserted. The "has runtime files" case alone would pass
// for a builder that emitted the two keys unconditionally, which is the exact
// shape D-03 forbids on the registration path — so the "no runtime files" case
// is what makes the pair discriminate.
//
// Built through the SAME production builders `index.ts` calls, per this file's
// standing rule: a local re-derivation would make the test agree with itself
// instead of with production.
describe("mcp-server-spec per-session channel (D-05, Drift's half)", () => {
  const ACTIVITY_FILE = path.join(
    "/tmp",
    "drift-mcp-x",
    "mcp-activity-s1.jsonl",
  );
  const APPROVALS_FILE = path.join(
    "/tmp",
    "drift-mcp-x",
    "mcp-approvals-s1.json",
  );

  function buildSessionSpec(runtimeFiles: boolean) {
    return buildMcpServerSpec({
      nodeExecutable: process.execPath,
      mcpScriptPath: fileURLToPath(
        new URL("../assets/mcp-server.mjs", import.meta.url),
      ),
      driftVars: buildMcpDriftVars({
        caidoUrl: "http://127.0.0.1:8080",
        caidoToken: FIXTURE_TOKEN,
        contextFilePath: "/tmp/drift-mcp-x/mcp-context.json",
        allowedToolNames: [...MCP_TOOL_NAMES],
        confirmationRequiredToolNames: [],
        confirmSensitiveActions: false,
        ...(runtimeFiles
          ? {
              activityFilePath: ACTIVITY_FILE,
              approvalsFilePath: APPROVALS_FILE,
            }
          : {}),
      }),
      parentEnv: process.env,
      identityFallback: { platform: "darwin", homeDir: undefined },
    });
  }

  it("puts both per-session file paths in the spawn environment, with their exact values, for a session that HAS runtime files", () => {
    const spec = buildSessionSpec(true);
    expect(spec.env.DRIFT_ACTIVITY_FILE).toBe(ACTIVITY_FILE);
    expect(spec.env.DRIFT_APPROVALS_FILE).toBe(APPROVALS_FILE);
  });

  it("puts NEITHER per-session file path in the spawn environment for a session that has none", () => {
    const spec = buildSessionSpec(false);
    expect(Object.keys(spec.env)).not.toContain("DRIFT_ACTIVITY_FILE");
    expect(Object.keys(spec.env)).not.toContain("DRIFT_APPROVALS_FILE");
  });
});
