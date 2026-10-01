import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { FORMATS } from "@/lib/ai/formats";
import { createManualPost } from "@/lib/ai/pipeline";

const STATUSES = new Set(schema.postStatus.enumValues);

export const GET = authed(async (req, user) => {
  const status = new URL(req.url).searchParams.get("status");
  const where = status && STATUSES.has(status as never)
    ? and(eq(schema.posts.userId, user.id), eq(schema.posts.status, status as (typeof schema.postStatus.enumValues)[number]))
    : eq(schema.posts.userId, user.id);
  return db.select().from(schema.posts).where(where).orderBy(desc(schema.posts.createdAt)).limit(200);
});

const Create = z.object({
  topic: z.string().trim().min(3).max(200),
  format: z.enum(FORMATS),
  pillar: z.string().trim().max(60).nullable().optional(),
  content: z.string().trim().min(1).max(3000),
});

// Manually written post: reviewed with available checks, then awaits approval like any draft.
export const POST = authed(async (req, user) => createManualPost(user.id, await parseBody(req, Create)), { limit: 20 });
