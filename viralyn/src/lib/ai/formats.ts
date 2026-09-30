export const FORMATS = [
  "educational", "storytelling", "personal lesson", "industry insight", "how-to", "list",
  "case study", "tool recommendation", "career advice", "question/discussion", "data-driven",
  "contrarian viewpoint", "mistake/lesson",
] as const;
export type Format = (typeof FORMATS)[number];

/** Formats that describe the user's own life. These may only be written from an Inbox experience. */
export const PERSONAL_FORMATS: readonly Format[] = ["storytelling", "personal lesson", "mistake/lesson"];
export const PERSONAL_PILLARS = ["personal journey"];

export function requiresExperience(format: string, pillar?: string | null) {
  return PERSONAL_FORMATS.includes(format as Format) || PERSONAL_PILLARS.includes((pillar ?? "").toLowerCase());
}

/** Formats that lean on facts; without research (Phase 5+) they must avoid specific claims. */
export const FACT_FORMATS: readonly Format[] = ["data-driven", "industry insight", "case study"];
