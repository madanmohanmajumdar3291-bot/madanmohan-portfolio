import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, HttpError, parseBody } from "@/lib/api";
import { logAction } from "@/lib/log";
import { manualEdit, PipelineError, rereview } from "@/lib/ai/pipeline";
import { AiUnavailableError } from "@/lib/ai/client";
import { criticalFailures } from "@/lib/ai/review";
import { createDraft } from "@/lib/ai/pipeline";
import { FORMATS } from "@/lib/ai/formats";
import { publishPost } from "@/lib/publisher";
import { LinkedInError } from "@/lib/linkedin";
import { linkedinUrnFrom } from "@/lib/checks";
import { notify } from "@/lib/notify";

export const maxDuration = 300;

async function owned(userId: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Post not found.");
  const [post] = await db.select().from(schema.posts).where(and(eq(schema.posts.id, id), eq(schema.posts.userId, userId)));
  if (!post) throw new HttpError(404, "Post not found.");
  return post;
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("unapprove") }),
  z.object({ action: z.literal("edit"), content: z.string().trim().min(1).max(3000) }),
  z.object({ action: z.literal("review") }),
  z.object({ action: z.literal("duplicate") }),
  z.object({ action: z.literal("publish") }),
  z.object({ action: z.literal("mark_published"), url: z.string().trim().min(10).max(500) }),
  z.object({ action: z.literal("schedule"), at: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal("unschedule") }),
  z.object({ action: z.literal("draft"), format: z.enum(FORMATS), topic: z.string().trim().min(3).max(200), experienceId: z.string().uuid().optional() }),
]);

const set = async (id: string, patch: Partial<typeof schema.posts.$inferInsert>) =>
  (await db.update(schema.posts).set({ ...patch, updatedAt: new Date() }).where(eq(schema.posts.id, id)).returning())[0];

export const PATCH = authed(async (req, user, ctx) => {
  const post = await owned(user.id, (await ctx.params).id);
  const body = await parseBody(req, Body);
  try {
    switch (body.action) {
      case "approve": {
        if (post.status !== "awaiting_approval") throw new HttpError(409, "Only posts awaiting approval can be approved.");
        if (criticalFailures(post.reviewResults ?? []).length) throw new HttpError(409, "This post failed a critical review check.");
        // A draft that already owns a future slot goes straight to Scheduled; otherwise it waits for Publish/Schedule.
        const scheduled = post.scheduledAt && post.scheduledAt > new Date();
        const p = await set(post.id, { status: scheduled ? "scheduled" : "approved" });
        await logAction(user.id, "approve", scheduled ? `Approved "${post.topic}"; scheduled for ${post.scheduledAt!.toISOString()}.` : `Approved "${post.topic}".`, { postId: post.id });
        return p;
      }
      case "unapprove": {
        if (post.status !== "approved") throw new HttpError(409, "Post is not approved.");
        const [p] = await db.update(schema.posts).set({ status: "awaiting_approval", updatedAt: new Date() }).where(eq(schema.posts.id, post.id)).returning();
        return p;
      }
      case "edit": return await manualEdit(user.id, post.id, body.content);
      case "review": return await rereview(user.id, post.id);
      case "publish": return await publishPost(user.id, post.id);
      case "mark_published": {
        // Shared by hand on LinkedIn: Published only with a real LinkedIn post link.
        if (!["approved", "scheduled", "failed"].includes(post.status)) throw new HttpError(409, "Approve the post before marking it published.");
        const urn = linkedinUrnFrom(body.url);
        if (!urn) throw new HttpError(400, "That isn't a LinkedIn post link. Open your post on LinkedIn, copy its link, and paste it here.");
        const p = await set(post.id, { status: "published", linkedinPostId: urn, publishedAt: new Date(), lastError: null, syncStatus: "manual" });
        if (post.experienceId) await db.update(schema.experiences).set({ status: "published" }).where(eq(schema.experiences.id, post.experienceId));
        await logAction(user.id, "publish", `Marked "${post.topic}" published manually (${urn}).`, { postId: post.id });
        await notify(user.id, "published", "Marked as published", post.topic, post.id);
        return p;
      }
      case "schedule": {
        const at = new Date(body.at);
        if (at <= new Date()) throw new HttpError(400, "Pick a time in the future.");
        if (post.status === "planned") return await set(post.id, { scheduledAt: at });
        if (!["approved", "scheduled", "failed", "awaiting_approval"].includes(post.status)) throw new HttpError(409, "Only reviewed posts can be scheduled.");
        const p = await set(post.id, { scheduledAt: at, syncStatus: null, publishAttempts: 0, status: post.status === "awaiting_approval" ? "awaiting_approval" : "scheduled" });
        await logAction(user.id, "schedule", `Scheduled "${post.topic}" for ${at.toISOString()}.`, { postId: post.id });
        return p;
      }
      case "unschedule": {
        if (post.status !== "scheduled") throw new HttpError(409, "Post is not scheduled.");
        const p = await set(post.id, { status: "approved", scheduledAt: null, syncStatus: null });
        await logAction(user.id, "schedule", `Unscheduled "${post.topic}".`, { postId: post.id });
        return p;
      }
      case "draft": {
        if (post.status !== "planned") throw new HttpError(409, "Only planned slots can be drafted.");
        const draft = await createDraft(user.id, { topic: body.topic, format: body.format, pillar: post.pillar }, body.experienceId);
        await db.delete(schema.posts).where(eq(schema.posts.id, post.id));
        return await set(draft.id, { scheduledAt: post.scheduledAt });
      }
      case "duplicate": {
        const { id: _id, createdAt: _c, updatedAt: _u, linkedinPostId: _l, publishedAt: _p, scheduledAt: _s, syncStatus: _y, ...rest } = post;
        const [p] = await db.insert(schema.posts).values({ ...rest, status: "draft", topic: `${post.topic} (copy)` }).returning();
        await logAction(user.id, "duplicate", `Duplicated "${post.topic}".`, { postId: p.id });
        return p;
      }
    }
  } catch (err) {
    if (err instanceof AiUnavailableError) throw new HttpError(503, err.message);
    if (err instanceof PipelineError || err instanceof LinkedInError) throw new HttpError(409, err.message);
    throw err;
  }
}, { limit: 30 });

export const DELETE = authed(async (_req, user, ctx) => {
  const post = await owned(user.id, (await ctx.params).id);
  if (post.status === "published") throw new HttpError(409, "Published posts can't be deleted from Viralyn yet.");
  await db.delete(schema.posts).where(eq(schema.posts.id, post.id));
  await logAction(user.id, "delete", `Deleted "${post.topic}".`);
  return { ok: true };
});
