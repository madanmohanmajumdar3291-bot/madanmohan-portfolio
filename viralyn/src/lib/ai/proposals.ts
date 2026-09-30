import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAction } from "@/lib/log";
import { planAhead } from "@/lib/plan";

// Data-changing chat actions are stored as proposals and only applied when the user taps Confirm.
export const Proposal = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pause"), until: z.string().datetime({ offset: true }).nullable() }),
  z.object({ kind: z.literal("resume") }),
  z.object({ kind: z.literal("avoid"), topics: z.array(z.string().min(1).max(100)).max(20).default([]), words: z.array(z.string().min(1).max(100)).max(20).default([]) }),
  z.object({ kind: z.literal("plan"), days: z.number().int().min(1).max(31) }),
]);
export type Proposal = z.infer<typeof Proposal>;

export function summarize(p: Proposal): string {
  switch (p.kind) {
    case "pause": return p.until ? `Pause all publishing until ${new Date(p.until).toUTCString()}` : "Pause all publishing until you resume";
    case "resume": return "Resume publishing";
    case "avoid": return `Never post about: ${[...p.topics, ...p.words.map((w) => `"${w}"`)].join(", ")}`;
    case "plan": return `Fill open posting slots for the next ${p.days} days with planned pillars`;
  }
}

export async function applyProposal(user: { id: string; timezone: string }, p: Proposal): Promise<string> {
  const where = eq(schema.settings.userId, user.id);
  switch (p.kind) {
    case "pause":
      await db.update(schema.settings).set(p.until ? { pausedUntil: new Date(p.until), paused: false } : { paused: true }).where(where);
      break;
    case "resume":
      await db.update(schema.settings).set({ paused: false, pausedUntil: null }).where(where);
      break;
    case "avoid": {
      const [s] = await db.select().from(schema.settings).where(where);
      await db.update(schema.settings).set({
        avoidTopics: [...new Set([...(s?.avoidTopics ?? []), ...p.topics])],
        avoidWords: [...new Set([...(s?.avoidWords ?? []), ...p.words])],
      }).where(where);
      break;
    }
    case "plan": {
      const r = await planAhead(user.id, user.timezone, p.days);
      return r.created ? `Planned ${r.created} slot(s).` : (r.reason ?? "Nothing to plan.");
    }
  }
  await logAction(user.id, "settings", `Via chat: ${summarize(p)}.`);
  return "Done.";
}
