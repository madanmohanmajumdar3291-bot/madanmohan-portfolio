import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, parseBody } from "@/lib/api";

export const GET = authed(async (_req, user) =>
  db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(50));

export const PATCH = authed(async (req, user) => {
  const { ids } = await parseBody(req, z.object({ ids: z.array(z.string().uuid()).max(100) }));
  if (ids.length) await db.update(schema.notifications).set({ read: true })
    .where(and(eq(schema.notifications.userId, user.id), inArray(schema.notifications.id, ids)));
  return { ok: true };
});
