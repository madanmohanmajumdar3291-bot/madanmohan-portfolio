import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { confidence, describeComparison, engagementRate, groupStats } from "./analytics";

/** Published posts joined with their latest metrics row. Only real (api/import/manual) numbers. */
export async function loadAnalytics(userId: string, tz: string) {
  const posts = await db.select().from(schema.posts)
    .where(and(eq(schema.posts.userId, userId), eq(schema.posts.status, "published"))).orderBy(desc(schema.posts.publishedAt));
  const rows = posts.length ? await db.select().from(schema.analytics).where(inArray(schema.analytics.postId, posts.map((p) => p.id))).orderBy(desc(schema.analytics.recordedAt)) : [];
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.postId)) latest.set(r.postId, r);

  const items = posts.map((p) => {
    const m = latest.get(p.id);
    const hour = p.publishedAt ? Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(p.publishedAt)) : null;
    const words = p.content.split(/\s+/).filter(Boolean).length;
    return {
      id: p.id, topic: p.topic, pillar: p.pillar, format: p.format, hookStyle: p.hookStyle, publishedAt: p.publishedAt, linkedinPostId: p.linkedinPostId,
      length: words < 120 ? "short (<120 words)" : words < 250 ? "medium (120-250)" : "long (250+)",
      timeOfDay: hour == null ? null : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening",
      metrics: m ? { impressions: m.impressions, reactions: m.reactions, comments: m.comments, reposts: m.reposts, source: m.source, recordedAt: m.recordedAt } : null,
      rate: m ? engagementRate(m) : null,
    };
  });

  const withData = items.filter((i) => i.rate != null);
  const dims = [
    ["format", "posts", (i: (typeof items)[number]) => i.format],
    ["pillar", "posts", (i: (typeof items)[number]) => i.pillar],
    ["hookStyle", "hooks", (i: (typeof items)[number]) => i.hookStyle],
    ["length", "posts", (i: (typeof items)[number]) => i.length],
    ["timeOfDay", "posts", (i: (typeof items)[number]) => i.timeOfDay],
  ] as const;
  const breakdowns = Object.fromEntries(dims.map(([k, , f]) => [k, groupStats(withData, f, (i) => i.rate, (i) => i.metrics?.impressions ?? null)]));
  const insights = dims.map(([k, noun]) => describeComparison(noun, breakdowns[k])).filter((s): s is string => !!s);

  const sum = (f: (m: NonNullable<(typeof items)[number]["metrics"]>) => number | null) =>
    withData.reduce((s, i) => s + (f(i.metrics!) ?? 0), 0);
  return {
    publishedCount: posts.length,
    withMetrics: withData.length,
    totals: withData.length ? {
      impressions: sum((m) => m.impressions), reactions: sum((m) => m.reactions), comments: sum((m) => m.comments), reposts: sum((m) => m.reposts),
      avgEngagement: withData.reduce((s, i) => s + i.rate!, 0) / withData.length,
    } : null,
    items, breakdowns, insights, confidence: confidence(withData.length),
  };
}
