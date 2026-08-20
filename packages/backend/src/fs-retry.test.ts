import { describe, expect, it, vi } from "vitest";
import {
  FS_RETRY_DELAYS_MS,
  getFsErrorCode,
  isTransientFsError,
  TRANSIENT_OS_ERROR_NUMBERS,
  withFsRetry,
} from "./fs-retry";

// These describe/it titles are a CONTRACT with 04-VALIDATION.md, which addresses
// the five RUN-04 rows by `-t` substring: "isTransientFsError",
// "retries a transient", "does not retry", "gives up", "ladder shape". Renaming
// a title silently unhooks a requirement from its proof.
//
// Every dependency is an injected fake — deliberately NOT vi.useFakeTimers().
// Injection is this repo's established pattern (persistence.test.ts) and fake
// timers are reserved for the frontend store tests. It is also what makes SC-3
// provable at all: a real Defender file lock cannot be induced on any CI
// runner, so the ladder is proven by reading back what the orchestrator ASKED
// to sleep for rather than by waiting 1.5 s.

function errnoError(code: string, message = "fs failure"): Error {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

function noopSleep() {
  return vi.fn(async (_ms: number): Promise<void> => undefined);
}

describe("isTransientFsError", () => {
  it("accepts every transient libuv code on a structured error", () => {
    expect(isTransientFsError(errnoError("EPERM"))).toBe(true);
    expect(isTransientFsError(errnoError("EBUSY"))).toBe(true);
    expect(isTransientFsError(errnoError("EACCES"))).toBe(true);
    // Third-party AV filter drivers returning nonstandard NTSTATUS values land
    // in UNKNOWN, which is why the roadmap names it explicitly.
    expect(isTransientFsError(errnoError("UNKNOWN"))).toBe(true);
  });

  it("rejects ENOENT, ENOSPC and EROFS", () => {
    // A missing parent is a real bug; a full or read-only volume is an honest
    // error that must surface now, not 1.5 s from now (T-04-11).
    expect(isTransientFsError(errnoError("ENOENT"))).toBe(false);
    expect(isTransientFsError(errnoError("ENOSPC"))).toBe(false);
    expect(isTransientFsError(errnoError("EROFS"))).toBe(false);
  });

  it("accepts an EBUSY carried only in the message (the LLRT fallback)", () => {
    // Caido's LLRT does not use libuv — it throws through or_throw_msg with a
    // human message rather than a structured .code, so the same Win32 failure
    // can arrive with no .code at all.
    expect(isTransientFsError(new Error("EBUSY: resource busy"))).toBe(true);
    expect(isTransientFsError("EPERM: operation not permitted")).toBe(true);
  });

  it("accepts the numeric (os error N) shape LLRT actually throws", () => {
    // These three strings are what Rust's `impl Display for std::io::Error`
    // renders, verbatim — the OS message then " (os error N)". No errno NAME
    // appears anywhere in them, so before the numeric arm existed every one of
    // these returned false and the RUN-04 ladder was inert on Windows.
    expect(
      isTransientFsError(new Error("Access is denied. (os error 5)")),
    ).toBe(true);
    expect(
      isTransientFsError(
        new Error(
          "The process cannot access the file because it is being used by another process. (os error 32)",
        ),
      ),
    ).toBe(true);
    expect(
      isTransientFsError(
        new Error(
          "The process cannot access the file because another process has locked a portion of the file. (os error 33)",
        ),
      ),
    ).toBe(true);
    // The POSIX namespace of the same rendering: LLRT throws this shape on
    // macOS and Linux too, where N is an errno rather than a Win32 code.
    expect(
      isTransientFsError(new Error("Permission denied (os error 13)")),
    ).toBe(true);
    expect(isTransientFsError("Device or resource busy (os error 16)")).toBe(
      true,
    );
  });

  it("rejects an (os error N) that is not on the transient list", () => {
    // Same exclusion rule as the name list: a missing parent or a full volume
    // is an honest error that must surface now (T-04-11). 2 is ENOENT /
    // ERROR_FILE_NOT_FOUND and 28 is ENOSPC; neither is on the list.
    expect(
      isTransientFsError(new Error("No such file or directory (os error 2)")),
    ).toBe(false);
    expect(
      isTransientFsError(new Error("No space left on device (os error 28)")),
    ).toBe(false);
    // 1314 ERROR_PRIVILEGE_NOT_HELD is deliberately excluded and documented as
    // such: a privilege the account lacks does not appear 1,500 ms later.
    expect(TRANSIENT_OS_ERROR_NUMBERS).not.toContain(1314);
  });

  it("rejects undefined, null and a message with no code", () => {
    expect(isTransientFsError(undefined)).toBe(false);
    expect(isTransientFsError(null)).toBe(false);
    expect(isTransientFsError(new Error("something went wrong"))).toBe(false);
    expect(isTransientFsError("plain failure")).toBe(false);
  });
});

describe("getFsErrorCode", () => {
  it("prefers the structured code and falls back to the message", () => {
    expect(getFsErrorCode(errnoError("EBUSY"))).toBe("EBUSY");
    expect(getFsErrorCode(errnoError("ENOENT"))).toBe("ENOENT");
    expect(getFsErrorCode(new Error("EPERM: operation not permitted"))).toBe(
      "EPERM",
    );
  });

  it("reports an os-error-N token for the numeric LLRT shape", () => {
    // The whole point of `lastCode` / `mcpFirstWriteAttempts` is that a Windows
    // bug report can answer whether the ladder was long enough. Returning
    // "unknown" for every LLRT failure made that channel report nothing.
    expect(getFsErrorCode(new Error("Access is denied. (os error 5)"))).toBe(
      "os-error-5",
    );
    expect(
      getFsErrorCode(
        new Error(
          "The process cannot access the file because it is being used by another process. (os error 32)",
        ),
      ),
    ).toBe("os-error-32");
    // Non-transient numbers are reported too: "the volume was full" is worth
    // more in a support bundle than "unknown".
    expect(
      getFsErrorCode(new Error("No space left on device (os error 28)")),
    ).toBe("os-error-28");
    // Lower-case token, for the same reason the sentinel below is lower-case:
    // no libuv code can collide with it.
    expect(getFsErrorCode(new Error("Access is denied. (os error 5)"))).toBe(
      getFsErrorCode(new Error("Access is denied. (os error 5)")).toLowerCase(),
    );
  });

  it("returns the lower-case unknown sentinel when nothing is classifiable", () => {
    // Lower-case on purpose: libuv's upper-case UNKNOWN is a real
    // classification and must stay distinguishable from "we could not tell".
    expect(getFsErrorCode(new Error("something went wrong"))).toBe("unknown");
    expect(getFsErrorCode(undefined)).toBe("unknown");
  });
});

describe("withFsRetry", () => {
  it("retries a transient EPERM and succeeds on the third attempt, sleeping the exact ladder", async () => {
    const sleep = noopSleep();
    let calls = 0;
    const operation = vi.fn(async (): Promise<string> => {
      calls += 1;
      if (calls < 3) throw errnoError("EPERM");
      return "ok";
    });

    const outcome = await withFsRetry(operation, { sleep });

    expect(outcome).toEqual({ kind: "Ok", value: "ok", attempts: 3 });
    expect(operation).toHaveBeenCalledTimes(3);
    // The first two rungs of FS_RETRY_DELAYS_MS, in order — the ladder is
    // observed, not merely declared.
    expect(sleep.mock.calls.flat()).toEqual([50, 100]);
  });

  it("does not retry a non-transient ENOENT and makes exactly one attempt", async () => {
    const sleep = noopSleep();
    const operation = vi.fn(async (): Promise<string> => {
      throw errnoError("ENOENT", "no such file or directory");
    });

    const outcome = await withFsRetry(operation, { sleep });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    // Asserted whole rather than narrowing `lastCode` behind an
    // `if (outcome.kind === "Error")`: a conditional expect can silently never
    // run, which vitest/no-conditional-expect rejects and `pnpm lint` treats as
    // an error. `toEqual` on the entire outcome needs no narrowing and proves
    // more — kind, attempts and lastCode in one unconditional assertion.
    expect(outcome).toEqual({
      kind: "Error",
      error: "Error: no such file or directory",
      attempts: 1,
      lastCode: "ENOENT",
    });
  });

  it("gives up after the full ladder and returns Error", async () => {
    const sleep = noopSleep();
    const operation = vi.fn(async (): Promise<string> => {
      throw errnoError("EBUSY", "resource busy or locked");
    });

    const outcome = await withFsRetry(operation, { sleep });

    // attempts is 1 initial + 5 rungs. The loop is bounded by the ladder
    // array's own length, so termination is structural (T-04-10).
    expect(operation).toHaveBeenCalledTimes(6);
    expect(outcome).toEqual({
      kind: "Error",
      error: "Error: resource busy or locked",
      attempts: 6,
      lastCode: "EBUSY",
    });
    expect(sleep.mock.calls.flat()).toEqual([50, 100, 200, 400, 750]);
    expect(sleep.mock.calls.flat()).toEqual([...FS_RETRY_DELAYS_MS]);
  });

  it("reports every retry through onRetry with the attempt index and code", async () => {
    const sleep = noopSleep();
    // T-04-03: the hook receives an integer, a code and a delay — never the
    // message, never a path, never file contents. 04-08 formats its sdk.console
    // line from these three fields only.
    const onRetry = vi.fn(
      (_info: { attempt: number; code: string; delayMs: number }): void =>
        undefined,
    );
    let calls = 0;
    const operation = vi.fn(async (): Promise<string> => {
      calls += 1;
      if (calls < 3) throw errnoError("EPERM");
      return "ok";
    });

    await withFsRetry(operation, { sleep, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, {
      attempt: 1,
      code: "EPERM",
      delayMs: 50,
    });
    expect(onRetry).toHaveBeenNthCalledWith(2, {
      attempt: 2,
      code: "EPERM",
      delayMs: 100,
    });
  });

  it("resolves rather than throwing when an injected hook throws", async () => {
    // The always-resolves contract (matching spawnAndWait) is what lets
    // startMcpServer branch on .kind; a throw escaping here would bypass its
    // error path entirely. 04-08 routes onRetry into sdk.console, which is not
    // guaranteed non-throwing in Caido's runtime.
    const sleep = noopSleep();
    const onRetry = vi.fn((): void => {
      throw new Error("sdk.console exploded");
    });
    const operation = vi.fn(async (): Promise<string> => {
      throw errnoError("EBUSY");
    });

    const outcome = await withFsRetry(operation, { sleep, onRetry });

    expect(outcome.kind).toBe("Error");
    expect(outcome.attempts).toBe(1);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("honours an injected delays array in place of the default ladder", async () => {
    // The escalation path when a real Windows machine still fails is to widen
    // the ladder, so the override has to be exercised somewhere.
    const sleep = noopSleep();
    const operation = vi.fn(async (): Promise<string> => {
      throw errnoError("UNKNOWN");
    });

    const outcome = await withFsRetry(operation, { sleep, delays: [5, 10] });

    expect(outcome.attempts).toBe(3);
    expect(sleep.mock.calls.flat()).toEqual([5, 10]);
  });
});

describe("FS_RETRY_DELAYS_MS ladder shape", () => {
  it("has ~5 entries summing to at most 1500 ms", () => {
    // SC-3's shape. The 1,500 ms ceiling is the number under review: this
    // ladder wraps startMcpServer, which the user is watching, so it is
    // deliberately two orders of magnitude below graceful-fs's 60 s budget.
    expect(FS_RETRY_DELAYS_MS.length).toBe(5);
    expect(FS_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      1500,
    );

    for (const delay of FS_RETRY_DELAYS_MS) {
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThan(0);
    }

    // Strictly increasing: geometric-ish growth, because nothing polls a stat
    // between tries, so a flat ladder would burn every attempt inside a single
    // AV scan window.
    const sorted = [...FS_RETRY_DELAYS_MS].every(
      (delay, index) =>
        index === 0 || delay > (FS_RETRY_DELAYS_MS[index - 1] ?? 0),
    );
    expect(sorted).toBe(true);
  });
});
