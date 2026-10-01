import { z } from "zod";
import type { ReviewCheck } from "@/db/schema";
import { describeVoice } from "./voice";
import { strategyText, type UserContext } from "./context";
import { structured } from "./client";
import { copiedPhrases, similarity } from "./similarity";

const Verdict = z.enum(["pass", "warn", "fail"]);
const Check = z.strictObject({ result: Verdict, reason: z.string().describe("One line") });
const Review = z.strictObject({
  accuracy: Check, relevance: Check, voice: Check, readability: Check, spam: Check, safety: Check, privacy: Check,
});

/** A failure on any of these blocks scheduling. */
export const CRITICAL = new Set(["Accuracy", "Originality", "Safety", "Privacy"]);

export function originalityCheck(content: string, ctx: UserContext, excludePostId?: string): ReviewCheck {
  const samples = ctx.voice?.samples ?? [];
  const copied = copiedPhrases(content, samples);
  if (copied.length) return { check: "Originality", result: "fail", reason: `Copies phrasing from your writing samples: "${copied[0]}…"` };
  let worst = { score: 0, topic: "" };
  for (const p of ctx.recent) {
    if (p.id === excludePostId) continue;
    const s = similarity(content, p.content);
    if (s > worst.score) worst = { score: s, topic: p.topic };
  }
  if (worst.score > 0.35) return { check: "Originality", result: "fail", reason: `Too similar to your post "${worst.topic}" (${Math.round(worst.score * 100)}% overlap).` };
  if (worst.score > 0.15) return { check: "Originality", result: "warn", reason: `Some overlap with "${worst.topic}" (${Math.round(worst.score * 100)}%).` };
  return { check: "Originality", result: "pass", reason: "No meaningful overlap with past posts or samples." };
}

export async function reviewDraft(opts: {
  userId: string; ctx: UserContext; content: string; experience?: string | null; postId?: string;
}): Promise<ReviewCheck[]> {
  const { ctx } = opts;
  const r = await structured({
    userId: opts.userId, action: "review", postId: opts.postId, shape: Review, effort: "medium",
    system:
      "You are Viralyn's strict reviewer. Judge the draft; do not rewrite it.\n" +
      "accuracy: FAIL if it states any statistic, study, quote, news, or specific factual claim not supported by the provided experience (no research sources are attached). FAIL if it adds personal events, numbers, people, descriptions of how things were ('it was slow'), or claims about what did not happen ('no pitch deck') beyond the experience text. Opinions and lessons drawn from the experience are fine. WARN for vague unsupported generalisations.\n" +
      "relevance: fits the strategy's audience, goals and pillars; FAIL if it touches an avoided topic or word.\n" +
      "voice: matches the voice profile.\nreadability: short paragraphs, clear hook, easy to scan.\n" +
      "spam: not repetitive, clickbait, engagement-bait or over-promotional.\nsafety: nothing harmful, defamatory, or reckless.\n" +
      "privacy: FAIL if it exposes private details about the user or identifiable third parties (names of clients, colleagues, interviewers, salaries, internal company info) that shouldn't be public.",
    prompt: `<strategy>\n${strategyText(ctx)}\n</strategy>\n<voice_profile>\n${describeVoice(ctx.voice?.profile)}\n</voice_profile>\n<experience>\n${opts.experience ?? "none"}\n</experience>\n<draft>\n${opts.content}\n</draft>`,
  });
  const label = (k: string) => k[0].toUpperCase() + k.slice(1);
  return [
    ...Object.entries(r).map(([k, v]) => ({ check: label(k), result: v.result, reason: v.reason })),
    originalityCheck(opts.content, ctx, opts.postId),
  ];
}

export const criticalFailures = (checks: ReviewCheck[]) => checks.filter((c) => c.result === "fail" && CRITICAL.has(c.check));
