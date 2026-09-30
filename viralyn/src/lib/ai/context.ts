import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Per-request context: voice, strategy, and a summary of the last ~20 posts (never full history). */
export async function loadContext(userId: string) {
  const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId));
  const [voice] = await db.select().from(schema.voiceProfiles).where(eq(schema.voiceProfiles.userId, userId));
  const recent = await db
    .select({ id: schema.posts.id, topic: schema.posts.topic, pillar: schema.posts.pillar, format: schema.posts.format,
      hookStyle: schema.posts.hookStyle, status: schema.posts.status, content: schema.posts.content, createdAt: schema.posts.createdAt })
    .from(schema.posts).where(eq(schema.posts.userId, userId)).orderBy(desc(schema.posts.createdAt)).limit(20);
  return { settings: settings ?? null, voice: voice ?? null, recent };
}
export type UserContext = Awaited<ReturnType<typeof loadContext>>;

export function strategyText(ctx: UserContext): string {
  const s = ctx.settings;
  if (!s) return "No strategy configured yet.";
  return [
    `Goals: ${s.goals.join(", ") || "not set"}`,
    `Audience: ${s.audience || "not set"}`,
    `Pillars: ${s.pillars.map((p) => `${p.name} (weight ${p.weight}): ${p.description}`).join("; ") || "not set"}`,
    `Topics to avoid: ${s.avoidTopics.join(", ") || "none"}`,
    `Words to avoid: ${s.avoidWords.join(", ") || "none"}`,
  ].join("\n");
}

export function historyText(ctx: UserContext): string {
  if (!ctx.recent.length) return "No previous posts.";
  return ctx.recent
    .map((p) => `- [${p.status}] ${p.topic} | ${p.pillar ?? "no pillar"} | ${p.format} | hook: ${p.hookStyle ?? "?"} | opens: "${p.content.split("\n")[0].slice(0, 90)}"`)
    .join("\n");
}
