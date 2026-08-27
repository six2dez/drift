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

// CR-01. `buildSpawnPlan`'s cmd.exe arm falls back to the BARE name "cmd.exe",
// which Windows resolves through a search order that includes the working
// directory Caido's plugin host chose. The pure module keeps that literal as a
// last resort and states that reading the environment is the caller's job; this
// is the assertion that the caller does it, at every site, without exception.
//
// The count is asserted too. A sixth site added without `comspec` fails the
// per-site check; a sixth site added WITH it still fails this count, which is
// the point — a new spawn of a provider binary is a decision that should be read
// by a human, not absorbed silently by a passing suite.
describe("index.ts wires COMSPEC into every buildSpawnPlan call site (CR-01)", () => {
  const calls = callArgumentTexts(code, "buildSpawnPlan");

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
    const body = functionBody(code, "cleanupMcpRuntime");

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
  const body = functionBody(code, "cleanupMcpRuntime");

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
      cleanupMcpRuntime: 1,
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
    const body = functionBody(code, "cleanupMcpRuntime");

    expect(body).not.toBe("");
    expect(body.indexOf("reapMcpOrphans(")).not.toBe(-1);
    expect(body.indexOf("killTree(")).not.toBe(-1);
    expect(body.indexOf("rm(")).not.toBe(-1);
    expect(body.indexOf("reapMcpOrphans(")).toBeLessThan(body.indexOf("rm("));
    expect(body.indexOf("killTree(")).toBeLessThan(body.indexOf("rm("));
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

  // 5. THE DEPTH COUNTER'S SYMMETRY. `callMcpMethod` spawns `node
  // mcp-server.mjs` directly and that child's argv is byte-identical to a CLI's
  // MCP child, so the idle reap would select it (T-08-28). The counter is what
  // excludes it, and a counter with two increments or two decrements is a
  // counter that drifts — in the decrement direction it would open the gate on a
  // live self-test.
  //
  // RED INPUT: add a second increment or a second release, or move the increment
  // out of `callMcpMethod`, and this fails.
  it("increments and releases the direct-call depth exactly once each, inside callMcpMethod", () => {
    expect(code.match(/mcpDirectCallDepth \+= 1/g) ?? []).toHaveLength(1);
    expect(code.match(/mcpDirectCallDepth -= 1/g) ?? []).toHaveLength(1);

    const slice = topLevelDeclarationSlice(code, "callMcpMethod");
    expect(slice).not.toBe("");
    expect(slice).toContain("spawnWithEnv(");
    expect(slice.match(/mcpDirectCallDepth \+= 1/g) ?? []).toHaveLength(1);

    // Released from BOTH handlers, because either can be this child's last
    // event and neither is guaranteed to fire under Caido's runtime.
    expect(slice.match(/releaseDirectCall\(\)/g) ?? []).toHaveLength(2);
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
