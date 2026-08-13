#!/usr/bin/env node
/**
 * Drift Windows/LLRT primitive probe — Phase 3 CI spike (requirement CI-02).
 *
 * What this is: a zero-dependency, one-shot diagnostic that answers the seven
 * OS/runtime assertions the whole Windows port is calibrated against — P0-ENV,
 * P0-TMP, P1-CMD, P1-WHERE, P2-OS, P3-VARS, P3-UUID — and maps the gating
 * subset of those answers onto an exit code.
 *
 * How it is run: `node scripts/windows-llrt-probe.mjs`, from the repository
 * root. Its authoritative run is on `windows-latest` in CI, where stdout+stderr
 * are tee'd into probe-results.txt and uploaded as an artifact. It also runs on
 * a POSIX dev host, where P0-TMP is expected to fail on the platform check —
 * that local run is the phase's falsifiability evidence that the P0 gate really
 * drives the exit code.
 *
 * Runtime vehicle: Node.js, NOT LLRT. No standalone LLRT Windows binary exists
 * — upstream dropped the Windows target at v0.6.0-beta and caido/dependency-llrt
 * has no published releases — so LLRT itself cannot be executed here. P0-ENV and
 * P0-TMP remain faithful: LLRT's child_process goes through
 * tokio::process::Command, i.e. the same Windows CreateProcess that Node reaches
 * through libuv, and LLRT's `env` option calls env_clear() + envs() with no
 * Windows-specific branch. P2-OS and P3-UUID are properties of the *runtime*
 * rather than of the OS, so their result lines carry an explicit non-LLRT label
 * (decision D-08) — without it a reader of the archived artifact months from now
 * would believe LLRT itself was exercised.
 *
 * Lifetime: temporary by design. This file and its workflow are deleted in
 * Phase 9, when CI-01 lands the permanent windows-latest regression job (D-02).
 *
 * Credential handling: none. The one secret-shaped value is a synthetic
 * sentinel of the form drift-probe-sentinel-<timestamp>, generated in-process.
 * The probe never reads a Caido credential, and it never enumerates or dumps
 * the environment — the three Windows variables P3-VARS reports are named
 * explicitly, one by one (D-10).
 */

import { spawn } from "node:child_process";
// The un-prefixed specifier here is DELIBERATE and must stay un-prefixed:
// P2-OS's entire assertion is that a bare built-in specifier resolves in the
// runtime. Rewriting this to "node:os" would make P2-OS assert nothing. Every
// other import in this file uses the node: prefix.
import { tmpdir, platform } from "os";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// Named import rather than a default `crypto` import, so the readonly global
// `crypto` is not shadowed — P3-UUID has to test the globalThis surface and the
// node:crypto surface separately.
import { randomUUID } from "node:crypto";

// ── Assertion registry ──────────────────────────────────────────────

// Declared once, frozen, and iterated by the summary block. The summary walks
// THIS array (not `results`), so an assertion that never ran still produces a
// line — an aborted probe fails loudly instead of emitting a short artifact
// that reads as a partial pass.
const ASSERTION_IDS = Object.freeze([
  "P0-ENV",
  "P0-TMP",
  "P1-CMD",
  "P1-WHERE",
  "P2-OS",
  "P3-VARS",
  "P3-UUID",
]);

// The only IDs that influence the exit code (D-05, D-06, D-07). P1-WHERE,
// P2-OS, P3-VARS and P3-UUID are informational and must never gate (D-09).
const GATING_IDS = Object.freeze(["P0-ENV", "P0-TMP", "P1-CMD"]);

const SPAWN_TIMEOUT_MS = 5000;

// Hoisted so the probe contains EXACTLY ONE occurrence of the Windows platform
// literal. Two assertions need it — P0-TMP's platform guard and P1-CMD's
// refusal to draw a .cmd conclusion off-platform — and plan 03-04's
// falsifiability mutation flips this one character sequence and nothing else.
// Inlining it a second time would give that mutation two sites and silently
// halve its blast radius.
const WINDOWS_PLATFORM_ID = "win32";

