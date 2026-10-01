import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { basicChecks } from "@/lib/checks";
import { loadContext } from "@/lib/ai/context";
import { originalityCheck } from "@/lib/ai/review";

// Rule-based checks only (no AI, no quota) so the editor can re-check while you type.
export const POST = authed(async (req, user) => {
  const { content, postId } = await parseBody(req, z.object({ content: z.string().max(10000), postId: z.string().uuid().optional() }));
  const ctx = await loadContext(user.id);
  const s = ctx.settings;
  return [
    ...basicChecks(content, { avoidTopics: s?.avoidTopics, avoidWords: s?.avoidWords, recentOpenings: ctx.recent.filter((p) => p.id !== postId).map((p) => p.content.split("\n")[0]) }),
    originalityCheck(content, ctx, postId),
  ];
}, { limit: 120 });
