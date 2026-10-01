import type Anthropic from "@anthropic-ai/sdk";

// Providers that speak the OpenAI chat-completions format (Gemini, NVIDIA, Groq, OpenRouter, OpenAI…).
// Viralyn keeps Anthropic-shaped messages internally; this file converts in and out.

const PRESETS: Record<string, { baseUrl: string; model: string; host: string }> = {
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-flash-latest", host: "generativelanguage.googleapis.com" },
  nvidia: { baseUrl: "https://integrate.api.nvidia.com/v1", model: "meta/llama-3.3-70b-instruct", host: "integrate.api.nvidia.com" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", host: "api.groq.com" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-flash-latest", host: "openrouter.ai" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini", host: "api.openai.com" },
};

export type CompatConfig = { name: string; baseUrl: string; model: string; apiKey: string | undefined; fallbackModel?: string };

/** Resolves AI_PROVIDER (+ optional AI_BASE_URL / AI_MODEL overrides) to an endpoint. */
export function compatConfig(provider: string, env: Record<string, string | undefined> = process.env): CompatConfig {
  const preset = PRESETS[provider] ?? PRESETS.gemini;
  return {
    name: PRESETS[provider] ? provider : "openai-compatible",
    baseUrl: (env.AI_BASE_URL || (provider === "nvidia" && env.NVIDIA_BASE_URL) || preset.baseUrl).replace(/\/$/, ""),
    model: env.AI_MODEL || (provider === "nvidia" && env.NVIDIA_MODEL) || preset.model,
    apiKey: env.AI_API_KEY || (provider === "nvidia" ? env.NVIDIA_API_KEY : provider === "gemini" ? env.GEMINI_API_KEY : undefined),
    ...(env.AI_FALLBACK_MODEL ? { fallbackModel: env.AI_FALLBACK_MODEL } : {}),
  };
}

type OAMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string }; extra_content?: unknown }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type NormalizedResponse = {
  content: ({ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown })[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "refusal";
  usage: { input_tokens: number; output_tokens: number };
};

// Gemini 3 attaches a thought signature to each tool call and rejects the next turn unless it's echoed back.
// Tool blocks only live within one chat turn, so a bounded in-process map keyed by tool call id is enough.
const toolCallExtras = new Map<string, unknown>();
function rememberExtra(id: string, extra: unknown) {
  toolCallExtras.set(id, extra);
  if (toolCallExtras.size > 500) toolCallExtras.delete(toolCallExtras.keys().next().value!);
}

const textOf = (c: Anthropic.MessageParam["content"]) =>
  typeof c === "string" ? c : c.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");

export function toOpenAI(system: string, messages: Anthropic.MessageParam[]): OAMessage[] {
  const out: OAMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content } as OAMessage); continue; }
    if (m.role === "user") {
      for (const b of m.content) {
        if (b.type === "tool_result") {
          const content = typeof b.content === "string" ? b.content : (b.content ?? []).map((x) => (x.type === "text" ? x.text : "")).join("\n");
          out.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.is_error ? `ERROR: ${content}` : content });
        }
      }
      const text = textOf(m.content.filter((b) => b.type === "text"));
      if (text) out.push({ role: "user", content: text });
    } else {
      const calls = m.content.flatMap((b) => (b.type === "tool_use" ? [{
        id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        ...(toolCallExtras.has(b.id) ? { extra_content: toolCallExtras.get(b.id) } : {}),
      }] : []));
      out.push({ role: "assistant", content: textOf(m.content) || null, ...(calls.length ? { tool_calls: calls } : {}) });
    }
  }
  return out;
}

export function fromOpenAI(data: {
  choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string }; extra_content?: unknown }[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}): NormalizedResponse {
  const choice = data.choices?.[0];
  const msg = choice?.message ?? {};
  const content: NormalizedResponse["content"] = [];
  if (msg.content?.trim()) content.push({ type: "text", text: msg.content.trim() });
  (msg.tool_calls ?? []).forEach((tc, i) => {
    let input: unknown = {};
    try { input = JSON.parse(tc.function?.arguments || "{}"); } catch { input = { __invalid_json: tc.function?.arguments }; }
    const id = tc.id || `call_${i}_${Date.now()}`;
    if (tc.extra_content) rememberExtra(id, tc.extra_content);
    content.push({ type: "tool_use", id, name: tc.function?.name ?? "", input });
  });
  const hasTools = content.some((b) => b.type === "tool_use");
  const fr = choice?.finish_reason;
  return {
    content,
    stop_reason: hasTools ? "tool_use" : fr === "length" ? "max_tokens" : fr === "content_filter" ? "refusal" : "end_turn",
    usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 },
  };
}

export async function compatChat(cfg: CompatConfig, opts: {
  system: string; messages: Anthropic.MessageParam[]; tools?: Anthropic.Tool[]; maxTokens?: number;
  jsonSchema?: Record<string, unknown>; temperature?: number;
}): Promise<NormalizedResponse> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: toOpenAI(opts.system, opts.messages),
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.6,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    body.tool_choice = "auto";
  }
  if (opts.jsonSchema) {
    // NVIDIA supports schema-guided decoding; everyone else gets the standard JSON mode.
    if (cfg.name === "nvidia") body.nvext = { guided_json: opts.jsonSchema };
    else body.response_format = { type: "json_object" };
  }

  const res = await fetchWithRetry(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    // AI_API_KEY=proxy means the environment's egress proxy injects the Authorization header itself.
    headers: { ...(cfg.apiKey && cfg.apiKey !== "proxy" ? { authorization: `Bearer ${cfg.apiKey}` } : {}), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  // Primary model overloaded or rate-limited after retries: try the fallback model once.
  if ((res.status === 429 || res.status >= 500) && cfg.fallbackModel && cfg.fallbackModel !== cfg.model) {
    return compatChat({ ...cfg, model: cfg.fallbackModel, fallbackModel: undefined }, opts);
  }
  if (!res.ok) throw new Error(`${cfg.name} API returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return fromOpenAI(await res.json());
}

/** Retries rate limits (429) and temporary outages (5xx) with exponential backoff. */
async function fetchWithRetry(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
    if (res.ok || i >= attempts - 1 || !(res.status === 429 || res.status >= 500)) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 2000 * 2 ** i));
  }
}

/** Pulls the first JSON object out of a model reply (handles ```json fences and leading prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const start = src.indexOf("{"), end = src.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model response.");
  return JSON.parse(src.slice(start, end + 1));
}
