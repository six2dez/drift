import { describe, expect, it, vi } from "vitest";
import { getPersistenceDbHandle } from "./persistence";

describe("persistence helpers", () => {
  it("rejects unsupported db handles", () => {
    expect(getPersistenceDbHandle(undefined)).toBeUndefined();
    expect(getPersistenceDbHandle({})).toBeUndefined();
    expect(getPersistenceDbHandle({
      execute: vi.fn(),
    })).toBeUndefined();
  });

  it("accepts db handles with execute and query methods", () => {
    const handle = {
      execute: vi.fn(async () => undefined),
      query: vi.fn(async () => []),
    };

    expect(getPersistenceDbHandle(handle)).toBe(handle);
  });
});
