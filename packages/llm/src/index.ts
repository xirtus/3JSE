// @3jse/llm — a tiny, provider-agnostic chat client for the editor's AI features (Atlas
// "Ask agent", the Agent panel). Pick a provider, paste an API key, done. Headless: the only
// dependency is `fetch`, which is injectable for tests. No streaming, no tool-calling — just
// `chat(messages) -> text`; that is all the planning surfaces need.

export { PROVIDERS, listProviders, getProvider } from "./providers.js";
export { createLlmClient, type LlmClient, type LlmClientOptions } from "./client.js";
export {
  LlmError,
  type LlmProtocol,
  type LlmProviderInfo,
  type LlmConfig,
  type ChatRole,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
} from "./types.js";