// The errnos that constitute a conclusive answer about direct .cmd spawning
// under D-07. EINVAL is Node's CVE-2024-27980 guard (>= 18.20.2); EPERM/EBUSY
// are a Defender or AppLocker handle on the file; ENOENT and ENOEXEC are the
// image-activation refusals. Anything outside this set — notably EACCES from a
// locked-down TEMP — says something about the host, not about .cmd semantics,
// and must escalate as indeterminate rather than be promoted to an
// architectural verdict for Phases 4-8.
const CONCLUSIVE_CMD_ERRNOS = Object.freeze([
  "EINVAL",
  "EPERM",
  "EBUSY",
  "ENOENT",
  "ENOEXEC",
]);

// ── Output grammar: SINGLE EMISSION ─────────────────────────────────
//
// pass() and fail() are RECORDERS, not printers. They push onto `results` and
// print nothing at call time. The `=== Summary ===` block at the end of main()
// is the ONLY place in this file that produces a line matching
// ^PASS [<ID>]:  or  ^FAIL [<ID>]: .
//
// This is load-bearing, not stylistic. Plans 03-03 and 03-04 verify the CI
// artifact with `grep -cE "^(PASS|FAIL) \[<ID>\]:" probe-results.txt` and
// require exactly 1 for each of the seven IDs. If pass()/fail() also printed
// inline, every one of those counts would be 2 and a CORRECT probe would fail
// its own verification. Do not add an inline status print "for visibility" —
// info() is the progress and diagnostic channel and is unlimited.
//
// Nothing is written to stderr deliberately; stderr stays reserved for uncaught
// runtime noise, which the workflow's `2>&1` still folds into the artifact.

const results = [];

// Collapses embedded newlines so one record can never become two output lines.
function oneLine(value) {
  return String(value).replace(/\s*\r?\n\s*/g, " ");
}

function info(id, detail) {
  process.stdout.write(`INFO [${id}]: ${oneLine(detail)}\n`);
}

function pass(id, detail) {
  results.push({ id, status: "PASS", detail: oneLine(detail) });
}

function fail(id, reason) {
  results.push({ id, status: "FAIL", detail: oneLine(reason) });
}

function describeError(error) {
  if (!error) return "none";
  return `${error.code ?? "no-code"}: ${error.message ?? "no-message"}`;
}

// ── Spawn helper ────────────────────────────────────────────────────
//
// Resolves (never rejects) to one of four surfaces — "throw", "error", "close",
// "timeout" — because on Windows the failure modes P1-CMD characterizes arrive
// through different channels and a result the probe cannot classify is a job
// failure under D-07.
//
// Shape copied from the shipped helpers: index.ts:852-875 (settled flag on all
// paths, clearTimeout on the non-timeout paths, SIGKILL + `catch { ... }` on the
// timeout path) and index.ts:1519-1529 (resolve on BOTH close and error). The
// synchronous try/catch around spawn() itself is what catches Node's
// CVE-2024-27980 guard, which throws out of spawn() for a .cmd target rather
// than emitting an error event.
function spawnCapture(cmd, args, opts = {}, timeoutMs = SPAWN_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolve({ surface: "throw", stdout: "", stderr: "", exitCode: null, error });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
      resolve({ surface: "timeout", stdout, stderr, exitCode: null, error: undefined });
    }, timeoutMs);

    // Stream errors are a SEPARATE emitter from child.on("error"), and an
    // 'error' with no listener is re-thrown as an uncaught exception. That
    // would reject the top-level await main() and skip the `=== Summary ===`
    // block entirely, uploading an artifact with zero PASS/FAIL lines on a red
    // job — evidence destroyed on exactly the run where it matters most. The
    // reachable trigger is this helper's own timeout path: SIGKILL maps to
    // TerminateProcess on Windows, and reading a named pipe whose writer was
    // abruptly terminated is a known ECONNRESET/EPIPE source. Swallowing is
    // correct here — by the time a pipe tears down, the surface is already
    // classified and whatever bytes arrived are already in `stdout`/`stderr`.
    child.stdout?.on("error", () => { /* pipe teardown; the surface is already classified */ });
    child.stderr?.on("error", () => { /* pipe teardown; the surface is already classified */ });
    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ surface: "close", stdout, stderr, exitCode: code, error: undefined });
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ surface: "error", stdout, stderr, exitCode: null, error });
    });
  });
}

