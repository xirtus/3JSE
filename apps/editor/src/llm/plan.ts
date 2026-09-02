// The one place the editor turns a scoped-context blob into an LLM call. Both the Atlas
// "Ask agent" button and the Agent panel's "Plan with AI" route through `askPlanner`, so the
// system prompt and guard rails live in exactly one spot.

import { createLlmClient, type LlmConfig } from "@3jse/llm";

export const PLANNER_SYSTEM_PROMPT = [
  "You are the 3JSE editor's planning agent. 3JSE is a headless-first TypeScript game engine",
  "(@3jse/* packages) with a semantic 'Atlas' over each game's systems.",
  "",
  "You are given a scoped context package: one system, its 1-ring of dependencies, the files",
  "and tests that touch it, its tuning knobs and FeelSpec, its current health, and the",
  "developer's intent. You may also get a change preview (what a task would affect).",
  "",
  "Produce a concrete, ordered plan:",
  "1. The smallest change that achieves the intent — name specific knobs, files, systems.",
  "2. Why, in one line each.",
  "3. Risks / what could regress (use the dependency ring and affected-systems list).",
  "4. What to verify afterwards (name the tests / the playable check).",
  "",
  "Work only from the context. Do not invent package names, files, or APIs that are not",
  "present. If the context is insufficient, say what else you'd need to see. Be concise —",
  "no preamble, no restating the context back.",
].join("\n");

export interface PlanInput {
  /** the JSON blob the panel already builds (scoped context + preview) */
  context: string;
  /** the developer's free-text goal */
  intent: string;
  /** explain / modify / tune / optimize / repair / compare */
  action: string;
  signal?: AbortSignal;
}

export interface PlanResult {
  text: string;
  model: string;
  ms: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export async function askPlanner(config: LlmConfig, input: PlanInput): Promise<PlanResult> {
  const client = createLlmClient(config);
  const started = Date.now();
  const res = await client.chat({
    system: PLANNER_SYSTEM_PROMPT,
    temperature: 0.3,
    maxTokens: 1200,
    signal: input.signal,
    messages: [
      {
        role: "user",
        content:
          `Action: ${input.action}\n` +
          `Intent: ${input.intent || "(none given — infer a reasonable one from the context)"}\n\n` +
          `Scoped context:\n${input.context}`,
      },
    ],
  });
  return {
    text: res.text.trim() || "(the model returned an empty response)",
    model: res.model,
    ms: Date.now() - started,
    usage: res.usage,
  };
}
