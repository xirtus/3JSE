import type { ShellAdapter } from "./ShellAdapter.js";
import { BrowserShell } from "./BrowserShell.js";
import { TauriShell, isTauri } from "./TauriShell.js";

export type { ShellAdapter, ShellCapabilities, DirHandle } from "./ShellAdapter.js";
export { BrowserShell } from "./BrowserShell.js";
export { TauriShell, isTauri } from "./TauriShell.js";

let cached: ShellAdapter | null = null;

/**
 * The one call the editor makes to get its shell. Tauri window -> TauriShell; anything else
 * (a browser tab, a test) -> BrowserShell. Cached so `capabilities` is stable across a session.
 */
export function getShell(): ShellAdapter {
  if (!cached) cached = isTauri() ? new TauriShell() : new BrowserShell();
  return cached;
}

/** test-only: forget the cached adapter */
export function __resetShell(): void {
  cached = null;
}
