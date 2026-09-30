import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed } from "@/lib/api";

export const GET = authed(async (_req, user) => {
  const posts = await db.select().from(schema.posts).where(eq(schema.posts.userId, user.id));
  const ids = posts.map((p) => p.id);
  const data = {
    exportedAt: new Date().toISOString(),
    user,
    settings: await db.select().from(schema.settings).where(eq(schema.settings.userId, user.id)),
    voiceProfile: await db.select().from(schema.voiceProfiles).where(eq(schema.voiceProfiles.userId, user.id)),
    experiences: await db.select().from(schema.experiences).where(eq(schema.experiences.userId, user.id)),
    posts,
    researchSources: ids.length ? await db.select().from(schema.researchSources).where(inArray(schema.researchSources.postId, ids)) : [],
    analytics: ids.length ? await db.select().from(schema.analytics).where(inArray(schema.analytics.postId, ids)) : [],
    chatMessages: await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.userId, user.id)),
    activity: await db.select().from(schema.agentLogs).where(eq(schema.agentLogs.userId, user.id)),
    usage: await db.select().from(schema.usage).where(eq(schema.usage.userId, user.id)),
  };
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="viralyn-export.json"' },
  });
}, { limit: 5 });
