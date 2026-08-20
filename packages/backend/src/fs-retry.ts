// RUN-04's tolerance for the Windows anti-virus write-then-exec race, split so
// that the half which must be *proven* carries no I/O: the DECISION ("is this
// error retryable, how long do I wait, what do I report") lives here and is
// pure, while the syscall it wraps stays in index.ts. This module imports
// NOTHING — `grep -c '^import'` over it returns 0 — for the same reason
// platform.ts does: an unused import is a hard build failure here (tsconfig
// `noUnusedLocals` → TS6133, and `pnpm lint` runs at `--max-warnings 0`), so
// the zero-import property is self-enforcing rather than a convention.
//
// `sleep` is an INJECTED dependency, and that injection is the entire reason
// SC-3's ladder is assertable at all: a real Defender file lock cannot be
// induced deterministically on any CI runner, so the only way a Linux runner
// can prove "it retried, and it waited 50 ms then 100 ms" is to hand the
// orchestrator a fake clock and read back what it was asked to sleep for.
//
// D-07 makes RUN-04 and RUN-05 one mechanism: this ladder wraps the *real*
// first write in `startMcpServer` (index.ts:1717–1720), never a separate canary
// file. A canary can itself trip the write-then-access race it exists to
// detect, producing a false negative on precisely the machines that matter.

// The transient set, from libuv's Windows error translator (`src/win/error.c`),
// which is what turns a Win32 `GetLastError()` into the `.code` Node exposes:
//   ERROR_SHARING_VIOLATION / ERROR_LOCK_VIOLATION        → EBUSY
//     (Defender holds the file open with an excluding share mode, or the
//      scanner holds a byte-range lock)
//   ERROR_ACCESS_DENIED                                   → EPERM
//     (the most common Defender/indexer symptom)
//   ERROR_ELEVATION_REQUIRED / ERROR_CANT_ACCESS_FILE     → EACCES
//   anything unmapped                                     → UNKNOWN
//     (third-party AV filter drivers returning nonstandard NTSTATUS values land
//      here — which is exactly why the roadmap names UNKNOWN by hand)
//
// The EXCLUSIONS are deliberate and are the reason this is an allow-list rather
// than a deny-list: ENOENT means a missing parent, which is a real bug and must
// surface immediately; ENOSPC and EROFS mean a full or read-only volume, where
// retrying only delays the honest error by 1.5 s on every single MCP start
// (T-04-11).
export const FS_TRANSIENT_ERROR_CODES = [
  "EPERM",
  "EBUSY",
  "EACCES",
  "UNKNOWN",
] as const;

// The NUMERIC half of the same allow-list, for the `(os error N)` shape that
// Rust's `std::io::Error` Display impl renders and that Caido's LLRT therefore
// surfaces. Without this list the name list above is unreachable on LLRT and
// the ladder is inert on the one runtime it was written for.
//
// N is NOT a single namespace: Rust prints the raw platform error number, so on
// Windows it is a Win32 code and on Linux/macOS it is an errno, and the two
// namespaces collide. Nothing in the message can be trusted to tell them apart,
// so every entry below is justified in whichever namespace makes it transient
// and then checked for harm in the other:
//
//   N     Win32                     POSIX errno   why it is here
//   1     ERROR_INVALID_FUNCTION    EPERM         POSIX arm; mirrors the EPERM name above
//   5     ERROR_ACCESS_DENIED       EIO           WIN32 arm; the most common Defender/indexer symptom
//   13    ERROR_INVALID_DATA        EACCES        POSIX arm; mirrors EACCES
//   16    ERROR_CURRENT_DIRECTORY   EBUSY         POSIX arm; mirrors EBUSY
//   32    ERROR_SHARING_VIOLATION   EPIPE         WIN32 arm; the AV holds the file open with an
//                                                 excluding share mode — this IS the RUN-04 symptom
//   33    ERROR_LOCK_VIOLATION      EDOM          WIN32 arm; the scanner holds a byte-range lock
//
// The wrong-namespace reading of each is bounded at 1,500 ms of extra delay on
// an error that was going to fail anyway, and none of the wrong-namespace
// meanings can be produced by the two syscalls this ladder actually wraps
// (`mkdir` of a fresh directory, `writeFile` of a regular file): EIO is a media
// fault, EPIPE needs a pipe, EDOM is a math error, ERROR_INVALID_FUNCTION and
// ERROR_CURRENT_DIRECTORY need a volume/rmdir call. That is what makes the
// collision tolerable rather than merely convenient.
//
// [UNCERTAIN, deliberately EXCLUDED] 1314 ERROR_PRIVILEGE_NOT_HELD. libuv maps
// it to EPERM, so the `.code` arm above would accept it and the two readings
// therefore disagree about that one failure. It is excluded anyway because a
// privilege the account does not hold does not materialise 1,500 ms later, and
// this list follows the same rule as the exclusions above: never spend the
// ladder on an error that cannot clear. Recorded rather than silently dropped
// so a later phase can add it on evidence.
export const TRANSIENT_OS_ERROR_NUMBERS = [1, 5, 13, 16, 32, 33] as const;

