// The built-in provider catalog. Model lists are *suggestions* the panel offers as a datalist —
// the field is free text, so a newer model id works without a code change, and the catalog does
// not need to chase every release. Everything hosted here except Anthropic speaks the OpenAI
// `/chat/completions` shape.

import type { LlmProviderInfo } from "./types.js";

export const PROVIDERS: Record<string, LlmProviderInfo> = {
  openai: {
    id: "openai",
    label: "OpenAI (ChatGPT)",
    protocol: "openai-chat",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3", "o4-mini"],
    defaultModel: "gpt-4o-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
    needsKey: true,
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    protocol: "anthropic-messages",
    baseUrl: "https://api.anthropic.com/v1",
    models: [
      "claude-sonnet-4-5",
      "claude-opus-4-1",
      "claude-3-5-haiku-latest",
      "claude-3-5-sonnet-latest",
    ],
    defaultModel: "claude-sonnet-4-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-",
    needsKey: true,
    note: "Direct browser calls need the account to allow them; a proxy base URL also works.",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai-chat",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyPrefix: "sk-",
    needsKey: true,
  },
  google: {
    id: "google",
    label: "Google (Gemini)",
    protocol: "openai-chat",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"],
    defaultModel: "gemini-2.0-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    needsKey: true,
    note: "Uses Gemini's OpenAI-compatible endpoint.",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter (many models)",
    protocol: "openai-chat",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-4o",
      "google/gemini-2.0-flash-001",
      "deepseek/deepseek-chat",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    defaultModel: "anthropic/claude-sonnet-4.5",
    keyUrl: "https://openrouter.ai/keys",
    keyPrefix: "sk-or-",
    needsKey: true,
    note: "One key, most providers — model ids are namespaced (vendor/model).",
  },
  groq: {
    id: "groq",
    label: "Groq",
    protocol: "openai-chat",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen-2.5-32b"],
    defaultModel: "llama-3.3-70b-versatile",
    keyUrl: "https://console.groq.com/keys",
    keyPrefix: "gsk_",
    needsKey: true,
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    protocol: "openai-chat",
    baseUrl: "https://api.mistral.ai/v1",
    models: ["mistral-large-latest", "mistral-small-latest", "codestral-latest"],
    defaultModel: "mistral-large-latest",
    keyUrl: "https://console.mistral.ai/api-keys",
    needsKey: true,
  },
  xai: {
    id: "xai",
    label: "xAI (Grok)",
    protocol: "openai-chat",
    baseUrl: "https://api.x.ai/v1",
    models: ["grok-2-latest", "grok-2-mini"],
    defaultModel: "grok-2-latest",
    keyUrl: "https://console.x.ai",
    keyPrefix: "xai-",
    needsKey: true,
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    protocol: "openai-chat",
    baseUrl: "http://localhost:11434/v1",
    models: ["llama3.1", "qwen2.5", "mistral-nemo", "deepseek-r1"],
    defaultModel: "llama3.1",
    needsKey: false,
    note: "Runs on your machine — no key. Start Ollama first (ollama serve).",
  },
  "openai-compatible": {
    id: "openai-compatible",
    label: "Other (OpenAI-compatible)",
    protocol: "openai-chat",
    baseUrl: "",
    models: [],
    defaultModel: "",
    needsKey: true,
    note: "Any endpoint that implements POST /chat/completions — set the base URL and model.",
  },
};

/** All providers as a stable-ordered list for a dropdown. */
export function listProviders(): LlmProviderInfo[] {
  return Object.values(PROVIDERS);
}

export function getProvider(id: string): LlmProviderInfo | undefined {
  return PROVIDERS[id];
}
