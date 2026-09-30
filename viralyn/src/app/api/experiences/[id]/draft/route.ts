import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, HttpError, parseBody } from "@/lib/api";
import { FORMATS } from "@/lib/ai/formats";
import { createDraft, PipelineError } from "@/lib/ai/pipeline";
import { AiUnavailableError } from "@/lib/ai/client";

export const maxDuration = 300;
const Body = z.object({ format: z.enum(FORMATS).default("storytelling"), topic: z.string().trim().max(200).optional() });

export const POST = authed(async (req, user, ctx) => {
  const id = (await ctx.params).id;
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Not found.");
  const [exp] = await db.select().from(schema.experiences).where(and(eq(schema.experiences.id, id), eq(schema.experiences.userId, user.id)));
  if (!exp) throw new HttpError(404, "Not found.");
  const body = await parseBody(req, Body);
  try {
    return await createDraft(user.id, { topic: body.topic || exp.content.slice(0, 80), format: body.format, pillar: exp.pillar }, exp.id);
  } catch (err) {
    if (err instanceof AiUnavailableError) throw new HttpError(503, err.message);
    if (err instanceof PipelineError) throw new HttpError(409, err.message);
    throw err;
  }
}, { limit: 10 });
