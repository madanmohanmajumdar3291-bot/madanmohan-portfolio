import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { planAhead } from "@/lib/plan";

export const POST = authed(async (req, user) => {
  const { days } = await parseBody(req, z.object({ days: z.number().int().min(1).max(31).default(7) }));
  return planAhead(user.id, user.timezone, days);
}, { limit: 10 });