// ── P0-ENV: spawn env passthrough (gates the exit code, D-05) ───────
//
// Drift does not pass an `env` option to spawn() anywhere in production today
// (index.ts:1191 and index.ts:2188 pass only stdio); environment injection runs
// through a #!/bin/bash wrapper that exports and execs. That wrapper cannot
// exist on Windows, so this assertion is not confirming an existing mechanism —
// it is proving the REPLACEMENT mechanism before code is written on top of it.

// Set in the PARENT process only, and deliberately absent from the env block
// handed to the child. The name matters: libuv's make_program_env()
// (src/win/process.c) back-fills a fixed eleven-name required_vars[] list —
// HOMEDRIVE, HOMEPATH, LOGONSERVER, PATH, SYSTEMDRIVE, SYSTEMROOT, TEMP,
// USERDOMAIN, USERNAME, USERPROFILE, WINDIR — into whatever block the caller
// supplies, so on Windows every one of those eleven appears in the child even
// when the block was fully replaced. PATH is on that list, which is why PATH
// alone cannot discriminate replace-from-merge on the one platform this probe
// exists to measure. This marker is on neither the required_vars list nor the
// supplied block, so its presence in the child is the discriminator that
// carries information on BOTH platforms.
const PARENT_ONLY_MARKER = "DRIFT_PROBE_PARENT_ONLY";
process.env[PARENT_ONLY_MARKER] = "1";

const ENV_CHILD_SCRIPT =
  "process.stdout.write((process.env.SENTINEL || 'MISSING') + '|' + " +
  "(process.env.PATH ? 'PATH-VISIBLE' : 'PATH-ABSENT') + '|' + " +
  `(process.env.${PARENT_ONLY_MARKER} ? 'PARENT-INHERITED' : 'PARENT-CLEARED'))`;

async function assertP0Env() {
  const sentinel = `drift-probe-sentinel-${Date.now()}`;
  info("P0-ENV", `spawning ${process.execPath} -e <inline> with env={SENTINEL} and nothing else (execPath is absolute, so the child needs no PATH to start)`);

  const isolated = await spawnCapture(
    process.execPath,
    ["-e", ENV_CHILD_SCRIPT],
    { env: { SENTINEL: sentinel } },
    SPAWN_TIMEOUT_MS,
  );
  const isolatedFields = isolated.stdout.trim().split("|");
  info("P0-ENV", `isolated-env surface=${isolated.surface} exit=${isolated.exitCode} stdout=${JSON.stringify(isolated.stdout)} stderr=${JSON.stringify(isolated.stderr)} error=${describeError(isolated.error)}`);

  if (isolatedFields[0] === sentinel) {
    // Fields 2 and 3 are what Phases 4-8 cannot recover from a bare PASS:
    // whether the env option REPLACED the parent block or merged into it
    // decides whether their spawn options must spread ...process.env. Field 3
    // (the parent-only marker) is the discriminator; field 2 (PATH) is recorded
    // for the record but is NOT evidence either way on Windows, because PATH is
    // one of libuv's eleven back-filled names.
    const pathVisibility = isolatedFields[1] ?? "UNREPORTED";
    const parentBlock = isolatedFields[2] ?? "UNREPORTED";
    let inheritance;
    if (parentBlock === "PARENT-CLEARED") {
      inheritance = "replaced";
    } else if (parentBlock === "PARENT-INHERITED") {
      inheritance = "merged into";
    } else {
      inheritance = "had an UNDETERMINED relationship to";
    }
    info("P0-ENV", `on this host (${process.platform}) the env option ${inheritance} the parent environment block: the parent-only marker ${PARENT_ONLY_MARKER} — set in the parent, omitted from the supplied block, and absent from libuv's eleven Windows required_vars — came back ${parentBlock} in the child`);
    info("P0-ENV", `PATH separately came back ${pathVisibility}, and that field is deliberately NOT the discriminator: PATH is one of the eleven names libuv back-fills on Windows, so a PATH-VISIBLE reading there is manufactured by the back-fill and does not license "the parent block is inherited". Read the marker, not PATH`);
    info("P0-ENV", `regardless of which way the marker read on this host, Phases 4-8 must pass every variable they need explicitly — { ...process.env, ...driftVars }, never { ...driftVars } — because APPDATA and LOCALAPPDATA, the two command-resolution.ts needs for the Windows nvm/fnm paths, are on neither the supplied block nor libuv's eleven`);
    pass("P0-ENV", `child received SENTINEL=${sentinel} through the spawn env option; measured on ${process.platform}, that option ${inheritance} the parent environment (parent-only marker ${parentBlock}; PATH ${pathVisibility}, which is back-filled on Windows and therefore not evidence)`);
    return;
  }

  // D-05 turns a P0-ENV failure into a blocker that halts Phase 4, and the
  // blocker text has to name what is being decided — so the failure must be
  // conclusive about WHICH mechanism broke, not a generic message.
  info("P0-ENV", `the isolated env block did not deliver the sentinel; retrying once with { ...process.env, SENTINEL } to separate "env option ignored" from "cleared env block breaks the child"`);
  const merged = await spawnCapture(
    process.execPath,
    ["-e", ENV_CHILD_SCRIPT],
    { env: { ...process.env, SENTINEL: sentinel } },
    SPAWN_TIMEOUT_MS,
  );
  const mergedFields = merged.stdout.trim().split("|");
  info("P0-ENV", `merged-env surface=${merged.surface} exit=${merged.exitCode} stdout=${JSON.stringify(merged.stdout)} stderr=${JSON.stringify(merged.stderr)} error=${describeError(merged.error)}`);

  if (mergedFields[0] === sentinel) {
    fail("P0-ENV", `the spawn env option IS honoured — the merged retry delivered the sentinel — but a fully-cleared environment block breaks the child on this host (isolated: surface=${isolated.surface} exit=${isolated.exitCode} stdout=${JSON.stringify(isolated.stdout)} error=${describeError(isolated.error)}). Phase 4 must always merge the parent block rather than replace it`);
  } else {
    fail("P0-ENV", `the spawn env option is not reaching the child at all — both the isolated and the merged form failed (isolated: surface=${isolated.surface} stdout=${JSON.stringify(isolated.stdout)} error=${describeError(isolated.error)}; merged: surface=${merged.surface} stdout=${JSON.stringify(merged.stdout)} error=${describeError(merged.error)}). Drift's env-injection architecture needs the documented .cmd-launcher fallback`);
  }
}

