// Where the editor keeps the user's AI-provider choice + keys. This is browser `localStorage`
// only — per device, never synced, never sent anywhere except (from AiProvidersPanel / the
// planning surfaces) directly to the provider the user picked. Tauri gets the same store via
// its localStorage shim; a future OS-keychain path can replace `read`/`write` here without
// touching callers.

import { getProvider, type LlmConfig } from "@3jse/llm";

const KEY = "3jse.llm.v1";

export interface LlmEntry {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface LlmStore {
  /** provider id the planning surfaces use, or null = AI features stay offline */
  activeProvider: string | null;
  entries: Record<string, LlmEntry>;
}

const EMPTY: LlmStore = { activeProvider: null, entries: {} };

function read(): LlmStore {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<LlmStore>;
    return {
      activeProvider: parsed.activeProvider ?? null,
      entries: parsed.entries ?? {},
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(store: LlmStore): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private mode / storage disabled — the in-memory copy still works for this session */
  }
}

let current = read();
const listeners = new Set<() => void>();

export function getLlmStore(): LlmStore {
  return current;
}

/** Subscribe to changes (panels re-read on save). Returns an unsubscribe. */
export function subscribeLlm(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLlmStore(next: LlmStore): void {
  current = next;
  write(current);
  for (const fn of listeners) fn();
}

export function upsertLlmEntry(providerId: string, patch: Partial<LlmEntry>): void {
  const prev = current.entries[providerId] ?? { apiKey: "", model: "" };
  setLlmStore({
    ...current,
    entries: { ...current.entries, [providerId]: { ...prev, ...patch } },
  });
}

export function setActiveProvider(providerId: string | null): void {
  setLlmStore({ ...current, activeProvider: providerId });
}

/** The config the planning surfaces should use right now, or null if AI is not set up. */
export function activeLlmConfig(store: LlmStore = current): LlmConfig | null {
  const id = store.activeProvider;
  if (!id) return null;
  const info = getProvider(id);
  if (!info) return null;
  const entry = store.entries[id];
  const model = (entry?.model || info.defaultModel).trim();
  const baseUrl = (entry?.baseUrl || info.baseUrl).trim();
  if (info.needsKey && !entry?.apiKey.trim()) return null;
  if (!model || !baseUrl) return null;
  return { provider: id, apiKey: entry?.apiKey ?? "", model, baseUrl: entry?.baseUrl?.trim() || undefined };
}

/** Short label for status lines, e.g. "Anthropic (Claude) · claude-sonnet-4-5". */
export function activeLlmLabel(store: LlmStore = current): string | null {
  const cfg = activeLlmConfig(store);
  if (!cfg) return null;
  const info = getProvider(cfg.provider);
  return `${info?.label ?? cfg.provider} · ${cfg.model}`;
}
