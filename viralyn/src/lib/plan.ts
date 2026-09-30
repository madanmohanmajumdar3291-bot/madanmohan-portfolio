import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { assignPillars, slots } from "./planner";
import { ymdIn } from "./time";
import { logAction } from "./log";

/** Fills free future slots with Planned placeholders (pillar only; no content is invented). */
export async function planAhead(userId: string, tz: string, days = 7) {
  const [s] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId));
  if (!s?.pillars.length) return { created: 0, reason: "Add content pillars in Settings first." };
  const now = new Date();
  const free = slots({ fromYmd: ymdIn(now, tz), days, frequency: s.frequency, postingTimes: s.postingTimes, maxPerDay: s.maxPostsPerDay, tz, now });
  const taken = await db.select({ at: schema.posts.scheduledAt }).from(schema.posts)
    .where(and(eq(schema.posts.userId, userId), gte(schema.posts.scheduledAt, now), inArray(schema.posts.status, ["planned", "scheduled", "approved", "awaiting_approval", "draft", "needs_revision"])));
  const takenSet = new Set(taken.map((t) => t.at?.toISOString()));
  const open = free.filter((d) => !takenSet.has(d.toISOString()));
  const recent = await db.select({ pillar: schema.posts.pillar }).from(schema.posts).where(eq(schema.posts.userId, userId)).orderBy(desc(schema.posts.createdAt)).limit(20);
  const pillars = assignPillars(s.pillars, open.length, recent.map((r) => r.pillar).filter((p): p is string => !!p));
  if (!open.length) return { created: 0, reason: "No open slots in that window." };
  await db.insert(schema.posts).values(open.map((at, i) => ({
    userId, topic: `Planned: ${pillars[i]}`, pillar: pillars[i], format: "tbd", content: "", status: "planned" as const, scheduledAt: at,
  })));
  await logAction(userId, "plan", `Planned ${open.length} slot(s) for the next ${days} days: ${pillars.join(", ")}.`);
  return { created: open.length, pillars };
}
