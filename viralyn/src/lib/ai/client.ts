import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db, schema } from "@/db";
import { extractJson, nvidiaChat, NVIDIA_MODEL, type NormalizedResponse } from "./nvidia";

/** "nvidia" (default) or "anthropic". */
export const PROVIDER = (process.env.AI_PROVIDER || "nvidia").toLowerCase() === "anthropic" ? "anthropic" : "nvidia";
const KEY_VAR = PROVIDER === "anthropic" ? "ANTHROPIC_API_KEY" : "NVIDIA_API_KEY";
export const MODEL = PROVIDER === "anthropic" ? process.env.VIRALYN_MODEL || "claude-opus-5-5" : NVIDIA_MODEL;

// USD per million tokens. NVIDIA's hosted trial credits are free; set AI_PRICE_* for paid endpoints.
const PRICE = {
  input: Number(process.env.AI_PRICE_INPUT ?? (PROVIDER === "anthropic" ? 4 : 0)),
  output: Number(process.env.AI_PRICE_OUTPUT ?? (PROVIDER === "anthropic" ? 20 : 0)),
};

export class AiUnavailableError extends Error {
  constructor(message = `AI is unavailable: ${KEY_VAR} is not configured on the server.`) { super(message); }
}

export const aiAvailable = () => Boolean(process.env[KEY_VAR]);
export function requireAi() { if (!aiAvailable()) throw new AiUnavailableError(); }

let anthropic: Anthropic | null = null;
const claude = () => (anthropic ??= new Anthropic());

type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };

export async function recordUsage(userId: string, action: string, u: Usage, postId?: string) {
  const input = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const cost = (input * PRICE.input + u.output_tokens * PRICE.output) / 1e6;
  await db.insert(schema.usage).values({ userId, action, postId: postId ?? null, tokens: input + u.output_tokens, cost });
}

/** One chat-model turn with tools, normalized to Anthropic-style content blocks for either provider. */
export async function chatModel(opts: { system: string; messages: Anthropic.MessageParam[]; tools: Anthropic.Tool[] }): Promise<NormalizedResponse> {
  requireAi();
  if (PROVIDER === "nvidia") return nvidiaChat({ ...opts, temperature: 0.4 });
  const r = await claude().messages.create({ model: MODEL, max_tokens: 16000, output_config: { effort: "low" }, ...opts });
  return {
    content: r.content.flatMap((b): NormalizedResponse["content"] =>
      b.type === "text" ? [{ type: "text", text: b.text }] : b.type === "tool_use" ? [{ type: "tool_use", id: b.id, name: b.name, input: b.input }] : []),
    stop_reason: r.stop_reason === "tool_use" ? "tool_use" : r.stop_reason === "max_tokens" ? "max_tokens" : r.stop_reason === "refusal" ? "refusal" : "end_turn",
    usage: r.usage,
  };
}

/** One structured LLM step: returns JSON validated against `shape`. */
export async function structured<T extends z.ZodType>(opts: {
  userId: string; action: string; system: string; prompt: string; shape: T; postId?: string;
  effort?: "low" | "medium" | "high";
}): Promise<z.infer<T>> {
  requireAi();
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(opts.shape) as Record<string, unknown>;

  if (PROVIDER === "anthropic") {
    const response = await claude().messages.create({
      model: MODEL, max_tokens: 16000, system: opts.system,
      output_config: { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: jsonSchema } },
      messages: [{ role: "user", content: opts.prompt }],
    });
    await recordUsage(opts.userId, opts.action, response.usage, opts.postId);
    if (response.stop_reason === "refusal") throw new Error(`${opts.action}: the model declined this request.`);
    if (response.stop_reason === "max_tokens") throw new Error(`${opts.action}: response was cut off.`);
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error(`${opts.action}: empty response.`);
    return opts.shape.parse(JSON.parse(text.text));
  }

  // NVIDIA: guided decoding where the endpoint supports it, plus an explicit schema in the prompt,
  // then strict validation. One corrective retry with the validation error before giving up.
  const system = `${opts.system}\n\nRespond with ONLY a JSON object (no prose, no code fences) matching this JSON Schema:\n${JSON.stringify(jsonSchema)}`;
  let prompt = opts.prompt;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await nvidiaChat({ system, messages: [{ role: "user", content: prompt }], guidedJson: jsonSchema, temperature: 0.3 });
    await recordUsage(opts.userId, opts.action, r.usage, opts.postId);
    if (r.stop_reason === "max_tokens") throw new Error(`${opts.action}: response was cut off.`);
    const text = r.content.find((b) => b.type === "text");
    try {
      return opts.shape.parse(extractJson(text?.type === "text" ? text.text : ""));
    } catch (err) {
      lastError = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (err as Error).message;
      prompt = `${opts.prompt}\n\nYour previous reply was invalid (${lastError}). Reply again with only the JSON object.`;
    }
  }
  throw new Error(`${opts.action}: the model did not return valid JSON (${lastError}).`);
}
