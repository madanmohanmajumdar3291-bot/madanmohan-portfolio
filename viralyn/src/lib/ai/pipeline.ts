import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ReviewCheck } from "@/db/schema";
import { logAction } from "@/lib/log";
import { notify } from "@/lib/notify";
import { loadContext } from "./context";
import { editDraft, writeDraft, type Brief } from "./write";
import { criticalFailures, reviewDraft } from "./review";
import { requiresExperience } from "./formats";

const MAX_AUTO_REVISIONS = 2;

export class PipelineError extends Error {}

async function getExperience(userId: string, experienceId?: string | null) {
  if (!experienceId) return null;
  const [exp] = await db.select().from(schema.experiences)
    .where(and(eq(schema.experiences.id, experienceId), eq(schema.experiences.userId, userId)));
  if (!exp) throw new PipelineError("That experience was not found in your Inbox.");
  return exp;
}

const statusFor = (checks: ReviewCheck[]): "needs_revision" | "awaiting_approval" =>
  criticalFailures(checks).length ? "needs_revision" : "awaiting_approval";

/** Write → Review → (auto-revise up to 2×) → save. Never publishes. */
export async function createDraft(userId: string, brief: Omit<Brief, "experience">, experienceId?: string | null) {
  if (requiresExperience(brief.format, brief.pillar) && !experienceId) {
    throw new PipelineError(
      `"${brief.format}" posts about your own life can only be written from an experience you shared. Tell me what happened and I'll save it to your Inbox first.`,
    );
  }
  const exp = await getExperience(userId, experienceId);
  const ctx = await loadContext(userId);
  const fullBrief: Brief = { ...brief, experience: exp?.content ?? null };

  let draft = await writeDraft(userId, ctx, fullBrief);
  let checks = await reviewDraft({ userId, ctx, content: draft.content, experience: exp?.content });
  let revisions = 0;
  while (criticalFailures(checks).length && revisions < MAX_AUTO_REVISIONS) {
    revisions++;
    draft = await writeDraft(userId, ctx, fullBrief, criticalFailures(checks).map((c) => `${c.check}: ${c.reason}`));
    checks = await reviewDraft({ userId, ctx, content: draft.content, experience: exp?.content });
  }

  const status = statusFor(checks);
  const [post] = await db.insert(schema.posts).values({
    userId, experienceId: exp?.id ?? null, topic: brief.topic, pillar: brief.pillar ?? null, format: brief.format,
    objective: brief.objective ?? null, angle: draft.angle, hookStyle: draft.hookStyle, cta: draft.cta,
    content: draft.content, status, reviewResults: checks, revisionCount: revisions,
  }).returning();
  if (exp && exp.status === "unused") await db.update(schema.experiences).set({ status: "drafted" }).where(eq(schema.experiences.id, exp.id));

  await logAction(userId, "draft", `Drafted "${brief.topic}" (${brief.format})${revisions ? ` after ${revisions} automatic revision(s)` : ""}.`, { postId: post.id });
  if (status === "awaiting_approval") await notify(userId, "approval_needed", "Draft ready for approval", brief.topic, post.id);
  await logAction(userId, "review", status === "awaiting_approval" ? "Review passed; awaiting your approval." : `Review failed: ${criticalFailures(checks).map((c) => c.reason).join(" ")}`,
    { postId: post.id, status: status === "awaiting_approval" ? "ok" : "warn" });
  return post;
}

async function ownedPost(userId: string, postId: string) {
  const [post] = await db.select().from(schema.posts).where(and(eq(schema.posts.id, postId), eq(schema.posts.userId, userId)));
  if (!post) throw new PipelineError("Post not found.");
  if (["publishing", "published"].includes(post.status)) throw new PipelineError("Published posts can't be edited here.");
  return post;
}

/** Conversational edit ("shorter hook") → re-review. */
export async function applyEdit(userId: string, postId: string, instruction: string) {
  const post = await ownedPost(userId, postId);
  const exp = await getExperience(userId, post.experienceId);
  const ctx = await loadContext(userId);
  const draft = await editDraft(userId, ctx, post.content, instruction, exp?.content);
  return saveAndReview(userId, post.id, draft.content, ctx, exp?.content, { hookStyle: draft.hookStyle, cta: draft.cta }, `Edited: ${instruction}`);
}

const EMOJI = /\p{Extended_Pictographic}/u;

/** Manual text edit from the post card → re-review. */
export async function manualEdit(userId: string, postId: string, content: string) {
  const post = await ownedPost(userId, postId);
  // Learn from edits, but ask before changing the voice profile.
  if (EMOJI.test(post.content) && !EMOJI.test(content)) {
    await logAction(userId, "voice_signal", "You removed all emojis from a draft.", { postId });
    const recent = await db.select({ id: schema.agentLogs.id }).from(schema.agentLogs)
      .where(and(eq(schema.agentLogs.userId, userId), eq(schema.agentLogs.action, "voice_signal"))).limit(3);
    if (recent.length === 3) {
      await notify(userId, "approval_needed", "Update your voice profile?", "You keep removing emojis from drafts. Set Emojis to \"none\" in Settings → My Voice?");
      await db.delete(schema.agentLogs).where(and(eq(schema.agentLogs.userId, userId), eq(schema.agentLogs.action, "voice_signal")));
    }
  }
  const exp = await getExperience(userId, post.experienceId);
  return saveAndReview(userId, post.id, content, await loadContext(userId), exp?.content, {}, "Edited manually.");
}

export async function rereview(userId: string, postId: string) {
  const post = await ownedPost(userId, postId);
  const exp = await getExperience(userId, post.experienceId);
  return saveAndReview(userId, post.id, post.content, await loadContext(userId), exp?.content, {}, "Re-reviewed.");
}

async function saveAndReview(userId: string, postId: string, content: string, ctx: Awaited<ReturnType<typeof loadContext>>,
  experience: string | null | undefined, extra: { hookStyle?: string; cta?: string }, logMsg: string) {
  const checks = await reviewDraft({ userId, ctx, content, experience, postId });
  const [updated] = await db.update(schema.posts)
    .set({ content, ...extra, reviewResults: checks, status: statusFor(checks), updatedAt: new Date() })
    .where(eq(schema.posts.id, postId)).returning();
  await logAction(userId, "edit", logMsg, { postId });
  return updated;
}
