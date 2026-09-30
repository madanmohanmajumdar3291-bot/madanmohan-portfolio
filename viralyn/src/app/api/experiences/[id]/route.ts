import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, HttpError, parseBody } from "@/lib/api";

const where = (userId: string, id: string) => and(eq(schema.experiences.id, id), eq(schema.experiences.userId, userId));
const validId = (id: string) => { if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Not found."); return id; };

const Body = z.object({ content: z.string().trim().min(5).max(4000).optional(), pillar: z.string().max(60).nullable().optional() });

export const PATCH = authed(async (req, user, ctx) => {
  const id = validId((await ctx.params).id);
  const [exp] = await db.update(schema.experiences).set(await parseBody(req, Body)).where(where(user.id, id)).returning();
  if (!exp) throw new HttpError(404, "Not found.");
  return exp;
});

export const DELETE = authed(async (_req, user, ctx) => {
  const id = validId((await ctx.params).id);
  const [exp] = await db.delete(schema.experiences).where(where(user.id, id)).returning();
  if (!exp) throw new HttpError(404, "Not found.");
  return { ok: true };
});
