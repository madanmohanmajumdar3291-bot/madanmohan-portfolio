import { and, eq, lte, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAction } from "./log";
import { notify } from "./notify";
import { getAccount, LinkedInError, publishText } from "./linkedin";

const MAX_ATTEMPTS = 3;

/** Publish one post. Only marks it Published after LinkedIn confirms with a post id. */
export async function publishPost(userId: string, postId: string) {
  // Claim the post atomically so a manual click and the worker can't both publish it.
  const [post] = await db.update(schema.posts)
    .set({ status: "publishing", publishAttempts: sql`${schema.posts.publishAttempts} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.posts.id, postId), eq(schema.posts.userId, userId), inArray(schema.posts.status, ["approved", "scheduled", "failed"])))
    .returning();
  if (!post) throw new LinkedInError("This post isn't approved or is already publishing.");

  try {
    const urn = await publishText(userId, post.content);
    const [done] = await db.update(schema.posts)
      .set({ status: "published", linkedinPostId: urn, publishedAt: new Date(), lastError: null, syncStatus: "unverified", updatedAt: new Date() })
      .where(eq(schema.posts.id, post.id)).returning();
    if (post.experienceId) await db.update(schema.experiences).set({ status: "published" }).where(eq(schema.experiences.id, post.experienceId));
    await logAction(userId, "publish", `Published "${post.topic}" to LinkedIn (${urn}).`, { postId: post.id });
    await notify(userId, "published", "Published to LinkedIn", post.topic, post.id);
    return done;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const expired = err instanceof LinkedInError && err.expired;
    // Retry transient failures from the scheduler; token problems and final attempts become Failed.
    const transient = err instanceof LinkedInError ? (err.status ?? 0) >= 500 || err.status === 429 : true; // network errors are transient
    const retry = Boolean(post.scheduledAt) && !expired && transient && post.publishAttempts < MAX_ATTEMPTS;
    const [failed] = await db.update(schema.posts)
      .set({ status: retry ? "scheduled" : "failed", lastError: reason, updatedAt: new Date(),
        scheduledAt: retry ? new Date(Date.now() + 5 * 60_000 * post.publishAttempts) : post.scheduledAt })
      .where(eq(schema.posts.id, post.id)).returning();
    await logAction(userId, "publish", `Publishing "${post.topic}" failed${retry ? " (will retry)" : ""}: ${reason}`, { postId: post.id, status: "error" });
    if (expired) await db.update(schema.settings).set({ paused: true }).where(eq(schema.settings.userId, userId)); // pause until reconnected
    if (!retry) await notify(userId, expired ? "linkedin_expired" : "publish_failed", expired ? "LinkedIn connection expired" : "Publishing failed", reason, post.id);
    return failed;
  }
}

/** Background tick: publish due scheduled posts, and warn about ones publishing within 2 hours. */
export async function runScheduler(now = new Date()) {
  const due = await db.select({ id: schema.posts.id, userId: schema.posts.userId, paused: schema.settings.paused, pausedUntil: schema.settings.pausedUntil })
    .from(schema.posts).innerJoin(schema.settings, eq(schema.settings.userId, schema.posts.userId))
    .where(and(eq(schema.posts.status, "scheduled"), lte(schema.posts.scheduledAt, now)));
  let published = 0, skipped = 0;
  for (const p of due) {
    const paused = p.paused || (p.pausedUntil && p.pausedUntil > now);
    if (paused) { skipped++; continue; }
    if (!(await getAccount(p.userId))) {
      // No LinkedIn connection: it's the user's turn to post by hand. Remind once and hand the post back.
      const [post] = await db.update(schema.posts).set({ status: "approved", updatedAt: new Date() })
        .where(and(eq(schema.posts.id, p.id), eq(schema.posts.status, "scheduled"))).returning();
      if (post) {
        await notify(p.userId, "about_to_publish", "Time to post", `"${post.topic}" is due. Open it in Viralyn, use Share manually, then paste the LinkedIn link.`, post.id);
        await logAction(p.userId, "schedule", `"${post.topic}" is due; LinkedIn isn't connected, so you were reminded to post it manually.`, { postId: post.id });
      }
      skipped++; continue;
    }
    const r = await publishPost(p.userId, p.id).catch(() => null);
    if (r?.status === "published") published++;
  }

  // Cancel-window notice, once per post (the syncStatus flag marks it sent).
  const soon = await db.select().from(schema.posts)
    .where(and(eq(schema.posts.status, "scheduled"), gte(schema.posts.scheduledAt, now), lte(schema.posts.scheduledAt, new Date(now.getTime() + 2 * 3600_000))));
  for (const p of soon) {
    if (p.syncStatus === "notified") continue;
    await notify(p.userId, "about_to_publish", "Publishing soon", `"${p.topic}" publishes at ${p.scheduledAt!.toISOString()}. Unschedule it to cancel.`, p.id);
    await db.update(schema.posts).set({ syncStatus: "notified" }).where(eq(schema.posts.id, p.id));
  }
  return { due: due.length, published, skipped };
}
