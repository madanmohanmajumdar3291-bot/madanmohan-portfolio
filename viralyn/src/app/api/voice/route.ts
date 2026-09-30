import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, parseBody } from "@/lib/api";
import { logAction } from "@/lib/log";

export const GET = authed(async (_req, user) => {
  const [v] = await db.select().from(schema.voiceProfiles).where(eq(schema.voiceProfiles.userId, user.id));
  return v;
});

const Profile = z.object({
  summary: z.string().max(1000), sentenceLength: z.string().max(200), formality: z.string().max(200), humor: z.string().max(200),
  hookStyle: z.string().max(200), paragraphStructure: z.string().max(200), emojiUsage: z.string().max(200),
  ctaStyle: z.string().max(200), tone: z.string().max(200), vocabulary: z.string().max(200),
});

// Direct edits to the profile by the user.
export const PUT = authed(async (req, user) => {
  const profile = await parseBody(req, Profile);
  await db.update(schema.voiceProfiles).set({ profile, updatedAt: new Date() }).where(eq(schema.voiceProfiles.userId, user.id));
  await logAction(user.id, "settings", "Voice profile edited.");
  return { ok: true };
});