// Pulls N out of Rust's trailing `(os error N)`. Anchored on the literal
// parenthesised form so a message that merely contains a number cannot match.
function osErrorNumber(message: string): number | undefined {
  const digits = /\(os error (\d+)\)/.exec(message)?.[1];
  return digits === undefined ? undefined : Number(digits);
}

// 5 retries → 6 attempts including the first, 1,500 ms total.
//
// Why these numbers, recorded so a later phase can widen them on evidence
// instead of guessing. Two ecosystem precedents budget far more —
// `graceful-fs`'s rename polyfill allows 60 s and npm/cli's arborist bin-links
// ~15.5 s — but both are batch tools where a long stall is invisible. This
// ladder wraps `startMcpServer`, which the user is *watching*: a 15-second
// freeze on the "Start MCP" button is a worse outcome than an actionable error.
//
// Growth is geometric rather than graceful-fs's linear `+10 ms` because
// graceful-fs polls a `stat` between tries and this does not, so short delays
// would burn every attempt inside a single scan window.
//
// No jitter: Drift is a single writer to a private per-run directory, so there
// is no thundering herd to spread out, and jitter would make the ladder
// non-deterministic to assert for zero benefit.
//
// Exported, not inlined, precisely so the escalation path when a real machine
// still fails is "widen this array" — and so a test asserts against the symbol
// rather than a literal (T-04-10: the ladder is finite by construction).
export const FS_RETRY_DELAYS_MS = [50, 100, 200, 400, 750] as const;

// True when the failure is worth retrying.
//
// THREE shapes are accepted, because the runtime is not settled and two of the
// three are live at the same time:
//
//   1. a structured `.code` — Node/libuv. [ASSUMED for Caido] Retained because
//      the same source is exercised against plain Node by the test suite and
//      may yet run against a libuv-backed host.
//   2. an errno NAME inside the message (`EBUSY: resource busy`). [ASSUMED] —
//      inferred from `llrt_utils::result::ResultExt` usage in
//      `caido/dependency-llrt`, not measured.
//   3. a NUMERIC `(os error N)` suffix inside the message. [MEASURED SHAPE] —
//      this is what Rust's `impl Display for std::io::Error` emits (the OS
//      message, then " (os error N)"), and every LLRT `tokio::fs`/`std::fs`
//      throw passes through it: `Access is denied. (os error 5)`.
//
// Reading 3 is the one that matters on the target runtime. Caido's LLRT does
// NOT use libuv, so readings 1 and 2 BOTH miss there — the *Win32* error is
// identical but the surfaced shape carries only a number. Handling all three
// means any one reading being wrong is harmless; handling only 1 and 2 meant
// the ladder never fired on Windows at all.
export function isTransientFsError(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code;
  if (
    typeof code === "string" &&
    FS_TRANSIENT_ERROR_CODES.some((candidate) => candidate === code)
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    FS_TRANSIENT_ERROR_CODES.some((candidate) => message.includes(candidate))
  ) {
    return true;
  }

  const osError = osErrorNumber(message);
  return (
    osError !== undefined &&
    TRANSIENT_OS_ERROR_NUMBERS.some((candidate) => candidate === osError)
  );
}

