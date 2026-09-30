import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db, schema } from "@/db";

export const MODEL = process.env.VIRALYN_MODEL || "claude-opus-5-5";
// USD per million tokens for the default model; update if VIRALYN_MODEL changes.
const PRICE = { input: 4, output: 20 };

export class AiUnavailableError extends Error {
  constructor(message = "AI is unavailable: ANTHROPIC_API_KEY is not configured on the server.") { super(message); }
}

let client: Anthropic | null = null;
export function ai(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiUnavailableError();
  return (client ??= new Anthropic());
}
export const aiAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function recordUsage(userId: string, action: string, u: Anthropic.Usage, postId?: string) {
  const input = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const cost = (input * PRICE.input + u.output_tokens * PRICE.output) / 1e6;
  await db.insert(schema.usage).values({ userId, action, postId: postId ?? null, tokens: input + u.output_tokens, cost });
}

/** One structured LLM step: returns JSON validated against `shape`. */
export async function structured<T extends z.ZodType>(opts: {
  userId: string; action: string; system: string; prompt: string; shape: T; postId?: string;
  effort?: "low" | "medium" | "high";
}): Promise<z.infer<T>> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(opts.shape) as Record<string, unknown>;
  const response = await ai().messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: opts.system,
    output_config: {
      effort: opts.effort ?? "medium",
      format: { type: "json_schema", schema },
    },
    messages: [{ role: "user", content: opts.prompt }],
  });
  await recordUsage(opts.userId, opts.action, response.usage, opts.postId);
  if (response.stop_reason === "refusal") throw new Error(`${opts.action}: the model declined this request.`);
  if (response.stop_reason === "max_tokens") throw new Error(`${opts.action}: response was cut off.`);
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error(`${opts.action}: empty response.`);
  return opts.shape.parse(JSON.parse(text.text));
}