// ── P0-TMP: os.tmpdir() + os.platform() (gates the exit code, D-06) ─

function assertP0Tmp() {
  // Deliberately the bare-imported os functions, not process.platform: the
  // Windows port reads os.tmpdir()/os.platform(), so those are what must hold.
  const tempDir = tmpdir();
  const osPlatform = platform();
  info("P0-TMP", `os.tmpdir()=${JSON.stringify(tempDir)} os.platform()=${JSON.stringify(osPlatform)}`);

  const hasDriveLetter = /^[A-Za-z]:[\\/]/.test(tempDir);
  const tempDirExists = existsSync(tempDir);
  info("P0-TMP", `drive-letter=${hasDriveLetter} exists-on-disk=${tempDirExists}`);

  if (osPlatform !== WINDOWS_PLATFORM_ID) { // the literal lives on WINDOWS_PLATFORM_ID — plan 03-04 mutates exactly that one site
    fail("P0-TMP", `os.platform() returned ${JSON.stringify(osPlatform)}, which is not the Windows platform id — this host is not Windows, so the Windows temp-dir assertion cannot be satisfied here`);
    return;
  }
  if (!hasDriveLetter) {
    fail("P0-TMP", `os.tmpdir() returned ${JSON.stringify(tempDir)}, which does not start with a drive letter — the Windows temp path is not in the expected form`);
    return;
  }
  if (!tempDirExists) {
    fail("P0-TMP", `os.tmpdir() returned ${JSON.stringify(tempDir)} but that path does not exist on disk`);
    return;
  }
  pass("P0-TMP", `platform is Windows and os.tmpdir()=${JSON.stringify(tempDir)} is drive-lettered and exists on disk`);
}

