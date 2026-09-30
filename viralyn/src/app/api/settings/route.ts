import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, parseBody } from "@/lib/api";
import { logAction } from "@/lib/log";

export const GET = authed(async (_req, user) => {
  const [s] = await db.select().from(schema.settings).where(eq(schema.settings.userId, user.id));
  return s;
});

const list = z.array(z.string().trim().min(1).max(100)).max(50);
const Body = z.object({
  goals: list.optional(),
  audience: z.string().max(1000).optional(),
  pillars: z.array(z.object({ name: z.string().trim().min(1).max(60), description: z.string().max(300), weight: z.number().int().min(1).max(10) })).max(12).optional(),
  avoidTopics: list.optional(),
  avoidWords: list.optional(),
  frequency: z.enum(["1/week", "3/week", "5/week", "daily"]).optional(),
  postingTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(6).optional(),
  maxPostsPerDay: z.number().int().min(1).max(5).optional(),
  timezone: z.string().max(64).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  onboarded: z.boolean().optional(),
  paused: z.boolean().optional(),
  pausedUntil: z.string().datetime({ offset: true }).nullable().optional(),
});

export const PUT = authed(async (req, user) => {
  const { timezone, name, onboarded, pausedUntil, ...body } = await parseBody(req, Body);
  const rest = { ...body, ...(pausedUntil !== undefined ? { pausedUntil: pausedUntil ? new Date(pausedUntil) : null } : {}) };
  if (Object.keys(rest).length) await db.update(schema.settings).set(rest).where(eq(schema.settings.userId, user.id));
  const userPatch = Object.fromEntries(Object.entries({ timezone, name, onboarded }).filter(([, v]) => v !== undefined));
  if (Object.keys(userPatch).length) await db.update(schema.users).set(userPatch).where(eq(schema.users.id, user.id));
  await logAction(user.id, "settings", `Updated: ${[...Object.keys(rest), ...Object.keys(userPatch)].join(", ")}`);
  return { ok: true };
});
