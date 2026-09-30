import type { Pillar } from "@/db/schema";
import { addDays, weekday, zonedToUtc } from "./time";

const DAYS_BY_FREQUENCY: Record<string, number[]> = {
  "1/week": [2], "3/week": [1, 3, 5], "5/week": [1, 2, 3, 4, 5], daily: [0, 1, 2, 3, 4, 5, 6],
};

/** Future posting slots (UTC) for the next `days` days, from the user's frequency, times and time zone. */
export function slots(opts: { fromYmd: string; days: number; frequency: string; postingTimes: string[]; maxPerDay: number; tz: string; now?: Date }): Date[] {
  const days = DAYS_BY_FREQUENCY[opts.frequency] ?? DAYS_BY_FREQUENCY["3/week"];
  const times = (opts.postingTimes.length ? [...opts.postingTimes].sort() : ["09:00"]).slice(0, Math.max(1, opts.maxPerDay));
  const now = opts.now ?? new Date();
  const out: Date[] = [];
  for (let i = 0; i < opts.days; i++) {
    const ymd = addDays(opts.fromYmd, i);
    if (!days.includes(weekday(ymd))) continue;
    // Frequencies below daily use one time per posting day; daily may use up to maxPerDay.
    for (const t of opts.frequency === "daily" ? times : times.slice(0, 1)) {
      const at = zonedToUtc(ymd, t, opts.tz);
      if (at > now) out.push(at);
    }
  }
  return out;
}

/**
 * Assigns pillars to slots proportionally to weight (smooth weighted round-robin),
 * starting from how often each pillar was used recently so the mix stays balanced over time.
 */
export function assignPillars(pillars: Pillar[], count: number, recentPillars: string[] = []): string[] {
  const usable = pillars.filter((p) => p.weight > 0);
  if (!usable.length) return [];
  const total = usable.reduce((s, p) => s + p.weight, 0);
  const current = new Map(usable.map((p) => [p.name, 0]));
  for (const name of recentPillars) if (current.has(name)) current.set(name, current.get(name)! - total / recentPillars.length);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    for (const p of usable) current.set(p.name, current.get(p.name)! + p.weight);
    const best = usable.reduce((a, b) => (current.get(b.name)! > current.get(a.name)! ? b : a));
    current.set(best.name, current.get(best.name)! - total);
    out.push(best.name);
  }
  return out;
}
