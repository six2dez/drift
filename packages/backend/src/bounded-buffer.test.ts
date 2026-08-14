// PERF-04's proof. Nothing here touches disk or spawns anything — the whole
// point of bounded-buffer.ts is that the truncation arithmetic is pure, so the
// caps, the retention policies and the marker are assertable on the POSIX
// runner the maintainer actually has.
//
// The `it` titles are a CONTRACT with 04-VALIDATION.md's PERF-04 rows, which
// address themselves as `-t "below the cap"`, `-t "both ends"`, `-t "marker"`,
// `-t "drains complete lines"`, `-t "drops an over-cap remainder"` and
// `-t "keeps the tail only under tail retention"`. vitest's -t is a substring
// match over the FULL test name, so a reworded title resolves to zero tests
// while still reading correctly to a human — a silently-empty selector is
// indistinguishable from a green run. Do not reword these.
import { describe, expect, it } from "vitest";
import {
  appendBounded,
  buildTruncationMarker,
  createBoundedBuffer,
  drainCompleteLines,
  renderBoundedBuffer,
  CLI_STDERR_MAX_CHARS,
  CLI_STDOUT_MAX_CHARS,
  MCP_SELFTEST_LINE_MAX_CHARS,
  MCP_SELFTEST_STDERR_MAX_CHARS,
  SPAWN_STDERR_MAX_CHARS,
  SPAWN_STDOUT_MAX_CHARS,
  TRUNCATION_MARKER_PREFIX,
  type BoundedRetention,
} from "./bounded-buffer";

const ALL_RETENTIONS: BoundedRetention[] = ["head", "tail", "both"];

// A positionally-identifiable payload: every 5-character block names its own
// index, so an assertion about which end survived is legible in a diff rather
// than a wall of the same character.
function numberedPayload(blocks: number): string {
  return Array.from(
    { length: blocks },
    (_, index) => `[${String(index).padStart(3, "0")}]`,
  ).join("");
}

