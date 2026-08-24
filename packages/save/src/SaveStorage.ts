/**
 * The storage backend a SaveService writes through — deliberately not `localStorage` baked in
 * directly. docs/RUNTIME.md's headless-mode requirement (CI, the Agent API's verify loop) means
 * "does this environment even have `localStorage`" can't be assumed, the same reasoning
 * InputManager's `attach()` is an optional DOM adapter rather than something the class does by
 * itself.
 */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Every key currently stored — SaveService filters this down to its own slot prefix. */
  keys(): string[];
}

/** An in-memory SaveStorage — the default in headless/test contexts, and a perfectly legitimate
 *  choice for a game that wants save data to live only for the current session. */
export class MemorySaveStorage implements SaveStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  keys(): string[] {
    return Array.from(this.data.keys());
  }
}

/** Wraps the browser's `localStorage` — real, persistent-across-reloads storage, which is
 *  exactly the "the browser is not a limitation to apologize for" point docs/VISION.md makes:
 *  a shipped web game's save data living in localStorage is not a lesser substitute for a
 *  desktop engine's save-file-on-disk, it's the equivalent capability, native to the platform. */
export class LocalStorageSaveStorage implements SaveStorage {
  getItem(key: string): string | null {
    return localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  keys(): string[] {
    return Object.keys(localStorage);
  }
}

/** `localStorage` when it exists (a real browser), an in-memory fallback otherwise. */
export function defaultSaveStorage(): SaveStorage {
  if (typeof localStorage !== "undefined") return new LocalStorageSaveStorage();
  return new MemorySaveStorage();
}
