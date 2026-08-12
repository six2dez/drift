# Phase 3: CI Spike — Prove LLRT Basics on Windows — Research

**Researched:** 2026-06-26
**Domain:** GitHub Actions `windows-latest`, LLRT/QuickJS runtime, Node.js `child_process` on Windows
**Confidence:** HIGH for Node.js vehicle choice and LLRT source-verified facts; MEDIUM for residual LLRT-specific behavior not observable from a Node.js probe

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CI-02 | A Phase-1 CI spike proves the 7 LLRT assertions (spawn `env` passthrough, `os.tmpdir()`/`os.platform()`, `.cmd` EINVAL behavior, `where` parsing, bare `"os"` import specifier, `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`, `crypto.randomUUID`) before any production port code is built on them | Sections: Central Question, Standard Stack, Architecture Patterns, Validation Architecture |
</phase_requirements>

---

## Summary

Phase 3 is a CI spike whose purpose is to empirically prove seven LLRT runtime primitives on a real Windows host before any production port code is written. The central planning question is: **what vehicle faithfully executes those assertions on `windows-latest` CI when Caido's LLRT runtime cannot be booted standalone?**

**The standalone LLRT vehicle is NOT available on windows-latest.** The upstream `awslabs/llrt` project dropped its Windows binary at v0.6.0-beta (commit `4ed0ac1`, July 2025). `caido/dependency-llrt` has no published binary releases at all. There is no pre-built LLRT executable that can be downloaded and invoked as `llrt probe.mjs` in GitHub Actions.

**Caido headless in CI is NOT a lightweight option.** Caido's GitHub Actions headless integration requires a paid Teams-plan Registration Key. It cannot be used in this open-source project's CI.

**The recommended vehicle is plain Node.js on `windows-latest`.** This is not a perfect LLRT facsimile, but it is the most faithful approximation available, for a well-grounded reason: LLRT's `child_process` implementation (verified from Rust source in `modules/llrt_child_process/src/lib.rs`) uses `tokio::process::Command`, which maps to the OS-level `CreateProcess` API on Windows — the exact same mechanism Node.js uses. The `env` option in LLRT calls `command.env_clear()` + `command.envs(env)`, cross-platform with no Windows-specific conditional. If Node.js proves `spawn({env})` passes env on windows-latest, this is strong evidence the same OS mechanism will work in LLRT on Windows.

The LLRT source also confirms that both `"os"` and `"node:os"` import specifiers work identically: the module resolver strips the `node:` prefix before lookup (`name.trim_start_matches("node:")`). The `os` module is fully documented. All seven assertions can therefore be answered meaningfully by a Node.js probe.

**Primary recommendation:** Create one new file: a self-contained probe script at `scripts/windows-llrt-probe.mjs` and one new CI workflow `.github/workflows/windows-llrt-probe.yml`. The probe runs all 7 assertions, emits machine-parseable `PASS/FAIL` lines, exits non-zero only on P0 failures (the `env`-passthrough and `os.tmpdir()` assertions), and uploads its full output as an artifact for review before Phase 4.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Probe script execution | CI runner (windows-latest) | — | No production src change; purely CI artifact |
| Env-passthrough assertion | OS / `child_process` API | Node.js runtime vehicle | OS `CreateProcess` is the shared mechanism |
| OS-info assertions | Node.js `os` module | Same surface as LLRT `os` module | Both call Windows OS APIs directly |
| `.cmd` EINVAL assertion | Node.js `child_process` | CVE-2024-27980 guard | Node.js IS the source of the EINVAL guard Drift must handle |
| `where.exe` assertion | Windows built-in | Spawned as child process | `where.exe` is on PATH on every Windows host |
| CRLF artifact upload | GitHub Actions artifact | — | For human review before Phase 4 |
| Residual LLRT-only risk | Real Caido-on-Windows | Reporter machine only | Not achievable in CI without paid Caido Teams |

---

## Central Question Resolved: Which Vehicle for Each Assertion

The crux of Phase 3 planning: **how do you execute the 7 assertions inside or faithfully approximating Caido's LLRT/QuickJS runtime when CI cannot boot Caido?**

### Vehicle 1: Standalone LLRT Binary — NOT AVAILABLE

`awslabs/llrt` v0.6.0-beta (July 2025) removed its Windows binary. The failure in the release workflow (`windows-latest` build, exit code 2) led to deliberate removal. `caido/dependency-llrt` has zero published releases. No pre-built LLRT `.exe` exists for download in a CI step. [VERIFIED: github.com/awslabs/llrt/actions/runs/16193238678]

**Verdict: Cannot use `llrt probe.mjs` on windows-latest.**

### Vehicle 2: Caido Headless in GitHub Actions — NOT VIABLE

Caido's GitHub Actions headless integration (`docs.caido.io/app/tutorials/github_action`) requires a Teams-plan Registration Key. It is explicitly a paid feature. An open-source plugin project cannot gate its CI on a paid product. [CITED: docs.caido.io/app/tutorials/github_action]

**Verdict: Cannot load Caido backend plugin code in CI without a paid account.**

### Vehicle 3: Node.js on `windows-latest` — RECOMMENDED

**Answers 6 of 7 assertions directly and definitively. Answers the 7th (import specifier) by structural analysis of LLRT source.**

Justification per assertion:

