import { z } from "zod";
import { authed, HttpError, parseBody } from "@/lib/api";
import { AiUnavailableError } from "@/lib/ai/client";
import { chatHistory, chatTurn, postIdsFrom, postsByIds } from "@/lib/ai/chat";
import { logAction } from "@/lib/log";

export const maxDuration = 300;

export const GET = authed(async (req, user) => {
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 200) || undefined;
  const messages = await chatHistory(user.id, q);
  const posts = await postsByIds(user.id, [...new Set(messages.flatMap((m) => postIdsFrom(m.toolCalls)))]);
  return { messages, posts };
});

const Body = z.object({ message: z.string().trim().min(1).max(4000) });

export const POST = authed(async (req, user) => {
  const { message } = await parseBody(req, Body);
  try {
    const { message: reply, postIds } = await chatTurn(user, message);
    return { message: reply, posts: await postsByIds(user.id, postIds) };
  } catch (err) {
    if (err instanceof AiUnavailableError) throw new HttpError(503, err.message);
    await logAction(user.id, "chat", `Generation failed: ${(err as Error).message}`, { status: "error" });
    throw new HttpError(502, `Viralyn couldn't finish that request: ${(err as Error).message}`);
  }
}, { limit: 20 });
