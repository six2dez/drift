// PERF-04's bounding arithmetic. Every function here is pure — no I/O, no
// process handles, no imports — so the caps, the retention policies and the
// truncation marker are unit-testable. That is the only way they get proven at
// all: index.ts calls them from inside child-process `data` handlers, and
// index.ts has no direct test coverage. The module deliberately carries BOTH of
// PERF-04's mechanisms — total-volume accumulation (appendBounded, five sites)
// and unterminated-line draining (drainCompleteLines, one site) — because
// collapsing them into a single policy is the exact failure mode this module
// exists to prevent: head/tail retention applied to a JSON-RPC line stream
// drops the middle of a frame and corrupts the protocol.
//
// claude-print.ts deliberately keeps its OWN copy of the line-drain logic
// instead of importing drainCompleteLines, and that is a decision rather than an
// oversight. Its remainder lives inside a multi-field ClaudePrintState object
// threaded through handler callbacks (`claude-print.ts:89-101`, `:140`), its
// 393-line test file is the CMP-01 regression net that has to stay green
// byte-for-byte, and importing this module would move plan 04-06 out of wave 1
// into a dependency on this plan for zero behavioural gain. Same shape, two
// call sites, on purpose.
//
// Divergence from Node's own precedent, recorded here because it is deliberate:
// child_process.exec's `maxBuffer` (default 1 MiB) KILLS the child on overflow.
// Drift must not. Killing a CLI mid-answer converts a cosmetic problem — an
// answer longer than anyone will read — into a lost turn, which is a
// self-inflicted availability failure (T-04-17). Truncate and keep reading.

// Which end of an over-cap stream is worth keeping. The answer is per-site and
// not a matter of taste: see the cap constants below, each of which pairs a
// number with the retention its consumer actually needs.
export type BoundedRetention = "head" | "tail" | "both";

// A state object rather than a bare string, because the marker has to carry a
// CUMULATIVE dropped count. Re-parsing a previously-embedded marker back out of
// a rendered string on every append would be fragile — the child's own output
// can contain the marker text — so the count is kept as a number beside the
// text. Matches the backend's proven createXState(): PlainObject + free
// functions shape (claude-print.ts:103-117, :140); every function here returns a
// NEW object rather than mutating.
export type BoundedBuffer = {
  head: string;
  tail: string;
  droppedChars: number;
  maxChars: number;
  retention: BoundedRetention;
};

export function createBoundedBuffer(options: {
  maxChars: number;
  retention: BoundedRetention;
}): BoundedBuffer {
  return {
    head: "",
    tail: "",
    droppedChars: 0,
    maxChars: options.maxChars,
    retention: options.retention,
  };
}

// Returns a NEW buffer; never mutates the one it is given. Below the cap all
// three policies are pass-through: droppedChars stays 0 and head + tail is
// exactly the concatenation of everything appended so far, which is the
// zero-overhead common case every one of these sites lives in.
export function appendBounded(
  buffer: BoundedBuffer,
  chunk: string,
): BoundedBuffer {
  if (buffer.retention === "head") {
    // Fill head up to maxChars and discard the excess. tail stays empty: the
    // consumer of a head-retained buffer reads line 1 and never the end.
    const room = Math.max(0, buffer.maxChars - buffer.head.length);
    if (chunk.length <= room) {
      return { ...buffer, head: buffer.head + chunk };
    }
    return {
      ...buffer,
      head: buffer.head + chunk.slice(0, room),
      droppedChars: buffer.droppedChars + (chunk.length - room),
    };
  }

  if (buffer.retention === "tail") {
    // Append, then drop from the FRONT until the tail fits. head stays empty:
    // the consumer of a tail-retained buffer wants the last error, and the
    // warnings that piled up ahead of it are the part worth losing.
    const combined = buffer.tail + chunk;
    if (combined.length <= buffer.maxChars) {
      return { ...buffer, tail: combined };
    }
    const dropped = combined.length - buffer.maxChars;
    return {
      ...buffer,
      tail: combined.slice(dropped),
      droppedChars: buffer.droppedChars + dropped,
    };
  }

  // "both": head fills to half the cap and is then frozen; everything after it
  // flows into the tail, which is trimmed from the front to whatever the cap has
  // left. head + tail therefore never exceeds maxChars, which is what makes the
  // rendered length bound (cap + marker) hold.
  const headCap = Math.floor(buffer.maxChars / 2);
  const headRoom = Math.max(0, headCap - buffer.head.length);
  const nextHead = buffer.head + chunk.slice(0, headRoom);
  const tailCap = Math.max(0, buffer.maxChars - nextHead.length);
  const combinedTail = buffer.tail + chunk.slice(headRoom);
  if (combinedTail.length <= tailCap) {
    return { ...buffer, head: nextHead, tail: combinedTail };
  }
  const dropped = combinedTail.length - tailCap;
  return {
    ...buffer,
    head: nextHead,
    tail: combinedTail.slice(dropped),
    droppedChars: buffer.droppedChars + dropped,
  };
}

