import { test } from "node:test";
import assert from "node:assert/strict";
import { assignPillars, slots } from "./planner";
import { zonedToUtc } from "./time";

test("zonedToUtc converts wall-clock time in a zone", () => {
  assert.equal(zonedToUtc("2026-10-05", "09:00", "Asia/Kolkata").toISOString(), "2026-10-05T03:30:00.000Z");
  assert.equal(zonedToUtc("2026-07-01", "09:00", "America/New_York").toISOString(), "2026-07-01T13:00:00.000Z");
  assert.equal(zonedToUtc("2026-12-01", "09:00", "America/New_York").toISOString(), "2026-12-01T14:00:00.000Z");
});

test("3/week gives Mon/Wed/Fri slots", () => {
  const s = slots({ fromYmd: "2026-10-05", days: 7, frequency: "3/week", postingTimes: ["09:00"], maxPerDay: 1, tz: "UTC", now: new Date("2026-01-01") });
  assert.deepEqual(s.map((d) => d.toISOString().slice(0, 10)), ["2026-10-05", "2026-10-07", "2026-10-09"]);
});

test("slots in the past are skipped", () => {
  const s = slots({ fromYmd: "2026-10-05", days: 1, frequency: "daily", postingTimes: ["09:00"], maxPerDay: 1, tz: "UTC", now: new Date("2026-10-05T10:00:00Z") });
  assert.equal(s.length, 0);
});

test("pillars follow weights", () => {
  const out = assignPillars([{ name: "A", description: "", weight: 3 }, { name: "B", description: "", weight: 1 }], 8);
  assert.equal(out.filter((x) => x === "A").length, 6);
  assert.equal(out.filter((x) => x === "B").length, 2);
});

test("recent overuse shifts the next pick", () => {
  const out = assignPillars([{ name: "A", description: "", weight: 1 }, { name: "B", description: "", weight: 1 }], 1, ["A", "A", "A"]);
  assert.deepEqual(out, ["B"]);
});