describe("appendBounded", () => {
  it("returns the input unchanged below the cap", () => {
    const chunks = ["alpha ", "bravo ", "charlie"];
    const expected = chunks.join("");

    for (const retention of ALL_RETENTIONS) {
      let buffer = createBoundedBuffer({ maxChars: 4096, retention });
      for (const chunk of chunks) {
        buffer = appendBounded(buffer, chunk);
      }

      const rendered = renderBoundedBuffer(buffer);
      expect(rendered).toBe(expected);
      expect(buffer.head + buffer.tail).toBe(expected);
      expect(buffer.droppedChars).toBe(0);
      expect(rendered).not.toContain(TRUNCATION_MARKER_PREFIX);
    }
  });

  it("keeps both ends and drops the middle when the cap is exceeded", () => {
    const maxChars = 100;
    const payload = numberedPayload(40); // 200 characters
    const buffer = appendBounded(
      createBoundedBuffer({ maxChars, retention: "both" }),
      payload,
    );

    const opening = payload.slice(0, 50);
    const closing = payload.slice(-50);
    const marker = buildTruncationMarker(buffer.droppedChars);
    const rendered = renderBoundedBuffer(buffer);

    expect(buffer.droppedChars).toBe(payload.length - maxChars);
    expect(rendered.startsWith(opening)).toBe(true);
    expect(rendered.endsWith(closing)).toBe(true);
    expect(rendered).toContain(marker);
    expect(rendered).toBe(opening + marker + closing);
    // The middle really is gone, not merely re-ordered.
    expect(rendered).not.toContain("[020]");
    // The bound the threat register (T-04-05) actually claims: a runaway child
    // cannot grow this past the cap plus one marker, no matter how much it
    // writes. Asserted numerically rather than as "truncation happened".
    expect(rendered.length).toBeLessThanOrEqual(maxChars + marker.length);
  });

  it("keeps the head only under head retention", () => {
    const payload = `HEAD-START${"-".repeat(80)}TAIL-END`;
    const buffer = appendBounded(
      createBoundedBuffer({ maxChars: 20, retention: "head" }),
      payload,
    );
    const rendered = renderBoundedBuffer(buffer);

    expect(buffer.head).toBe(payload.slice(0, 20));
    expect(buffer.tail).toBe("");
    expect(buffer.droppedChars).toBe(payload.length - 20);
    expect(rendered.startsWith("HEAD-START")).toBe(true);
    expect(rendered).not.toContain("TAIL-END");
  });

  it("keeps the tail only under tail retention", () => {
    const payload = `HEAD-START${"-".repeat(80)}TAIL-END`;
    const buffer = appendBounded(
      createBoundedBuffer({ maxChars: 20, retention: "tail" }),
      payload,
    );
    const rendered = renderBoundedBuffer(buffer);

    expect(buffer.head).toBe("");
    expect(buffer.tail).toBe(payload.slice(-20));
    expect(buffer.droppedChars).toBe(payload.length - 20);
    expect(rendered.endsWith("TAIL-END")).toBe(true);
    expect(rendered).not.toContain("HEAD-START");
  });

  it("embeds the dropped byte count in the marker", () => {
    const maxChars = 64;
    const payload = numberedPayload(100); // 500 characters
    const buffer = appendBounded(
      createBoundedBuffer({ maxChars, retention: "both" }),
      payload,
    );
    const rendered = renderBoundedBuffer(buffer);

    // The count is what was lost, exactly: everything appended minus everything
    // still held. A marker that cannot be reconciled with the retained text is
    // worse than no marker (T-04-18).
    expect(buffer.droppedChars).toBe(
      payload.length - (buffer.head.length + buffer.tail.length),
    );
    expect(rendered).toContain(String(buffer.droppedChars));
    expect(rendered).toContain(buildTruncationMarker(buffer.droppedChars));

    // The literal wire form, pinned so a well-meaning reword of the marker is a
    // failing test rather than a silently un-greppable support bundle.
    expect(buildTruncationMarker(4194304)).toBe(
      "\n…[drift: truncated 4194304 bytes]…\n",
    );
  });

  it("accumulates the dropped count across several appends past the cap", () => {
    const maxChars = 32;
    let buffer = createBoundedBuffer({ maxChars, retention: "tail" });
    const seen: number[] = [];

    for (let round = 0; round < 3; round += 1) {
      buffer = appendBounded(buffer, "y".repeat(100));
      seen.push(buffer.droppedChars);
    }

    expect(seen).toEqual([68, 168, 268]);
    expect(seen[0]).toBeLessThan(seen[1] ?? -1);
    expect(seen[1]).toBeLessThan(seen[2] ?? -1);
    expect(buffer.droppedChars).toBe(300 - maxChars);

    // Cumulative, not per-append: the marker must not read 100 (the last
    // append's own contribution), which is exactly what re-deriving the count
    // from a rendered string on each append would produce.
    const rendered = renderBoundedBuffer(buffer);
    expect(rendered).toContain(buildTruncationMarker(268));
    expect(rendered).not.toContain(buildTruncationMarker(100));
  });

  it("does not mutate the buffer it is given", () => {
    const original = appendBounded(
      createBoundedBuffer({ maxChars: 16, retention: "both" }),
      "seed",
    );
    const snapshot = {
      head: original.head,
      tail: original.tail,
      droppedChars: original.droppedChars,
    };

    const overCap = appendBounded(original, "z".repeat(100));

    expect(original.head).toBe(snapshot.head);
    expect(original.tail).toBe(snapshot.tail);
    expect(original.droppedChars).toBe(snapshot.droppedChars);
    expect(overCap).not.toBe(original);
    expect(overCap.droppedChars).toBeGreaterThan(0);

    // The below-cap path returns a fresh object too, so a caller can never
    // accidentally alias the previous state.
    expect(appendBounded(original, "y")).not.toBe(original);
  });

  it("handles an empty chunk and an empty buffer", () => {
    for (const retention of ALL_RETENTIONS) {
      const fresh = createBoundedBuffer({ maxChars: 8, retention });
      expect(renderBoundedBuffer(fresh)).toBe("");

      const afterEmpty = appendBounded(fresh, "");
      expect(afterEmpty).not.toBe(fresh);
      expect(afterEmpty.head).toBe("");
      expect(afterEmpty.tail).toBe("");
      expect(afterEmpty.droppedChars).toBe(0);
      expect(afterEmpty.maxChars).toBe(8);
      expect(afterEmpty.retention).toBe(retention);
      expect(renderBoundedBuffer(afterEmpty)).toBe("");

      // An empty chunk after real content is a no-op, not a state reset.
      const withContent = appendBounded(afterEmpty, "ok");
      expect(renderBoundedBuffer(appendBounded(withContent, ""))).toBe("ok");
    }
  });
});

