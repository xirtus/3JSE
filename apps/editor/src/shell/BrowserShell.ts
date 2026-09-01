import type { DirHandle, ShellAdapter, ShellCapabilities } from "./ShellAdapter.js";

// A DirHandle that wraps the File System Access API's FileSystemDirectoryHandle.
interface FsDirHandle extends DirHandle {
  fs: FileSystemDirectoryHandle;
}

// Minimal shapes from the File System Access API (not in lib.dom for all TS versions).
interface FileSystemDirectoryHandle {
  name: string;
  values(): AsyncIterable<FileSystemHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemFileHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
}
interface FileSystemHandle {
  kind: "file" | "directory";
  name: string;
}
interface FileSystemFileHandle extends FileSystemHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

/**
 * The browser implementation — File System Access API where the browser supports it
 * (Chromium does; that's the editor's baseline anyway for WebGPU), a download fallback for
 * `writeFile` otherwise. No second-window support (`multiWindow: false`); a browser tab can't
 * tear a panel off into an OS window.
 */
export class BrowserShell implements ShellAdapter {
  readonly kind = "browser" as const;
  readonly capabilities: ShellCapabilities;

  constructor() {
    const hasFsAccess = typeof window !== "undefined" && "showDirectoryPicker" in window;
    this.capabilities = { filesystem: hasFsAccess, multiWindow: false, native: false };
  }

  async pickDirectory(): Promise<DirHandle> {
    if (!this.capabilities.filesystem) {
      throw new Error("This browser has no File System Access API — run in the desktop shell to open a project folder.");
    }
    const picker = (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    const fs = await picker();
    return { name: fs.name, __brand: "DirHandle", fs } as FsDirHandle;
  }

  async readFile(dir: DirHandle, path: string): Promise<string> {
    const handle = await this.resolveFile((dir as FsDirHandle).fs, path, false);
    const file = await handle.getFile();
    return file.text();
  }

  async writeFile(dir: DirHandle | null, path: string, contents: string): Promise<void> {
    if (dir) {
      const handle = await this.resolveFile((dir as FsDirHandle).fs, path, true);
      const w = await handle.createWritable();
      await w.write(contents);
      await w.close();
      return;
    }
    // No directory handle -> hand the file to the browser's download flow.
    const blob = new Blob([contents], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() ?? "download.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async listDir(dir: DirHandle): Promise<string[]> {
    const out: string[] = [];
    const walk = async (h: FileSystemDirectoryHandle, prefix: string) => {
      for await (const entry of h.values()) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.kind === "directory") await walk(await h.getDirectoryHandle(entry.name), rel);
        else out.push(rel);
      }
    };
    await walk((dir as FsDirHandle).fs, "");
    return out.sort();
  }

  async message(text: string): Promise<string> {
    // Deliberately no blocking alert() — the caller routes this to the editor log.
    return text;
  }

  private async resolveFile(root: FileSystemDirectoryHandle, path: string, create: boolean): Promise<FileSystemFileHandle> {
    const parts = path.split("/").filter(Boolean);
    const fileName = parts.pop()!;
    let dir = root;
    for (const seg of parts) dir = await dir.getDirectoryHandle(seg, { create });
    return dir.getFileHandle(fileName, { create });
  }
}
