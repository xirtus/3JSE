// The editor's native-call adapter — evidence/phase0-spike4-editor-shell.md's "SPA's
// shell-agnosticism (kept as a guardrail)". Every OS-level capability the editor needs goes
// through this interface, so the exact same SPA runs unchanged in:
//   - a plain browser tab (BrowserShell — File System Access API, download fallback)
//   - a Tauri v2 window (TauriShell — routes to window.__TAURI__ at runtime, no build-time dep)
//   - (later) an Electron window, by adding one more implementation
//
// This is what makes the Tauri-vs-Electron decision reversible cheaply, and what lets the
// browser build stay a first-class CI target.

export interface ShellCapabilities {
  /** can read/write a real project folder (not just download) */
  filesystem: boolean;
  /** can open additional OS windows for tear-off panels */
  multiWindow: boolean;
  /** running inside a native shell at all (vs a browser tab) */
  native: boolean;
}

export interface DirHandle {
  name: string;
  /** opaque — passed back to readFile/writeFile/listDir */
  readonly __brand: "DirHandle";
}

export interface ShellAdapter {
  readonly kind: "browser" | "tauri" | "electron";
  readonly capabilities: ShellCapabilities;

  /** Ask the user to choose a project directory. Rejects if unsupported or cancelled. */
  pickDirectory(): Promise<DirHandle>;

  /** Read a UTF-8 file, path relative to `dir`. */
  readFile(dir: DirHandle, path: string): Promise<string>;

  /** Write a UTF-8 file, path relative to `dir`, creating parents as needed. In a browser with
   *  no directory handle this becomes a download of the file. */
  writeFile(dir: DirHandle | null, path: string, contents: string): Promise<void>;

  /** List file paths (relative, POSIX) under `dir`, recursively. */
  listDir(dir: DirHandle): Promise<string[]>;

  /** Surface a message to the user without a blocking `alert` — returns the text so the caller
   *  can also route it to the editor's own log. */
  message(text: string): Promise<string>;
}
