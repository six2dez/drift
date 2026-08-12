/**
 * Node >= 25.0.0 unflagged Web Storage, so `localStorage` now exists on the
 * Node global. Vitest's populateGlobal() skips any happy-dom window property
 * whose name already exists on the Node global and is not in its explicit
 * KEYS list -- and `localStorage`/`sessionStorage` are not in that list
 * (verified: `grep -c localStorage` over vitest 4.0.18's and 4.1.10's
 * environment chunk returns 0). The result is a DOM test environment with no
 * working storage on Node >= 25, which silently sends the ChatView tests down
 * the "no storage" branch instead of the "token present" branch.
 *
 * Upstream: vitest-dev/vitest#8757 (closed: "non-LTS is not officially
 * supported"), capricorn86/happy-dom#1950 (open). Fixed only in Vitest 5,
 * which adds `localStorage` to OTHER_KEYS.
 *
 * DELETE THIS FILE when the repo upgrades to Vitest >= 5 (re-verify
 * sessionStorage, which v5 still does not list).
 */
type StorageLike = {
  readonly length: number;
  key: (index: number) => string | null;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function hasUsableStorage(name: "localStorage" | "sessionStorage"): boolean {
  try {
    const candidate = (globalThis as Record<string, unknown>)[name];
    if (candidate === undefined || candidate === null) return false;
    return typeof (candidate as StorageLike).getItem === "function";
  } catch {
    // Property access itself can throw. Treat as unusable.
    return false;
  }
}

function createStorage(): StorageLike {
  const Ctor = (globalThis as { Storage?: new () => StorageLike }).Storage;
  if (typeof Ctor === "function") {
    try {
      // happy-dom's Storage IS constructible. Node's native Storage is NOT --
      // `new Storage()` throws "Illegal constructor" -- hence the try/catch.
      return new Ctor();
    } catch {
      /* fall through to the in-memory shim */
    }
  }
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  };
}

// Only patch inside a DOM environment. Node-environment test files must stay
// storage-free so they keep exercising the "no browser storage" branch.
if (typeof (globalThis as { document?: unknown }).document !== "undefined") {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    if (!hasUsableStorage(name)) {
      Object.defineProperty(globalThis, name, {
        value: createStorage(),
        configurable: true,
        writable: true,
      });
    }
  }
}
