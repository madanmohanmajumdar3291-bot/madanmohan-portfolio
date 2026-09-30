import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, HttpError, parseBody } from "@/lib/api";
import { analyzeVoice } from "@/lib/ai/voice";
import { AiUnavailableError } from "@/lib/ai/client";
import { logAction } from "@/lib/log";

const Body = z.object({ samples: z.array(z.string().trim().min(40, "Each sample should be at least 40 characters").max(5000)).min(3).max(20) });

export const POST = authed(async (req, user) => {
  const { samples } = await parseBody(req, Body);
  try {
    const profile = await analyzeVoice(user.id, samples);
    await db.update(schema.voiceProfiles).set({ samples, profile, updatedAt: new Date() }).where(eq(schema.voiceProfiles.userId, user.id));
    await logAction(user.id, "voice", `Built voice profile from ${samples.length} samples.`);
    return { profile };
  } catch (err) {
    if (err instanceof AiUnavailableError) throw new HttpError(503, err.message);
    await logAction(user.id, "voice", `Voice analysis failed: ${(err as Error).message}`, { status: "error" });
    throw new HttpError(502, `Voice analysis failed: ${(err as Error).message}`);
  }
}, { limit: 5 });
