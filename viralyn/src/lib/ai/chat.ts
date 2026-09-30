import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAction } from "@/lib/log";
import { ai, MODEL, recordUsage } from "./client";
import { historyText, loadContext, strategyText } from "./context";
import { describeVoice } from "./voice";
import { FORMATS } from "./formats";
import { applyEdit, createDraft, PipelineError, rereview } from "./pipeline";

const DraftInput = z.object({
  topic: z.string().min(3), format: z.enum(FORMATS), pillar: z.string().optional(),
  objective: z.string().optional(), angle: z.string().optional(), notes: z.string().optional(),
  experience_id: z.string().uuid().optional(),
});
const EditInput = z.object({ post_id: z.string().uuid(), instruction: z.string().min(2) });
const ExperienceInput = z.object({ content: z.string().min(5), pillar: z.string().optional() });
const ReviewInput = z.object({ post_id: z.string().uuid() });
const HistoryInput = z.object({ limit: z.number().int().min(1).max(20).optional() });

const tools: Anthropic.Tool[] = [
  {
    name: "draft_post",
    description: "Write a new LinkedIn post draft in the user's voice. It is automatically reviewed and saved as awaiting approval (or needs revision). It is never published. For storytelling, personal lesson, mistake/lesson formats or the Personal Journey pillar, experience_id is REQUIRED (from save_experience).",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string" }, format: { type: "string", enum: [...FORMATS] }, pillar: { type: "string" },
        objective: { type: "string" }, angle: { type: "string" },
        notes: { type: "string", description: "Extra user instructions, e.g. tone or length" },
        experience_id: { type: "string" },
      },
      required: ["topic", "format"],
    },
  },
  {
    name: "edit_draft",
    description: "Apply a conversational edit to an existing draft (e.g. 'shorter hook', 'less formal', 'remove hashtags'). Re-runs review.",
    input_schema: { type: "object", properties: { post_id: { type: "string" }, instruction: { type: "string" } }, required: ["post_id", "instruction"] },
  },
  {
    name: "save_experience",
    description: "Save something that actually happened to the user into their Experience Inbox. Use the user's own words; do not add details. Returns an experience_id.",
    input_schema: { type: "object", properties: { content: { type: "string" }, pillar: { type: "string" } }, required: ["content"] },
  },
  {
    name: "submit_for_review",
    description: "Re-run the review checks on a draft.",
    input_schema: { type: "object", properties: { post_id: { type: "string" } }, required: ["post_id"] },
  },
  {
    name: "get_post_history",
    description: "List the user's most recent posts with status, topic, pillar and format.",
    input_schema: { type: "object", properties: { limit: { type: "integer" } } },
  },
];

type ToolOutcome = { result: string; postId?: string; isError?: boolean };

async function runTool(userId: string, name: string, raw: unknown): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "draft_post": {
        const i = DraftInput.parse(raw);
        const post = await createDraft(userId, { topic: i.topic, format: i.format, pillar: i.pillar, objective: i.objective, angle: i.angle, userNotes: i.notes }, i.experience_id);
        return { postId: post.id, result: JSON.stringify({ post_id: post.id, status: post.status, review: post.reviewResults }) };
      }
      case "edit_draft": {
        const i = EditInput.parse(raw);
        const post = await applyEdit(userId, i.post_id, i.instruction);
        return { postId: post.id, result: JSON.stringify({ post_id: post.id, status: post.status, review: post.reviewResults }) };
      }
      case "submit_for_review": {
        const post = await rereview(userId, ReviewInput.parse(raw).post_id);
        return { postId: post.id, result: JSON.stringify({ post_id: post.id, status: post.status, review: post.reviewResults }) };
      }
      case "save_experience": {
        const i = ExperienceInput.parse(raw);
        const [exp] = await db.insert(schema.experiences).values({ userId, content: i.content, pillar: i.pillar ?? null }).returning();
        await logAction(userId, "experience", `Saved to Inbox: "${i.content.slice(0, 80)}"`);
        return { result: JSON.stringify({ experience_id: exp.id }) };
      }
      case "get_post_history": {
        const { limit } = HistoryInput.parse(raw ?? {});
        const rows = await db.select({ id: schema.posts.id, topic: schema.posts.topic, pillar: schema.posts.pillar, format: schema.posts.format, status: schema.posts.status, createdAt: schema.posts.createdAt })
          .from(schema.posts).where(eq(schema.posts.userId, userId)).orderBy(desc(schema.posts.createdAt)).limit(limit ?? 10);
        return { result: rows.length ? JSON.stringify(rows) : "No posts yet." };
      }
      default:
        return { result: `Unknown tool ${name}`, isError: true };
    }
  } catch (err) {
    if (err instanceof PipelineError) return { result: err.message, isError: true };
    if (err instanceof z.ZodError) return { result: `Invalid input: ${err.issues.map((x) => x.message).join("; ")}`, isError: true };
    throw err;
  }
}

