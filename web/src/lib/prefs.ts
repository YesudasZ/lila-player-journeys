/**
 * Small choices of the viewer that the page remembers, such as a section folded away. They live in
 * the browser's storage when the page may use it; otherwise the page simply forgets them. Nothing
 * here throws. Pure apart from the storage it is handed.
 */

/** The part of the Web Storage interface used here. */
export interface FlagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The names under which the choices are kept. */
export const PREF_KEYS = { filtersCollapsed: "lila.filters.collapsed", legendCollapsed: "lila.legend.collapsed" } as const;

/** The browser's localStorage, or null where there is none. Reading `localStorage` itself throws when the browser blocks storage. */
export function browserStorage(): FlagStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** A remembered yes or no; the fallback when nothing (or nothing sensible) is stored, or the storage cannot be read. */
export function readFlag(storage: () => FlagStorage | null, key: string, fallback: boolean): boolean {
  try {
    const value = storage()?.getItem(key);
    return value === "1" ? true : value === "0" ? false : fallback;
  } catch {
    return fallback;
  }
}

/** Remember a yes or no. A storage that refuses (full, blocked, private mode) is ignored: the choice is then forgotten on reload. */
export function writeFlag(storage: () => FlagStorage | null, key: string, value: boolean): void {
  try {
    storage()?.setItem(key, value ? "1" : "0");
  } catch {
    // nothing to do: the choice holds for this visit only
  }
}
