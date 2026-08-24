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
