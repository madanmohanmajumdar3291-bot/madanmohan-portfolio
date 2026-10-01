import { z } from "zod";
import { describeVoice } from "./voice";
import { historyText, strategyText, type UserContext } from "./context";
import { structured } from "./client";
import { FACT_FORMATS, type Format } from "./formats";

export type Brief = {
  topic: string; format: Format; pillar?: string | null; objective?: string | null; angle?: string | null;
  experience?: string | null; userNotes?: string | null;
};

const Draft = z.strictObject({
  content: z.string().describe("The full public LinkedIn post text, ready to publish"),
  hookStyle: z.string().describe("Short label for the opening hook style, e.g. 'question', 'bold statement', 'moment in time'"),
  cta: z.string().describe("The call to action used, or 'none'"),
  angle: z.string(),
});
export type Draft = z.infer<typeof Draft>;

const RULES = `Writing rules (non-negotiable):
- Never invent facts, statistics, quotes, studies, news, product claims, or personal stories.
- Personal experiences may come ONLY from the <experience> block. Do not embellish it with events, numbers, people, or feelings it does not state.
  That includes descriptions ("it was slow", "they were frustrated") and things that didn't happen ("no pitch deck", "no slides") unless the experience says so. Your reflection on what it means is fine; new facts are not.
- If a point would need a fact you were not given, make the point without the fact or phrase it as opinion.
- Match the voice profile, but never copy phrases from the user's writing samples or past posts.
- Strong but honest opening hook. No clickbait, no fake suspense.
- Short readable paragraphs, natural transitions, a fitting CTA, 0-3 relevant hashtags.
- Avoid generic AI phrasing ("In today's fast-paced world", "Let's dive in", "game-changer", "unlock"), excessive emojis, corporate jargon, empty motivation.
- Do not reuse hooks or opening lines from the post history.
- Plain text only (LinkedIn does not render markdown).`;

function system(ctx: UserContext) {
  return `You are Viralyn's writer: a co-writer that drafts LinkedIn posts in the user's own voice.\n\n${RULES}\n\n<voice_profile>\n${describeVoice(ctx.voice?.profile)}\n</voice_profile>\n\n<strategy>\n${strategyText(ctx)}\n</strategy>\n\n<post_history>\n${historyText(ctx)}\n</post_history>`;
}

export async function writeDraft(userId: string, ctx: UserContext, brief: Brief, revisionNotes?: string[]): Promise<Draft> {
  const factNote = FACT_FORMATS.includes(brief.format)
    ? "\nNo verified research is attached to this post. Do not state any statistic or specific factual claim; frame insights as the user's perspective."
    : "";
  const prompt = [
    `Topic: ${brief.topic}`, `Format: ${brief.format}`, `Pillar: ${brief.pillar ?? "unspecified"}`,
    `Objective: ${brief.objective ?? "unspecified"}`, `Angle: ${brief.angle ?? "choose a fresh one"}`,
    brief.experience ? `<experience>\n${brief.experience}\n</experience>` : "<experience>none provided: do not write about the user's own life</experience>",
    brief.userNotes ? `User instructions: ${brief.userNotes}` : "",
    revisionNotes?.length ? `A reviewer rejected the previous attempt. Fix these problems:\n- ${revisionNotes.join("\n- ")}` : "",
    factNote,
  ].filter(Boolean).join("\n");
  return structured({ userId, action: "write", shape: Draft, system: system(ctx), prompt, effort: "medium" });
}

export async function editDraft(userId: string, ctx: UserContext, current: string, instruction: string, experience?: string | null): Promise<Draft> {
  const prompt = `Current draft:\n<draft>\n${current}\n</draft>\n\n${experience ? `<experience>\n${experience}\n</experience>\n\n` : ""}Apply this edit and change nothing else unnecessarily: ${instruction}`;
  return structured({ userId, action: "edit", shape: Draft, system: system(ctx), prompt, effort: "low" });
}
