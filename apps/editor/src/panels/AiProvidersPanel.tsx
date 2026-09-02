import { useEffect, useMemo, useState } from "react";
import { Button } from "@galacean/editor-ui";
import { createLlmClient, listProviders, getProvider, LlmError } from "@3jse/llm";
import {
  activeLlmConfig,
  getLlmStore,
  setActiveProvider,
  subscribeLlm,
  upsertLlmEntry,
} from "../llm/store.js";
import type { EditorContext } from "./types.js";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  background: "#1c1c1e",
  color: "#eee",
  border: "1px solid #3a3a3c",
  borderRadius: 4,
  fontSize: 12,
};

type TestState = { kind: "idle" | "running" | "ok" | "err"; msg?: string };

/**
 * docs/AI_AGENT_API.md's PLAN stage needs a model behind it. This panel is where the user wires
 * one: pick a provider (OpenAI / Anthropic / DeepSeek / Gemini / OpenRouter / Groq / Mistral /
 * xAI / Ollama / any OpenAI-compatible endpoint), paste the key, pick a model, hit Test. The
 * choice + keys live in this browser's localStorage only (see ../llm/store.ts) and are sent
 * straight from here to the provider — nothing else sees them. Once a provider is active, the
 * Atlas "Ask agent" button and the Agent panel's "Plan with AI" call it for real.
 */
export function AiProvidersPanel({ ctx }: { ctx: EditorContext }) {
  const providers = useMemo(() => listProviders(), []);
  const [, force] = useState(0);
  useEffect(() => subscribeLlm(() => force((n) => n + 1)), []);

  const store = getLlmStore();
  const [selected, setSelected] = useState<string>(store.activeProvider ?? providers[0]!.id);
  const info = getProvider(selected)!;
  const entry = store.entries[selected] ?? { apiKey: "", model: "", baseUrl: "" };

  const [reveal, setReveal] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  const isActive = store.activeProvider === selected && !!activeLlmConfig(store);
  const activeCfgForSelected = activeLlmConfig({ ...store, activeProvider: selected });

  async function runTest() {
    const cfg = activeCfgForSelected;
    if (!cfg) {
      setTest({ kind: "err", msg: info.needsKey ? "Enter an API key first." : "Set a model / base URL first." });
      return;
    }
    setTest({ kind: "running" });
    const t0 = Date.now();
    try {
      const res = await createLlmClient(cfg).chat({
        maxTokens: 16,
        messages: [{ role: "user", content: "Reply with exactly: pong" }],
      });
      const got = res.text.trim().slice(0, 40) || "(empty)";
      setTest({ kind: "ok", msg: `${res.model} replied "${got}" in ${Date.now() - t0} ms` });
    } catch (e) {
      const msg = e instanceof LlmError ? e.message : e instanceof Error ? e.message : String(e);
      setTest({ kind: "err", msg });
    }
  }

  function useThisProvider() {
    setActiveProvider(selected);
    ctx.pushLog("info", `AI provider set to ${info.label} (${entry.model || info.defaultModel}).`);
  }

  return (
    <div style={{ padding: 10, fontSize: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ fontWeight: 700, color: "#f5f5f7" }}>AI Providers</div>
        <p style={{ color: "#8a8a8e", margin: "2px 0 0" }}>
          Used by Atlas “Ask agent” and the Agent panel. Keys are stored in this browser only and
          sent directly to the provider you choose.
        </p>
      </div>

      {store.activeProvider && (
        <div style={{ fontSize: 11, color: "#22c55e" }}>
          ● Active: {getProvider(store.activeProvider)?.label ?? store.activeProvider}
          {activeLlmConfig(store) ? ` · ${activeLlmConfig(store)!.model}` : " (needs a key)"}
        </div>
      )}

      <label style={{ display: "block" }}>
        <span style={{ color: "#8a8a8e" }}>Provider</span>
        <select
          value={selected}
          onChange={(e) => { setSelected(e.target.value); setTest({ kind: "idle" }); }}
          style={{ ...inputStyle, marginTop: 3 }}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>

      {info.note && <div style={{ fontSize: 11, color: "#8a8a8e" }}>{info.note}</div>}

      {info.needsKey && (
        <label style={{ display: "block" }}>
          <span style={{ color: "#8a8a8e" }}>
            API key{info.keyUrl && (
              <> · <a href={info.keyUrl} target="_blank" rel="noreferrer" style={{ color: "#5b8cff" }}>get one</a></>
            )}
          </span>
          <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
            <input
              type={reveal ? "text" : "password"}
              value={entry.apiKey}
              autoComplete="off"
              spellCheck={false}
              placeholder={info.keyPrefix ? `${info.keyPrefix}…` : "paste key"}
              onChange={(e) => { upsertLlmEntry(selected, { apiKey: e.target.value }); setTest({ kind: "idle" }); }}
              style={inputStyle}
            />
            <button onClick={() => setReveal((r) => !r)} style={{ ...inputStyle, width: "auto", cursor: "pointer" }}>
              {reveal ? "hide" : "show"}
            </button>
          </div>
        </label>
      )}

      <label style={{ display: "block" }}>
        <span style={{ color: "#8a8a8e" }}>Model</span>
        <input
          list={`models-${selected}`}
          value={entry.model}
          placeholder={info.defaultModel || "model id"}
          onChange={(e) => { upsertLlmEntry(selected, { model: e.target.value }); setTest({ kind: "idle" }); }}
          style={{ ...inputStyle, marginTop: 3 }}
        />
        <datalist id={`models-${selected}`}>
          {info.models.map((m) => <option key={m} value={m} />)}
        </datalist>
      </label>

      <details>
        <summary style={{ color: "#8a8a8e", cursor: "pointer" }}>Advanced — base URL</summary>
        <input
          value={entry.baseUrl ?? ""}
          placeholder={info.baseUrl || "https://…/v1"}
          onChange={(e) => { upsertLlmEntry(selected, { baseUrl: e.target.value }); setTest({ kind: "idle" }); }}
          style={{ ...inputStyle, marginTop: 4 }}
        />
        <div style={{ fontSize: 11, color: "#8a8a8e", marginTop: 2 }}>
          Override for a proxy, gateway, Azure, or a self-hosted OpenAI-compatible server.
        </div>
      </details>

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Button size="xs" onClick={runTest} disabled={test.kind === "running"}>
          {test.kind === "running" ? "Testing…" : "Test"}
        </Button>
        <Button size="xs" onClick={useThisProvider} disabled={isActive}>
          {isActive ? "In use" : "Use this provider"}
        </Button>
        {store.activeProvider === selected && (
          <Button size="xs" onClick={() => setActiveProvider(null)}>Turn off</Button>
        )}
      </div>

      {test.kind !== "idle" && (
        <div
          style={{
            fontSize: 11,
            color: test.kind === "ok" ? "#22c55e" : test.kind === "err" ? "#ef4444" : "#8a8a8e",
            wordBreak: "break-word",
          }}
        >
          {test.kind === "running" ? "Contacting the provider…" : test.msg}
        </div>
      )}
    </div>
  );
}
