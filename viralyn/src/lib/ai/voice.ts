import { z } from "zod";
import type { VoiceProfile } from "@/db/schema";
import { structured } from "./client";

const Profile = z.strictObject({
  summary: z.string().describe("2-3 plain-language sentences a non-expert understands"),
  sentenceLength: z.string(),
  formality: z.string(),
  humor: z.string(),
  hookStyle: z.string(),
  paragraphStructure: z.string(),
  emojiUsage: z.string(),
  ctaStyle: z.string(),
  tone: z.string(),
  vocabulary: z.string(),
});

export async function analyzeVoice(userId: string, samples: string[]): Promise<VoiceProfile> {
  return structured({
    userId, action: "voice_analysis", shape: Profile, effort: "medium",
    system:
      "You analyze a person's LinkedIn writing style. Describe HOW they write, never WHAT they wrote. " +
      "Do not quote or paraphrase sentences from the samples. Each field is one short plain-language line, " +
      "e.g. 'Short punchy sentences', 'Rarely uses emojis', 'Ends with a question'.",
    prompt: samples.map((s, i) => `<sample index="${i + 1}">\n${s}\n</sample>`).join("\n\n"),
  });
}

export function describeVoice(p: VoiceProfile | null | undefined): string {
  if (!p) return "No voice profile yet. Write clearly and plainly; avoid hype.";
  return [
    `Summary: ${p.summary}`, `Sentences: ${p.sentenceLength}`, `Formality: ${p.formality}`, `Humor: ${p.humor}`,
    `Hooks: ${p.hookStyle}`, `Paragraphs: ${p.paragraphStructure}`, `Emojis: ${p.emojiUsage}`,
    `CTA: ${p.ctaStyle}`, `Tone: ${p.tone}`, `Vocabulary: ${p.vocabulary}`,
  ].join("\n");
}
