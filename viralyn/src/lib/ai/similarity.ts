// Deterministic overlap checks: used by Review (originality) and to stop drafts copying voice samples.

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

function shingles(s: string, n: number): Set<string> {
  const w = words(s);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/** Jaccard similarity of word 3-grams, 0..1. */
export function similarity(a: string, b: string): number {
  const A = shingles(a, 3), B = shingles(b, 3);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Phrases of 8+ consecutive words shared between `text` and any source. */
export function copiedPhrases(text: string, sources: string[], n = 8): string[] {
  const mine = shingles(text, n);
  const hits = new Set<string>();
  for (const src of sources) for (const s of shingles(src, n)) if (mine.has(s)) hits.add(s);
  return [...hits];
}
