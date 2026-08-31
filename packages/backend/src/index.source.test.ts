import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// ── What this file is, and what it deliberately is not ──────────────
//
// `index.ts` declares no `caido:plugin` alias and cannot be imported by any test
// this project can run, so every decision taken inside it is unverifiable by
// construction. The house answer to that is to move decisions into pure modules,
// and this project does — but a decision cannot be moved out of `index.ts` when
// the decision IS the wiring: whether a call site passes an argument at all.
//
// This suite therefore asserts on the SOURCE TEXT, and says so plainly rather
// than dressing itself up as a behavioural test. It proves that a required
// argument appears at every call site of a given function and that the number of
// call sites is the number the reviewer counted. It proves NOTHING about what
// those arguments evaluate to at runtime; the pure modules' own suites do that
// (`selectComspec` in platform.test.ts, `classifyMcpRemoveExit` in
// mcp-server-spec.test.ts).
//
// The failure mode it exists to catch is the one that shipped CR-01: a pure
// module grows an optional security-relevant parameter, its unit test proves the
// parameter works, and no production call site ever passes it. Both halves are
// needed and only one of them was ever asserted.
//
// COMMENTS ARE STRIPPED FIRST, and that is load-bearing rather than tidy:
// `index.ts` carries long explanatory comments by house rule, several of which
// quote the very call shapes this file matches on. A scan that counted those
// would report call sites that do not exist — and would go green while a real
// one was missing its argument.

const indexSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf-8",
);

// Whole-line comments only. A cheap strip that cannot corrupt a string literal
// containing `//` — a URL, a Windows UNC path — because it never looks inside a
// line that has code on it. The call shapes below always put their arguments on
// their own lines, so nothing this scan needs can hide behind trailing text.
function stripCommentLines(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return (
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("/*") &&
        !trimmed.startsWith("*")
      );
    })
    .join("\n");
}