// One greppable string, with the count embedded so a reader can tell a truncated
// answer from a model that stopped early (T-04-18: truncation is marked, never
// silent). The prefix is exported so a test — or a support bundle — can detect a
// marker without hardcoding the whole sentence.
//
// The count is UTF-16 code units (JS String#length) while the marker says
// "bytes". The wording is kept for greppability and the discrepancy is
// documented here rather than silently wrong: for the ASCII-dominated CLI output
// these sites carry the two numbers coincide, and for anything else the marker
// is an order-of-magnitude signal, not an accounting record.
export const TRUNCATION_MARKER_PREFIX = "\n…[drift: truncated ";

export function buildTruncationMarker(droppedChars: number): string {
  return `${TRUNCATION_MARKER_PREFIX}${String(droppedChars)} bytes]…\n`;
}

export function renderBoundedBuffer(buffer: BoundedBuffer): string {
  if (buffer.droppedChars === 0) return buffer.head + buffer.tail;
  return buffer.head + buildTruncationMarker(buffer.droppedChars) + buffer.tail;
}

// ── Per-site total-volume caps ──────────────────────────────────────
//
// Exported constants rather than inline literals so these Claude's-Discretion
// numbers are reviewable and tunable on evidence without touching a call site.

// sendCliMessage stdout (index.ts:2205, appended :2484), retention "both". For
// gemini/codex/copilot this string IS the chat answer (index.ts:2332, :2340):
// the opening of an answer matters to a reader and so does the conclusion, so a
// middle-drop preserves both ends. 2 MiB is roughly 20x a long answer while
// still bounding the Caido backend's heap.
export const CLI_STDOUT_MAX_CHARS = 2 * 1024 * 1024;

// sendCliMessage stderr (index.ts:2206, appended :2573), retention "tail".
// stderr is diagnostics; the LAST error is the actionable one and warnings pile
// up ahead of it.
export const CLI_STDERR_MAX_CHARS = 256 * 1024;

// spawnAndWait stdout (index.ts:1522, appended :1524), retention "head".
// Consumers read line 1 — `which` output, `node --version` — or a short
// `mcp add` acknowledgement.
//
// This constant is ALSO the cap plan 04-10 applies to site 7, resolveCommand's
// which/where.exe accumulator (`let out = ""` at index.ts:854, appended at
// :862). That site has the identical head-read shape, so a second constant would
// be a distinction without a difference. It is deliberately not exempted on
// "it's only `which`, the output is small, and there's a 1-second timeout"
// grounds: that is the same argument this phase rejects for callMcpMethod below,
// and shipping it in one place while rejecting it in the other is how an
// inconsistency becomes a precedent.
export const SPAWN_STDOUT_MAX_CHARS = 1024 * 1024;

