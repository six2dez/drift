import { describe, it, expect } from "vitest";
import {
  jsonRpcSuccess,
  jsonRpcError,
  getStringArg,
  getNumberArg,
} from "./protocol";

describe("jsonRpcSuccess", () => {
  it("creates success response with id", () => {
    const res = jsonRpcSuccess(1, { data: "test" });
    expect(res).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { data: "test" },
    });
  });

  it("handles null id", () => {
    const res = jsonRpcSuccess(null, "ok");
    expect(res.id).toBeNull();
  });

  it("handles undefined id", () => {
    const res = jsonRpcSuccess(undefined, "ok");
    expect(res.id).toBeNull();
  });
});

describe("jsonRpcError", () => {
  it("creates error response", () => {
    const res = jsonRpcError(1, -32601, "Method not found");
    expect(res).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "Method not found" },
    });
  });
});

describe("getStringArg", () => {
  it("returns string value", () => {
    expect(getStringArg({ name: "test" }, "name")).toBe("test");
  });

  it("returns undefined for missing key", () => {
    expect(getStringArg({}, "name")).toBeUndefined();
  });

  it("returns default for missing key", () => {
    expect(getStringArg({}, "name", "fallback")).toBe("fallback");
  });

  it("converts number to string", () => {
    expect(getStringArg({ n: 42 }, "n")).toBe("42");
  });

  it("returns default for null", () => {
    expect(getStringArg({ n: null }, "n", "def")).toBe("def");
  });
});

describe("getNumberArg", () => {
  it("returns number value", () => {
    expect(getNumberArg({ n: 42 }, "n")).toBe(42);
  });

  it("returns undefined for missing key", () => {
    expect(getNumberArg({}, "n")).toBeUndefined();
  });

  it("returns default for missing key", () => {
    expect(getNumberArg({}, "n", 10)).toBe(10);
  });

  it("converts string to number", () => {
    expect(getNumberArg({ n: "42" }, "n")).toBe(42);
  });

  it("returns default for NaN string", () => {
    expect(getNumberArg({ n: "abc" }, "n", 5)).toBe(5);
  });

  it("returns default for NaN number", () => {
    expect(getNumberArg({ n: NaN }, "n", 5)).toBe(5);
  });
});
