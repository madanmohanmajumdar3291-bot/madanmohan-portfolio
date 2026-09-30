import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, HttpError, parseBody } from "@/lib/api";
import { applyProposal, Proposal } from "@/lib/ai/proposals";

type Stored = { confirm?: { id: string; summary: string; payload: unknown; status: string; result?: string } };
const Body = z.object({ messageId: z.string().uuid(), proposalId: z.string().uuid(), decision: z.enum(["confirm", "cancel"]) });

export const POST = authed(async (req, user) => {
  const b = await parseBody(req, Body);
  const [msg] = await db.select().from(schema.chatMessages).where(and(eq(schema.chatMessages.id, b.messageId), eq(schema.chatMessages.userId, user.id)));
  const calls = (msg?.toolCalls ?? []) as Stored[];
  const entry = calls.find((c) => c.confirm?.id === b.proposalId)?.confirm;
  if (!msg || !entry) throw new HttpError(404, "Proposal not found.");
  if (entry.status !== "pending") throw new HttpError(409, `Already ${entry.status}.`);
  if (b.decision === "confirm") {
    entry.result = await applyProposal(user, Proposal.parse(entry.payload));
    entry.status = "confirmed";
  } else entry.status = "cancelled";
  await db.update(schema.chatMessages).set({ toolCalls: calls }).where(eq(schema.chatMessages.id, msg.id));
  return { status: entry.status, result: entry.result ?? null };
});
