import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed } from "@/lib/api";

export const GET = authed(async (req, user) => {
  const postId = new URL(req.url).searchParams.get("postId");
  const where = postId && z.string().uuid().safeParse(postId).success
    ? and(eq(schema.agentLogs.userId, user.id), eq(schema.agentLogs.postId, postId))
    : eq(schema.agentLogs.userId, user.id);
  return db.select().from(schema.agentLogs).where(where).orderBy(desc(schema.agentLogs.createdAt)).limit(300);
});