function systemPrompt(name: string, ctx: Awaited<ReturnType<typeof loadContext>>) {
  return `You are Viralyn, ${name}'s AI co-writer for LinkedIn. You help them capture experiences and turn them into posts in their own voice.

Principles:
- Honesty first. Never invent facts, statistics, quotes, news or personal stories. If you lack information, say so or ask.
- Personal posts (storytelling, personal lesson, mistake/lesson, Personal Journey) come only from experiences the user told you. If they haven't shared one, ask what happened. When they do, save it with save_experience using their words, then draft from it.
- You cannot publish, schedule, or change settings. Publishing only happens when the user taps Approve on the post card. Never claim something was posted.
- Scheduling, calendar, research, analytics and LinkedIn publishing are not available yet in this version. If asked, say they're coming and offer what you can do now.
- When you draft or edit, the post card is shown to the user automatically: don't paste the whole post back. Briefly say what you did and summarise any review warnings or failures.
- Be concise and friendly.

<voice_profile>
${describeVoice(ctx.voice?.profile)}
</voice_profile>
<strategy>
${strategyText(ctx)}
</strategy>
<recent_posts>
${historyText(ctx)}
</recent_posts>`;
}

const MAX_STEPS = 6;

export async function chatTurn(user: { id: string; name: string }, message: string) {
  const client = ai(); // fail fast (before storing anything) when AI isn't configured
  const history = await db.select().from(schema.chatMessages)
    .where(eq(schema.chatMessages.userId, user.id)).orderBy(desc(schema.chatMessages.createdAt)).limit(30);
  await db.insert(schema.chatMessages).values({ userId: user.id, role: "user", content: message });

  // Past turns are replayed as plain text; tool blocks only live within the current turn.
  const messages: Anthropic.MessageParam[] = history.reverse()
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  messages.push({ role: "user", content: message });

  const ctx = await loadContext(user.id);
  const postIds: string[] = [];
  const calls: { name: string; input: unknown; error?: boolean }[] = [];
  let text = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.messages.create({
      model: MODEL, max_tokens: 16000, system: systemPrompt(user.name, ctx), tools, messages,
      output_config: { effort: "low" },
    });
    await recordUsage(user.id, "chat", response.usage);
    if (response.stop_reason === "refusal") { text = "I can't help with that one."; break; }
    messages.push({ role: "assistant", content: response.content });
    text = response.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n").trim();
    if (response.stop_reason !== "tool_use") break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const out = await runTool(user.id, block.name, block.input);
      calls.push({ name: block.name, input: block.input, error: out.isError });
      if (out.postId && !postIds.includes(out.postId)) postIds.push(out.postId);
      results.push({ type: "tool_result", tool_use_id: block.id, content: out.result, is_error: out.isError });
    }
    messages.push({ role: "user", content: results });
    if (step === MAX_STEPS - 1) text ||= "I ran out of steps for this request. Please try again with a narrower ask.";
  }

  const [saved] = await db.insert(schema.chatMessages)
    .values({ userId: user.id, role: "assistant", content: text || "Done.", toolCalls: [...calls, ...postIds.map((id) => ({ postId: id }))] })
    .returning();
  return { message: saved, postIds };
}

export async function chatHistory(userId: string, q?: string) {
  const rows = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.userId, userId)).orderBy(asc(schema.chatMessages.createdAt)).limit(500);
  return q ? rows.filter((r) => r.content.toLowerCase().includes(q.toLowerCase())) : rows.slice(-100);
}

export const postIdsFrom = (toolCalls: unknown[] | null) =>
  (toolCalls ?? []).flatMap((c) => (c && typeof c === "object" && "postId" in c ? [String((c as { postId: string }).postId)] : []));

export async function postsByIds(userId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await Promise.all(ids.map((id) => db.select().from(schema.posts).where(and(eq(schema.posts.id, id), eq(schema.posts.userId, userId)))));
  return rows.flat();
}