// Every argument list passed to `name(`, with parentheses balanced so a nested
// call cannot end the extraction early. Returns the text BETWEEN the outer
// parentheses, one entry per call site.
function callArgumentTexts(source: string, name: string): string[] {
  const calls: string[] = [];
  const needle = `${name}(`;
  let cursor = source.indexOf(needle);
  while (cursor !== -1) {
    let depth = 0;
    let index = cursor + needle.length - 1;
    const start = index + 1;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (character === "(") depth += 1;
      else if (character === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    calls.push(source.slice(start, index));
    cursor = source.indexOf(needle, index);
  }
  return calls;
}

// The brace-balanced body of a top-level `function name(` or `async function
// name(` declaration, returned as the text BETWEEN the outer braces. The same
// shape as `callArgumentTexts` above, one brace class instead of one paren
// class — and with one extra step that is NOT optional: the parameter list is
// skipped by balancing PARENTHESES first, because several declarations in
// `index.ts` take an inline object type (`input: { sessionId: string }`) whose
// brace would otherwise be mistaken for the body's. Skipping that step returns
// a 19-character "body" for `closeCliSession` — measured — and every ordering
// assertion below it then passes on nothing.
//
// WHAT IT PROVES AND WHAT IT DOES NOT. It reads source text. It proves the
// POSITION of a statement relative to another statement inside one function. It
// proves nothing whatsoever about what either statement does at runtime, and
// this file's preamble applies in full.
//
// Returns "" when the declaration is not found, deliberately: a missing
// declaration must make the caller's assertion fail LOUDLY rather than yield an
// empty body in which every `indexOf` returns -1 and every ordering comparison
// is vacuously satisfiable. Every block below therefore asserts the body is
// non-empty before it compares anything.
function functionBody(source: string, name: string): string {
  let paramsIdx = -1;
  for (const prefix of ["async function ", "function "]) {
    const index = source.indexOf(`${prefix}${name}(`);
    if (index !== -1) {
      paramsIdx = index + prefix.length + name.length;
      break;
    }
  }
  if (paramsIdx === -1) return "";

  let depth = 0;
  let cursor = paramsIdx;
  for (; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (cursor >= source.length) return "";

  const open = source.indexOf("{", cursor);
  if (open === -1) return "";

  depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return "";
}

const code = stripCommentLines(indexSource);

// CR-01 / CR-02. `buildSpawnPlan` refuses a Windows shim when there is no
// absolute command interpreter. Production consumes its typed boundary so that
// the refusal remains fail-closed without escaping the caller's cleanup.
//
// The count is asserted too. A sixth site added without `comspec` fails the
// per-site check; a sixth site added WITH it still fails this count, which is
// the point — a new spawn of a provider binary is a decision that should be read
// by a human, not absorbed silently by a passing suite.
describe("index.ts contains every spawn-plan refusal at its orchestration boundary (CR-02)", () => {
  const calls = callArgumentTexts(code, "buildSpawnPlanResult");

  it("has exactly the five call sites the review inventoried", () => {
    expect(calls).toHaveLength(5);
  });

  it("passes `comspec` at every one of them", () => {
    for (const call of calls) {
      expect(call).toContain("comspec: getComspec()");
    }
  });

  it("resolves the interpreter through the pure selector, not inline", () => {
    // The environment read belongs at this I/O boundary and the CHOICE belongs
    // in platform.ts, where it is assertable from literal inputs. An inline
    // `readParentEnv().COMSPEC` at a call site would be neither.
    const helper = callArgumentTexts(code, "selectComspec");
    expect(helper).toHaveLength(1);
    expect(helper[0]).toContain("env: readParentEnv()");
    expect(helper[0]).toContain("platform: host?.platform");
  });

  it("has no throwing planner call in the production orchestrator", () => {
    expect(callArgumentTexts(code, "buildSpawnPlan")).toHaveLength(0);
  });

  it("turns registration planning failure into start and refresh cleanup", () => {
    const register = functionBody(code, "tryRegisterMcpForProviders");
    const start = functionBody(code, "startMcpServerOperation");
    const refresh = functionBody(code, "refreshActiveMcpRuntimeOperation");
    expect(register).toContain('registrationResult.kind === "Error"');
    for (const body of [start, refresh]) {
      expect(body).toContain('registration.kind === "Error"');
      const refusal = body.indexOf('registration.kind === "Error"');
      const cleanup = body.indexOf("cleanupMcpRuntime(", refusal);
      expect(refusal).not.toBe(-1);
      expect(cleanup).toBeGreaterThan(refusal);
    }
  });

  it("records cleanup plan refusals and continues to the termination pass", () => {
    const unregister = functionBody(code, "unregisterMcpFromCli");
    const recorder = functionBody(code, "recordMcpCliPlanRefusal");
    const cleanup = functionBody(code, "cleanupMcpRuntimeGeneration");
    expect(unregister).toContain('removePlan.kind === "Error"');
    expect(unregister).toContain("recordMcpCliPlanRefusal(");
    expect(recorder).toContain("MCP_REMOVE_PLAN_REFUSED");
    expect(unregister).toContain("continue;");
    expect(cleanup.indexOf("unregisterMcpFromCli(")).toBeLessThan(
      cleanup.indexOf("killTree("),
    );
    expect(cleanup.indexOf("killTree(")).toBeLessThan(
      cleanup.indexOf("reapMcpOrphans("),
    );
    expect(cleanup.indexOf("reapMcpOrphans(")).toBeLessThan(
      cleanup.indexOf("await rm("),
    );
  });

  it("reports send planning failure inside the provider lease cleanup", () => {
    const send = functionBody(code, "sendCliMessage");
    const plan = send.indexOf("buildSpawnPlanResult(");
    const refusal = send.indexOf('spawnPlanResult.kind === "Error"', plan);
    const stagedCleanup = send.indexOf("cleanupUncommittedProviderStart(");
    expect(plan).not.toBe(-1);
    expect(refusal).toBeGreaterThan(plan);
    expect(stagedCleanup).toBeGreaterThan(refusal);
  });
});

describe("index.ts makes Start idempotent inside the lifecycle FIFO (WR-01)", () => {
  const start = functionBody(code, "startMcpServerOperation");

  it("decides reuse or replacement before prerequisites, epoch advance and staging", () => {
    expect(start).not.toBe("");
    const calls = callArgumentTexts(start, "getMcpStartDisposition");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("tempDir: startTempDir");
    expect(calls[0]).toContain("...runtimeArtifacts");
    expect(calls[0]).toContain('mcpAuthState === "valid"');
    expect(calls[0]).toContain('getEffectiveCaidoToken() !== ""');
    const disposition = start.indexOf("getMcpStartDisposition(");
    const prerequisites = start.indexOf(
      "const caidoToken = getEffectiveCaidoToken();",
    );
    const nextEpoch = start.indexOf("beginMcpRuntimeGeneration(");
    const sweep = start.indexOf("sweepOrphanedMcpTempDirs(");
    expect(disposition).not.toBe(-1);
    expect(disposition).toBeLessThan(prerequisites);
    expect(disposition).toBeLessThan(nextEpoch);
    expect(disposition).toBeLessThan(sweep);
  });

  it("returns the current status on reuse and fully cleans before replacement", () => {
    const reuse = start.indexOf('startDisposition === "reuse"');
    const replace = start.indexOf('startDisposition === "replace"');
    const cleanup = start.indexOf("cleanupMcpRuntime(", replace);
    const nextEpoch = start.indexOf("beginMcpRuntimeGeneration(");
    expect(reuse).not.toBe(-1);
    expect(start.slice(reuse, replace)).toContain("buildCurrentMcpStatus(");
    expect(replace).toBeGreaterThan(reuse);
    expect(cleanup).toBeGreaterThan(replace);
    expect(cleanup).toBeLessThan(nextEpoch);
  });

  it("measures the active runtime directory, script and context before reuse", () => {
    const inspect = start.indexOf(
      "await inspectMcpRuntimeArtifacts(startTempDir)",
    );
    const disposition = start.indexOf("getMcpStartDisposition(");
    const reuse = start.indexOf('startDisposition === "reuse"');
    expect(start).toContain("const startTempDir = mcpTempDir");
    expect(inspect).not.toBe(-1);
    expect(disposition).not.toBe(-1);
    expect(reuse).not.toBe(-1);
    expect(inspect).toBeLessThan(disposition);
    expect(disposition).toBeLessThan(reuse);

    const health = functionBody(code, "inspectMcpRuntimeArtifacts");
    expect(health).toContain("await stat(tempDir)");
    expect(health).toContain("directoryInfo.isDirectory()");
    expect(health).toContain("getMcpScriptPath(tempDir)");
    expect(health).toContain("getMcpContextPath(tempDir)");
    expect(health.match(/await fileExists\(/g) ?? []).toHaveLength(2);
  });
});

// WR-01 / WR-02. The registration's `spawnEnvToken` must be the environment the
// CLI child is given, composed with the production builder — not `spec.env`,
// which belongs to the MCP server's own node process. The comment that claimed
// otherwise was the finding; this is the assertion that the code no longer can
// drift back to it, since index.ts's own comments are stripped before the scan.
describe("index.ts feeds the registration check the CLI child's environment (WR-01)", () => {
  const calls = callArgumentTexts(code, "planMcpCliRegistration");

  it("has exactly one registration planner call site", () => {
    expect(calls).toHaveLength(1);
  });

  it("composes spawnEnvToken with buildSpawnEnv over the parent environment", () => {
    const call = calls[0] ?? "";
    expect(call).toContain("spawnEnvToken: buildSpawnEnv({");
    expect(call).toContain("parentEnv: readParentEnv()");
    expect(call).toContain("driftVars: spec.driftVars");
  });

  it("no longer reads the MCP server's own env block for it", () => {
    expect(calls[0] ?? "").not.toContain("spec.env.CAIDO_TOKEN");
  });
});

// WR-05. `spawnAndWait` resolves a SYNTHETIC `code: 1` when the spawn threw or
// emitted `error` — an EINVAL or an ENOENT, not a removal outcome. Classifying
// that as `"failed"` puts the SECURITY line ("a token may remain") on the
// provider card on every single start, which is the alarm-fatigue outcome
// `classifyMcpRemoveExit`'s own docblock names as the thing to prevent. The
// discriminator only helps if every call site threads it.
describe("index.ts threads the spawn discriminator into every removal classification (WR-05)", () => {
  const calls = callArgumentTexts(code, "classifyMcpRemoveExit");

  it("has exactly the three removal sites the policy covers", () => {
    // The pre-clean inside registerMcpWithCli, the session cleanup in
    // unregisterMcpFromCli, and the unconditional startup sweep.
    expect(calls).toHaveLength(3);
  });

  it("passes `spawnFailed` at every one of them", () => {
    for (const call of calls) {
      expect(call).toMatch(/spawnFailed: !\w+\.spawned/);
    }
  });

  it("drops the unusable outcome at every site instead of formatting a security line", () => {
    // Only "failed" may reach formatMcpRemoveFailure. Three classification
    // sites, three early exits, three non-security log lines.
    expect(code.match(/outcome === "unusable"/g)).toHaveLength(3);
    expect(callArgumentTexts(code, "formatMcpRemoveUnusable")).toHaveLength(3);
  });

  it("marks exactly one spawnAndWait resolve path as having started a process", () => {
    // The close handler is the only place an exit code is a real exit status.
    // The synchronous-throw catch and the "error" handler both invent `code: 1`,
    // and reporting either as a started process would put the discriminator
    // back where it was.
    expect(code.match(/spawned: true/g)).toHaveLength(1);
    expect(code.match(/spawned: false/g)).toHaveLength(2);
  });
});

// WR-04. The sweep called itself UNCONDITIONAL while carrying two gates it never
// listed, and README.md promised the stronger behaviour. The gates cannot be
// removed - the sweep removes an entry by shelling the CLI's own `mcp remove`,
// so with no binary there is no removal - so the residual has to be REPORTED.
// This is the assertion that it still is; the sentence itself is asserted in
// mcp-server-spec.test.ts, where it can be read as data.
describe("index.ts reports the residual the sweep cannot remove (WR-04)", () => {
  it("emits the blocked-sweep notice on the console channel", () => {
    const calls = callArgumentTexts(code, "formatMcpSweepBlockedResidual");
    expect(calls).toHaveLength(1);
    expect(code).toContain(
      "sdk.console.error(formatMcpSweepBlockedResidual({ cli }))",
    );
  });

  it("emits it once per process per command value, not once per MCP start", () => {
    // A line that repeats on every Start is the one a user stops reading, which
    // is the same argument the removal classifier makes for its own banner.
    expect(code).toContain("mcpCliBlockedSweepNotices");
    expect(code).toMatch(/if \(!mcpCliBlockedSweepNotices\.has\(noticeKey\)\)/);
  });
});

// ── Phase 8 (LIF-01 / LIF-02) ───────────────────────────────────────

// THE LLRT TRAP GATE. This is the phase's single most important control and the
// only one that is independent of the test vehicle.
//
// The defect it prevents: signalling a process group by handing a NEGATIVE pid
// to the runtime's own kill primitive. Caido's LLRT types that parameter as a
// Rust `u32` and rquickjs range-checks it through `f64`, so it raises an
// `Underflow` conversion error there — while working perfectly under Node, which
// is the only vehicle any CI leg in this repository runs. Worse, every kill site
// in `index.ts` wraps its call in `catch { /* already dead */ }`, so the throw is
// swallowed and the orphan the phase exists to prevent survives in silence. A
// control that fails green on every runner the project has is exactly finding
// L-4 of `05-RESEARCH.md` recurring, and a source gate is the only answer
// available (08-RESEARCH.md § Pitfall 1).
//
// COMMENT-STRIPPING IS LOAD-BEARING HERE, not tidy. `08-VALIDATION.md` seeded
// this row as a raw `grep`, and that spelling is WRONG: `kill-plan.ts`'s POSIX
// branch and `index.ts`'s tree-kill comment both quote the banned form verbatim,
// by house rule, precisely so a future reader does not reintroduce it. A raw grep
// would go red against the very comments that prevent the defect. The shell
// alternative the seed offered (`sed 's://.*::'`) is worse still: it strips `//`
// inside string literals, which `stripCommentLines` above deliberately never
// does. The in-test form is therefore the primary gate, and the marked
// correction to `08-VALIDATION.md` is plan 08-05's T-08-13.
//
// THE NEEDLE IS AN ESCAPED `RegExp`, AND THAT IS A REQUIREMENT RATHER THAN A
// STYLE CHOICE. This file lives in `packages/backend/src`, so it is inside the
// scope of the companion repo-wide scan, and that scan exempts WHOLE-LINE
// comments only — an assertion is not a comment. Handing the banned form to
// `not.toContain(...)` as a plain string literal would spell it verbatim on a
// code line and turn the scan red AGAINST THE GATE ITSELF, which the next reader
// would then "fix" by weakening the scan. Escaping the dot and the opening
// parenthesis keeps the banned character sequence off every code line in this
// file. Do not simplify the regex back into a string.
const killPlanSource = readFileSync(
  fileURLToPath(new URL("./kill-plan.ts", import.meta.url)),
  "utf-8",
);
const lifecycleCode = `${code}\n${stripCommentLines(killPlanSource)}`;
// THE NEEDLE IS ANCHORED ON THE PROPERTY, NOT ON THE RECEIVER, and that widening
// is review finding WR-02 (`08-REVIEW.md`). The original spelling matched
// `process . kill ( -` and nothing else, so it could not see the indirection
// THIS PHASE introduced twenty lines above `killTree`:
//
//     const killRef = processRef.process?.kill;
//     killRef.call(processRef.process, pid, 0);
//
// which is now the ESTABLISHED LOCAL IDIOM for reaching the runtime's kill
// primitive in `index.ts`, sitting immediately beside the code the gate exists to
// protect. A future edit written in its neighbour's idiom —
// `killRef.call(processRef.process, -pid, "SIGTERM")` — would have reintroduced
// the `Underflow` defect while this gate stayed green on all five CI legs: L-4
// recurring for the third time. Two alternations now:
//
//   1. `.kill( -…` — ANY receiver, so a rename of `process` or a new handle
//      variable cannot slip past it.
//   2. `kill*.call(…, -…)` / `.apply(…, -…)` — the reflective form, matched on a
//      `kill`-prefixed callee so the receiver name is irrelevant there too.
//
// WHAT IT STILL CANNOT SEE, stated rather than implied, because a gate whose
// limits are unwritten gets trusted past them. A negative pid bound to a variable
// first (`const target = -pid; proc.kill(target)`), a computed member access
// (`proc["kill"](-pid)`), `Reflect.apply`, or a callee not named `kill*` all pass
// this regex. The census below is the answer to that class: reaching the
// primitive reflectively at all requires first taking it as a VALUE, and every
// such reference in `index.ts` is counted.
const LLRT_NEGATIVE_PID_SIGNAL =
  /\.\s*kill\s*\(\s*-|kill\w*\s*\.\s*(?:call|apply)\s*\(\s*[^,()]*,\s*-/g;

describe("the LLRT-incompatible group-signalling spelling cannot re-enter as code (Pitfall 1)", () => {
  it("does not appear in index.ts or kill-plan.ts once whole-line comments are stripped", () => {
    expect(lifecycleCode.match(LLRT_NEGATIVE_PID_SIGNAL)).toBeNull();
  });

  it("still reaches the plan builder, so the gate cannot pass by deletion", () => {
    // Without this companion the block above goes green the moment somebody
    // removes the whole mechanism — a gate that passes hardest when there is
    // nothing left to guard.
    expect(lifecycleCode).toContain("buildKillTreePlan(");
  });

  it("catches both spellings when they are present, so the widening is not decorative", () => {
    // The falsifying partner, run against synthetic text rather than against the
    // repository: a needle asserted only to be absent is a needle that can rot
    // into one matching nothing at all, and nobody would notice. Both arms are
    // exercised — the bare receiver-agnostic form and the reflective one the
    // original needle was blind to.
    expect("someHandle.kill(-pid, 9)".match(LLRT_NEGATIVE_PID_SIGNAL)).not.toBeNull();
    expect(
      'killRef.call(processRef.process, -pid, "SIGTERM")'.match(
        LLRT_NEGATIVE_PID_SIGNAL,
      ),
    ).not.toBeNull();
    // And it must NOT fire on the positive-pid idiom that legitimately ships.
    expect(
      "killRef.call(processRef.process, pid, 0)".match(LLRT_NEGATIVE_PID_SIGNAL),
    ).toBeNull();
  });

  it("counts every reference that takes the kill primitive as a VALUE", () => {
    // The generalisation the regex cannot make. Any NEW indirection — a variable
    // holding a negative pid, a computed member access, `Reflect.apply`, a
    // differently-named alias — has to reach the primitive somehow, and reaching
    // it reflectively means first binding it as a value rather than calling it.
    // `index.ts` contains exactly ONE such reference, `isPidAlive`'s `killRef`.
    // A second one is a new route to a syscall this project spent a phase
    // fencing, and it should be read by a human rather than absorbed by a
    // passing suite. If this number ever legitimately moves, name the new site
    // here in the same edit.
    expect(code.match(/\.\s*kill\b(?!\s*\()/g)).toHaveLength(1);
  });

  it("passes a positive pid at both reflective calls", () => {
    // The positive companion to the negative gate: the sites the widened needle
    // was written for are asserted to be correct, not merely absent from a
    // blacklist. Two of them — the calibration and the target probe.
    const body = functionBody(code, "isPidAlive");

    expect(body).toContain("killRef.call(processRef.process, selfPid, 0)");
    expect(body).toContain("killRef.call(processRef.process, pid, 0)");
    expect(body.match(/killRef\.call\(/g)).toHaveLength(2);
  });
});

// THE `detached` ANSWERS. `detached` is a REQUIRED member of `SpawnWithEnv`, so
// the compiler already forces every call site to say something; this block
// asserts WHAT each of them says, which the compiler cannot.
//
// The direction matters in both senses. A leaf spawn that said `true` would
// escape Drift's own process group and outlive a hard-killed Caido while holding
// a live session token (threat T-08-11). The provider spawn saying `false` would
// leave its `mcp-server.mjs` grandchild unreachable from a group signal, which is
// the LIF-02 defect itself.
describe("index.ts states a detached answer at every spawnWithEnv call site (LIF-02 / T-08-11)", () => {
  const calls = callArgumentTexts(code, "spawnWithEnv");

  it("has exactly the three call sites the review inventoried", () => {
    // callMcpMethod's self-test spawn, spawnAndWait's env arm, and the provider
    // launch. A fourth site added WITH an answer still fails this count, and
    // that is the point: a new spawn carrying a live Caido session token is a
    // decision a human should read, not one a passing suite absorbs.
    expect(calls).toHaveLength(3);
  });

  it("passes `detached` at every one of them", () => {
    for (const call of calls) {
      expect(call).toContain("detached:");
    }
  });

  it("detaches the provider spawn and nothing else", () => {
    // Exactly one site delegates to the pure decision, and it is the provider
    // launch — the only spawn whose child spawns a token-bearing grandchild of
    // its own. The other two are Drift-owned leaves that must die with Drift.
    const detaching = calls.filter((call) =>
      call.includes("detached: shouldDetachProviderSpawn(host?.platform)"),
    );
    const attached = calls.filter((call) => call.includes("detached: false"));

    expect(detaching).toHaveLength(1);
    expect(attached).toHaveLength(2);
  });

  it("reaches the plan builder through the injected-boundary shape (D-P4)", () => {
    // The same shape as the `selectComspec` assertion above: the environment is
    // read at this I/O boundary and the CHOICE is made by a pure function that a
    // test can reach from literal inputs. An inline `readParentEnv().SystemRoot`
    // at the call site would move the dual-casing fallback back into `index.ts`,
    // where no test this project can run is able to reach it — which is the
    // "unverifiable by construction" problem the module split exists to remove.
    const builder = callArgumentTexts(code, "buildKillTreePlan");

    expect(builder).toHaveLength(1);
    expect(builder[0]).toContain("platform: host?.platform");
    expect(builder[0]).toContain("env: readParentEnv()");
  });
});


// ── SC-4: the kill precedes the removal, at all three removal sites ──
//
// WHAT THIS IS REALLY ASSERTING. Each of these three functions removes a file
// or a directory that carried CAIDO_TOKEN into a child process's environment:
// `cleanupMcpRuntime` removes the whole MCP temp directory, `closeCliSession`
// and `deleteChat` remove the per-session activity and approvals files. If the
// removal runs while a token-bearing child is still alive, the deletion destroys
// the forensic trail — which pid, which session, which policy — while leaving
// the capability completely intact, because the token is in the process's memory
// rather than in the file. Deleting a token-bearing file is not revocation.
// Killing the process that read it is (threat T-08-01, and T-08-12 for the
// startMcpServer failure path that reaches cleanupMcpRuntime too).
//
// WHY A POSITIONAL ASSERTION AT ALL. `index.ts` declares no `caido:plugin` alias
// and cannot be imported by any test this project can run, so there is no
// behavioural vehicle for this fact. And nothing else in this repository measures
// statement ORDER inside `index.ts` — `callArgumentTexts` returns argument text
// and discards offsets. A shell gate over the same three functions exists and is
// run as an independent second read, but it is not what this evidence rests on:
// a vitest assertion runs on all five CI legs unprompted, a shell gate runs where
// somebody remembers to run it.
describe("index.ts kills every tracked tree before it removes the files that carried its token (SC-4)", () => {
  // The three sites are written out ONE PER ASSERTION rather than driven from a
  // table. A table would name each function exactly once, in a data literal; the
  // unrolled form names it at the call to `functionBody`, which is where a reader
  // grepping for the site actually lands — and it keeps every assertion inline
  // where `vitest/expect-expect` can see it, this repository running eslint at
  // `--max-warnings 0`.

  it("cleanupMcpRuntime terminates every tracked pid before the temp dir goes", () => {
    // The directory removed here holds the MCP config, the context file and the
    // per-session approvals/activity documents — every env-source that carried
    // the Caido token into a child's environment.
    const body = functionBody(code, "cleanupMcpRuntimeGeneration");

    // The non-vacuity guard: an empty body makes both lookups -1 and the
    // comparison meaningless, so it fails loudly here instead.
    expect(body).not.toBe("");
    expect(body.indexOf("killTree(")).not.toBe(-1);
    expect(body.indexOf("rm(")).not.toBe(-1);
    expect(body.indexOf("killTree(")).toBeLessThan(body.indexOf("rm("));
  });

  it("closeCliSession terminates before it removes the session's runtime files", () => {
    const body = functionBody(code, "closeCliSession");

    expect(body).not.toBe("");
    expect(body.indexOf("killTree(")).not.toBe(-1);
    expect(body.indexOf("rm(")).not.toBe(-1);
    expect(body.indexOf("killTree(")).toBeLessThan(body.indexOf("rm("));
  });

  it("deleteChat terminates before it removes the session's runtime files", () => {
    const body = functionBody(code, "deleteChat");

    expect(body).not.toBe("");
    expect(body.indexOf("killTree(")).not.toBe(-1);
    expect(body.indexOf("rm(")).not.toBe(-1);
    expect(body.indexOf("killTree(")).toBeLessThan(body.indexOf("rm("));
  });
});

// ── WR-01: cleanupMcpRuntime's kill loop reports what it killed ──
//
// WHY THE LOOP IS WIDE, AND WHY THAT MAKES REPORTING MANDATORY. `cleanupMcpRuntime`
// has TWELVE call sites, not the two its comment and `08-SECURITY.md` T-08-12
// originally named, and two of them fire during normal operation: a settings save
// that carries `caidoApi`, and the token-refresh path the frontend keep-alive
// drives. Narrowing the loop to the teardown callers is NOT the fix, because every
// one of those paths continues into the temp-directory removal — killing on some
// and not others would remove the env-source documents that carried CAIDO_TOKEN
// while a child that read them is still running, which is SC-4 inverted.
//
// So the loop stays wide and has to be honest. Without the two statements asserted
// here, `activeProcesses.delete` ran with no `stopped` event and no watchdog
// cleanup — and a later `cancelCliMessage` for that session then found
// `proc === undefined` and returned `ok` while publishing nothing, so the user's
// Stop button was a silent no-op for a session still on their screen.
describe("index.ts publishes and de-registers every session its cleanup loop kills (WR-01)", () => {
  const body = functionBody(code, "cleanupMcpRuntimeGeneration");

  it("finds a non-empty body carrying the kill loop", () => {
    expect(body).not.toBe("");
    expect(body).toContain("activeProcesses.entries()");
    expect(body).toContain("killTree(");
  });

  it("publishes a stopped state for each killed session", () => {
    expect(body).toContain("publishSessionState(");
    expect(body).toContain('state: "stopped"');
  });

  it("drops the watchdog alongside the process it pumps", () => {
    // A watchdog left behind is polled by the frontend keep-alive against a
    // session whose child no longer exists.
    expect(body).toContain("sessionWatchdogs.delete(sessionId)");
  });
});

// ── SC-4: the absolute-timeout handler kills before it finalizes ──
//
// Pitfall 10. The kill moved UP; `finalize` did NOT move and must not: it is a
// `const` arrow declared lower in the same promise executor, so hoisting it into
// the handler puts it in its temporal dead zone and throws a ReferenceError
// synchronously inside the executor. `finalize` removes the activity and
// approvals files, which is why the order matters here for the same reason it
// matters at the three sites above.
describe("index.ts kills before it finalizes a timed-out turn (SC-4 / Pitfall 10)", () => {
  const body = functionBody(code, "sendCliMessage");

  // THE END ANCHOR IS THE CALL'S FULL CLOSING LINE, AND IT IS SEARCHED FORWARD
  // FROM THE START ANCHOR — note the second argument to `indexOf`. Do not shorten
  // it back to the bare `currentSettings.processTimeoutSeconds` identifier: that
  // identifier's FIRST occurrence inside `sendCliMessage` is the
  // `sendCliMessage start …` debug-log line, roughly five hundred lines ABOVE the
  // handler. An unanchored lookup would therefore return an end BEFORE the start,
  // `.slice` would return "", both inner lookups would return -1, and the
  // ordering assertion would pass while proving nothing. That vacuous pass is the
  // precise failure this block exists to prevent, so the guards below are part of
  // the assertion rather than decoration.
  const startIdx = body.indexOf("const timeout = setTimeout(");
  const endIdx = body.indexOf(
    "}, currentSettings.processTimeoutSeconds * 1000)",
    startIdx,
  );

  it("finds a non-empty, correctly-ordered handler slice", () => {
    expect(body).not.toBe("");
    expect(startIdx).not.toBe(-1);
    expect(endIdx).not.toBe(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
    expect(body.slice(startIdx, endIdx)).not.toBe("");
  });

  it("puts the tree kill above finalize()", () => {
    const slice = body.slice(startIdx, endIdx);

    expect(slice).toContain("killTree(");
    expect(slice).toContain("finalize(");
    expect(slice.indexOf("killTree(")).toBeLessThan(slice.indexOf("finalize("));
  });
});

// ── CR-01: the single-pid rung must not run ahead of the tree killer on win32 ──
//
// THE DEFECT THIS PREVENTS, AND WHY NO EXECUTED TEST CAN SEE IT. `proc.kill(...)`
// on win32 is an unconditional `TerminateProcess` whatever signal name it is
// given — the fact `kill-plan.ts` already relies on when it refuses to build a
// graceful win32 rung. Issued BEFORE the tree killer, it removes the target from
// the process table, and `taskkill /pid <n> /t /f` walks `ParentProcessId` from a
// pid it can no longer enumerate: the token-bearing grandchild survives the
// cancel, and the deferred second rung then self-skips because it is guarded on
// that same pid's liveness. `kill-tree.win32.test.ts` cannot catch it — it calls
// `buildKillTreePlan` and runs the argv against a LIVE tree, never going through
// `killTree` — so this ordering has no behavioural vehicle on any platform this
// project can execute, and a positional source gate is again the only answer.
//
// FALSIFIABILITY, stated so the next reader does not have to re-derive it:
// deleting the platform guard makes assertion 2 red; moving the signal out of the
// guarded block makes assertion 3 red; adding a second unguarded signal anywhere
// in `killTree` makes assertion 4 red; deleting the win32 fallback makes the
// last two red.
describe("index.ts does not pre-terminate the target on win32 before the tree killer runs (CR-01)", () => {
  const body = functionBody(code, "killTree");
  const guard = 'if (host?.platform !== "win32") {';

  it("finds a non-empty killTree body to assert against", () => {
    // The non-vacuity guard, for the same reason the SC-4 block carries one: an
    // empty body makes every `indexOf` below -1 and every comparison meaningless.
    expect(body).not.toBe("");
    expect(body).toContain("buildKillTreePlan(");
  });

  it("puts the single-pid rung behind a non-win32 guard", () => {
    expect(body).toContain(guard);
    expect(body.indexOf(guard)).toBeLessThan(body.indexOf("proc.kill("));
  });

  it("carries exactly one direct signal on the handle, the guarded one", () => {
    // A second one added anywhere in this function — including an "obviously
    // harmless" win32 re-issue — fails here rather than being absorbed silently.
    expect(body.match(/proc\.kill\(/g)).toHaveLength(1);
  });

  it("keeps the win32 signal as the fallback at both spawn-failure arms", () => {
    // Guarding the preamble off win32 would otherwise leave a Windows host that
    // cannot spawn `taskkill.exe` at all with no killer whatsoever — worse than
    // what shipped. Both arms: the async `error` event and the synchronous throw.
    expect(body.match(/killWin32Leaf\(proc\)/g)).toHaveLength(2);
  });

  it("scopes that fallback to win32 in its own declaration", () => {
    const fallback = functionBody(code, "killWin32Leaf");

    expect(fallback).not.toBe("");
    expect(fallback).toContain('if (host?.platform !== "win32") return;');
  });
});

// ── CR-02: the deferred rungs guard on HANDLE IDENTITY, not on pid liveness ──
//
// WHAT T-08-04 ACTUALLY REQUIRES. The threat is a deferred rung acting on a pid
// the OS has REASSIGNED — on Windows that takes an unrelated process's whole
// tree, because the argv is `/t /f`. `isPidAlive` sends signal 0, and signal 0
// answers "does *a* process with this number exist", which is precisely `true`
// for a reassigned pid: its only discriminating power was over pids that are
// dead AND not yet reused, i.e. the harmless case. The capture-before-schedule
// control does not close the gap either — the callback calls `killTree`, which
// re-reads `proc.pid`, and Node does not clear `pid` after reaping.
//
// The answer has to come from the HANDLE, and `hasTrackedProcessExited`
// (kill-plan.ts) is where that decision lives, reachable from literal inputs.
// This block asserts only what the pure module cannot: that both rungs call it,
// that they call it BEFORE the liveness probe, and that they feed it the
// handle's own answers rather than something a stranger holding the pid could
// also produce. Put the identity check after the liveness probe and the
// dangerous case is decided before it ever runs.
//
// No behavioural vehicle exists for the ordering: reproducing pid reassignment
// inside a 3-second window is not a test this project can write, and `index.ts`
// cannot be imported in any case. Positional source assertions again.
describe("index.ts guards both deferred rungs on handle identity before liveness (CR-02)", () => {
  const sendBody = functionBody(code, "sendCliMessage");
  const shutdownStart = sendBody.indexOf("const requestGracefulShutdown = () => {");
  const shutdownEnd = sendBody.indexOf(
    "const scheduleClaudePostToolShutdown = () => {",
    shutdownStart,
  );
  const shutdownSlice = sendBody.slice(shutdownStart, shutdownEnd);
  const cancelBody = functionBody(code, "cancelCliMessage");
  const identity = "hasTrackedProcessExited({";

  it("finds a non-empty, correctly-ordered slice for each rung", () => {
    // The same non-vacuity discipline as the SC-4 blocks: an anchor that missed
    // would make every `indexOf` below -1 and every comparison meaningless.
    expect(shutdownStart).not.toBe(-1);
    expect(shutdownEnd).toBeGreaterThan(shutdownStart);
    expect(shutdownSlice).toContain("isPidAlive(");
    expect(cancelBody).not.toBe("");
    expect(cancelBody).toContain("isPidAlive(");
  });

  it("checks the handle before the pid at requestGracefulShutdown's rung", () => {
    expect(shutdownSlice).toContain(identity);
    expect(shutdownSlice.indexOf(identity)).toBeLessThan(
      shutdownSlice.indexOf("isPidAlive("),
    );
  });

  it("checks the handle before the pid at cancelCliMessage's rung", () => {
    expect(cancelBody).toContain(identity);
    expect(cancelBody.indexOf(identity)).toBeLessThan(
      cancelBody.indexOf("isPidAlive("),
    );
  });

  it("feeds it the handle's own exit event at both rungs", () => {
    // `observedExitEvent` is the ONLY identity source that survives on Caido's
    // LLRT, whose ChildProcess exposes no exit state — so a call site that
    // passed a literal `false` here would leave the real runtime with liveness
    // only. Each rung must name a flag its own handler sets.
    expect(shutdownSlice).toContain("observedExitEvent: providerProcessExited");
    expect(cancelBody).toContain("observedExitEvent: cancelledProcessExited");
  });

  it("reads the handle's exit state through the guarded boundary, not inline", () => {
    // The D-P4 shape again: the property reads live at one cast-carrying
    // boundary and the DECISION is a pure function reachable from literals. An
    // inline `proc.exitCode !== null` at a call site would be neither — and is
    // the exact spelling that reads `undefined !== null` as "exited" under LLRT.
    const calls = callArgumentTexts(code, "hasTrackedProcessExited");

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call).toContain("...readHandleExitState(proc)");
    }
    expect(code).not.toContain("proc.exitCode !==");
    expect(code).not.toContain("proc.signalCode !==");
  });
});

// ── The termination call-site census ──
//
// The count is asserted AS WELL AS the per-site content, the same argument the
// buildSpawnPlan block above makes: a ninth call site added correctly still fails
// this count, and that is the point — a new termination of a token-bearing
// process is a decision a human should read, not one a passing suite absorbs
// silently. If a measured count ever differs from the numbers here, update the
// number AND the enumeration in the same edit. Never relax an exact count to a
// range or a lower bound.
describe("index.ts pins every process-termination site to a counted inventory (LIF-01 / LIF-02)", () => {
  it("declares the tree killer exactly once", () => {
    expect(code.match(/function killTree\(/g)).toHaveLength(1);
  });

  it("has the one declaration plus the eight in-scope call sites", () => {
    // deleteChat 1, the sendCliMessage absolute timeout 1,
    // requestGracefulShutdown 2, cancelCliMessage 2, closeCliSession 1,
    // cleanupMcpRuntime 1 — eight calls, plus the declaration itself.
    expect(code.match(/killTree\(/g)).toHaveLength(9);
  });

  it("keeps the liveness probe at its declaration plus both deferred rungs", () => {
    // `08-SECURITY.md` cites this count as T-08-04's evidence, but at phase
    // close it was a one-time grep with no standing control — deleting either
    // guard left the suite green (review WR-03). It is an assertion now.
    expect(code.match(/isPidAlive\(/g)).toHaveLength(3);
  });

  it("reads the probe's RESULT, not only whether it threw (WR-03)", () => {
    // The runtime difference no CI leg can observe. Caido's LLRT converts the
    // missing-pid case to a RETURN VALUE (`Ok(false)`) where Node throws ESRCH,
    // so a try/catch that ignores the result reports every pid as alive there
    // and the T-08-04 guard is silently inert on every real install. Both
    // spellings of the self-pid are read for the same class of reason: Node has
    // `process.pid`, LLRT sets `id` and declares no `pid`.
    const body = functionBody(code, "isPidAlive");

    expect(body).not.toBe("");
    expect(body).toContain("=== false");
    expect(body).toContain("!== false");
    expect(body).toContain("processRef.process?.pid ?? processRef.process?.id");
  });

  it("leaves exactly the four out-of-scope single-pid signals on the child handle", () => {
    // Two of them are callMcpMethod's own rungs against Drift's self-test child,
    // which is a leaf with no tree. The third is INSIDE killTree: the single-pid
    // rung it issues before spawning the group kill, kept deliberately as defence
    // against assumption A1 (does the shipped Caido LLRT honour the process-group
    // spawn option?), which 08-SPIKE.md still records as OPEN and unmeasured.
    // That rung is load-bearing, not decoration — do not delete it to make this
    // number smaller. The fourth is `killWin32Leaf`, the win32-only last resort
    // reached from killTree's two spawn-failure arms; it exists because review
    // CR-01 guarded the third off win32, and without it a Windows host that
    // cannot spawn `taskkill.exe` at all would lose nothing.
    //
    // Was 3 before CR-01. If this number moves again, move the enumeration
    // above with it — never relax it to a lower bound.
    expect(code.match(/proc\.kill\(/g)).toHaveLength(4);

    // resolveCommand's PATH-search timeout. A `which` invocation is a leaf
    // process with no tree of its own, explicitly excluded from tree termination.
    expect(code.match(/child\.kill\(/g)).toHaveLength(1);
  });
});

// ── The orphan reap: the census, both orderings, and the guarantees ──
//
// Plan 08-06 shipped `reapMcpOrphans` and ONE wired call site, and recorded in
// its own SUMMARY that neither the boundary nor the call site is reachable by any
// executed assertion — `index.ts` cannot be imported, so the truth was rated
// `verification: backstop` and routed to human UAT. This block is the cheap
// strengthening that SUMMARY named: it cannot prove the reap works, but it can
// prove the wiring exists, sits in the right functions, sits in the right ORDER
// relative to the removals, and is never awaited. Every assertion below states
// the input that makes it red, because this phase has already caught gates whose
// stated red input did not exist.
//
// A NOTE ON `functionBody` AND WHY ONE ASSERTION BELOW DOES NOT USE IT.
// `functionBody` finds a body by taking the first `{` after the parameter list.
// For a declaration whose RETURN TYPE is an inline object type — `async function
// callMcpMethod(...): Promise<{ response: JsonRpcResponse; durationMs: number }>`
// — that first brace belongs to the return type, so the "body" it returns is the
// TYPE, not the code. Measured, not assumed: it returns a slice containing
// neither `mcpDirectCallDepth` nor any statement. Rather than widen the shared
// scanner every existing gate above depends on, the depth-symmetry case below
// uses its own declaration-to-next-declaration slice with its own non-vacuity
// guards. If a future edit widens `functionBody` to skip return-type
// annotations, this local helper can go — but re-run the SC-4 blocks above first.
function topLevelDeclarationSlice(source: string, name: string): string {
  let start = -1;
  for (const prefix of ["async function ", "function "]) {
    const index = source.indexOf(`${prefix}${name}(`);
    if (index !== -1) {
      start = index;
      break;
    }
  }
  if (start === -1) return "";

  // The next declaration at column 0. Searched from AFTER this one's own first
  // line, so the declaration itself cannot terminate its own slice.
  const rest = source.slice(start + 1);
  const candidates = [
    rest.indexOf("\nasync function "),
    rest.indexOf("\nfunction "),
  ].filter((index) => index !== -1);
  if (candidates.length === 0) return "";
  return rest.slice(0, Math.min(...candidates));
}

describe("index.ts wires the orphan reap at every counted site and nowhere else (LIF-02 / AR-02)", () => {
  // 1. THE CENSUS, BY ENCLOSING FUNCTION NAME AND NEVER BY A BARE TOTAL. A
  // whole-file count is satisfied by ANY redistribution of the same number of
  // calls across the wrong functions, which is precisely the failure a census
  // exists to catch. Each function is named against its expected count, INCLUDING
  // the zero.
  //
  // RED INPUT: drop the reap from any named function and that function's
  // assertion goes red naming it. Add one to an unnamed function and the
  // sum-versus-total assertion goes red, because the enumerated set no longer
  // accounts for every call in the file.
  //
  // The rejected alternative, recorded so it is not reinstated: an earlier draft
  // proposed `grep -c 'activeProcesses.delete('` == `grep -c
  // 'reapSessionOrphansIfIdle('`. That is coincidence-shaped. It reads 5 == 5
  // only because one side counts five real deletions and the other counts one
  // declaration plus four calls, over two different populations. Adding a
  // legitimate `activeProcesses.delete(` inside `cleanupMcpRuntime` — which
  // CORRECTLY gets no idle reap — would turn it red for a correct change, and
  // deleting a declaration while adding a call would keep it green for a wrong
  // one. Equal totals over two different populations is not a contract.
  it("calls the reap boundary from exactly the three functions that own a reap", () => {
    const sites = {
      cleanupMcpRuntimeGeneration: 1,
      sweepOrphanedMcpTempDirs: 1,
      reapSessionOrphansIfIdle: 1,
    };
    let enumerated = 0;
    for (const [name, expected] of Object.entries(sites)) {
      const body = functionBody(code, name);
      // Non-vacuity, per function: an empty body makes the match below `null`
      // and the count 0, which would silently satisfy a zero-expectation.
      expect(body).not.toBe("");
      expect(body.match(/reapMcpOrphans\(/g) ?? []).toHaveLength(expected);
      enumerated += expected;
    }
    // The unnamed-function guard. Total occurrences minus the declaration must
    // equal what the enumeration accounts for; a call added anywhere else fails
    // here rather than being absorbed.
    const total = (code.match(/reapMcpOrphans\(/g) ?? []).length;
    const declaration = (code.match(/function reapMcpOrphans\(/g) ?? []).length;
    expect(declaration).toBe(1);
    expect(total - declaration).toBe(enumerated);
  });

  it("calls the idle reap from exactly the four session sites, and never from cleanup", () => {
    // The ZERO is as load-bearing as the ones. `cleanupMcpRuntime` runs its own
    // UNCONDITIONAL teardown reap (the case above), and its kill loop empties
    // `activeProcesses` on the way past — so an idle-gated second call there
    // would find the gate OPEN and issue a duplicate scan of the same marker on
    // every teardown. Not harmful, and that is exactly why it must not be there:
    // it would read as a safeguard while being a second spawn doing nothing the
    // first did not.
    const sites = {
      deleteChat: 1,
      sendCliMessage: 1,
      cancelCliMessage: 1,
      closeCliSession: 1,
      cleanupMcpRuntime: 0,
    };
    let enumerated = 0;
    for (const [name, expected] of Object.entries(sites)) {
      const body = functionBody(code, name);
      expect(body).not.toBe("");
      expect(body.match(/reapSessionOrphansIfIdle\(/g) ?? []).toHaveLength(
        expected,
      );
      enumerated += expected;
    }
    const total = (code.match(/reapSessionOrphansIfIdle\(/g) ?? []).length;
    const declaration = (
      code.match(/function reapSessionOrphansIfIdle\(/g) ?? []
    ).length;
    expect(declaration).toBe(1);
    expect(total - declaration).toBe(enumerated);
  });

  // 2. THE START-UP ORDERING (AR-02 / recorded decision OQ-3). The directories
  // `sweepOrphanedMcpTempDirs` removes are the env-source documents that carried
  // CAIDO_TOKEN into these very processes. Removing them first destroys the
  // forensic trail and withdraws nothing, because the token is in the surviving
  // process's memory.
  //
  // RED INPUT: move the reap below the root loop. Verified by constructing that
  // exact variant — the reap's statement index moves from 3 to 543 while the
  // first `rm(` stays at 329, and the comparison below fails.
  it("sweepOrphanedMcpTempDirs kills previous-run orphans before it removes any directory", () => {
    const body = functionBody(code, "sweepOrphanedMcpTempDirs");

    // The non-vacuity guard the SC-4 blocks above all carry, and for the reason
    // this phase measured: an empty body makes every `indexOf` -1 and every
    // ordering comparison vacuously satisfiable.
    expect(body).not.toBe("");
    expect(body.indexOf("reapMcpOrphans(")).not.toBe(-1);
    expect(body.indexOf("rm(")).not.toBe(-1);
    expect(body.indexOf("reapMcpOrphans(")).toBeLessThan(body.indexOf("rm("));

    // The scan plan is built from the CLASS-wide builder, and it is handed the
    // current session directory name — which is the GUARD, not a parameter:
    // `buildPreviousRunOrphanScanPlan` refuses with `session-active` whenever
    // that value is defined, so a future edit that moves this call below the
    // `mcpTempDir` assignment stops the scan instead of pointing it at the live
    // session's own child. RED INPUT: pass `undefined` literally here and this
    // fails.
    const calls = callArgumentTexts(body, "buildPreviousRunOrphanScanPlan");
    expect(calls).toHaveLength(1);
    expect(calls[0] ?? "").toContain(
      "currentSessionDirName: getMcpSessionDirName()",
    );
  });

  // 3. THE TEARDOWN ORDERING. Sits BESIDE the existing kill-before-sweep case
  // rather than replacing it: both the `killTree` loop and the reap must precede
  // every `rm(`, and they cover different populations — the loop reaches what
  // Drift spawned, the reap reaches what it did not.
  //
  // RED INPUT: move the reap below the `rm(mcpTempDir)` block and this fails
  // while the neighbouring `killTree` case stays green, which is the point of
  // asserting them separately.
  it("cleanupMcpRuntime reaps before it removes the temp dir, alongside the kill loop", () => {
    const body = functionBody(code, "cleanupMcpRuntimeGeneration");

    expect(body).not.toBe("");
    expect(body.indexOf("reapMcpOrphans(")).not.toBe(-1);
    expect(body.indexOf("killTree(")).not.toBe(-1);
    expect(body.indexOf("rm(")).not.toBe(-1);
    expect(body.indexOf("reapMcpOrphans(")).toBeLessThan(body.indexOf("rm("));
    expect(body.indexOf("killTree(")).toBeLessThan(body.indexOf("rm("));
  });

  it("cleanupMcpRuntime removes only its captured directory and guards stale mutations", () => {
    const body = functionBody(code, "cleanupMcpRuntimeGeneration");
    expect(body).not.toBe("");
    expect(body).toContain("const cleanupTempDir = mcpTempDir");
    expect(body.indexOf("const cleanupTempDir = mcpTempDir")).toBeLessThan(
      body.indexOf("await unregisterMcpFromCli"),
    );
    expect(body).toContain(
      "await rm(cleanupTempDir, { recursive: true, force: true })",
    );
    expect(body).not.toContain("await rm(mcpTempDir");
    expect(
      body.match(
        /isMcpRuntimeEpochCurrent\(mcpLifecycle, cleanupEpoch\)/g,
      ) ?? [],
    ).toHaveLength(2);
    expect(body).toContain("mcpTempDir !== cleanupTempDir");
  });

  // 4. FIRE-AND-FORGET, exactly as the shipped `await killTree` gate is. Awaiting
  // either reap would suspend an RPC handler on a child-process callback and a
  // timer Caido's runtime does not reliably deliver during an await — the
  // starvation anti-pattern CLAUDE.md names — and for
  // `reapSessionOrphansIfIdle` it would additionally force `cancelCliMessage`
  // and `closeCliSession` async, changing signatures recorded decision OQ-4
  // fixes.
  //
  // COMMENT-STRIPPING IS LOAD-BEARING, not tidy: the fire-and-forget rule is
  // explained in `index.ts` comments that quote the awaited spelling, so an
  // unstripped scan would go red against the very text preventing the defect.
  //
  // RED INPUT: add the `await` keyword at any reap call site and the matching
  // count becomes non-null.
  it("never awaits either reap, and still calls both", () => {
    expect(code.match(/await\s+reapMcpOrphans/g)).toBeNull();
    expect(code.match(/await\s+reapSessionOrphansIfIdle/g)).toBeNull();

    // The positive companion, the rule T-08-06's gate already follows: without
    // it this case goes green the moment somebody deletes the whole mechanism —
    // a gate that passes hardest when there is nothing left to guard.
    expect(code).toContain("reapMcpOrphans(");
    expect(code).toContain("reapSessionOrphansIfIdle(");
  });

  it("revalidates the reap generation gate immediately before the signal loop", () => {
    const body = functionBody(code, "reapMcpOrphans");
    expect(body).not.toBe("");
    const recheck = body.indexOf("isMcpOrphanReapGateCurrent({");
    const signalLoop = body.indexOf("for (const pid of outcome.pids)");
    expect(recheck).not.toBe(-1);
    expect(signalLoop).not.toBe(-1);
    expect(recheck).toBeLessThan(signalLoop);
    expect(body.slice(recheck, signalLoop)).toContain(
      'reason: "gate-stale"',
    );
    expect(body.slice(recheck, signalLoop)).toContain("return;");
    expect(body).toContain("activeSessionCount: activeProcesses.size");
    expect(body).toContain(
      "directMcpCallDepth: countMcpDirectCalls(mcpLifecycle)",
    );
  });

  it("binds every reap caller to the gate identity it owns", () => {
    const gates = {
      reapSessionOrphansIfIdle: 'kind: "session-idle"',
      cleanupMcpRuntimeGeneration: 'kind: "runtime-cleanup"',
      sweepOrphanedMcpTempDirs: 'kind: "runtime-absent"',
    };
    for (const [name, gateKind] of Object.entries(gates)) {
      const body = functionBody(code, name);
      expect(body).not.toBe("");
      expect(body.match(/reapMcpOrphans\(/g) ?? []).toHaveLength(1);
      expect(body).toContain(gateKind);
      expect(body).toContain("getMcpRuntimeEpoch(mcpLifecycle)");
    }
  });

  // 5. THE GENERATION TOKEN'S SYMMETRY. `callMcpMethod` spawns `node
  // mcp-server.mjs` directly and that child's argv is byte-identical to a CLI's
  // MCP child, so the idle reap would select it (T-08-28). An acquire now
  // returns an epoch-bound identity and every release must carry that SAME
  // identity; scalar decrement/reset spellings are forbidden because a stale
  // release could consume a newer generation's slot.
  it("acquires and releases the exact direct-call token through the shared mutators", () => {
    expect(code).not.toContain("mcpDirectCallDepth");

    const acquire = topLevelDeclarationSlice(code, "acquireDirectMcpCall");
    expect(acquire).not.toBe("");
    expect(acquire).toContain("return acquireMcpDirectCall(mcpLifecycle)");

    const release = topLevelDeclarationSlice(code, "releaseDirectMcpCall");
    expect(release).not.toBe("");
    expect(release).toContain("releaseMcpDirectCall(mcpLifecycle, token)");

    const slice = topLevelDeclarationSlice(code, "callMcpMethod");
    expect(slice).not.toBe("");
    expect(slice).toContain("spawnWithEnv(");
    expect(slice.match(/acquireDirectMcpCall\(\)/g) ?? []).toHaveLength(1);
    expect(slice).toContain("const directCallToken = acquireDirectMcpCall()");
    expect(slice).toContain("releaseDirectMcpCall(directCallToken)");

    // Released from ALL THREE handlers, because any of them can be this child's
    // last event and none is guaranteed to fire under Caido's runtime. `exit` is
    // the one `kill-plan.ts` records LLRT as actually supplying, and it was the
    // missing one (review WR-01); `releaseDirectCall()` is idempotent, so a
    // runtime that delivers two of them still releases exactly once.
    expect(slice.match(/releaseDirectCall\(\)/g) ?? []).toHaveLength(3);
    for (const event of ["exit", "close", "error"]) {
      expect(slice).toContain(`proc.on("${event}"`);
    }
  });

  // 5c. Cleanup retires only its captured generation. A global reset is the bug:
  // it lets an old cleanup erase calls acquired by a replacement runtime.
  it("retires direct-call tokens only for cleanup's captured epoch", () => {
    const cleanup = functionBody(code, "cleanupMcpRuntimeGeneration");
    expect(cleanup).not.toBe("");
    expect(cleanup).toContain(
      "const cleanupEpoch = getMcpRuntimeEpoch(mcpLifecycle)",
    );
    expect(cleanup).toContain(
      "retireMcpDirectCalls(mcpLifecycle, cleanupEpoch)",
    );
    expect(cleanup).not.toContain("mcpLifecycle.directCalls.clear()");
  });

  it("serializes start, stop and refresh through the same lifecycle queue", () => {
    const operations = {
      startMcpServer: "startMcpServerOperation(sdk)",
      stopMcpServer: "stopMcpServerOperation(sdk)",
      refreshActiveMcpRuntime: "refreshActiveMcpRuntimeOperation(sdk)",
    };
    for (const [name, delegatedCall] of Object.entries(operations)) {
      const body = functionBody(code, name);
      expect(body).not.toBe("");
      expect(body).toContain("runMcpLifecycleOperation(mcpLifecycle");
      expect(body).toContain(delegatedCall);
    }
  });

  it("guards only the provider start commit with an epoch-bound lease", () => {
    const send = functionBody(code, "sendCliMessage");
    expect(send).not.toBe("");
    expect(send).not.toContain("runMcpLifecycleOperation(mcpLifecycle");

    const acquire = send.indexOf("acquireProviderStartLease(");
    const firstAwait = send.indexOf("await dataReady");
    const stage = send.indexOf("createSessionRuntimeFiles(");
    const commit = send.indexOf("commitProviderStartLease({");
    const spawn = send.indexOf("spawnWithEnv(", commit);
    const track = send.indexOf("activeProcesses.set(", commit);
    expect(acquire).not.toBe(-1);
    expect(firstAwait).not.toBe(-1);
    expect(stage).not.toBe(-1);
    expect(commit).not.toBe(-1);
    expect(spawn).not.toBe(-1);
    expect(track).not.toBe(-1);
    // A send owns its preparation identity before it can yield even once.
    // Otherwise Stop can complete while the send is invisible, after which a
    // newly acquired lease would be current and could commit a provider spawn.
    expect(acquire).toBeLessThan(firstAwait);
    expect(firstAwait).toBeLessThan(stage);
    expect(stage).toBeLessThan(commit);
    expect(commit).toBeLessThan(spawn);
    expect(spawn).toBeLessThan(track);
    const runtimeFileCalls = callArgumentTexts(
      send,
      "createSessionRuntimeFiles",
    );
    expect(runtimeFileCalls).toHaveLength(1);
    expect(runtimeFileCalls[0]).toContain("input.sessionId");
    expect(runtimeFileCalls[0]).toContain("providerStartLease.tempDir");
    expect(send).toContain("cleanupUncommittedProviderStart({");

    // If Stop removed the captured generation while one of the preparation
    // awaits was pending, createSessionRuntimeFiles may have recreated that
    // retired root before the stale commit is refused. Per-file cleanup must be
    // followed by ownership cleanup of the now-unreferenced directory.
    const stagedCleanup = send.indexOf("cleanupUncommittedProviderStart({");
    const retiredRootCleanup = send.indexOf(
      "cleanupRetiredProviderStartRoot({",
    );
    const retiredResult = send.indexOf(
      "const providerStartRetired = releaseProviderStartLease(",
    );
    const configCleanup = send.indexOf(
      "cleanupOwnedMcpConfigPaths(",
      retiredResult,
    );
    expect(retiredResult).not.toBe(-1);
    expect(configCleanup).not.toBe(-1);
    expect(retiredResult).toBeLessThan(configCleanup);
    expect(retiredRootCleanup).toBeGreaterThan(stagedCleanup);
    expect(send.match(/releaseProviderStartLease\(/g) ?? []).toHaveLength(1);
    const retiredCleanupCalls = callArgumentTexts(
      send,
      "cleanupRetiredProviderStartRoot",
    );
    expect(retiredCleanupCalls).toHaveLength(1);
    expect(retiredCleanupCalls[0]).toContain(
      "retired: providerStartRetired",
    );
    expect(retiredCleanupCalls[0]).toContain(
      "tempDir: providerStartLease.tempDir",
    );
    expect(retiredCleanupCalls[0]).toContain("removeRoot:");
    expect(retiredCleanupCalls[0]).toContain("recursive: true");
    expect(code).not.toContain("currentTempDir === leaseTempDir");
    expect(functionBody(code, "cleanupRetiredProviderStartRoot")).toBe("");
  });

  it("owns every token-bearing provider config in one cleanup funnel", () => {
    const send = functionBody(code, "sendCliMessage");
    expect(send).not.toBe("");

    // Claude and Copilot each write one per-turn config. Both paths must enter
    // the same owner-aware writer before I/O instead of adding ownership only
    // after a successful write.
    const configWrites = callArgumentTexts(send, "writeChatMcpConfig");
    expect(configWrites).toHaveLength(2);
    for (const call of configWrites) {
      expect(call).toContain("ownedMcpConfigPaths");
    }
    expect(send).not.toContain("ownedMcpConfigPaths.add(cfgFile)");
    expect(send).not.toContain("claudeMcpConfigPath");

    // A committed child reaches finalize on success, async spawn error, or
    // timeout. A refused/stale/synchronously throwing start reaches the outer
    // finally. Both consume the same ownership set; a rejected removal remains
    // in that set so the other consumer can retry it.
    const cleanupCalls = callArgumentTexts(
      send,
      "cleanupOwnedMcpConfigPaths",
    );
    expect(cleanupCalls).toHaveLength(2);
    for (const call of cleanupCalls) {
      expect(call).toContain("ownedMcpConfigPaths");
    }
    expect(send).toContain('finalize(err("Process timed out"))');
    expect(send).toContain("finalize(err(`Spawn error: ${e.message}`))");

    const cleanup = functionBody(code, "cleanupOwnedMcpConfigPaths");
    expect(cleanup).not.toContain("configPaths.clear()");
    expect(cleanup).toContain("await cleanupOwnedPaths({");
    expect(cleanup).toContain("owners: configPaths");
    expect(cleanup).toContain("remove: async (configPath)");
    expect(cleanup).toContain("await rm(configPath, { force: true })");
  });

  it("atomically writes owned configs inside the bounded retry ladder", () => {
    const writer = functionBody(code, "writeChatMcpConfig");
    expect(writer).not.toBe("");

    const expansionGuard = writer.indexOf("findExpandableEnvKeys(");
    const ownershipWrite = writer.indexOf("writeOwnedTempFile({");
    expect(expansionGuard).not.toBe(-1);
    expect(ownershipWrite).not.toBe(-1);
    expect(expansionGuard).toBeLessThan(ownershipWrite);
    expect(writer.match(/withFsRetry\(/g) ?? []).toHaveLength(1);
    expect(writer).toContain("owners: ownedMcpConfigPaths");
    expect(writer).toContain("await mkdir(tempDir, {");
    expect(writer).toContain("mode: 0o700");
    expect(writer).toContain("await writeFile(stagingPath, content, {");
    expect(writer).toContain("mode: 0o600");
    expect(writer).toContain("await rename(stagingPath, finalPath)");
    expect(writer).toContain("lastTempWriteAttempts = written.attempts");
    expect(writer).toContain("`${name}.${genUUID()}.tmp`");
  });

  it("invalidates provider start leases before teardown's process pass", () => {
    const cleanup = functionBody(code, "cleanupMcpRuntime");
    const generation = functionBody(code, "cleanupMcpRuntimeGeneration");
    expect(cleanup).not.toBe("");
    expect(generation).not.toBe("");
    expect(cleanup).toContain("runMcpProviderTeardown(");
    expect(cleanup).toContain("cleanupMcpRuntimeGeneration(");
    expect(generation).toContain("killTree(");
  });

  // 5b. THE CR-01 CENSUS — every spawn whose argv carries the MCP server script
  // path sits inside a direct-call guard, BY ENCLOSING FUNCTION AND NEVER BY A
  // BARE TOTAL, the same shape as case 1 above and for the same reason.
  //
  // The script path reaches a spawn argv through exactly two expressions in this
  // file: `spec.args` (whose element 0 IS the path, set by `buildMcpServerSpec`)
  // and `addPlan.args` (built from `buildMcpCliRegistrationArgv`, which ends with
  // the path as a positional). Both populations are enumerated per function and
  // balanced against the file total, so a FOURTH script-path-bearing spawn added
  // anywhere goes red here instead of being absorbed by a whole-file count — the
  // failure that let `validateCaidoAuth` and the `mcp add` registration sit
  // outside the counter for the whole of this phase.
  //
  // `tryRegisterMcpForProviders` is enumerated with 1 and needs NO guard: its
  // `spec.args[0]` is a READ, not a spawn. It is counted so the total balances,
  // which is what keeps the sum honest rather than exempting it.
  //
  // RED INPUT: delete `withDirectMcpCall(` from `validateCaidoAuth` or
  // `registerMcpWithCli`, or add a `spec.args`-bearing spawn to a fourth
  // function, and this fails naming it.
  it("routes every script-path-bearing spawn through a direct-call guard", () => {
    const specArgsSites = {
      validateCaidoAuth: 1,
      callMcpMethod: 1,
      tryRegisterMcpForProviders: 1,
    };
    let enumerated = 0;
    for (const [name, expected] of Object.entries(specArgsSites)) {
      const slice = topLevelDeclarationSlice(code, name);
      // Non-vacuity per function, per case 1's rule: an empty slice counts 0 and
      // would silently satisfy any expectation that happened to be 0.
      expect(slice).not.toBe("");
      expect({ name, hits: (slice.match(/spec\.args/g) ?? []).length }).toEqual({
        name,
        hits: expected,
      });
      enumerated += expected;
    }
    expect(code.match(/spec\.args/g) ?? []).toHaveLength(enumerated);

    // The registration argv, its own population of one.
    const register = topLevelDeclarationSlice(code, "registerMcpWithCli");
    expect(register).not.toBe("");
    expect(register.match(/addPlan\.value\.args/g) ?? []).toHaveLength(1);
    expect(code.match(/addPlan\.value\.args/g) ?? []).toHaveLength(1);

    // THE GUARD ITSELF, at the two AWAITED sites. `withDirectMcpCall(` matches
    // the two CALLS and not the declaration — that is spelled
    // `withDirectMcpCall<T>(` — so this total is the call count, not the call
    // count plus one.
    const validate = topLevelDeclarationSlice(code, "validateCaidoAuth");
    expect(validate).not.toBe("");
    expect(validate.match(/withDirectMcpCall\(/g) ?? []).toHaveLength(1);
    expect(register.match(/withDirectMcpCall\(/g) ?? []).toHaveLength(1);
    expect(code.match(/withDirectMcpCall\(/g) ?? []).toHaveLength(2);

    // And the declaration exists, so this case cannot pass by the guard having
    // been deleted along with both of its call sites.
    expect(code).toContain("async function withDirectMcpCall<T>(");
  });

  // 5d. THE GATE'S REFUSAL IS OBSERVABLE (review WR-02). The idle gate is the
  // only arm on this path that can suppress the reap for an entire Caido
  // session, and it was the only one that returned without logging — so a
  // suppressed reap and a reap that found nothing produced identical
  // diagnostics, on a phase whose verification vehicle is a human reading them.
  //
  // The two scalars are asserted BY NAME rather than by a bare `console.log`
  // count, because a log line that omits the counts distinguishes nothing: it is
  // `sessions` versus `directDepth` that separates AR-07 from a leaked depth.
  //
  // RED INPUT: delete the log, or drop either scalar from it, and this fails.
  it("logs the two scalars when the idle gate refuses", () => {
    const body = functionBody(code, "reapSessionOrphansIfIdle");
    expect(body).not.toBe("");
    expect(body.match(/sdk\.console\.log\(/g) ?? []).toHaveLength(1);
    expect(body).toContain("gate-closed");
    expect(body).toContain("sessions=${String(activeSessionCount)}");
    expect(body).toContain("directDepth=${String(directMcpCallDepth)}");
  });

  // 5e. THE TWO BOUNDS ON THE SAME WINDOW CANNOT DRIFT APART (review WR-03).
  //
  // `reapMcpOrphans` bounds the scan twice: with a `setTimeout` that kills the
  // enumerator, and — since WR-03 — with a wall-clock age the pure classifier
  // compares against a budget. The wall-clock check exists BECAUSE the timer may
  // not get to run on a starved event loop, so it must never be the STRICTER of
  // the two: a budget smaller than the timeout would refuse scans the timer would
  // have allowed, which is the reaper failing to fire when it should.
  //
  // Passing the same identifier to both is the whole guarantee, and it is
  // asserted here because nothing in `index.ts` is reachable from a unit test.
  //
  // RED INPUT: pass a literal, or a different constant, to either the timer or
  // the classifier and this fails.
  it("bounds the scan with ONE constant, at the timer and at the freshness check", () => {
    const body = functionBody(code, "reapMcpOrphans");
    expect(body).not.toBe("");
    expect(body).toContain("scanFreshnessBudgetMs: ORPHAN_SCAN_TIMEOUT_MS,");
    expect(body).toContain("}, ORPHAN_SCAN_TIMEOUT_MS);");
    expect(body).toContain("scanAgeMs: Date.now() - scanStartedAt,");
    // Read BEFORE the spawn, so the age covers the enumerator's whole life. A
    // `scanStartedAt` assigned inside `settleScan` would read ~0 every time and
    // make the bound vacuous while both assertions above stayed green.
    expect(body.indexOf("const scanStartedAt = Date.now();")).toBeGreaterThan(-1);
    expect(body.indexOf("const scanStartedAt = Date.now();")).toBeLessThan(
      body.indexOf("scanner = spawn("),
    );

    // And the constant it resolves to is a POSITIVE INTEGER — the classifier
    // treats a non-positive or non-integer budget as stale, which would disable
    // the reap entirely.
    const declaration = /const POSIX_PATH_SEARCH_TIMEOUT_MS = (\d+);/.exec(code);
    expect(declaration).not.toBeNull();
    expect(Number(declaration?.[1] ?? "0")).toBeGreaterThan(0);
    expect(code).toContain(
      "const ORPHAN_SCAN_TIMEOUT_MS = POSIX_PATH_SEARCH_TIMEOUT_MS;",
    );
  });

  // 6. THE MARKER HAS ONE SPELLING. The directory Drift CREATES and the pattern
  // the reaper SEARCHES FOR must be the same string, which they silently would
  // not be if the prefix lived as a bare literal at either site. Plan 08-06
  // replaced two such literals with `MCP_TEMP_DIR_PREFIX`; this keeps them gone.
  //
  // THE VALUE IS READ FROM THE CONSTANT'S DECLARATION rather than restated here,
  // so renaming the prefix cannot leave this gate asserting a stale string.
  //
  // ONE occurrence survives in the comment-stripped source and it is ENUMERATED
  // rather than exempted by a looser count: the user-facing insecure-mode message
  // that tells a user to remove leftover `drift-mcp-*` directories by hand. That
  // is prose shown to a human, not a marker any code matches on. RED INPUT:
  // reintroduce the literal at either former marker site — `path.join(root,
  // "drift-mcp-" + token)` — and the count goes from 1 to 2.
  it("spells the temp-dir prefix once, through the shared constant", () => {
    const prefixDeclaration = /export const MCP_TEMP_DIR_PREFIX = "([^"]+)";/.exec(
      killPlanSource,
    );
    expect(prefixDeclaration).not.toBeNull();
    const prefix = prefixDeclaration?.[1] ?? "";
    expect(prefix).not.toBe("");

    const occurrences = code.split(prefix).length - 1;
    expect(occurrences).toBe(1);

    // And that single occurrence is the human-facing remediation sentence, not a
    // marker. Asserted by content so a NEW bare literal cannot inherit this
    // exemption by simply replacing it.
    const line = code
      .split("\n")
      .find((candidate) => candidate.includes(prefix));
    expect(line ?? "").toContain("Remove any leftover");

    // The constant is what the code actually uses, at both former literal sites
    // plus the import — the positive companion, so this gate cannot pass by the
    // marker having been deleted.
    expect(code.match(/MCP_TEMP_DIR_PREFIX/g) ?? []).toHaveLength(3);
  });
});

// ── G-01: the derived Windows system root, at every consumer and nowhere else ──
//
// WHAT THIS BLOCK IS REALLY GUARDING. `readParentEnv()` returns an EMPTY record
// on every real Caido install — measured 2026-08-27, `parentEnvKeyCount: 0` —
// so three consumers whose empty-environment outcome was a BARE executable name
// now take a derived root instead. `platform.ts` and `kill-plan.ts` prove the
// LADDER from literal inputs; nothing but a source scan can prove the WIRING,
// because `index.ts` cannot be imported by any test this project can run.
//
// This is the CR-01 failure shape asserted directly (T-08-36): a
// security-relevant parameter whose own unit test passes and which no production
// call site ever supplies. The compiler catches that one for these three, since
// the member is required — but only in `src`. It cannot catch it in a test file,
// because `packages/backend/tsconfig.json` excludes `./src/**/*.test.ts`.
describe("index.ts derives a Windows system root and passes it at every consumer (G-01)", () => {
  // RED INPUT: add a fourth call site, or drop one, and this fails. A NEW
  // consumer of the derived root is a decision that should be read by a human,
  // not absorbed silently by a passing suite — the rule the COMSPEC block above
  // already applies to `buildSpawnPlan`.
  it("has the one declaration plus exactly the three call sites", () => {
    expect(code.match(/getWindowsSystemRootFallback\(/g) ?? []).toHaveLength(4);
    expect(code).toContain("function getWindowsSystemRootFallback(");
  });

  // Asserted PER CONSUMER rather than as an aggregate, so a single missing site
  // is identifiable from the failure message instead of "one of three".
  //
  // RED INPUT: delete `systemRootFallback` from any one of the three argument
  // lists and exactly that consumer's expectation fails, naming it.
  it("passes systemRootFallback at each named consumer", () => {
    for (const consumer of [
      "selectComspec",
      "getWhichCommand",
      "buildKillTreePlan",
    ]) {
      const calls = callArgumentTexts(code, consumer);
      expect(calls, `${consumer} call sites`).toHaveLength(1);
      expect(calls[0] ?? "", `${consumer} arguments`).toContain(
        "systemRootFallback: getWindowsSystemRootFallback()",
      );
    }
  });

  // The D-P4 injected-boundary shape, one level up: the derivation happens ONCE,
  // at the I/O boundary, and the three consumers receive its result. A call site
  // deriving its own root would put the win32 decision in three places again —
  // which is the duplication this plan removed from `getWhichCommand` and
  // `buildKillTreePlan`.
  //
  // RED INPUT: inline `deriveWindowsSystemRoot({ tmpdir: host?.tmpdir })` at any
  // call site and the count goes from 1 to 2.
  it("derives the root in exactly one place, inside the boundary function", () => {
    expect(code.match(/deriveWindowsSystemRoot\(/g) ?? []).toHaveLength(1);

    const slice = topLevelDeclarationSlice(code, "getWindowsSystemRootFallback");
    expect(slice).not.toBe("");
    expect(slice).toContain("deriveWindowsSystemRoot({ tmpdir: host?.tmpdir })");
  });

  // THE CENSUS, and it is the reason this block is worth its weight. Every
  // consumer of `readParentEnv()` inherits an empty record on a real install.
  // Three of them were security defects and are fixed here; two are recorded
  // residuals with owning phases. A SIXTH consumer added later would inherit the
  // same emptiness silently — so the count is pinned, and moving it forces
  // whoever moves it to answer the in-scope/out-of-scope question written at
  // `readParentEnv`'s own declaration.
  //
  // MEASURED IN THIS TASK rather than copied from the plan: 13 occurrences in
  // the comment-stripped source — the declaration plus twelve call sites.
  //
  // RED INPUT: add a thirteenth `readParentEnv()` call site and this fails.
  it("pins the readParentEnv consumer census at its measured count", () => {
    expect(code.match(/readParentEnv\(/g) ?? []).toHaveLength(13);
  });

  // The positive companion, the rule T-08-06's gate already follows: without it
  // the census above goes green the moment somebody deletes `readParentEnv`
  // outright — a gate that passes hardest when there is nothing left to guard.
  //
  // RED INPUT: delete the declaration, or stop passing the environment at any
  // named consumer, and this fails.
  it("still routes every named consumer through that one boundary read", () => {
    expect(code).toContain("function readParentEnv(");
    for (const consumer of [
      "selectComspec",
      "getWhichCommand",
      "buildKillTreePlan",
    ]) {
      const calls = callArgumentTexts(code, consumer);
      expect(calls[0] ?? "", `${consumer} environment source`).toContain(
        "env: readParentEnv()",
      );
    }
    // The two OUT-OF-SCOPE consumers, enumerated rather than ignored. Their
    // empty-environment outcome is a missing candidate path or a child with
    // fewer variables — never a bare name executed — so they are residuals with
    // owning phases (10 and 9), recorded at `readParentEnv`'s declaration.
    //
    // BY COUNT, not by `toContain`, and the difference was measured rather than
    // assumed: each of these shapes occurs at TWO sites, so an existence check
    // is satisfied by either one and cannot see the other regress. Constructing
    // that exact mutation — reflowing ONE `getWindowsNamedRoots` site — left a
    // `toContain` form of this assertion GREEN. The counts below go red for it.
    expect(
      code.split("getWindowsNamedRoots({ env: readParentEnv() })").length - 1,
    ).toBe(2);
    expect(
      code.split("isNvmWindowsInstalled({ env: readParentEnv() })").length - 1,
    ).toBe(2);
    expect(code.split("parentEnv: readParentEnv()").length - 1).toBe(4);
  });
});

// G-05. Five writes into the MCP temp directory shipped with no `mode` option
// and landed at 0644, against CLAUDE.md's rule that sensitive temp files are
// 0o600. The gap was filed against ONE of them — `mcp-context.json`, the only
// one anybody had run `ls -la` on — and the other four were found by tracing the
// omission rather than by observing it. This census is what makes the SIXTH one
// impossible to add silently: a `writeFile` added to `index.ts` without a mode
// moves a number here, and moving it forces whoever moved it to say why.
//
// MEASURED IN THIS TASK on 2026-08-27 against `index.ts` as delivered by this
// plan's Task 1, not copied from the plan: SEVEN `writeFile(` call sites, of
// which SIX carry a `mode:` option.
describe("index.ts states an explicit mode at every writeFile but the one named exemption (G-05)", () => {
  // The census, stated as a total and a difference rather than as two
  // independent literals, so the two numbers cannot drift apart quietly.
  //
  // THE ONE EXEMPTION IS NAMED, and it is `saveJson`'s plugin-data backup —
  // `path.join(pluginPath, ...)`. That write lives OUTSIDE the temp root, in
  // Caido's own plugin data directory, carries settings and chat history rather
  // than the session token, and is outside G-05's scope. It is exempt on
  // purpose, not by oversight, which is why it is spelled out here instead of
  // being absorbed into a round number.
  //
  // RED INPUT, in both directions and both verified by construction:
  //   - add a `writeFile` into the temp directory without a mode → the
  //     difference becomes two and this fails;
  //   - remove any one of the seven `mode:` options → same failure.
  it("carries a mode at every writeFile except exactly one", () => {
    const writes = callArgumentTexts(code, "writeFile");
    expect(writes).toHaveLength(8);

    const withMode = writes.filter((args) => args.includes("mode:"));
    expect(withMode).toHaveLength(writes.length - 1);
  });

  // The positive companion, and it is not ceremony. Without it the case above
  // goes green two ways that both LOOK like a fix: delete the exempt write
  // outright (8 → 7, 7 → 6, difference still one), or move a temp-directory
  // write into the exempt shape. Naming the exemption positively closes both.
  //
  // RED INPUT: delete the plugin-data write, or give a second `writeFile` a
  // `pluginPath` argument, and this fails.
  it("names that one exemption positively rather than assuming it", () => {
    const writes = callArgumentTexts(code, "writeFile");
    const exempt = writes.filter((args) => args.includes("pluginPath"));
    expect(exempt).toHaveLength(1);
    expect(exempt[0] ?? "").not.toContain("mode:");
  });

  // THE EXECUTE-BIT ASSERTION, and it is a `callArgumentTexts` scan rather than
  // a grep for a reason that is not obvious and WILL tempt a later reader into
  // "simplifying" it back into one line. Do not.
  //
  // `index.ts`'s `writeMcpContextFile` write is a MULTI-LINE `writeFile(` call:
  // its arguments run across four lines, so an injected `mode: 0o700` lands on a
  // line carrying no `writeFile` token at all. Every line-oriented pipeline
  // therefore misses it — including the one this plan originally drafted
  // (`grep -n '0o700' … | grep -v mkdir | grep -c writeFile`), which was
  // falsifiable at four of the five temp-directory sites and blind at the fifth.
  // The fifth is the site gap G-05 was filed against, so the grep form was blind
  // at precisely the place the criterion existed to watch. Verified empirically
  // on 2026-08-27 by injecting that exact violation at that exact site and
  // watching the pipeline return 0 while the tree was in a violating state.
  //
  // `callArgumentTexts` balances parentheses, so it sees the whole argument list
  // however it is wrapped. It also never reads comments — it extracts argument
  // text, not lines — which is the second thing the grep form needed a pipe
  // stage for.
  //
  // RED INPUT: add `{ mode: 0o700 }` to ANY `writeFile` call, including the
  // multi-line one, and this fails.
  it("grants no execute bit at any writeFile, however the call is wrapped", () => {
    const writes = callArgumentTexts(code, "writeFile");
    expect(writes).not.toHaveLength(0);
    for (const [index, args] of writes.entries()) {
      expect(args, `writeFile call site #${String(index)}`).not.toContain(
        "0o700",
      );
    }
  });
});

// The reap's outcome log lines, over the COMMENT-STRIPPED stream. Ledger entry
// 18 records an exact-count criterion in this very file that moved when someone
// added a "why" comment mentioning the token it counted — no behavioural change,
// a red gate. Entries 16 and 17 are the same defect in its other direction: a
// criterion that already returned its target value against an UNEDITED tree, so
// it proved nothing. Both hazards are answered the same way — count over the
// stripped stream, and measure the gate against a mutated tree rather than
// asserting it would move.
const REAP_OUTCOME_LOG = /\[drift lifecycle\] (?:no )?orphan reap:/g;
const REAP_RECORD_CALL = /recordOrphanReapOutcome\(/g;

// Every top-level `function` / `async function` name in the file. Used by
// direction two below to ATTRIBUTE a stray recording call to the function that
// contains it, rather than merely reporting that the totals disagree — a census
// that says "something is wrong somewhere" is one nobody can act on.
function topLevelFunctionNames(source: string): string[] {
  const names = new Set<string>();
  const pattern = /^(?:async )?function ([A-Za-z0-9_$]+)\(/gm;
  let match = pattern.exec(source);
  while (match !== null) {
    if (match[1] !== undefined) names.add(match[1]);
    match = pattern.exec(source);
  }
  return [...names];
}

describe("index.ts records every reap outcome it logs, and records nothing else (UD-01 / T-08-75)", () => {
  // The two functions that PRODUCE a reap outcome. `reapMcpOrphans` owns three
  // (the plan refusal, the no-op arm and the completed reap);
  // `reapSessionOrphansIfIdle` owns the gate-closed refusal, which is the ONE
  // arm that can suppress the reap for a whole Caido session.
  const OUTCOME_FUNCTIONS = ["reapMcpOrphans", "reapSessionOrphansIfIdle"];

  // DIRECTION ONE. Enumerated PER FUNCTION and never as a file-wide total,
  // because a file-wide equality is satisfied by any redistribution: a fifth arm
  // added to `reapMcpOrphans` with no recording call, plus a stray recording
  // call added anywhere else, keeps 5 == 5 while the key silently stops
  // reporting the new arm.
  //
  // RED INPUT: delete one `recordOrphanReapOutcome(` call and this fails naming
  // the enclosing function and both counts. MEASURED, not asserted — see this
  // plan's SUMMARY for the captured failure and the restored pass.
  it("pairs a recording call with every outcome log line, function by function", () => {
    for (const name of OUTCOME_FUNCTIONS) {
      const body = functionBody(code, name);
      // Non-vacuity, per function. An empty body counts 0 log lines and 0
      // recording calls, and 0 === 0 would satisfy the equality below while
      // asserting nothing whatsoever — the shape ledger entries 16 and 17 name as
      // the ninth and tenth vacuous gates of this phase.
      expect(body, `${name} body`).not.toBe("");

      const logs = (body.match(REAP_OUTCOME_LOG) ?? []).length;
      const records = (body.match(REAP_RECORD_CALL) ?? []).length;

      expect(logs, `${name} outcome log lines`).toBeGreaterThan(0);
      expect(
        records,
        `${name} logs ${String(logs)} reap outcome(s) but records ${String(records)} of them — every outcome the console reports must also reach lastOrphanReap`,
      ).toBe(logs);
    }
  });

  // DIRECTION TWO. A one-directional census is how a gate passes by accident:
  // direction one is satisfied by a function that records MORE outcomes than it
  // logs, and a recording call on an unrelated path makes the diagnostics key
  // report an outcome that never happened.
  //
  // RED INPUT: add a `recordOrphanReapOutcome(` call inside any other function
  // and this fails naming that function. MEASURED, not asserted.
  it("records a reap outcome from nowhere except the functions that produce one", () => {
    const offenders: string[] = [];
    let attributed = 0;
    for (const name of topLevelFunctionNames(code)) {
      // The declaration of the recorder itself is not a call site, and its own
      // body contains no call, so it needs no special case here — but the
      // file-wide total below does subtract it.
      const body = functionBody(code, name);
      const records = (body.match(REAP_RECORD_CALL) ?? []).length;
      if (records === 0) continue;
      attributed += records;
      if (!OUTCOME_FUNCTIONS.includes(name)) {
        offenders.push(`${name} (${String(records)} call(s))`);
      }
    }

    expect(
      offenders,
      `recordOrphanReapOutcome( is called from ${offenders.join(", ")} — a function that produces no reap outcome, so lastOrphanReap would report an outcome that never happened`,
    ).toEqual([]);

    // The unattributed guard, in the same shape the existing reap census uses.
    // A call inside an arrow-function const, or inside a nested closure of some
    // unrelated function, belongs to no top-level `function` declaration and so
    // is invisible to the loop above; it shows up here as a total that the
    // enumeration cannot account for.
    const total = (code.match(REAP_RECORD_CALL) ?? []).length;
    const declaration = (
      code.match(/function recordOrphanReapOutcome\(/g) ?? []
    ).length;
    expect(declaration).toBe(1);
    expect(
      total - declaration,
      "a recordOrphanReapOutcome( call sits in no enumerated top-level function",
    ).toBe(attributed);
  });

  // The key reaches the support bundle EXACTLY ONCE, and has exactly one
  // writer. Two writers is how a value drifts from the outcome it names; two
  // keys is how a reader gets a stale one and a fresh one side by side.
  //
  // RED INPUT: surface the key twice, drop it from getDiagnostics entirely, or
  // assign lastOrphanReap anywhere other than the recorder, and this fails.
  it("surfaces the key once in getDiagnostics and writes it from one place", () => {
    const diagnostics = functionBody(code, "getDiagnostics");
    expect(diagnostics).not.toBe("");
    expect(diagnostics.match(/lastOrphanReap:/g) ?? []).toHaveLength(1);

    expect(code.match(/let lastOrphanReap/g) ?? []).toHaveLength(1);
    const writer = functionBody(code, "recordOrphanReapOutcome");
    expect(writer).not.toBe("");
    expect(writer).toContain("lastOrphanReap = formatOrphanReapRecord(record)");
    // One assignment in the whole file, and it is that one.
    expect(code.match(/lastOrphanReap = /g) ?? []).toHaveLength(1);
  });

  // THE FIRE-AND-FORGET CONTRACT IS UNCHANGED BY THIS KEY. Recording is a
  // synchronous assignment; if a future edit makes it awaitable it would suspend
  // an RPC handler on the reap path, which is the starvation anti-pattern
  // CLAUDE.md names and which recorded decision OQ-4 forbids for these two
  // functions specifically.
  //
  // RED INPUT: write `await recordOrphanReapOutcome(` at any site.
  it("never awaits the recording, and still records", () => {
    expect(code.match(/await\s+recordOrphanReapOutcome/g)).toBeNull();
    expect(code).toContain("recordOrphanReapOutcome(");
  });
});
