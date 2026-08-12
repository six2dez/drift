// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

describe("web storage shim", () => {
  it("round-trips values through localStorage", () => {
    const store = globalThis.localStorage;

    store.setItem("drift-shim-probe", "v");
    expect(store.getItem("drift-shim-probe")).toBe("v");
    expect(store.length).toBeGreaterThanOrEqual(1);

    store.removeItem("drift-shim-probe");
    expect(store.getItem("drift-shim-probe")).toBeNull();

    store.clear();
    expect(store.length).toBe(0);
  });

  it("round-trips values through sessionStorage", () => {
    // sessionStorage is the second property vitest skips on Node >= 25, and it
    // is still absent from Vitest 5's OTHER_KEYS, so it needs its own coverage.
    const store = globalThis.sessionStorage;

    store.setItem("drift-shim-probe", "v");
    expect(store.getItem("drift-shim-probe")).toBe("v");
    expect(store.length).toBeGreaterThanOrEqual(1);

    store.removeItem("drift-shim-probe");
    expect(store.getItem("drift-shim-probe")).toBeNull();

    store.clear();
    expect(store.length).toBe(0);
  });

  it("installs a real Storage rather than the in-memory fallback", () => {
    // This is the inertness proof. A setItem/getItem round-trip passes on BOTH
    // a real Storage and the shim's in-memory object literal, so it proves
    // nothing on its own. The discriminator: the fallback is a plain object
    // literal, so its prototype IS Object.prototype and its constructor.name is
    // "Object". Any real Storage is neither.
    //
    // Which real Storage it is varies by Node major, and both are acceptable:
    //   - localStorage is happy-dom's (Node's own is inert without
    //     --localstorage-file, so the shim replaces it on Node >= 25).
    //   - sessionStorage is happy-dom's on Node <= 24, but Node's native
    //     in-memory one on Node >= 25 -- that one is fully usable, so the shim
    //     deliberately leaves it alone. No product code reads sessionStorage.
    // Asserting "not the fallback" is therefore the assertion that holds on
    // every Node major. A failure here means the shim fell through to the
    // in-memory fallback: a real finding, not a test to relax.
    for (const store of [globalThis.localStorage, globalThis.sessionStorage]) {
      // Compare prototypes OUTSIDE expect(). Handing a native WebIDL prototype
      // to expect() makes vitest inspect it, which calls Storage.prototype's
      // `length` getter with the prototype as `this` and throws "Illegal
      // invocation". The predicate itself is unchanged.
      const isPlainObjectLiteral =
        Object.getPrototypeOf(store) === Object.prototype;

      expect(isPlainObjectLiteral).toBe(false);
      expect(store.constructor.name).toBe("Storage");
    }
  });
});
