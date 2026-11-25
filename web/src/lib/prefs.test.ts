import { afterEach, describe, expect, it, vi } from "vitest";

import { browserStorage, readFlag, writeFlag, type FlagStorage } from "./prefs.ts";

const memory = (): FlagStorage & { kept: Map<string, string> } => {
  const kept = new Map<string, string>();
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("remembered choices", () => {
  it("read back what was written", () => {
    const storage = memory();
    writeFlag(() => storage, "folded", true);
    expect([readFlag(() => storage, "folded", false), storage.kept.get("folded")]).toEqual([true, "1"]);
    writeFlag(() => storage, "folded", false);
    expect(readFlag(() => storage, "folded", true)).toBe(false);
  });

  it("fall back when nothing, or nothing they wrote, is stored", () => {
    const storage = memory();
    expect([readFlag(() => storage, "folded", true), readFlag(() => storage, "folded", false)]).toEqual([true, false]);
    storage.setItem("folded", "yes");
    expect(readFlag(() => storage, "folded", true)).toBe(true);
  });

  it("fall back and never throw without a storage, when reaching it throws, or when it refuses", () => {
    expect(readFlag(() => null, "folded", true)).toBe(true);
    expect(() => {
      writeFlag(() => null, "folded", true);
    }).not.toThrow();
    const blocked = (): FlagStorage => {
      throw new DOMException("The storage is blocked", "SecurityError");
    };
    expect(readFlag(blocked, "folded", false)).toBe(false);
    expect(() => {
      writeFlag(blocked, "folded", true);
    }).not.toThrow();
    const refusing: FlagStorage = {
      getItem: () => {
        throw new Error("unreadable");
      },
      setItem: () => {
        throw new DOMException("The quota is exceeded", "QuotaExceededError");
      },
    };
    expect(readFlag(() => refusing, "folded", true)).toBe(true);
    expect(() => {
      writeFlag(() => refusing, "folded", true);
    }).not.toThrow();
  });

  it("use the browser's storage when there is one, and none when reaching it throws", () => {
    const storage = memory();
    vi.stubGlobal("localStorage", storage);
    expect(browserStorage()).toBe(storage);
    vi.unstubAllGlobals();
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The storage is blocked", "SecurityError");
      },
    });
    try {
      expect(browserStorage()).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
});