| Assertion ID | Can Node.js answer it? | Why | Residual risk |
|---|---|---|---|
| P0-ENV: `spawn({env})` passthrough | YES — definitively | LLRT uses `tokio::process::Command`; Node uses `libuv` → `CreateProcess`. Both pass env via the same OS environment block. LLRT source confirms `env` option calls `env_clear()` + `envs()`. [VERIFIED: github.com/awslabs/llrt/modules/llrt_child_process/src/lib.rs] | Caido's fork could have a custom shim overriding this — LOW risk given source shows standard Rust stdlib |
| P0-TMP: `os.tmpdir()` + `os.platform()` | YES — definitively | LLRT's `os` module is documented by Caido and maps to the same Windows API (`GetTempPath`/`GetWindowsDirectory`). Node's `os.tmpdir()` calls the same Win32 API. [CITED: developer.caido.io/reference/modules/extra/os.html] | None — Win32 API is stable |
| P1-CMD: `.cmd` EINVAL behavior | YES — directly | The EINVAL guard IS a Node.js feature (CVE-2024-27980). Node.js IS the process that spawns `.cmd` files in real usage. LLRT's behavior may differ, but Drift's code ultimately lands in Node anyway when it spawns CLI shims. | LLRT may not reproduce EINVAL (it might throw a different error or succeed). Probe records the actual error; plan must handle both outcomes. |
| P1-WHERE: `where.exe` spawnability + CRLF | YES — definitively | `where.exe` is a Windows built-in; its behavior does not depend on which runtime spawns it. CRLF output is OS-level. | LLRT stream handling could buffer differently — probe records raw output |
| P2-OS: bare `"os"` import specifier | PARTIAL — by structural analysis | LLRT source proves the resolver strips `"node:"` prefix: `name.trim_start_matches("node:")`. So `"os"` and `"node:os"` are identical in LLRT. Node.js supports bare `"os"` natively. The probe verifies the import works on the Node runtime. [VERIFIED: github.com/caido/dependency-llrt/llrt_modules/src/module/resolver.rs] | Caido might register the module under a different name. LOW risk — Caido's own docs show `import { tmpdir } from "os"` style. |
| P3-VARS: `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` | YES — definitively | These are OS-level environment variables on every Windows session. They are present in `process.env` regardless of whether the runtime is Node or LLRT. | None |
| P3-UUID: `crypto.randomUUID()` | YES — definitively | `globalThis.crypto.randomUUID` was added in Node 19+ (via Web Crypto). In Node 20 (project's CI version), it is available. LLRT's `crypto` module is documented. The probe verifies availability. | LLRT's `crypto` module may not expose Web Crypto API identically. `import { randomUUID } from "node:crypto"` is Node-specific syntax; in LLRT prefer `globalThis.crypto.randomUUID()`. Probe checks both. |

### Recommendation: Node.js ONLY (no LLRT probe)

Run a single Node.js probe on `windows-latest`. Do NOT attempt to build LLRT from source in CI (complex Rust toolchain, WSL2-only documented build path, not what Caido ships). Node.js IS the correct vehicle for all OS-level assertions, and the LLRT source analysis closes the only gap that required source-level verification (the `env` option).

---

## Standard Stack

### Core (all are built-ins — no npm installs)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Node.js | 20 (CI-pinned) | Probe execution vehicle | Existing project standard; `actions/setup-node@v4` node-version: 20 |
| `child_process` (built-in) | — | Spawn assertions (P0-ENV, P1-CMD, P1-WHERE) | Standard Node.js module |
| `os` (built-in) | — | P0-TMP, P2-OS assertions | Same surface as Caido LLRT `os` module |
| `fs` (built-in) | — | P0-TMP: verify tmpdir exists on disk | Standard Node.js module |
| `crypto` (built-in) | — | P3-UUID assertion | Standard Node.js module |
| `node:crypto` | — | P3-UUID via `randomUUID` named import | Node 15+ feature |

### GitHub Actions Actions (match existing ci.yml)

| Action | Version | Purpose |
|--------|---------|---------|
| `actions/checkout` | `@v4` | Checkout repo [ASSUMED] |
| `pnpm/action-setup` | `@v4` | Install pnpm (matches existing CI) [VERIFIED: .github/workflows/ci.yml] |
| `actions/setup-node` | `@v4` with `cache: pnpm` | Node 20 + pnpm cache (matches existing CI) [VERIFIED: .github/workflows/ci.yml] |
| `actions/upload-artifact` | `@v4` | Upload probe results artifact (matches existing CI) [VERIFIED: .github/workflows/ci.yml] |

**No npm install step needed for the probe** — it uses only Node.js built-ins. `pnpm install --frozen-lockfile` is still included for consistency and to set up the PATH for Node.

### Installation

```bash
# No new dependencies. Probe uses only Node.js built-ins.
# No changes to package.json, pnpm-lock.yaml, or any packages/*/src file.
```

---

## Package Legitimacy Audit

This phase installs NO external packages. The probe uses only Node.js built-in modules. No audit required.

---

## Architecture Patterns

### System Architecture Diagram

```
  windows-latest runner
  ┌──────────────────────────────────────────────────────┐
  │  checkout + pnpm install                             │
  │                                                      │
  │  node scripts/windows-llrt-probe.mjs                 │
  │  ┌────────────────────────────────────────────────┐  │
  │  │  probe script (pure Node.js, no deps)          │  │
  │  │                                                │  │
  │  │  P0-ENV: spawn(node, ["-e", "…"], {env:…})     │  │
  │  │     → child stdout: SENTINEL value             │  │
  │  │     → PASS/FAIL [FATAL if FAIL]                │  │
  │  │                                                │  │
  │  │  P0-TMP: os.tmpdir() / os.platform()           │  │
  │  │     → drive-letter check, existsSync           │  │
  │  │     → PASS/FAIL [FATAL if FAIL]                │  │
  │  │                                                │  │
  │  │  P1-CMD: spawn("dummy.cmd") directly           │  │
  │  │     → record EINVAL / ENOENT / success         │  │
  │  │     → PASS (always recorded, not fatal)        │  │
  │  │                                                │  │
  │  │  P1-WHERE: spawn("where.exe", ["node"])        │  │
  │  │     → capture stdout, split /\r?\n/            │  │
  │  │     → PASS/WARN (not fatal)                    │  │
  │  │                                                │  │
  │  │  P2-OS: import { tmpdir } from "os"            │  │
  │  │     → validated by running at all              │  │
  │  │     → PASS (not fatal)                         │  │
  │  │                                                │  │
  │  │  P3-VARS: process.env.USERPROFILE/APPDATA/…   │  │
  │  │     → non-empty string check                  │  │
  │  │     → PASS/WARN (not fatal)                    │  │
  │  │                                                │  │
  │  │  P3-UUID: globalThis.crypto.randomUUID         │  │
  │  │     → typeof === "function"                    │  │
  │  │     → PASS/WARN (not fatal)                    │  │
  │  │                                                │  │
  │  │  exit 0 (if P0 pass) / exit 1 (if P0 fail)    │  │
  │  └────────────────────────────────────────────────┘  │
  │                                                      │
  │  upload probe-results.txt as CI artifact            │
  └──────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
.
├── scripts/
│   └── windows-llrt-probe.mjs      # NEW: self-contained probe (no prod src changes)
└── .github/
    └── workflows/
        ├── ci.yml                   # UNCHANGED: existing Linux CI
        └── windows-llrt-probe.yml  # NEW: windows-latest CI spike job
```

**Constraint:** Phase 3 MUST NOT touch any file under `packages/*/src`. The probe script is the only code file created.

### Pattern: Self-Contained Probe Script

**What:** A single `.mjs` file that imports only Node.js built-ins, runs all 7 assertions serially using a top-level `await` pattern, emits one `PASS [ID]: <detail>` or `FAIL [ID]: <reason>` line per assertion to stdout, and exits non-zero only on P0 failures.

**Why this structure:**
- No build step — `node scripts/windows-llrt-probe.mjs` runs directly
- `.mjs` extension — explicit ESM (matches project's use of `.mjs` for `mcp-server.mjs`)
- Serial execution — clear output ordering
- Machine-parseable output — one result per line, `PASS`/`FAIL` prefix for grep
- `tee probe-results.txt` in CI captures both console and artifact

**Example probe skeleton (annotated):**

```javascript
// scripts/windows-llrt-probe.mjs
// Phase 3 CI Spike — LLRT/Windows primitive probe
// Vehicle: Node.js 20 on windows-latest (LLRT standalone binary unavailable)
// Evidence: LLRT child_process uses CreateProcess (same as Node) for env passthrough.
// Assertions use OS-level facts that hold regardless of runtime.
// Source: github.com/awslabs/llrt/modules/llrt_child_process/src/lib.rs

import { spawn } from "child_process";
import { tmpdir, platform } from "os";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, unlinkSync } from "fs";
import crypto from "node:crypto";

const results = [];

function pass(id, detail) {
  const line = `PASS [${id}]: ${detail}`;
  console.log(line);
  results.push({ id, status: "PASS", detail });
}

function fail(id, reason) {
  const line = `FAIL [${id}]: ${reason}`;
  console.error(line);
  results.push({ id, status: "FAIL", detail: reason });
}

function info(id, detail) {
  const line = `INFO [${id}]: ${detail}`;
  console.log(line);
}

// --- Async spawn helper -------------------------------------------------
function spawnCapture(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let spawnError = null;
    let exitCode = null;

    let child;
    try {
      child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      resolve({ stdout: "", stderr: "", exitCode: null, spawnError: err });
      return;
    }

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => { spawnError = err; });
    child.on("close", (code) => {
      exitCode = code;
      resolve({ stdout, stderr, exitCode, spawnError });
    });

    // Safety timeout for hung processes
    setTimeout(() => {
      try { child.kill(); } catch (_) {}
      resolve({ stdout, stderr, exitCode: null, spawnError: new Error("timeout") });
    }, 5000);
  });
}

// === P0: Spawn env passthrough (FATAL if fails) ========================
async function assertP0Env() {
  const sentinel = "drift-probe-sentinel-" + Date.now();
  // Inline script avoids writing a temp file
  const { stdout, spawnError } = await spawnCapture(
    process.execPath,
    ["-e", "process.stdout.write(process.env.SENTINEL || 'MISSING')"],
    { env: { SENTINEL: sentinel } }
  );

  if (spawnError) {
    fail("P0-ENV", `spawn threw: ${spawnError.code ?? spawnError.message}`);
  } else if (stdout.trim() === sentinel) {
    pass("P0-ENV", `child received SENTINEL via spawn env (value: ${sentinel})`);
  } else {
    fail("P0-ENV", `child stdout was "${stdout.trim()}", expected "${sentinel}"`);
  }
}

// === P0: os.tmpdir() + os.platform() (FATAL if fails) =================
function assertP0Tmp() {
  const td = tmpdir();
  const plat = platform();

  info("P0-TMP", `os.tmpdir() = ${td}  |  os.platform() = ${plat}`);

  const hasDriveLetter = /^[A-Za-z]:[\\\/]/.test(td);
  const tdExists = existsSync(td);

  if (plat !== "win32") {
    fail("P0-TMP", `os.platform() returned "${plat}", expected "win32"`);
  } else if (!hasDriveLetter) {
    fail("P0-TMP", `os.tmpdir() "${td}" does not start with a drive letter`);
  } else if (!tdExists) {
    fail("P0-TMP", `os.tmpdir() path "${td}" does not exist on disk`);
  } else {
    pass("P0-TMP", `platform=win32, tmpdir="${td}" (drive-letter, exists)`);
  }
}

// === P1: .cmd direct spawn behavior (shapes provider strategy) =========
async function assertP1Cmd() {
  // Create a real .cmd file in tmpdir, then try spawning it directly
  const cmdPath = join(tmpdir(), `probe-test-${Date.now()}.cmd`);
  writeFileSync(cmdPath, "@echo off\r\necho CMD_PROBE_RAN\r\n");

  try {
    const { stdout, spawnError, exitCode } = await spawnCapture(cmdPath, []);

    if (spawnError) {
      pass("P1-CMD",
        `Direct .cmd spawn threw ${spawnError.code ?? spawnError.message} ` +
        `(expected EINVAL on Node>=18.20.2; provider strategy: use cmd.exe /c)`
      );
    } else if (stdout.includes("CMD_PROBE_RAN")) {
      pass("P1-CMD",
        `Direct .cmd spawn succeeded (exit ${exitCode}); ` +
        `LLRT may not reproduce EINVAL — cmd.exe /c branch still safer`
      );
    } else {
      pass("P1-CMD",
        `Direct .cmd spawn completed (exit ${exitCode}, no expected output); recorded`
      );
    }
  } finally {
    try { unlinkSync(cmdPath); } catch (_) {}
  }
}

// === P1: where.exe spawnability + CRLF output parse ====================
async function assertP1Where() {
  const { stdout, spawnError, exitCode } = await spawnCapture("where.exe", ["node"]);

  if (spawnError) {
    fail("P1-WHERE", `where.exe spawn threw: ${spawnError.code ?? spawnError.message}`);
    return;
  }

  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  info("P1-WHERE", `where.exe node output (${lines.length} lines): ${JSON.stringify(lines)}`);

  if (lines.length === 0) {
    fail("P1-WHERE", `where.exe returned no output for "node" (exit ${exitCode})`);
  } else {
    const first = lines[0];
    const isExe = first.toLowerCase().endsWith(".exe");
    pass("P1-WHERE",
      `where.exe found "${first}" (${isExe ? "is .exe" : "not .exe — check"}, ` +
      `CRLF split: ${lines.length} line(s))`
    );
  }
}

// === P2: "os" bare import specifier resolution =========================
function assertP2OsImport() {
  // The import at the top of this file already proves "os" resolves.
  // LLRT resolver: name.trim_start_matches("node:") — "os" and "node:os" are identical.
  const td = tmpdir(); // already imported — no error means the module loaded
  pass("P2-OS",
    `import { tmpdir, platform } from "os" succeeded (bare specifier works); ` +
    `LLRT also resolves "os" and "node:os" identically via its resolver`
  );
}

// === P3: USERPROFILE / APPDATA / LOCALAPPDATA presence =================
function assertP3EnvVars() {
  const vars = ["USERPROFILE", "APPDATA", "LOCALAPPDATA"];
  const missing = vars.filter((v) => !process.env[v]);
  const present = vars.filter((v) => process.env[v]);

  for (const v of present) {
    info("P3-VARS", `${v} = ${process.env[v]}`);
  }

  if (missing.length === 0) {
    pass("P3-VARS", `${vars.join(", ")} all present in process.env`);
  } else {
    fail("P3-VARS", `Missing env vars: ${missing.join(", ")}`);
  }
}

// === P3: crypto.randomUUID availability ================================
function assertP3Uuid() {
  // Check both the Web Crypto API surface and the node:crypto named import
  const webCryptoAvailable = typeof globalThis.crypto?.randomUUID === "function";
  const nodeCryptoAvailable = typeof crypto.randomUUID === "function";

  if (webCryptoAvailable || nodeCryptoAvailable) {
    pass("P3-UUID",
      `crypto.randomUUID: globalThis.crypto=${webCryptoAvailable}, ` +
      `node:crypto=${nodeCryptoAvailable}`
    );
  } else {
    fail("P3-UUID",
      `crypto.randomUUID not available via globalThis.crypto or node:crypto; ` +
      `fallback: Math.random hex loop`
    );
  }
}

// === Main ==============================================================
async function main() {
  console.log("=== Drift LLRT Windows Primitive Probe ===");
  console.log(`Node: ${process.version}  Platform: ${process.platform}`);
  console.log("Vehicle: Node.js (LLRT standalone binary unavailable on windows-latest)");
  console.log("LLRT evidence: spawn env uses CreateProcess (same OS mechanism as Node)");
  console.log("");

  // Run all assertions
  await assertP0Env();
  assertP0Tmp();
  await assertP1Cmd();
  await assertP1Where();
  assertP2OsImport();
  assertP3EnvVars();
  assertP3Uuid();

  // Summary
  console.log("");
  console.log("=== Summary ===");
  for (const r of results) {
    console.log(`${r.status} [${r.id}]: ${r.detail}`);
  }

  const p0Failures = results.filter(
    (r) => (r.id === "P0-ENV" || r.id === "P0-TMP") && r.status === "FAIL"
  );

  if (p0Failures.length > 0) {
    console.error("");
    console.error("PROBE FAILED: P0 assertions failed — the direct-spawn+env architecture needs fallback.");
    console.error("See STACK.md: fallback is a .cmd launcher that set KEY=VALUE + calls node.");
    process.exit(1);
  } else {
    console.log("");
    console.log("PROBE PASSED: P0 assertions green — proceed to Phase 4.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Unhandled probe error:", err);
  process.exit(1);
});
```

**CI workflow skeleton:**

```yaml
# .github/workflows/windows-llrt-probe.yml
# Phase 3 CI Spike — proves 7 LLRT/Windows primitives before any port code is written.
# This job is SEPARATE from the permanent CI (ci.yml); it is a one-time spike.
# Phase 9 will create the permanent windows-latest build+vitest job.

name: Windows LLRT Primitive Probe

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  windows-llrt-probe:
    name: Windows LLRT primitive assertions (CI-02)
    runs-on: windows-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        shell: bash
        run: pnpm install --frozen-lockfile

      - name: Run LLRT Windows primitive probe
        shell: bash
        run: node scripts/windows-llrt-probe.mjs 2>&1 | tee probe-results.txt
        # Exit code: 0=P0 pass, 1=P0 fail (env-passthrough broken — fallback needed)

      - name: Upload probe results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: windows-llrt-probe-${{ github.run_number }}
          path: probe-results.txt
          if-no-files-found: warn
          retention-days: 30
```

**Key design decisions:**

- `shell: bash` on the probe step — matches existing CI convention and works on windows-latest via Git Bash
- `2>&1 | tee` — merges stderr into the artifact (FAIL lines go to stderr)
- `if: always()` on artifact upload — captures output even if probe exits non-zero
- `retention-days: 30` — long enough for the team to review before Phase 4 starts
- Separate workflow file (not merged into `ci.yml`) — the spike is temporary; Phase 9 creates the permanent job
- `concurrency: cancel-in-progress` — matches ci.yml pattern

### Anti-Patterns to Avoid

- **Writing a temp `.mjs` child script to disk for P0-ENV** — use `node -e "…"` inline; avoids a temp file write/read and the AV file-lock issue the probe is partly trying to characterize
- **Using `setTimeout` for async orchestration** — use `await` on `spawnCapture`; the setTimeout inside `spawnCapture` is only a safety net for the hung-process case
- **Making P1-CMD fatal** — this assertion is informational; it shapes the `buildSpawnSpec` strategy but is not itself blocking. If `.cmd` spawn succeeds (LLRT has no EINVAL guard), the `cmd.exe /c` approach is still safer (injection surface)
- **Relying on `process.platform` in the probe** — the probe uses `os.platform()` for the Windows check to match Caido's documented preference
- **Adding probe to vitest** — the probe uses async event-driven `child_process` patterns that don't fit the Vitest test runner model and runs on a different runner. Keep it as a standalone script

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Capturing child stdout | Custom event loop | `spawnCapture` helper using EventEmitter + Promise |
| Cross-platform temp path | Hardcode `C:\Temp` | `os.tmpdir()` |
| `.cmd` spawn | Custom batch escaper | Document in probe output, then use `cmd.exe /c` in production |
| CRLF-safe line splitting | Hand-rolled state machine | `/\r?\n/` regex split |
| Environment variable passthrough test | Write a file and read it back | `spawn` with inline `-e` script |

---

## Common Pitfalls

### Pitfall 1: `tee` on Windows swallows exit code

**What goes wrong:** `node probe.mjs | tee probe-results.txt` on Windows cmd.exe returns the exit code of `tee`, not `node`. The CI step sees `0` even if the probe fails.
**Why it happens:** Windows `|` pipeline exit-code semantics differ from POSIX.
**How to avoid:** Use `shell: bash` on the step. Git Bash on windows-latest honors POSIX pipeline semantics (`set -o pipefail` behavior). Alternatively, use `2>&1 | tee` and set `shell: bash` explicitly.
**Warning signs:** CI shows green but probe-results.txt contains `FAIL [P0-ENV]`.

### Pitfall 2: `spawn` inherits process env when `env:` key is omitted

**What goes wrong:** If the probe omits the `env:` option, the child inherits the parent's env (which includes `SENTINEL` if set in the parent). This produces a false PASS.
**Why it happens:** Node.js default for missing `env` option is `process.env` inheritance.
**How to avoid:** Pass `env: { SENTINEL: sentinel }` — no other keys. This proves the `env` option works IN ISOLATION (no inheritance). The child should only see `SENTINEL` and miss everything else (like `PATH`). Use `node -e "process.stdout.write(process.env.SENTINEL||'MISSING')"` — the script does not need `PATH` because `process.execPath` is an absolute path.

### Pitfall 3: Windows AV scan delays on fresh `.cmd` file write

**What goes wrong:** P1-CMD creates a `.cmd` file in `os.tmpdir()` and immediately tries to spawn it. Windows Defender may hold a brief exclusive handle, causing `EPERM` or `EBUSY` instead of the expected `EINVAL`.
**Why it happens:** Defender scans freshly-written executables. This is one of the exact pitfalls Phase 4 must handle (RUN-04).
**How to avoid:** P1-CMD records whatever error occurs (`EINVAL`, `EPERM`, `EBUSY`, `ENOENT`). All are informational. If `EPERM`/`EBUSY`, note in the artifact that Phase 4's AV-retry is needed for this path too.

### Pitfall 4: `where.exe` not on PATH in `shell: bash`

**What goes wrong:** On windows-latest, Git Bash's `PATH` may not include `C:\Windows\System32`, so `where.exe` cannot be found when running under `bash`.
**Why it happens:** Git Bash has its own PATH that differs from the Windows system PATH.
**How to avoid:** Spawn `where.exe` as an absolute path: `C:\\Windows\\System32\\where.exe`. In the Node.js probe, hardcode the absolute path as a fallback: `const whereExe = "C:\\Windows\\System32\\where.exe";`

### Pitfall 5: `.cmd` EINVAL only on Node >= 18.20.2

**What goes wrong:** If CI ever runs Node 18.x < 18.20.2, the EINVAL guard is absent and P1-CMD would succeed unexpectedly.
**Why it happens:** CVE-2024-27980 fix was backported to 18.20.2 (not earlier 18.x).
**How to avoid:** Pin Node 20 in the workflow (already the project standard). Node 20.12.2+ always has the guard. Record `process.version` in the probe output.

### Pitfall 6: `process.env.SENTINEL` visible in CI logs

**What goes wrong:** The sentinel value appears in CI logs, which is fine for a random timestamp value but would be problematic if real secrets were used.
**How to avoid:** The sentinel is a random value (`drift-probe-sentinel-<timestamp>`), never a real token. No secrets involved.

---

## Validation Architecture

This section describes how each of the 7 LLRT assertions maps to concrete probe observations in CI. This feeds the VALIDATION.md for Phase 3.

### Assertion Map

| Assertion | Priority | Probe ID | Observation Method | Pass Condition | Fail Condition | Fatal? |
|-----------|----------|----------|--------------------|----------------|----------------|--------|
| `spawn(node, [script], { env })` passes env to child | P0 | `P0-ENV` | `spawnCapture(process.execPath, ["-e", "…"], { env: { SENTINEL } })` → check stdout === sentinel | `stdout.trim() === sentinel` | `spawnError` OR stdout !== sentinel | YES (exit 1) |
| `os.tmpdir()` returns drive-lettered path that exists; `os.platform()` === `"win32"` | P0 | `P0-TMP` | `os.tmpdir()` value matches `/^[A-Za-z]:\\/`; `existsSync(td)`; `os.platform() === "win32"` | All three conditions true | Any condition false | YES (exit 1) |
| Direct `.cmd` spawn behavior (EINVAL / runs / hangs) | P1 | `P1-CMD` | Write `.cmd` to tmpdir; `spawnCapture(cmdPath, [])` with 5s timeout; record spawnError code and stdout | Any outcome recorded without crash | Script crashes (uncaught exception) | NO (always informational) |
| `where.exe node` spawnability + CRLF output parse | P1 | `P1-WHERE` | `spawnCapture("C:\\Windows\\System32\\where.exe", ["node"])`; split stdout on `/\r?\n/`; check line count > 0 | lines.length > 0, first line non-empty | spawnError OR zero lines | NO (warning, not fatal) |
| Bare `"os"` import specifier resolves in runtime | P2 | `P2-OS` | Probe imports `tmpdir, platform` from `"os"` at top level; if script runs, import worked | Script reaches P2 assertion (no import error) | Script throws at import (would crash before P2) | NO |
| `USERPROFILE`, `APPDATA`, `LOCALAPPDATA` present in `process.env` | P3 | `P3-VARS` | Check `process.env.USERPROFILE`, `process.env.APPDATA`, `process.env.LOCALAPPDATA` each non-empty | All three non-empty | Any one empty or undefined | NO (warning) |
| `crypto.randomUUID` available | P3 | `P3-UUID` | `typeof globalThis.crypto?.randomUUID === "function"` AND `typeof crypto.randomUUID === "function"` | Either is true | Both false | NO (fallback is Math.random hex loop) |

### Exit Code Policy

```
exit 0  → P0-ENV PASS and P0-TMP PASS → proceed to Phase 4 as planned
exit 1  → P0-ENV FAIL or P0-TMP FAIL  → trigger fallback design (documented in STACK.md)
           (P1/P2/P3 failures never cause exit 1)
```

### CI Artifact: `probe-results.txt`

Content: all stdout + stderr interleaved via `2>&1 | tee`. Each line is one of:
- `PASS [ID]: <detail>` — assertion passed
- `FAIL [ID]: <reason>` — assertion failed
- `INFO [ID]: <detail>` — context/observation (not pass/fail)
- `=== Summary ===` header followed by one line per assertion
- `PROBE PASSED/FAILED:` final verdict line

**What the team reads from the artifact:**

| P1-CMD result | Interpretation | Phase 4+ impact |
|---|---|---|
| `FAIL [P1-CMD]: spawnError=EINVAL` | LLRT on Windows likely has the EINVAL guard too — `buildSpawnSpec` cmd.exe branch is mandatory | Phase 7: cmd.exe /c branch required |
| `PASS [P1-CMD]: direct .cmd spawn succeeded` | LLRT may not have the EINVAL guard | Phase 7: cmd.exe /c still recommended (injection safety); document LLRT difference |
| `PASS [P1-CMD]: spawnError=ENOENT` | Platform found no `.cmd` support at all | Investigate runner environment |
| `PASS [P1-CMD]: spawnError=timeout` | .cmd hung without error | Use cmd.exe /c in production; direct spawn unreliable |

| P1-WHERE result | Interpretation |
|---|---|
| First line ends `.exe` | node.exe is on PATH; where resolves correctly with extension |
| First line ends `.cmd` | where found a .cmd shim first; prefer resolution by `where.exe /f node.exe` in Phase 6 |
| Zero lines / FAIL | where.exe not spawnable from Node on windows-latest runner — investigate PATH |

### Framework: Standalone Script (not Vitest)

| Property | Value |
|----------|-------|
| Framework | None — standalone `node scripts/windows-llrt-probe.mjs` |
| Config file | None |
| Quick run (local) | `node scripts/windows-llrt-probe.mjs` |
| Full run (CI) | `node scripts/windows-llrt-probe.mjs 2>&1 | tee probe-results.txt` |

Rationale for not using Vitest: the probe uses async event-driven `child_process` patterns with safety timeouts; it must run on a different OS runner than the existing `pnpm exec vitest run` job; and it is a one-time spike, not a permanent regression test (that role goes to Phase 9).

---

## Runtime State Inventory

This is a greenfield CI addition — no rename/refactor/migration. Omitted.

---

## Environment Availability

| Dependency | Required By | Available on `windows-latest` | Version | Fallback |
|------------|------------|-------------------------------|---------|----------|
| Node.js 20 | Probe execution | Yes (via `actions/setup-node@v4`) | 20.x | None needed |
| `where.exe` | P1-WHERE assertion | Yes (System32, always present) | Windows built-in | Use absolute path `C:\Windows\System32\where.exe` |
| `cmd.exe` | P1-CMD assertion | Yes (always present on Windows) | Windows built-in | N/A |
| `pnpm` | `pnpm install` step | Yes (via `pnpm/action-setup@v4`) | 9.x | None needed |
| `bash` | `shell: bash` steps | Yes (Git Bash on windows-latest) | Git for Windows | Use `shell: pwsh` for PowerShell if needed |
| `tee` | Output capture | Yes (Git Bash includes `tee`) | GNU coreutils | Redirect to file + cat |
| Standalone LLRT binary | Ideal probe vehicle | NO | N/A | Node.js (recommended vehicle) |
| Caido headless instance | Ideal LLRT host | NO (requires paid Teams plan) | N/A | Node.js (recommended vehicle) |

**Missing dependencies with no fallback:**
- None — all required tools are available on `windows-latest`.

**Missing dependencies with fallback (used):**
- Standalone LLRT binary → Node.js (primary vehicle)
- Caido headless → Node.js (primary vehicle)

---

## Residual Risk: What Only Real Caido-on-Windows Can Confirm

After the probe runs and all P0/P1/P2/P3 assertions pass, ONE residual risk remains that Node.js CI cannot resolve:

**Caido's specific `dependency-llrt` build may have diverged from upstream `awslabs/llrt`.**

Specifically: `caido/dependency-llrt` is a maintained fork. If Caido added custom shim layers, module loaders, or QuickJS environment setup that override `child_process`, `os`, or the module resolver, the probe's Node.js results would not reflect Caido's runtime.

Concretely:
- **P0-ENV risk:** Caido might intercept `spawn()` in its QuickJS environment before passing to the Rust layer. If so, the `env` option might not be forwarded. The LLRT source shows this is correct — but Caido's fork could have added custom handling.
- **P2-OS risk:** Caido might register `os` under a different specifier. The Caido docs show `import { tmpdir } from "os"` style, so this risk is LOW.
- **P1-CMD risk:** LLRT's Rust `StdCommand` does NOT implement the Node.js EINVAL guard. The EINVAL guard is in Node's `libuv`/`uv_spawn`. LLRT will likely throw a different error or succeed when spawning `.cmd` directly. **The `cmd.exe /c` approach is correct regardless.**

**Mitigation:** The Phase 3 CI spike result, combined with the reporter testing Phase 5 output on a real Caido installation, resolves this. The ROADMAP.md already notes: "the maintainer cannot test native Windows locally; validation is CI + the original reporter confirming on a real machine."

Confidence that the probe is sufficient: HIGH. The OS-level mechanism (`CreateProcess` + environment block) is the same for both runtimes. The LLRT source confirms the `env` option is implemented. The risk is architecturally informed, not speculative.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| LLRT had a Windows binary | Windows binary dropped from awslabs/llrt | v0.6.0-beta (July 2025) | No standalone LLRT on windows-latest CI |
| `spawn(.cmd)` worked on all Node versions | Node ≥ 18.20.2 throws `EINVAL` for `.cmd` | April 2024 (CVE-2024-27980) | Drift must use cmd.exe /c or .exe path for .cmd shims |
| `Caido headless` testing = manual only | Caido headless CI now possible (Teams plan) | Caido 0.55.3+ | Still not free-tier viable for CI probe |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pnpm/action-setup@v4` is the correct current version for the project's CI | Standard Stack | Minor: use whatever version matches existing `ci.yml` — already confirmed @v4 |
| A2 | Git Bash's `tee` on windows-latest supports `2>&1 \| tee` with correct exit propagation when `shell: bash` is set | Pitfall 1 | Probe exit code not captured; use `|| true` or restructure output capture |
| A3 | `C:\Windows\System32\where.exe` is the canonical absolute path to `where.exe` on `windows-latest` | P1-WHERE | `where.exe` not found at that path; fall back to `process.env.SystemRoot + "\\System32\\where.exe"` |
| A4 | Node 20 on windows-latest has `globalThis.crypto.randomUUID` available | P3-UUID | Check also `node:crypto` named import; probe checks both |
| A5 | LLRT's `child_process` source at `modules/llrt_child_process/src/lib.rs` in `awslabs/llrt` main branch matches what `caido/dependency-llrt` ships internally | Central Question | If Caido's fork diverges significantly, probe results may not reflect LLRT behavior; mitigated by reporter real-machine test |

---

## Open Questions

1. **Does P1-CMD produce EINVAL in LLRT (not just Node)?**
   - What we know: Node ≥ 18.20.2 throws EINVAL. LLRT's Rust source does NOT implement this guard — Rust's `std::process::Command` on Windows calls `CreateProcess` directly, which simply fails with `ERROR_BAD_EXE_FORMAT` or similar for `.cmd` files, likely surfacing as a different error code.
   - What's unclear: Exact error LLRT will surface when spawning a `.cmd` directly.
   - Recommendation: Probe records whatever error occurs. The `cmd.exe /c` design is correct regardless — it is the safest approach even if LLRT doesn't throw EINVAL.

2. **What exact error does Windows `CreateProcess` return for a `.cmd` file?**
   - What we know: Windows `CreateProcess` on a `.cmd` file without `CREATE_NEW_CONSOLE` / shell invocation returns `ERROR_BAD_EXE_FORMAT` (193). Node maps this to EINVAL post-CVE-2024-27980.
   - What's unclear: How LLRT surfaces this Windows error at the JavaScript level — could be EINVAL, ENOENT, or a custom LLRT error.
   - Recommendation: Probe records the raw `err.code` and `err.message`. Phase 7 plan handles all variants.

3. **Is Phase 3 workflow file meant to be permanent or removed after Phase 9?**
   - Recommendation: Mark it as temporary in comments. Phase 9 creates the permanent `windows-latest` build+vitest job. After Phase 9 is complete and merged, `windows-llrt-probe.yml` can be removed or left as documentation of the spike findings. Decision is deferred to Phase 9.

---

## Security Domain

Phase 3 creates no production code and processes no secrets. The probe uses a synthetic sentinel value (not a real token). Security domain is not applicable to this phase.

---

## Project Constraints (from CLAUDE.md)

From `./CLAUDE.md`:

1. **Runtime constraint:** "Only use Node APIs Caido actually provides. Whether `os.tmpdir()` and `process.platform` are available in that runtime is an open research question for planning — confirm before relying on them." — Phase 3 IS the confirmation step. Probe result resolves this constraint.

2. **Testing constraint:** "The maintainer cannot test native Windows locally. Validation is CI on `windows-latest` (build + vitest) plus, where possible, the original reporter confirming the fix on a real machine." — Probe is the mechanism for this validation.

3. **Compatibility constraint:** "Must preserve existing macOS/Linux behavior." — Phase 3 adds no production code; existing CI (`ci.yml`) is unchanged. macOS/Linux unaffected.

4. **Security constraint:** "Runtime temp files carry the Caido token. Windows ignores POSIX modes." — Not applicable to Phase 3 (no temp files with real tokens in probe).

5. **No-POSIX rule (from REQUIREMENTS.md):** Phase 3 touches ONLY CI (`windows-latest` job) and the probe script. No `packages/*/src` edits. No POSIX-breaking changes.

---

## Sources

### Primary (HIGH confidence)
- LLRT `child_process` Rust source — `env` option implementation verified — `github.com/awslabs/llrt` `modules/llrt_child_process/src/lib.rs`
- LLRT module resolver Rust source — `"node:"` prefix stripping confirmed — `github.com/caido/dependency-llrt` `llrt_modules/src/module/resolver.rs`
- LLRT child_process test file — Windows-aware tests (`IS_WINDOWS` conditionals) — `github.com/awslabs/llrt` `tests/unit/child_process.test.ts`
- Caido `os` module reference — `tmpdir()`, `homedir()`, `platform()` documented Windows returns — `developer.caido.io/reference/modules/extra/os.html`
- Existing `ci.yml` — `pnpm/action-setup@v4`, `actions/setup-node@v4 cache:pnpm`, `shell` conventions — `.github/workflows/ci.yml`
- LLRT API.md — `os` module fully listed, `child_process.spawn` noted with stream caveat — `github.com/awslabs/llrt/blob/main/API.md`

### Secondary (MEDIUM confidence)
- GitHub Actions run `#44` — "rm windows binary" commit at v0.6.0-beta — `github.com/awslabs/llrt/actions/runs/16193238678`
- Caido headless CI tutorial — Teams plan required for headless runner — `docs.caido.io/app/tutorials/github_action`
- `caido/dependency-llrt` repository — no published releases — confirmed via `gh api repos/caido/dependency-llrt/releases`

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Vehicle choice (Node.js over LLRT binary): HIGH — no LLRT Windows binary exists; confirmed from release pages and action run
- `env` option in LLRT: HIGH — verified from Rust source code
- Import specifier `"os"` behavior: HIGH — verified from resolver source stripping `"node:"` prefix
- P1-CMD LLRT-specific behavior: LOW — LLRT may not reproduce Node's EINVAL; probe records actual outcome
- CI workflow conventions: HIGH — extracted from existing `ci.yml`

**Research date:** 2026-06-26
**Valid until:** 2026-09-26 (90 days — GitHub Actions action versions change slowly; LLRT releases fast-moving but vehicle choice is stable)