// ── P1-CMD: direct .cmd spawn behaviour (conclusive-or-fail, D-07) ──
//
// The three legitimate outcomes — errors / runs / hangs — each select a
// different architecture for Phases 4-8, so a "wrong" answer is not a failure.
// An outcome the probe cannot CLASSIFY is the failure, because it leaves Phase 4
// with no architectural basis at all.
//
// "Classified" is narrower than "the spawn did something". Two guards keep an
// unrelated host condition from being promoted to a .cmd verdict: the platform
// must be Windows (a POSIX exec outcome on a file named .cmd measures the POSIX
// loader, not Windows), and any error surface must carry an errno from
// CONCLUSIVE_CMD_ERRNOS. Everything else records FAIL/indeterminate, which is
// what D-07 asks for — an escalation, not a false conclusive on a gating ID.

async function assertP1Cmd() {
  const hostPlatform = platform();
  const onWindows = hostPlatform === WINDOWS_PLATFORM_ID;
  const cmdPath = join(tmpdir(), `probe-test-${Date.now()}.cmd`);
  let written = false;

  try {
    try {
      writeFileSync(cmdPath, "@echo off\r\necho CMD_PROBE_RAN\r\n");
      written = true;
    } catch (error) {
      info("P1-CMD", `could not write the probe .cmd at ${cmdPath}: ${describeError(error)}`);
      fail("P1-CMD", `indeterminate — writing the probe .cmd to ${cmdPath} on ${hostPlatform} failed (${describeError(error)}), so no spawn surface was observed at all`);
      return;
    }

    info("P1-CMD", `wrote ${cmdPath} with CRLF line endings; spawning it directly on ${hostPlatform} with a ${SPAWN_TIMEOUT_MS} ms bound`);
    const observed = await spawnCapture(cmdPath, [], {}, SPAWN_TIMEOUT_MS);
    // Raw observation first, so it is in the artifact independently of how the
    // classification below turned out.
    info("P1-CMD", `surface=${observed.surface} exit=${observed.exitCode} stdout=${JSON.stringify(observed.stdout)} stderr=${JSON.stringify(observed.stderr)} error=${describeError(observed.error)}`);

    // Platform guard FIRST. Off Windows this spawn measured the POSIX loader:
    // an EACCES from a missing execute bit, or — if the fixture happens to be
    // executable — /bin/sh running `echo CMD_PROBE_RAN` and producing the
    // marker. Both would otherwise be recorded as a conclusive .cmd verdict on
    // a gating ID, which is exactly the false-green the exit contract exists to
    // prevent.
    if (!onWindows) {
      fail("P1-CMD", `indeterminate — this host is ${hostPlatform}, not Windows, so the observed surface=${observed.surface} (${describeError(observed.error)}) is an ordinary POSIX exec outcome for a file that merely has a .cmd suffix and says nothing about how Windows handles a direct .cmd spawn. Only a windows-latest run can answer this; the exit code gates on it deliberately (D-07)`);
      return;
    }

    const errno = observed.error?.code;
    const conclusiveErrno = typeof errno === "string" && CONCLUSIVE_CMD_ERRNOS.includes(errno);

    if (observed.surface === "throw" || observed.surface === "error") {
      if (!conclusiveErrno) {
        fail("P1-CMD", `indeterminate — surface=${observed.surface} on ${hostPlatform} with ${describeError(observed.error)}, whose errno is not one D-07 recognises as a .cmd answer (${CONCLUSIVE_CMD_ERRNOS.join(", ")}). An EACCES from a locked-down TEMP or any other host condition describes this machine, not .cmd semantics, so Phase 4 has no architectural basis and the job must break`);
      } else if (observed.surface === "throw") {
        pass("P1-CMD", `spawn-threw-sync — on ${hostPlatform}, spawn() threw synchronously with ${describeError(observed.error)} (EINVAL is expected on Node >= 18.20.2 from the CVE-2024-27980 guard; EPERM/EBUSY from a Defender handle, ENOENT and ENOEXEC are equally conclusive). Phases 4-8 must route .cmd targets through cmd.exe /c`);
      } else {
        pass("P1-CMD", `spawn-error-event — on ${hostPlatform}, the child emitted an error event with ${describeError(observed.error)} (conclusive: direct .cmd spawn is not usable on this host, so Phases 4-8 must route .cmd targets through cmd.exe /c)`);
      }
    } else if (observed.surface === "close" && observed.stdout.includes("CMD_PROBE_RAN")) {
      pass("P1-CMD", `ran — on ${hostPlatform}, the direct .cmd spawn produced the CMD_PROBE_RAN marker and closed with exit ${observed.exitCode} (conclusive: this runtime has no .cmd guard; cmd.exe /c is still the safer branch for argument handling)`);
    } else if (observed.surface === "timeout") {
      pass("P1-CMD", `hung — on ${hostPlatform}, the direct .cmd spawn produced no terminal event within ${SPAWN_TIMEOUT_MS} ms and was SIGKILLed (conclusive: direct .cmd spawn is unreliable, so Phases 4-8 must route .cmd targets through cmd.exe /c)`);
    } else {
      fail("P1-CMD", `indeterminate — surface=${observed.surface} exit=${observed.exitCode} on ${hostPlatform} with no CMD_PROBE_RAN marker; stdout=${JSON.stringify(observed.stdout)} stderr=${JSON.stringify(observed.stderr)} error=${describeError(observed.error)}. This is none of D-07's three legitimate outcomes, so Phase 4 has no architectural basis and the job must break`);
    }
  } finally {
    if (written) {
      try { unlinkSync(cmdPath); } catch { /* ignore */ }
    }
  }
}

