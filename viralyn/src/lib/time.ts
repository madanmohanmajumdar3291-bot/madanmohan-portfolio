/** Offset (ms) of `tz` from UTC at the given instant. */
function tzOffset(date: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(date).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - date.getTime();
}

/** Converts a wall-clock time in `tz` (YYYY-MM-DD, HH:MM) to a UTC Date. Handles DST. */
export function zonedToUtc(ymd: string, hhmm: string, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = guess - tzOffset(new Date(guess), tz);
  return new Date(guess - tzOffset(new Date(first), tz));
}

/** YYYY-MM-DD of `date` in `tz`. */
export function ymdIn(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 = Sunday
