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
const LLRT_NEGATIVE_PID_SIGNAL = /process\s*\.\s*kill\s*\(\s*-/g;

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