// ── P1-WHERE: where.exe spawnability + CRLF parse (no gate, D-09) ───

async function assertP1Where() {
  // Absolute path on purpose: Git Bash's PATH on windows-latest may not include
  // System32, so resolving "where.exe" by name would measure PATH, not where.
  const whereExe = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "where.exe");
  info("P1-WHERE", `resolving the binary by absolute path: ${whereExe}`);

  const observed = await spawnCapture(whereExe, ["node"], {}, SPAWN_TIMEOUT_MS);
  const lines = observed.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  info("P1-WHERE", `surface=${observed.surface} exit=${observed.exitCode} parsed-lines=${lines.length} lines=${JSON.stringify(lines)} stderr=${JSON.stringify(observed.stderr)} error=${describeError(observed.error)}`);

  if (lines.length === 0) {
    fail("P1-WHERE", `where.exe produced no parseable output for "node" (surface=${observed.surface} exit=${observed.exitCode} error=${describeError(observed.error)}) — informational only, this does not gate the exit code`);
    return;
  }

  const first = lines[0];
  const endsInExe = first.toLowerCase().endsWith(".exe");
  pass("P1-WHERE", `where.exe resolved node to ${JSON.stringify(first)} (${endsInExe ? "ends in .exe" : "does NOT end in .exe — Phase 6 should prefer /f node.exe"}) across ${lines.length} CRLF-split line(s)`);
}

// ── P2-OS: bare specifier resolution (informational, D-08 label) ────

function assertP2Os() {
  // The bare import at the top of this file having succeeded IS the assertion —
  // reaching this function proves it, because an unresolvable specifier would
  // have thrown at module load.
  info("P2-OS", `the un-prefixed built-in specifier "os" resolved at module load (typeof tmpdir=${typeof tmpdir}, typeof platform=${typeof platform})`);
  pass("P2-OS", `the bare specifier for the os built-in resolved at import time; reaching this assertion is the proof (node-vehicle; LLRT resolver verified by source analysis)`);
}

// ── P3-VARS: Windows profile variables (no gate, D-09) ──────────────

function assertP3Vars() {
  // Named explicitly, one by one. process.env is never enumerated or dumped —
  // on a hosted runner it carries tokens injected by the Actions runtime (D-10).
  const names = ["USERPROFILE", "APPDATA", "LOCALAPPDATA"];
  info("P3-VARS", `checking ${names.join(", ")} by explicit name (process.env is never enumerated)`);

  const missing = [];
  for (const name of names) {
    const value = process.env[name];
    if (value === undefined || value === "") {
      missing.push(name);
    } else {
      info("P3-VARS", `${name} = ${value}`);
    }
  }

  if (missing.length === 0) {
    pass("P3-VARS", `${names.join(", ")} are all present and non-empty`);
    return;
  }
  info("P3-VARS", `missing or empty: ${missing.join(", ")}`);
  fail("P3-VARS", `missing or empty: ${missing.join(", ")} — informational only, this does not gate the exit code`);
}

