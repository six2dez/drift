import { describe, expect, it } from "vitest";

// Logic-only test for the cancel-race guard pattern used in ChatView.vue.
// The real handleSend flow is not mounted (no @vue/test-utils dep available),
// but the decision rule is small enough that replicating it here prevents
// regression of the duplicate-assistant-message bug Codex flagged:
//
//   1. handleCancel marks the session as cancelled BEFORE awaiting
//      cancelCliMessage, so the in-flight sendCliMessage promise will
//      observe the flag when it finally resolves.
//   2. handleSend, after awaiting sendCliMessage, skips adding the
//      assistant message if the session was cancelled (and clears the
//      flag so a subsequent turn on the same session still renders).

type Result<T> = { kind: "Ok"; value: T } | { kind: "Error"; error: string };

function applyResult(
  cancelledSessionIds: Set<string>,
  messages: string[],
  sessionId: string,
  result: Result<string>,
) {
  if (cancelledSessionIds.has(sessionId)) {
    cancelledSessionIds.delete(sessionId);
    return;
  }
  if (result.kind === "Error") {
    messages.push(`error:${result.error}`);
    return;
  }
  messages.push(result.value);
}

describe("cancel-race guard", () => {
  it("discards late results from a cancelled session and does not duplicate the [Cancelled] message", () => {
    const cancelled = new Set<string>();
    const messages: string[] = [];
    const sessionId = "s-1";

    // User clicked Stop before the RPC resolved: handleCancel adds the
    // local [Cancelled] placeholder and marks the session.
    messages.push("[Cancelled]");
    cancelled.add(sessionId);

    // The backend eventually returns whatever output it had when SIGTERM
    // hit. With the guard in place, this must NOT add a second message.
    applyResult(cancelled, messages, sessionId, {
      kind: "Ok",
      value: "late claude output that should be dropped",
    });

    expect(messages).toEqual(["[Cancelled]"]);
    expect(cancelled.has(sessionId)).toBe(false);
  });

  it("renders a fresh turn on the same session after a cancel", () => {
    const cancelled = new Set<string>();
    const messages: string[] = [];
    const sessionId = "s-2";

    cancelled.add(sessionId);
    messages.push("[Cancelled]");
    applyResult(cancelled, messages, sessionId, {
      kind: "Ok",
      value: "dropped",
    });

    // New turn on the same session: flag is cleared, result renders.
    applyResult(cancelled, messages, sessionId, {
      kind: "Ok",
      value: "new reply",
    });

    expect(messages).toEqual(["[Cancelled]", "new reply"]);
  });

  it("surfaces normal errors when the session was not cancelled", () => {
    const cancelled = new Set<string>();
    const messages: string[] = [];
    const sessionId = "s-3";

    applyResult(cancelled, messages, sessionId, {
      kind: "Error",
      error: "spawn failed",
    });

    expect(messages).toEqual(["error:spawn failed"]);
    expect(cancelled.size).toBe(0);
  });
});
