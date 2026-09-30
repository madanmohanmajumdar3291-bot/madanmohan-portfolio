import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, HttpError, parseBody } from "@/lib/api";
import { engagementRate } from "@/lib/analytics";
import { loadAnalytics } from "@/lib/analytics-data";
import { logAction } from "@/lib/log";

export const GET = authed(async (_req, user) => loadAnalytics(user.id, user.timezone));

const n = z.number().int().min(0).max(1e9).nullable().optional();
const Manual = z.object({ postId: z.string().uuid(), impressions: n, reactions: n, comments: n, reposts: n });

// Manual entry for one post.
export const PUT = authed(async (req, user) => {
  const b = await parseBody(req, Manual);
  const [post] = await db.select().from(schema.posts).where(and(eq(schema.posts.id, b.postId), eq(schema.posts.userId, user.id)));
  if (!post) throw new HttpError(404, "Post not found.");
  const [row] = await db.insert(schema.analytics).values({
    postId: post.id, impressions: b.impressions ?? null, reactions: b.reactions ?? null, comments: b.comments ?? null, reposts: b.reposts ?? null,
    engagementRate: engagementRate(b), source: "manual",
  }).returning();
  await logAction(user.id, "analytics", `Entered metrics manually for "${post.topic}".`, { postId: post.id });
  return row;
});
