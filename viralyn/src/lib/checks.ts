import type { ReviewCheck } from "@/db/schema";

// Checks that need no AI. Used for manually written posts and as a fallback when AI is unavailable.

export const LINKEDIN_MAX = 3000;
const EMOJI = /\p{Extended_Pictographic}/gu;

export function basicChecks(content: string, opts: { avoidTopics?: string[]; avoidWords?: string[]; recentOpenings?: string[] } = {}): ReviewCheck[] {
  const text = content.trim();
  const lower = text.toLowerCase();
  const avoided = [...(opts.avoidTopics ?? []), ...(opts.avoidWords ?? [])]
    .filter((w) => w.trim() && new RegExp(`\\b${w.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower));
  const hashtags = (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
  const emojis = (text.match(EMOJI) ?? []).length;
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const longest = Math.max(0, ...paragraphs.map((p) => p.split(/\s+/).length));
  const opening = text.split("\n")[0].trim().toLowerCase();
  const repeatedOpening = !!opening && (opts.recentOpenings ?? []).some((o) => o.trim().toLowerCase() === opening);

  return [
    avoided.length
      ? { check: "Relevance", result: "fail", reason: `Mentions something on your avoid list: ${avoided.join(", ")}.` }
      : { check: "Relevance", result: "pass", reason: "Nothing from your avoid list." },
    text.length > LINKEDIN_MAX
      ? { check: "Length", result: "fail", reason: `${text.length} characters; LinkedIn allows ${LINKEDIN_MAX}.` }
      : text.length < 80
        ? { check: "Length", result: "warn", reason: `Only ${text.length} characters.` }
        : { check: "Length", result: "pass", reason: `${text.length} of ${LINKEDIN_MAX} characters.` },
    longest > 60
      ? { check: "Readability", result: "warn", reason: `A paragraph has ${longest} words; short paragraphs read better on LinkedIn.` }
      : { check: "Readability", result: "pass", reason: "Paragraphs are short." },
    hashtags > 3
      ? { check: "Spam", result: "warn", reason: `${hashtags} hashtags; 0–3 is recommended.` }
      : emojis > 5
        ? { check: "Spam", result: "warn", reason: `${emojis} emojis.` }
        : repeatedOpening
          ? { check: "Spam", result: "warn", reason: "Same opening line as a recent post." }
          : { check: "Spam", result: "pass", reason: `${hashtags} hashtag(s), ${emojis} emoji(s).` },
  ];
}

/** Marks the AI-only checks as not run, so a manual post never shows a fake pass. */
export const unavailableChecks = (): ReviewCheck[] =>
  ["Accuracy", "Voice", "Safety", "Privacy"].map((check) => ({ check, result: "warn" as const, reason: "Not checked: AI review is unavailable. Check this yourself." }));

/** Accepts LinkedIn post URLs or URNs; returns the canonical URN or null. */
export function linkedinUrnFrom(input: string): string | null {
  const s = decodeURIComponent(input.trim());
  const urn = s.match(/urn:li:(share|ugcPost|activity):(\d{10,})/);
  if (urn) return `urn:li:${urn[1]}:${urn[2]}`;
  const slug = s.match(/linkedin\.com\/posts\/[^?#\s]*?-(activity|share|ugcPost)-(\d{10,})/);
  return slug ? `urn:li:${slug[1]}:${slug[2]}` : null;
}
