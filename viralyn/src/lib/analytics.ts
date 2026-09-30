/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

export type MetricRow = { ref: string; impressions?: number; reactions?: number; comments?: number; reposts?: number };

const ALIASES: Record<keyof MetricRow, string[]> = {
  ref: ["post url", "post link", "url", "link", "post id", "urn", "linkedin post id"],
  impressions: ["impressions", "views"],
  reactions: ["reactions", "likes"],
  comments: ["comments"],
  reposts: ["reposts", "shares"],
};

/** Maps a LinkedIn-style export (header names vary) to metric rows. Unknown columns are ignored. */
export function toMetricRows(rows: string[][]): { rows: MetricRow[]; missing: string[] } {
  if (rows.length < 2) return { rows: [], missing: ["header and at least one data row"] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (k: keyof MetricRow) => header.findIndex((h) => ALIASES[k].includes(h));
  const idx = { ref: col("ref"), impressions: col("impressions"), reactions: col("reactions"), comments: col("comments"), reposts: col("reposts") };
  if (idx.ref < 0) return { rows: [], missing: ["a post URL or post id column"] };
  const num = (v: string | undefined) => {
    if (v === undefined || v.trim() === "") return undefined;
    const n = Number(v.replace(/[,\s]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
  };
  return {
    missing: [],
    rows: rows.slice(1).map((r) => ({
      ref: r[idx.ref]?.trim() ?? "",
      impressions: idx.impressions >= 0 ? num(r[idx.impressions]) : undefined,
      reactions: idx.reactions >= 0 ? num(r[idx.reactions]) : undefined,
      comments: idx.comments >= 0 ? num(r[idx.comments]) : undefined,
      reposts: idx.reposts >= 0 ? num(r[idx.reposts]) : undefined,
    })).filter((r) => r.ref),
  };
}

/** Extracts a LinkedIn activity/share/ugcPost id from a URL or URN so exports can be matched to stored posts. */
export function linkedinIdFrom(ref: string): string | null {
  const m = decodeURIComponent(ref).match(/urn:li:(?:share|ugcPost|activity):(\d+)/) ?? ref.match(/(?:activity|share|ugcPost)[-:](\d{10,})/);
  return m ? m[1] : null;
}

export function engagementRate(m: { impressions?: number | null; reactions?: number | null; comments?: number | null; reposts?: number | null }) {
  if (!m.impressions) return null;
  return ((m.reactions ?? 0) + (m.comments ?? 0) + (m.reposts ?? 0)) / m.impressions;
}

export type Confidence = "low" | "medium" | "high";
export const confidence = (n: number): Confidence => (n < 5 ? "low" : n < 15 ? "medium" : "high");

export type GroupStat = { key: string; n: number; avgEngagement: number; avgImpressions: number | null };

/** Groups posts by a dimension and averages engagement. Groups with no data are dropped. */
export function groupStats<T>(items: T[], key: (t: T) => string | null, rate: (t: T) => number | null, impressions: (t: T) => number | null): GroupStat[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (k == null || rate(it) == null) continue;
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  return [...groups].map(([k, xs]) => {
    const imps = xs.map(impressions).filter((v): v is number => v != null);
    return {
      key: k, n: xs.length,
      avgEngagement: xs.reduce((s, x) => s + rate(x)!, 0) / xs.length,
      avgImpressions: imps.length ? imps.reduce((a, b) => a + b, 0) / imps.length : null,
    };
  }).sort((a, b) => b.avgEngagement - a.avgEngagement);
}

/** Plain-language insight comparing the best and worst group, with sample sizes and confidence. */
export function describeComparison(dimension: string, stats: GroupStat[]): string | null {
  if (stats.length < 2) return null;
  const best = stats[0], worst = stats[stats.length - 1];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return `${best.key} ${dimension} averaged higher engagement than ${worst.key} (${pct(best.avgEngagement)} vs ${pct(worst.avgEngagement)}; ${best.n} vs ${worst.n} post${worst.n === 1 && best.n === 1 ? "" : "s"}, ${confidence(Math.min(best.n, worst.n))} confidence).`;
}