// spawnAndWait stderr (index.ts:1523, appended :1525), retention "tail".
export const SPAWN_STDERR_MAX_CHARS = 256 * 1024;

// callMcpMethod stderr (index.ts:1201, appended :1295), retention "tail". Same
// reasoning as the other two stderr sites: this string is the text of the
// rejection thrown at :1248 and :1306, and the last error is the actionable one.
//
// Why the site needs a cap at all, despite callMcpMethod's
// Math.min(processTimeoutSeconds * 1000, 10000) timeout (:1211) and its
// proc.kill("SIGKILL") (:1207): the timeout bounds the WINDOW, not the VOLUME. A
// child writing stderr at pipe speed for ten seconds is a multi-hundred-megabyte
// allocation in a single-threaded runtime, and the kill only arrives after it.
export const MCP_SELFTEST_STDERR_MAX_CHARS = 256 * 1024;

// ── The unterminated-line cap ───────────────────────────────────────

// The cap for callMcpMethod's stdoutBuffer (index.ts:1200, appended :1268) — a
// line-DRAIN buffer, not an accumulator, and therefore a different ceiling with
// a different mechanism (drainCompleteLines, below).
//
// Deliberately the same 4 MiB as plan 04-06's CLAUDE_LINE_BUFFER_MAX_CHARS and
// plan 04-04's ACTIVITY_PARTIAL_MAX_BYTES. All three are the identical hazard —
// one never-terminated line in a stream carrying target-application content —
// and three different numbers for one hazard would read as an oversight. 4 MiB
// is deliberately generous: a legitimate MCP tool result carrying a large
// history search can be big, and dropping a real one is worse than holding it
// briefly.
export const MCP_SELFTEST_LINE_MAX_CHARS = 4 * 1024 * 1024;

export type LineDrainResult = {
  lines: string[];
  remainder: string;
  droppedChars: number;
};

// The second mechanism, and NOT a variant of appendBounded — it deliberately
// takes no BoundedBuffer. Head/tail/both retention is actively WRONG for a line
// stream: dropping the middle of JSON-RPC framing produces a frame that parses
// as neither the first message nor the second.
//
// Why the bound is on the REMAINDER and not the combined buffer: a buffer
// containing newlines drains naturally through the split below, so the only
// unbounded case is a trailing fragment with no terminator. Bounding the
// pre-split concatenation would throw away legitimate complete lines that were
// about to be emitted.
//
// Why the over-cap remainder is dropped WHOLE rather than truncated: a truncated
// JSON-RPC line is unparseable and would be swallowed by the caller's existing
// `catch { continue; }` (index.ts:1279-1281), turning a counted drop into a
// silent hole. Same reasoning as plan 04-06 and plan 04-04's drop-whole policy.
//
// Why one split instead of the caller's indexOf/slice loop: callMcpMethod's
// existing loop (index.ts:1269-1291) re-copies the whole remainder and rescans
// from index 0 once PER LINE, which is O(k·n) for a chunk of k lines and n
// characters. Under Caido's single-threaded runtime that CPU cost blocks the
// same event loop the RPC keep-alive depends on. This is the identical fix plan
// 04-06 applies inside claude-print.ts.
export function drainCompleteLines(input: {
  buffered: string;
  chunk: string;
  maxRemainderChars: number;
}): LineDrainResult {
  const combined = input.buffered + input.chunk;
  const parts = combined.split("\n");
  // The last part is whatever followed the final newline — empty when the chunk
  // ended cleanly, a partial line otherwise. It is the only candidate remainder.
  const candidate = parts.pop() ?? "";
  const lines: string[] = [];
  for (const part of parts) {
    const line = part.trim();
    if (line !== "") lines.push(line);
  }

  if (candidate.length > input.maxRemainderChars) {
    return { lines, remainder: "", droppedChars: candidate.length };
  }
  return { lines, remainder: candidate, droppedChars: 0 };
}
