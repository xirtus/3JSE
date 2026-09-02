// A minimal chat client over the two protocols in `providers.ts`. One method: `chat()`.
// `fetch` is injectable so this runs (and is tested) with no network and no DOM.

import { getProvider } from "./providers.js";
import {
  LlmError,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type LlmConfig,
  type LlmProviderInfo,
} from "./types.js";

export interface LlmClientOptions {
  /** defaults to `globalThis.fetch` */
  fetch?: typeof fetch;
  /** extra headers merged into every request (e.g. OpenRouter's HTTP-Referer / X-Title) */
  headers?: Record<string, string>;
}

export interface LlmClient {
  readonly provider: LlmProviderInfo;
  readonly model: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

/** Split `system` + any leading `role: "system"` messages out from the turn list. Both wire
 *  formats want the system prompt separate from the user/assistant exchange. */
function splitSystem(req: ChatRequest): { system: string; turns: ChatMessage[] } {
  const sys: string[] = [];
  if (req.system) sys.push(req.system);
  const turns: ChatMessage[] = [];
  for (const m of req.messages) {
    if (m.role === "system") sys.push(m.content);
    else turns.push(m);
  }
  return { system: sys.join("\n\n"), turns };
}

async function readError(res: Response): Promise<never> {
  let body: unknown;
  let detail = "";
  try {
    body = await res.json();
    const b = body as { error?: { message?: string } | string; message?: string };
    detail =
      (typeof b.error === "object" ? b.error?.message : b.error) ?? b.message ?? "";
  } catch {
    try {
      detail = await res.text();
    } catch {
      /* nothing readable */
    }
  }
  throw new LlmError(
    `${res.status} ${res.statusText}${detail ? ` — ${String(detail).slice(0, 300)}` : ""}`,
    res.status,
    body,
  );
}

export function createLlmClient(config: LlmConfig, opts: LlmClientOptions = {}): LlmClient {
  const provider = getProvider(config.provider);
  if (!provider) throw new LlmError(`Unknown provider "${config.provider}"`);

  const doFetch = opts.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new LlmError("No fetch implementation available (pass opts.fetch)");
  }

  const baseUrl = (config.baseUrl?.trim() || provider.baseUrl).replace(/\/+$/, "");
  if (!baseUrl) throw new LlmError(`Provider "${provider.id}" needs a base URL`);
  const model = config.model.trim() || provider.defaultModel;
  if (!model) throw new LlmError(`Provider "${provider.id}" needs a model id`);
  if (provider.needsKey && !config.apiKey.trim()) {
    throw new LlmError(`Provider "${provider.label}" needs an API key`);
  }

  async function openaiChat(req: ChatRequest): Promise<ChatResponse> {
    const { system, turns } = splitSystem(req);
    const messages = [
      ...(system ? [{ role: "system", content: system }] : []),
      ...turns,
    ];
    const res = await doFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: req.signal,
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        ...opts.headers,
      },
      body: JSON.stringify({
        model: req.model ?? model,
        messages,
        ...(req.temperature != null ? { temperature: req.temperature } : {}),
        ...(req.maxTokens != null ? { max_tokens: req.maxTokens } : {}),
      }),
    });
    if (!res.ok) await readError(res);
    const data = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = data.choices?.[0];
    return {
      text: choice?.message?.content ?? "",
      model: data.model ?? (req.model ?? model),
      finishReason: choice?.finish_reason,
      usage: data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined,
      raw: data,
    };
  }

  async function anthropicChat(req: ChatRequest): Promise<ChatResponse> {
    const { system, turns } = splitSystem(req);
    const res = await doFetch(`${baseUrl}/messages`, {
      method: "POST",
      signal: req.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        // lets the call run from a browser origin when the account permits it
        "anthropic-dangerous-direct-browser-access": "true",
        ...opts.headers,
      },
      body: JSON.stringify({
        model: req.model ?? model,
        max_tokens: req.maxTokens ?? 1024,
        ...(system ? { system } : {}),
        ...(req.temperature != null ? { temperature: req.temperature } : {}),
        messages: turns.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) await readError(res);
    const data = (await res.json()) as {
      model?: string;
      stop_reason?: string;
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");
    return {
      text,
      model: data.model ?? (req.model ?? model),
      finishReason: data.stop_reason,
      usage: data.usage
        ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
        : undefined,
      raw: data,
    };
  }

  return {
    provider,
    model,
    chat: provider.protocol === "anthropic-messages" ? anthropicChat : openaiChat,
  };
}
