import { z } from "zod";
import type { Pillar } from "@/db/schema";
import { aiAvailable, structured } from "./client";

/** Suggests a pillar for an Inbox item. Returns null when AI is unavailable or nothing fits. */
export async function suggestPillar(userId: string, content: string, pillars: Pillar[]): Promise<string | null> {
  if (!aiAvailable() || !pillars.length) return null;
  const names = pillars.map((p) => p.name);
  const r = await structured({
    userId, action: "suggest_pillar", effort: "low",
    shape: z.strictObject({ pillar: z.string().describe(`One of: ${names.join(", ")}, or "none"`) }),
    system: "Pick the single content pillar that best fits this experience. Answer 'none' if nothing fits.",
    prompt: `Pillars:\n${pillars.map((p) => `- ${p.name}: ${p.description}`).join("\n")}\n\nExperience:\n${content}`,
  }).catch(() => null);
  return r && names.includes(r.pillar) ? r.pillar : null;
}
