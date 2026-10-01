import type Anthropic from "@anthropic-ai/sdk";

// NVIDIA's hosted models (build.nvidia.com) speak the OpenAI chat-completions format.
// Viralyn keeps Anthropic-shaped messages internally; this file converts in and out.

export const NVIDIA_BASE = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
export const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";

type OAMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type NormalizedResponse = {
  content: ({ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown })[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "refusal";
  usage: { input_tokens: number; output_tokens: number };
};

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
      const calls = m.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }] : []));
      out.push({ role: "assistant", content: textOf(m.content) || null, ...(calls.length ? { tool_calls: calls } : {}) });
    }
  }
  return out;
}

export function fromOpenAI(data: {
  choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}): NormalizedResponse {
  const choice = data.choices?.[0];
  const msg = choice?.message ?? {};
  const content: NormalizedResponse["content"] = [];
  if (msg.content?.trim()) content.push({ type: "text", text: msg.content.trim() });
  (msg.tool_calls ?? []).forEach((tc, i) => {
    let input: unknown = {};
    try { input = JSON.parse(tc.function?.arguments || "{}"); } catch { input = { __invalid_json: tc.function?.arguments }; }
    content.push({ type: "tool_use", id: tc.id || `call_${i}_${Date.now()}`, name: tc.function?.name ?? "", input });
  });
  const hasTools = content.some((b) => b.type === "tool_use");
  const fr = choice?.finish_reason;
  return {
    content,
    stop_reason: hasTools ? "tool_use" : fr === "length" ? "max_tokens" : fr === "content_filter" ? "refusal" : "end_turn",
    usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 },
  };
}

export async function nvidiaChat(opts: {
  system: string; messages: Anthropic.MessageParam[]; tools?: Anthropic.Tool[]; maxTokens?: number;
  guidedJson?: Record<string, unknown>; temperature?: number;
}): Promise<NormalizedResponse> {
  const body: Record<string, unknown> = {
    model: NVIDIA_MODEL,
    messages: toOpenAI(opts.system, opts.messages),
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.6,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    body.tool_choice = "auto";
  }
  if (opts.guidedJson) body.nvext = { guided_json: opts.guidedJson };

  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`NVIDIA API returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return fromOpenAI(await res.json());
}

/** Pulls the first JSON object out of a model reply (handles ```json fences and leading prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const start = src.indexOf("{"), end = src.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model response.");
  return JSON.parse(src.slice(start, end + 1));
}