// The code to report for retry logging and diagnostics. Same three shapes as
// above, most specific first.
//
// The numeric arm reports EVERY `(os error N)` it can parse, not only the
// transient ones. `lastCode` is the field a Windows bug report is actually read
// from, and it is the evidence channel for "was 1,500 ms enough" — an
// `os-error-32` answers "an AV held the file" where the old `unknown` answered
// nothing at all and was indistinguishable from "no retry happened". `unknown`
// now means genuinely unclassifiable rather than "this is LLRT".
//
// The `"unknown"` sentinel is lower-case on purpose so it is never confused
// with libuv's upper-case `UNKNOWN`, which is a real classification. The
// `os-error-N` token is lower-case for the same reason: no libuv code can
// collide with it.
export function getFsErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | undefined)?.code;
  if (typeof code === "string" && code.trim() !== "") return code;

  const message = error instanceof Error ? error.message : String(error ?? "");
  const matched = FS_TRANSIENT_ERROR_CODES.find((candidate) =>
    message.includes(candidate),
  );
  if (matched !== undefined) return matched;

  const osError = osErrorNumber(message);
  return osError === undefined ? "unknown" : `os-error-${String(osError)}`;
}

// The `kind`-discriminated shape index.ts already branches on for its inline
// `Result<T>` (index.ts:1724–1728). It is deliberately NOT that type: `Result`
// is declared inline in index.ts — to avoid Zod, which crashes QuickJS — and is
// not exported, so importing it is impossible and would break the zero-import
// property above.
//
// `attempts` is not decoration. It is the agreed mitigation for the one RUN-04
// behaviour that is not provable on any CI runner (surviving a real Defender
// lock): plan 04-08 surfaces this count in `getDiagnostics`, so a future bug
// report answers whether 1,500 ms was enough instead of speculating.
export type FsRetryOutcome<T> =
  | { kind: "Ok"; value: T; attempts: number }
  | { kind: "Error"; error: string; attempts: number; lastCode: string };

const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// Runs `operation`, retrying only transient failures, on a bounded ladder.
//
// Contract: this NEVER throws — same "always resolves" guarantee as
// `spawnAndWait` (index.ts:1519–1529). The caller branches on `.kind`, so a
// throw escaping here would bypass `startMcpServer`'s error path entirely.
//
// `onRetry` exists so plan 04-08 can log every retry through `sdk.console` with
// the code and the attempt index. It receives ONLY an integer attempt index, an
// error *code* string, and a delay in ms — never the error message, never a
// path, never file contents (T-04-03). Pure modules never touch `sdk.console`:
// this one returns data and takes a callback; index.ts does the logging.
export async function withFsRetry<T>(
  operation: () => Promise<T>,
  deps?: {
    delays?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (info: {
      attempt: number;
      code: string;
      delayMs: number;
    }) => void;
  },
): Promise<FsRetryOutcome<T>> {
  const delays = deps?.delays ?? FS_RETRY_DELAYS_MS;
  const sleep = deps?.sleep ?? defaultSleep;

  let lastError: unknown;
  let attempts = 0;

  // `<= delays.length` is what makes this 1 initial attempt plus one per rung.
  // The bound is the array's own length, so the loop is finite by construction
  // and no code path can extend it (T-04-10).
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    attempts = attempt + 1;
    try {
      const value = await operation();
      return { kind: "Ok", value, attempts };
    } catch (error) {
      lastError = error;
      if (!isTransientFsError(error) || attempt === delays.length) break;

      const delayMs = delays[attempt] ?? 0;
      // The hook and the sleep are the only injected code running inside this
      // loop, and a throw from either would escape and break the contract
      // above — 04-08 routes `onRetry` into `sdk.console`, which is not
      // guaranteed non-throwing in Caido's runtime. Treat a failure in either
      // as terminal: the honest answer is still the filesystem error just
      // caught, which is what the outcome already carries.
      try {
        deps?.onRetry?.({
          attempt: attempt + 1,
          code: getFsErrorCode(error),
          delayMs,
        });
        await sleep(delayMs);
      } catch {
        break;
      }
    }
  }

  return {
    kind: "Error",
    error: String(lastError),
    attempts,
    lastCode: getFsErrorCode(lastError),
  };
}
