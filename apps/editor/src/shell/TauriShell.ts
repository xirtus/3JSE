import type { DirHandle, ShellAdapter, ShellCapabilities } from "./ShellAdapter.js";

// Tauri exposes its API on `window.__TAURI__` when `withGlobalTauri` is enabled (the editor's
// tauri.conf.json would set that). We call through the global rather than importing
// `@tauri-apps/api`, so the browser build has zero Tauri dependency and this file compiles /
// bundles everywhere — evidence/phase0-spike4-editor-shell.md's "SPA's shell-agnosticism".

interface TauriGlobal {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
  dialog?: { open(opts: { directory: boolean }): Promise<string | null> };
  fs?: {
    readTextFile(path: string): Promise<string>;
    writeTextFile(path: string, contents: string): Promise<void>;
    readDir(path: string, opts?: { recursive?: boolean }): Promise<{ path: string; children?: unknown[] }[]>;
    mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  };
}

function tauri(): TauriGlobal | undefined {
  return (globalThis as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
}

/** True when the SPA is running inside a Tauri v2 window. */
export function isTauri(): boolean {
  return tauri() !== undefined;
}

interface TauriDirHandle extends DirHandle {
  abs: string;
}

/**
 * The Tauri v2 implementation — real project-folder read/write via `plugin-fs`, real OS-window
 * capability. Every method fails loudly if the corresponding Tauri plugin isn't wired into
 * tauri.conf.json yet, so bring-up gaps are obvious rather than silent.
 */
export class TauriShell implements ShellAdapter {
  readonly kind = "tauri" as const;
  readonly capabilities: ShellCapabilities = { filesystem: true, multiWindow: true, native: true };

  async pickDirectory(): Promise<DirHandle> {
    const dialog = tauri()?.dialog;
    if (!dialog) throw new Error("Tauri dialog plugin not enabled (tauri-plugin-dialog).");
    const abs = await dialog.open({ directory: true });
    if (abs == null) throw new Error("directory selection cancelled");
    return { name: abs.split(/[\\/]/).pop() ?? abs, __brand: "DirHandle", abs } as TauriDirHandle;
  }

  async readFile(dir: DirHandle, path: string): Promise<string> {
    return this.fs().readTextFile(join(dir, path));
  }

  async writeFile(dir: DirHandle | null, path: string, contents: string): Promise<void> {
    if (!dir) throw new Error("TauriShell.writeFile needs a directory handle (no download fallback in native).");
    const full = join(dir, path);
    const parent = full.split(/[\\/]/).slice(0, -1).join("/");
    if (parent) await this.fs().mkdir(parent, { recursive: true });
    await this.fs().writeTextFile(full, contents);
  }

  async listDir(dir: DirHandle): Promise<string[]> {
    const base = (dir as TauriDirHandle).abs;
    const entries = await this.fs().readDir(base, { recursive: true });
    return entries
      .filter((e) => !e.children)
      .map((e) => e.path.replace(base, "").replace(/^[\\/]/, "").split(/[\\/]/).join("/"))
      .sort();
  }

  async message(text: string): Promise<string> {
    return text;
  }

  private fs() {
    const fs = tauri()?.fs;
    if (!fs) throw new Error("Tauri fs plugin not enabled (tauri-plugin-fs).");
    return fs;
  }
}

function join(dir: DirHandle, path: string): string {
  return `${(dir as TauriDirHandle).abs}/${path}`.replace(/\/+/g, "/");
}
