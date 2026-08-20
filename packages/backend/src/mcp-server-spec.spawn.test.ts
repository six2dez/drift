import { spawn } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { createServer } from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";

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

// One constant, referenced by every case, so a future raise cannot apply to one
// of them only. 15 s rather than the transport test's 5 s because Windows
// runners are materially slower at process creation and Defender scans a
// freshly written script — the correct response to that is a bigger budget, not
// a retry, which would convert a real hang into a flake that passes on the
// second attempt.
const SPAWN_TIMEOUT_MS = 15000;

const FIXTURE_TOKEN = "drift-spawn-test-token";

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
      allowedToolNames: ["get_environment", "search_history"],
      confirmationRequiredToolNames: [],
      confirmSensitiveActions: false,
    }),
    parentEnv: process.env,
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
});
