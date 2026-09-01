import { afterEach, describe, expect, it } from "vitest";
import { getShell, __resetShell, isTauri, BrowserShell, TauriShell } from "./index.js";

afterEach(() => {
  __resetShell();
  delete (globalThis as Record<string, unknown>).__TAURI__;
});

describe("shell adapter selection", () => {
  it("returns a BrowserShell when not in a Tauri window", () => {
    expect(isTauri()).toBe(false);
    const s = getShell();
    expect(s.kind).toBe("browser");
    expect(s).toBeInstanceOf(BrowserShell);
    expect(s.capabilities.native).toBe(false);
    expect(s.capabilities.multiWindow).toBe(false);
  });

  it("returns a TauriShell when window.__TAURI__ is present", () => {
    (globalThis as Record<string, unknown>).__TAURI__ = { core: { invoke: async () => undefined } };
    __resetShell();
    expect(isTauri()).toBe(true);
    const s = getShell();
    expect(s.kind).toBe("tauri");
    expect(s).toBeInstanceOf(TauriShell);
    expect(s.capabilities).toEqual({ filesystem: true, multiWindow: true, native: true });
  });

  it("caches the adapter across calls", () => {
    expect(getShell()).toBe(getShell());
  });

  it("BrowserShell.message returns the text without a blocking alert", async () => {
    await expect(new BrowserShell().message("saved")).resolves.toBe("saved");
  });

  it("BrowserShell.pickDirectory fails clearly with no File System Access API", async () => {
    await expect(new BrowserShell().pickDirectory()).rejects.toThrow(/File System Access API/);
  });

  it("TauriShell.readFile fails loudly if the fs plugin isn't wired", async () => {
    (globalThis as Record<string, unknown>).__TAURI__ = { core: { invoke: async () => undefined } };
    await expect(
      new TauriShell().readFile({ name: "p", __brand: "DirHandle" } as never, "x.json"),
    ).rejects.toThrow(/tauri-plugin-fs/);
  });
});
