import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ReviewCheck } from "@/db/schema";
import { logAction } from "@/lib/log";
import { notify } from "@/lib/notify";
import { loadContext } from "./context";
import { editDraft, writeDraft, type Brief } from "./write";
import { criticalFailures, originalityCheck, reviewDraft } from "./review";
import { aiAvailable, AiUnavailableError } from "./client";
import { basicChecks, unavailableChecks } from "@/lib/checks";
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

const RANK = { pass: 0, warn: 1, fail: 2 } as const;

/**
 * Review that always works: rule-based checks + originality, plus AI review when available.
 * If AI is missing or fails (e.g. quota), the AI-only checks are marked "not checked", never passed.
 */
export async function reviewAny(opts: { userId: string; ctx: Awaited<ReturnType<typeof loadContext>>; content: string; experience?: string | null; postId?: string }) {
  const s = opts.ctx.settings;
  const rules = [
    ...basicChecks(opts.content, { avoidTopics: s?.avoidTopics, avoidWords: s?.avoidWords, recentOpenings: opts.ctx.recent.filter((p) => p.id !== opts.postId).map((p) => p.content.split("\n")[0]) }),
    originalityCheck(opts.content, opts.ctx, opts.postId),
  ];
  let ai: ReviewCheck[] = unavailableChecks();
  let note: string | null = null;
  if (aiAvailable()) {
    try { ai = await reviewDraft({ ...opts }); }
    catch (err) { note = err instanceof AiUnavailableError ? null : (err as Error).message; ai = unavailableChecks(); }
  }
  // Merge by check name, keeping the stricter verdict.
  const merged = new Map<string, ReviewCheck>();
  for (const c of [...ai, ...rules]) {
    const prev = merged.get(c.check);
    if (!prev || RANK[c.result] > RANK[prev.result]) merged.set(c.check, c);
  }
  if (note) await logAction(opts.userId, "review", `AI review unavailable, rule-based checks only: ${note}`, { postId: opts.postId, status: "warn" });
  return [...merged.values()];
}

async function saveAndReview(userId: string, postId: string, content: string, ctx: Awaited<ReturnType<typeof loadContext>>,
  experience: string | null | undefined, extra: { hookStyle?: string; cta?: string }, logMsg: string) {
  const checks = await reviewAny({ userId, ctx, content, experience, postId });
  const [updated] = await db.update(schema.posts)
    .set({ content, ...extra, reviewResults: checks, status: statusFor(checks), updatedAt: new Date() })
    .where(eq(schema.posts.id, postId)).returning();
  await logAction(userId, "edit", logMsg, { postId });
  return updated;
}

/** A post the user wrote themselves. Reviewed with whatever checks are available; never published here. */
export async function createManualPost(userId: string, input: { topic: string; format: string; pillar?: string | null; content: string; scheduledAt?: Date | null }) {
  const ctx = await loadContext(userId);
  const [post] = await db.insert(schema.posts).values({
    userId, topic: input.topic, format: input.format, pillar: input.pillar ?? null, content: input.content,
    status: "draft", scheduledAt: input.scheduledAt ?? null,
  }).returning();
  const checks = await reviewAny({ userId, ctx, content: input.content, postId: post.id });
  const [saved] = await db.update(schema.posts).set({ reviewResults: checks, status: statusFor(checks) }).where(eq(schema.posts.id, post.id)).returning();
  await logAction(userId, "draft", `Wrote "${input.topic}" manually.`, { postId: post.id });
  return saved;
}
