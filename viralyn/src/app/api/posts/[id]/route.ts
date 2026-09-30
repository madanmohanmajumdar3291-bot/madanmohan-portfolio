import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, HttpError, parseBody } from "@/lib/api";
import { logAction } from "@/lib/log";
import { manualEdit, PipelineError, rereview } from "@/lib/ai/pipeline";
import { AiUnavailableError } from "@/lib/ai/client";
import { criticalFailures } from "@/lib/ai/review";

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
]);

export const PATCH = authed(async (req, user, ctx) => {
  const post = await owned(user.id, (await ctx.params).id);
  const body = await parseBody(req, Body);
  try {
    switch (body.action) {
      case "approve": {
        if (post.status !== "awaiting_approval") throw new HttpError(409, "Only posts awaiting approval can be approved.");
        if (criticalFailures(post.reviewResults ?? []).length) throw new HttpError(409, "This post failed a critical review check.");
        const [p] = await db.update(schema.posts).set({ status: "approved", updatedAt: new Date() }).where(eq(schema.posts.id, post.id)).returning();
        await logAction(user.id, "approve", `Approved "${post.topic}". Not published: LinkedIn publishing is not connected yet.`, { postId: post.id });
        return p;
      }
      case "unapprove": {
        if (post.status !== "approved") throw new HttpError(409, "Post is not approved.");
        const [p] = await db.update(schema.posts).set({ status: "awaiting_approval", updatedAt: new Date() }).where(eq(schema.posts.id, post.id)).returning();
        return p;
      }
      case "edit": return await manualEdit(user.id, post.id, body.content);
      case "review": return await rereview(user.id, post.id);
      case "duplicate": {
        const { id: _id, createdAt: _c, updatedAt: _u, linkedinPostId: _l, publishedAt: _p, scheduledAt: _s, syncStatus: _y, ...rest } = post;
        const [p] = await db.insert(schema.posts).values({ ...rest, status: "draft", topic: `${post.topic} (copy)` }).returning();
        await logAction(user.id, "duplicate", `Duplicated "${post.topic}".`, { postId: p.id });
        return p;
      }
    }
  } catch (err) {
    if (err instanceof AiUnavailableError) throw new HttpError(503, err.message);
    if (err instanceof PipelineError) throw new HttpError(409, err.message);
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