describe("drainCompleteLines", () => {
  it("drains complete lines and carries the remainder across chunks", () => {
    const first = drainCompleteLines({
      buffered: "",
      chunk: '{"a":1}\n{"b":2}\n{"c":3',
      maxRemainderChars: MCP_SELFTEST_LINE_MAX_CHARS,
    });

    expect(first.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(first.remainder).toBe('{"c":3');
    expect(first.droppedChars).toBe(0);

    // The torn record emits whole once its terminator lands — the property
    // callMcpMethod's JSON-RPC framing depends on.
    const second = drainCompleteLines({
      buffered: first.remainder,
      chunk: "}\n",
      maxRemainderChars: MCP_SELFTEST_LINE_MAX_CHARS,
    });

    expect(second.lines).toEqual(['{"c":3}']);
    expect(second.remainder).toBe("");
    expect(second.droppedChars).toBe(0);
  });

  it("drops an over-cap remainder whole and counts it", () => {
    const chunk = "x".repeat(100);
    const result = drainCompleteLines({
      buffered: "",
      chunk,
      maxRemainderChars: 32,
    });

    // Whole, never truncated: a truncated JSON-RPC line is unparseable and the
    // caller's `catch { continue; }` would swallow it, turning a counted drop
    // into a silent hole.
    expect(result.remainder).toBe("");
    expect(result.droppedChars).toBe(100);
    expect(result.lines).toEqual([]);
  });

  it("does not drop when the over-cap content is newline-terminated", () => {
    // The falsifiability partner of the case above. Without it, an
    // implementation that bounded the pre-split CONCATENATION instead of the
    // remainder would pass the drop test and silently discard complete lines.
    const line = "x".repeat(99);
    const result = drainCompleteLines({
      buffered: "",
      chunk: `${line}\n`,
      maxRemainderChars: 32,
    });

    expect(result.droppedChars).toBe(0);
    expect(result.lines).toEqual([line]);
    expect(result.remainder).toBe("");
  });

  it("trims lines and drops empty ones", () => {
    const result = drainCompleteLines({
      buffered: "",
      chunk: '  {"a":1}  \n\n\n{"b":2}\n',
      maxRemainderChars: 1024,
    });

    expect(result.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(result.remainder).toBe("");
    expect(result.droppedChars).toBe(0);
  });

  it("returns no lines and buffers everything when the chunk contains no newline", () => {
    const result = drainCompleteLines({
      buffered: "half-",
      chunk: "a-line",
      maxRemainderChars: 1024,
    });

    expect(result.lines).toEqual([]);
    expect(result.remainder).toBe("half-a-line");
    expect(result.droppedChars).toBe(0);
  });

  it("produces identical lines whether a payload arrives whole or one character at a time", () => {
    const payload =
      '{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n{"jsonrpc":"2.0","id":2,"result":{}}\n{"jsonrpc":"2.0","id":3';

    const whole = drainCompleteLines({
      buffered: "",
      chunk: payload,
      maxRemainderChars: 1024,
    });

    const streamed: string[] = [];
    let remainder = "";
    for (const character of payload) {
      const step = drainCompleteLines({
        buffered: remainder,
        chunk: character,
        maxRemainderChars: 1024,
      });
      streamed.push(...step.lines);
      remainder = step.remainder;
      expect(step.droppedChars).toBe(0);
    }

    // The equivalence proof for the split-once refactor plan 04-09 task 3
    // applies to callMcpMethod: chunk boundaries are arbitrary on a pipe, so
    // line output must not depend on where they fall.
    expect(streamed).toEqual(whole.lines);
    expect(streamed).toHaveLength(2);
    expect(remainder).toBe(whole.remainder);
    expect(remainder).toBe('{"jsonrpc":"2.0","id":3');
  });
});

describe("cap constants", () => {
  it("exports the five total-volume site caps and the line cap as tunable constants", () => {
    // Asserted by value so a silent retune fails a test instead of shipping.
    // These are the Claude's-Discretion numbers 04-CONTEXT.md delegated; they
    // are meant to move on evidence, deliberately rather than incidentally.
    expect(CLI_STDOUT_MAX_CHARS).toBe(2097152);
    expect(CLI_STDERR_MAX_CHARS).toBe(262144);
    expect(SPAWN_STDOUT_MAX_CHARS).toBe(1048576);
    expect(SPAWN_STDERR_MAX_CHARS).toBe(262144);
    expect(MCP_SELFTEST_STDERR_MAX_CHARS).toBe(262144);
    expect(MCP_SELFTEST_LINE_MAX_CHARS).toBe(4194304);
  });

  it("uses one shared value for every unterminated-line cap in the phase", () => {
    // The two siblings are CLAUDE_LINE_BUFFER_MAX_CHARS (claude-print.ts, plan
    // 04-06) and ACTIVITY_PARTIAL_MAX_BYTES (activity-tail.ts, plan 04-04).
    // All three bound the identical hazard — one never-terminated line in a
    // stream carrying target-application content — so all three are 4 MiB by
    // construction. A future divergence should be a deliberate act with its own
    // rationale, not a drift nobody noticed.
    expect(MCP_SELFTEST_LINE_MAX_CHARS).toBe(4 * 1024 * 1024);
  });
});