// ── P3-UUID: randomUUID surfaces (informational, D-08 label) ────────

function assertP3Uuid() {
  // Both surfaces are recorded separately because LLRT and Node do not
  // necessarily expose both, and Phase 4 needs to know which one to target.
  const webCryptoSurface = typeof globalThis.crypto?.randomUUID === "function";
  const nodeCryptoSurface = typeof randomUUID === "function";
  info("P3-UUID", `globalThis.crypto.randomUUID=${webCryptoSurface} node:crypto randomUUID=${nodeCryptoSurface}`);

  if (webCryptoSurface || nodeCryptoSurface) {
    pass("P3-UUID", `randomUUID is available (globalThis.crypto=${webCryptoSurface}, node:crypto=${nodeCryptoSurface}) (node-vehicle; LLRT crypto surface unverified)`);
    return;
  }
  fail("P3-UUID", `randomUUID is available on neither globalThis.crypto nor node:crypto; the fallback is index.ts's hand-rolled hex loop (node-vehicle; LLRT crypto surface unverified)`);
}

// ── Main + exit contract ────────────────────────────────────────────

async function main() {
  process.stdout.write(
    [
      "=== Drift Windows/LLRT primitive probe (Phase 3, CI-02) ===",
      `node=${process.version} process.platform=${process.platform} execPath=${process.execPath}`,
      "vehicle: Node.js, NOT LLRT — no standalone LLRT Windows binary exists (upstream dropped it at v0.6.0-beta).",
      "the .cmd guard from CVE-2024-27980 exists only on Node >= 18.20.2, so the node version above is part of the record.",
      "",
      "",
    ].join("\n"),
  );

  // Wrapped so a thrown assertion cannot prevent the summary from being emitted;
  // the IDs it never reached still get their FAIL lines below.
  try {
    await assertP0Env();
    assertP0Tmp();
    await assertP1Cmd();
    await assertP1Where();
    assertP2Os();
    assertP3Vars();
    assertP3Uuid();
  } catch (error) {
    info("PROBE-ABORT", `an assertion threw and the remaining assertions were skipped: ${error?.stack ?? error}`);
  }

  // The whole tail is built as ONE string and written ONCE. Under single
  // emission this is the only region of output carrying the counted status
  // lines, so its integrity is the artifact's integrity: one write cannot be
  // interleaved with anything else or partially ordered against stderr.
  const tail = ["", "=== Summary ==="];
  let gatingFailure = false;

  for (const id of ASSERTION_IDS) {
    const recorded = results.filter((result) => result.id === id);
    let status;
    let detail;
    if (recorded.length === 0) {
      status = "FAIL";
      detail = "not reached — probe aborted before this assertion ran";
    } else if (recorded.length > 1) {
      status = "FAIL";
      detail = "duplicate result recorded";
    } else {
      status = recorded[0].status;
      detail = recorded[0].detail;
    }
    tail.push(`${status} [${id}]: ${detail}`);
    // The single exit rule: any non-PASS on a gating ID exits 1. Duplicates and
    // never-reached assertions feed it exactly as any other FAIL does; there is
    // no second path by which a status can reach the exit code.
    if (status !== "PASS" && GATING_IDS.includes(id)) {
      gatingFailure = true;
    }
  }

  const code = gatingFailure ? 1 : 0;
  tail.push("");
  if (code === 0) {
    tail.push(`PROBE PASSED: ${GATING_IDS.join(", ")} are all PASS — the direct spawn+env architecture holds and P1-CMD was conclusive. Proceed to Phase 4.`);
  } else {
    tail.push(`PROBE FAILED: at least one of ${GATING_IDS.join(", ")} is not PASS — see the summary lines above for which.`);
    tail.push("If P0-ENV is the failure, the documented fallback is a minimal .cmd launcher that `set`s each variable and then calls node (STATE.md blocker, D-05); Phase 4 does not start until that fallback is decided.");
  }
  tail.push("");

  await new Promise((resolve, reject) => {
    process.stdout.write(tail.join("\n"), (error) => {
      if (error) reject(error);
      else resolve(undefined);
    });
  });
  process.exit(code);
}

await main();
