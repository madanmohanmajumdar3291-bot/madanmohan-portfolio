import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed } from "@/lib/api";

const STATUSES = new Set(schema.postStatus.enumValues);

export const GET = authed(async (req, user) => {
  const status = new URL(req.url).searchParams.get("status");
  const where = status && STATUSES.has(status as never)
    ? and(eq(schema.posts.userId, user.id), eq(schema.posts.status, status as (typeof schema.postStatus.enumValues)[number]))
    : eq(schema.posts.userId, user.id);
  return db.select().from(schema.posts).where(where).orderBy(desc(schema.posts.createdAt)).limit(200);
});
