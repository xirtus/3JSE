// Shared types for @3jse/llm. Headless: no DOM, no editor — just `fetch`.

/** The two wire shapes this package speaks. Almost every hosted provider is OpenAI-compatible
 *  (`POST /chat/completions`); Anthropic uses its own `POST /messages`. Gemini, Groq, DeepSeek,
 *  Mistral, xAI, OpenRouter and local runners (Ollama, LM Studio) all expose an OpenAI-shaped
 *  endpoint, so `openai-chat` covers them. */
export type LlmProtocol = "openai-chat" | "anthropic-messages";

export interface LlmProviderInfo {
  /** stable id used as the config key and in the UI dropdown */
  id: string;
  /** human label for the dropdown, e.g. "OpenAI (ChatGPT)" */
  label: string;
  protocol: LlmProtocol;
  /** default API root, no trailing slash; user-overridable per config */
  baseUrl: string;
  /** suggested model ids — the UI offers these but also allows free text */
  models: string[];
  /** model used when the config leaves `model` blank */
  defaultModel: string;
  /** where the user gets an API key (shown as a link in the panel) */
  keyUrl?: string;
  /** soft hint only — a key not starting with this still submits */
  keyPrefix?: string;
  /** false for local runners that ignore the key (Ollama, LM Studio) */
  needsKey: boolean;
  /** one-line note shown under the provider in the panel */
  note?: string;
}

export interface LlmConfig {
  /** provider id from {@link LlmProviderInfo} */
  provider: string;
  apiKey: string;
  /** model id; blank → the provider's `defaultModel` */
  model: string;
  /** optional API-root override (proxy, self-host, Azure, a gateway) */
  baseUrl?: string;
}

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** prepended as the system prompt (merged ahead of any `role: "system"` messages) */
  system?: string;
  /** overrides the client's configured model for this call */
  model?: string;
  temperature?: number;
  /** hard cap on output tokens. Anthropic requires one — defaults to 1024 there. */
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  text: string;
  model: string;
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** the raw decoded JSON body, for debugging */
  raw?: unknown;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
