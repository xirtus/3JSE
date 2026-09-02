import { describe, expect, it, vi } from "vitest";
import { createLlmClient, listProviders, PROVIDERS, LlmError } from "./index.js";

/** Build a fake `fetch` that records the call and returns `body` as JSON. */
function fakeFetch(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, reqInit: RequestInit) => {
    calls.push({ url, init: reqInit });
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      statusText: init.statusText ?? "OK",
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("provider catalog", () => {
  it("lists providers, each with a usable default model (or a free-text slot)", () => {
    const all = listProviders();
    expect(all.length).toBeGreaterThanOrEqual(8);
    for (const p of all) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      // every provider except the generic "other" ships a concrete default model
      if (p.id !== "openai-compatible") expect(p.defaultModel).toBeTruthy();
    }
    expect(PROVIDERS.openai?.protocol).toBe("openai-chat");
    expect(PROVIDERS.anthropic?.protocol).toBe("anthropic-messages");
    expect(PROVIDERS.ollama?.needsKey).toBe(false);
  });
});

describe("openai-chat protocol (OpenAI / DeepSeek / Gemini / Groq / OpenRouter / …)", () => {
  it("POSTs /chat/completions with a Bearer key and the system prompt hoisted first", async () => {
    const { fn, calls } = fakeFetch({
      model: "gpt-4o-mini",
      choices: [{ message: { content: "pong" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 11, completion_tokens: 1 },
    });
    const client = createLlmClient(
      { provider: "openai", apiKey: "sk-test", model: "" },
      { fetch: fn },
    );
    const res = await client.chat({ system: "be terse", messages: [{ role: "user", content: "ping" }] });

    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
    const sent = JSON.parse(calls[0]!.init.body as string);
    expect(sent.model).toBe("gpt-4o-mini"); // fell back to provider default
    expect(sent.messages).toEqual([
      { role: "system", content: "be terse" },
      { role: "user", content: "ping" },
    ]);
    expect(res.text).toBe("pong");
    expect(res.usage).toEqual({ inputTokens: 11, outputTokens: 1 });
  });

  it("honours a base URL override (proxy / self-host / Azure gateway)", async () => {
    const { fn, calls } = fakeFetch({ choices: [{ message: { content: "ok" } }] });
    const client = createLlmClient(
      { provider: "openai-compatible", apiKey: "k", model: "local-model", baseUrl: "https://gw.example/v1/" },
      { fetch: fn },
    );
    await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(calls[0]!.url).toBe("https://gw.example/v1/chat/completions");
  });
});

describe("anthropic-messages protocol", () => {
  it("POSTs /messages with x-api-key, a version header, max_tokens, and system split out", async () => {
    const { fn, calls } = fakeFetch({
      model: "claude-sonnet-4-5",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "hello" }],
      usage: { input_tokens: 7, output_tokens: 2 },
    });
    const client = createLlmClient(
      { provider: "anthropic", apiKey: "sk-ant-x", model: "claude-sonnet-4-5" },
      { fetch: fn },
    );
    const res = await client.chat({
      system: "you are a planner",
      messages: [{ role: "system", content: "also concise" }, { role: "user", content: "plan it" }],
      maxTokens: 256,
    });

    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-x");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const sent = JSON.parse(calls[0]!.init.body as string);
    expect(sent.system).toBe("you are a planner\n\nalso concise");
    expect(sent.messages).toEqual([{ role: "user", content: "plan it" }]);
    expect(sent.max_tokens).toBe(256);
    expect(res.text).toBe("hello");
    expect(res.finishReason).toBe("end_turn");
  });
});

describe("errors", () => {
  it("throws a typed LlmError carrying the status and provider message", async () => {
    const { fn } = fakeFetch({ error: { message: "invalid x-api-key" } }, { ok: false, status: 401, statusText: "Unauthorized" });
    const client = createLlmClient({ provider: "anthropic", apiKey: "bad", model: "claude-sonnet-4-5" }, { fetch: fn });
    await expect(client.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({
      name: "LlmError",
      status: 401,
    });
    await expect(client.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(/invalid x-api-key/);
  });

  it("rejects an unknown provider and a missing key up front", () => {
    expect(() => createLlmClient({ provider: "nope", apiKey: "k", model: "m" })).toThrow(LlmError);
    expect(() => createLlmClient({ provider: "openai", apiKey: "  ", model: "gpt-4o" }, { fetch: fakeFetch({}).fn })).toThrow(
      /needs an API key/,
    );
  });
});
