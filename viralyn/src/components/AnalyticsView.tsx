"use client";
import { useEffect, useState } from "react";
import { BarList } from "./BarList";

type Stat = { key: string; n: number; avgEngagement: number; avgImpressions: number | null };
type Item = { id: string; topic: string; format: string; pillar: string | null; publishedAt: string | null; rate: number | null;
  metrics: { impressions: number | null; reactions: number | null; comments: number | null; reposts: number | null; source: string } | null };
type Data = { publishedCount: number; withMetrics: number; confidence: string; insights: string[]; items: Item[]; breakdowns: Record<string, Stat[]>;
  totals: { impressions: number; reactions: number; comments: number; reposts: number; avgEngagement: number } | null };

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const int = (v: number) => Math.round(v).toLocaleString();

function ManualEntry({ item, onSaved }: { item: Item; onSaved: () => void }) {
  const [v, setV] = useState({ impressions: "", reactions: "", comments: "", reposts: "" });
  const [err, setErr] = useState("");
  async function save() {
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    const res = await fetch("/api/analytics", { method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId: item.id, impressions: num(v.impressions), reactions: num(v.reactions), comments: num(v.comments), reposts: num(v.reposts) }) });
    if (!res.ok) return setErr((await res.json().catch(() => ({}))).error ?? "Save failed.");
    onSaved();
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(v) as (keyof typeof v)[]).map((k) => (
        <input key={k} className="input w-24 py-1 text-xs" inputMode="numeric" placeholder={k} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/[^\d]/g, "") })} />
      ))}
      <button className="btn-ghost py-1 text-xs" onClick={save}>Save</button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}

export function AnalyticsView() {
  const [data, setData] = useState<Data | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pillarMsg, setPillarMsg] = useState("");
  const load = () => fetch("/api/analytics").then((r) => r.json()).then(setData);
  useEffect(() => { load(); }, []);

  async function importFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) return setImportMsg("Please save LinkedIn's export as CSV first (XLSX isn't supported yet).");
    const res = await fetch("/api/analytics/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv: await file.text() }) });
    const d = await res.json().catch(() => ({}));
    setImportMsg(res.ok ? `Imported ${d.matched} of ${d.total} rows.${d.unmatchedCount ? ` ${d.unmatchedCount} rows didn't match a post published through Viralyn.` : ""}` : d.error ?? "Import failed.");
    load();
  }

  async function boostPillar(name: string) {
    const s = await fetch("/api/settings").then((r) => r.json());
    const pillars = s.pillars.map((p: { name: string; weight: number }) => (p.name === name ? { ...p, weight: Math.min(10, p.weight + 1) } : p));
    const res = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ pillars }) });
    setPillarMsg(res.ok ? `Increased the weight of "${name}" by 1.` : "Update failed.");
  }

  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;
  const bestPillar = data.breakdowns.pillar?.[0];
  const trend = data.items.filter((i) => i.metrics?.impressions != null).slice(0, 12).reverse();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">📊 Analytics</h1>
          <p className="text-sm text-slate-500">Only real numbers: imported from LinkedIn&apos;s export or entered by you. LinkedIn&apos;s API doesn&apos;t provide metrics for personal accounts.</p>
        </div>
        <label className="btn-primary cursor-pointer">
          Import LinkedIn export (CSV)
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
      </div>
      {importMsg && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{importMsg}</p>}

      {!data.totals ? (
        <div className="card p-8 text-center">
          <span className="badge mb-3 bg-slate-100 text-slate-600">Analytics unavailable</span>
          <p className="text-sm text-slate-600">No metrics yet{data.publishedCount ? ` for your ${data.publishedCount} published post(s)` : ""}.</p>
          <ol className="mx-auto mt-3 max-w-md list-decimal space-y-1 text-left text-sm text-slate-500">
            <li>On LinkedIn, open your post analytics and export them.</li>
            <li>Save the file as CSV with a post URL column, plus impressions, reactions, comments and reposts.</li>
            <li>Import it above, or enter numbers per post below.</li>
          </ol>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[["Impressions", int(data.totals.impressions)], ["Reactions", int(data.totals.reactions)], ["Comments", int(data.totals.comments)],
            ["Reposts", int(data.totals.reposts)], ["Avg engagement", pct(data.totals.avgEngagement)]].map(([l, v]) => (
            <div key={l} className="card p-4"><div className="text-xs text-slate-500">{l}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div></div>
          ))}
          <p className="col-span-full text-xs text-slate-400">Based on {data.withMetrics} of {data.publishedCount} published posts.</p>
        </div>
      )}

      {data.insights.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-2 font-semibold">Insights</h2>
          <p className="mb-3 text-xs text-slate-500">Signals, not proof. Small samples can mislead.</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{data.insights.map((s) => <li key={s}>{s}</li>)}</ul>
          {bestPillar && data.breakdowns.pillar.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm">
              <span>Post more about <b>{bestPillar.key}</b>? ({bestPillar.n} post{bestPillar.n === 1 ? "" : "s"}, {bestPillar.n < 5 ? "low" : bestPillar.n < 15 ? "medium" : "high"} confidence)</span>
              <button className="btn-ghost py-1 text-xs" onClick={() => boostPillar(bestPillar.key)}>Increase its weight</button>
              {pillarMsg && <span className="text-xs text-slate-500">{pillarMsg}</span>}
            </div>
          )}
        </div>
      )}

      {data.totals && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-5"><h2 className="mb-3 font-semibold">Impressions per post (latest 12)</h2>
            <BarList rows={trend.map((i) => ({ label: i.topic, value: i.metrics!.impressions! }))} format={int} /></div>
          <div className="card p-5"><h2 className="mb-3 font-semibold">Engagement by format</h2>
            <BarList rows={(data.breakdowns.format ?? []).map((s) => ({ label: s.key, value: s.avgEngagement, note: `n=${s.n}` }))} format={pct} /></div>
          <div className="card p-5"><h2 className="mb-3 font-semibold">Engagement by pillar</h2>
            <BarList rows={(data.breakdowns.pillar ?? []).map((s) => ({ label: s.key, value: s.avgEngagement, note: `n=${s.n}` }))} format={pct} /></div>
          <div className="card p-5"><h2 className="mb-3 font-semibold">Engagement by time of day</h2>
            <BarList rows={(data.breakdowns.timeOfDay ?? []).map((s) => ({ label: s.key, value: s.avgEngagement, note: `n=${s.n}` }))} format={pct}
              empty="Not enough data to suggest posting times." /></div>
        </div>
      )}

      <div className="card p-5">
        <h2 className="mb-3 font-semibold">Published posts</h2>
        {data.items.length === 0 ? <p className="text-sm text-slate-500">Nothing published yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((i) => (
              <li key={i.id} className="space-y-2 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{i.topic}</span>
                  <span className="text-xs text-slate-500">{i.format}{i.pillar ? ` · ${i.pillar}` : ""}</span>
                  <span className="ml-auto text-xs tabular-nums text-slate-600">
                    {i.metrics ? `${i.metrics.impressions ?? "?"} impr · ${i.metrics.reactions ?? "?"} reactions · ${i.metrics.comments ?? "?"} comments · ${i.rate != null ? pct(i.rate) : "?"} (${i.metrics.source})` : "no data"}
                  </span>
                  <button className="text-xs text-brand-blue" onClick={() => setEditing(editing === i.id ? null : i.id)}>Enter numbers</button>
                </div>
                {editing === i.id && <ManualEntry item={i} onSaved={() => { setEditing(null); load(); }} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
