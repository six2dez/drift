export type Result<TOk = void, TErr = string> =
  | { kind: "Ok"; value: TOk }
  | { kind: "Error"; error: TErr };

export const Result = {
  ok: <TOk>(value: TOk): Result<TOk> => ({ kind: "Ok", value }),
  err: <TOk = never, TErr = string>(error: TErr): Result<TOk, TErr> => ({
    kind: "Error",
    error,
  }),
  isOk: <TOk, TErr>(
    result: Result<TOk, TErr>
  ): result is { kind: "Ok"; value: TOk } => result.kind === "Ok",
  isErr: <TOk, TErr>(
    result: Result<TOk, TErr>
  ): result is { kind: "Error"; error: TErr } => result.kind === "Error",
};
