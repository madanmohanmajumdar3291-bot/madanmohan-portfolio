import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, parseBody } from "@/lib/api";
import { logAction } from "@/lib/log";
import { suggestPillar } from "@/lib/ai/pillar";

export const GET = authed(async (_req, user) =>
  db.select().from(schema.experiences).where(eq(schema.experiences.userId, user.id)).orderBy(desc(schema.experiences.createdAt)));

const Body = z.object({ content: z.string().trim().min(5).max(4000), source: z.enum(["text", "voice"]).default("text"), pillar: z.string().max(60).optional() });

export const POST = authed(async (req, user) => {
  const body = await parseBody(req, Body);
  let pillar = body.pillar ?? null;
  if (!pillar) {
    const [s] = await db.select({ pillars: schema.settings.pillars }).from(schema.settings).where(eq(schema.settings.userId, user.id));
    pillar = await suggestPillar(user.id, body.content, s?.pillars ?? []);
  }
  const [exp] = await db.insert(schema.experiences).values({ userId: user.id, content: body.content, source: body.source, pillar }).returning();
  await logAction(user.id, "experience", `Saved to Inbox${body.source === "voice" ? " (voice note)" : ""}: "${body.content.slice(0, 80)}"`);
  return exp;
}, { limit: 30 });
