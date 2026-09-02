import { describe, expect, it, beforeEach } from "vitest";
import {
  activeLlmConfig,
  activeLlmLabel,
  getLlmStore,
  setActiveProvider,
  setLlmStore,
  upsertLlmEntry,
} from "./store.js";

// No localStorage in the node test env — the store falls back to its in-memory copy, which is
// exactly what we exercise here.
beforeEach(() => setLlmStore({ activeProvider: null, entries: {} }));

describe("llm store", () => {
  it("is offline until a provider is active AND has a key", () => {
    expect(activeLlmConfig()).toBeNull();

    upsertLlmEntry("openai", { apiKey: "sk-test", model: "" });
    expect(activeLlmConfig()).toBeNull(); // entry exists but not selected

    setActiveProvider("openai");
    const cfg = activeLlmConfig();
    expect(cfg).toEqual({ provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini", baseUrl: undefined });
    expect(activeLlmLabel()).toBe("OpenAI (ChatGPT) · gpt-4o-mini");
  });

  it("a selected provider with no key stays offline", () => {
    setActiveProvider("anthropic");
    expect(activeLlmConfig()).toBeNull();
    upsertLlmEntry("anthropic", { apiKey: "sk-ant-x", model: "claude-sonnet-4-5" });
    expect(activeLlmConfig()?.model).toBe("claude-sonnet-4-5");
  });

  it("a local provider (Ollama) needs no key", () => {
    setActiveProvider("ollama");
    const cfg = activeLlmConfig();
    expect(cfg?.provider).toBe("ollama");
    expect(cfg?.model).toBe("llama3.1");
  });

  it("carries a base URL override through", () => {
    upsertLlmEntry("openai-compatible", { apiKey: "k", model: "my-model", baseUrl: "https://gw.local/v1" });
    setActiveProvider("openai-compatible");
    expect(activeLlmConfig()).toMatchObject({ model: "my-model", baseUrl: "https://gw.local/v1" });
  });

  it("Turn off clears the active provider", () => {
    upsertLlmEntry("openai", { apiKey: "sk-x", model: "" });
    setActiveProvider("openai");
    expect(activeLlmConfig()).not.toBeNull();
    setActiveProvider(null);
    expect(activeLlmConfig()).toBeNull();
    expect(getLlmStore().entries.openai?.apiKey).toBe("sk-x"); // key kept for next time
  });
});
