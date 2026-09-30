"use client";
import { useEffect, useState } from "react";
import type { Pillar } from "@/db/schema";

export const GOALS = ["Build personal brand", "Grow followers", "Increase engagement", "Attract recruiters", "Generate leads", "Showcase expertise", "Promote business", "Share knowledge"];
export const DEFAULT_PILLARS: Pillar[] = [
  { name: "AI & Technology", description: "Tools, trends and hands-on lessons with AI", weight: 3 },
  { name: "Career Growth", description: "Interviews, skills, and growing as a professional", weight: 3 },
  { name: "Productivity", description: "Workflows and habits that actually help", weight: 2 },
  { name: "Personal Journey", description: "Real experiences, wins and mistakes", weight: 2 },
  { name: "Industry Insights", description: "Perspective on where the industry is going", weight: 1 },
];

type S = { goals: string[]; audience: string; pillars: Pillar[]; avoidTopics: string[]; avoidWords: string[] };
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function StrategyEditor({ sections = ["goals", "audience", "pillars", "avoid"], onSaved, cta = "Save strategy" }: {
  sections?: ("goals" | "audience" | "pillars" | "avoid")[]; onSaved?: () => void; cta?: string;
}) {
  const [s, setS] = useState<S | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => setS({ ...d, pillars: d.pillars?.length ? d.pillars : DEFAULT_PILLARS }));
  }, []);
  if (!s) return <p className="text-sm text-slate-500">Loading…</p>;

  async function save() {
    setBusy(true); setMsg("");
    const body: Partial<S> = {};
    if (sections.includes("goals")) body.goals = s!.goals;
    if (sections.includes("audience")) body.audience = s!.audience;
    if (sections.includes("pillars")) body.pillars = s!.pillars.filter((p) => p.name.trim());
    if (sections.includes("avoid")) { body.avoidTopics = s!.avoidTopics; body.avoidWords = s!.avoidWords; }
    const res = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) return setMsg((await res.json().catch(() => ({}))).error ?? "Save failed.");
    setMsg("Saved."); onSaved?.();
  }

  const setPillar = (i: number, patch: Partial<Pillar>) => setS({ ...s, pillars: s.pillars.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <div className="space-y-6">
      {sections.includes("goals") && (
        <div>
          <label className="label">Goals</label>
          <div className="flex flex-wrap gap-2">
            {GOALS.map((g) => {
              const on = s.goals.includes(g);
              return <button key={g} type="button" onClick={() => setS({ ...s, goals: on ? s.goals.filter((x) => x !== g) : [...s.goals, g] })}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-brand-blue bg-brand-blue/10 text-brand-blue" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>{g}</button>;
            })}
          </div>
        </div>
      )}
      {sections.includes("audience") && (
        <div>
          <label className="label" htmlFor="aud">Target audience</label>
          <textarea id="aud" className="input" rows={2} value={s.audience} onChange={(e) => setS({ ...s, audience: e.target.value })}
            placeholder="Recruiters, founders, students and people interested in AI" />
        </div>
      )}
      {sections.includes("pillars") && (
        <div>
          <label className="label">Content pillars</label>
          <div className="space-y-2">
            {s.pillars.map((p, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_2fr_90px_auto] sm:items-center">
                <input className="input" value={p.name} placeholder="Name" onChange={(e) => setPillar(i, { name: e.target.value })} />
                <input className="input" value={p.description} placeholder="Description" onChange={(e) => setPillar(i, { description: e.target.value })} />
                <label className="flex items-center gap-2 text-xs text-slate-500">Weight
                  <input className="input w-14 px-2" type="number" min={1} max={10} value={p.weight} onChange={(e) => setPillar(i, { weight: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />
                </label>
                <button className="text-xs text-red-500" onClick={() => setS({ ...s, pillars: s.pillars.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            <button className="btn-ghost text-xs" onClick={() => setS({ ...s, pillars: [...s.pillars, { name: "", description: "", weight: 1 }] })}>+ Add pillar</button>
          </div>
        </div>
      )}
      {sections.includes("avoid") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Topics to avoid</label><input className="input" defaultValue={s.avoidTopics.join(", ")} onBlur={(e) => setS({ ...s, avoidTopics: csv(e.target.value) })} placeholder="politics, religion" /></div>
          <div><label className="label">Words to avoid</label><input className="input" defaultValue={s.avoidWords.join(", ")} onBlur={(e) => setS({ ...s, avoidWords: csv(e.target.value) })} placeholder="synergy, hustle" /></div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : cta}</button>
        {msg && <span className="text-sm text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}
