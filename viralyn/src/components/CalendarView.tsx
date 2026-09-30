"use client";
import { useEffect, useMemo, useState } from "react";
import { STATUS_LABEL, type PostDTO } from "@/lib/types";
import { PostCard } from "./PostCard";
import { ymdIn, zonedToUtc } from "@/lib/time";

// Grid cells are calendar days (plain dates); post times are placed and shown in the user's saved time zone.
const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({ authorName, tz }: { authorName: string; tz: string }) {
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [mode, setMode] = useState<"month" | "week">("month");
  const [selected, setSelected] = useState<PostDTO | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/posts").then((r) => r.json()).then(setPosts);
  useEffect(() => { load(); }, []);

  const days = useMemo(() => {
    const start = new Date(cursor);
    if (mode === "month") start.setDate(1);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
    const count = mode === "month" ? 42 : 7;
    return Array.from({ length: count }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor, mode]);

  const byDay = useMemo(() => {
    const m = new Map<string, PostDTO[]>();
    for (const p of posts) {
      const at = p.publishedAt ?? p.scheduledAt;
      if (!at) continue;
      const k = ymdIn(new Date(at), tz);
      m.set(k, [...(m.get(k) ?? []), p].sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "")));
    }
    return m;
  }, [posts]);

  async function drop(day: Date, id: string) {
    const p = posts.find((x) => x.id === id);
    if (!p?.scheduledAt || p.status === "published") return;
    const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(p.scheduledAt));
    const at = zonedToUtc(ymdLocal(day), hhmm, tz);
    if (at <= new Date()) return setMsg("Can't move a post into the past.");
    const res = await fetch(`/api/posts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "schedule", at: at.toISOString() }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(data.error ?? "Reschedule failed.");
    setMsg(""); setPosts((all) => all.map((x) => (x.id === id ? data : x)));
  }

  async function plan() {
    setBusy(true);
    const res = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ days: 7 }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? (data.created ? `Planned ${data.created} slot(s): ${data.pillars.join(", ")}.` : data.reason) : data.error ?? "Planning failed.");
    load();
  }

  const shift = (n: number) => { const d = new Date(cursor); if (mode === "month") d.setMonth(d.getMonth() + n); else d.setDate(d.getDate() + 7 * n); setCursor(d); };
  const today = ymdIn(new Date(), tz);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold tracking-tight">📅 Calendar</h1>
        <button className="btn-ghost" onClick={() => shift(-1)}>‹</button>
        <span className="min-w-[140px] text-center text-sm font-medium">{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <button className="btn-ghost" onClick={() => shift(1)}>›</button>
        <button className="btn-ghost" onClick={() => setMode(mode === "month" ? "week" : "month")}>{mode === "month" ? "Week view" : "Month view"}</button>
        <button className="btn-primary" disabled={busy} onClick={plan}>{busy ? "Planning…" : "Plan next 7 days"}</button>
      </div>
      {msg && <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{msg}</p>}
      <p className="mb-3 text-xs text-slate-500">Times in {tz}. Drag a post to another day to reschedule (keeps its time). Planned slots are placeholders until you draft them.</p>

      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200">
          {DOW.map((d) => <div key={d} className="bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-500">{d}</div>)}
          {days.map((d) => {
            const k = ymdLocal(d);
            const inMonth = mode === "week" || d.getMonth() === cursor.getMonth();
            return (
              <div key={k} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(d, e.dataTransfer.getData("text/plain"))}
                className={`min-h-[110px] bg-white p-1.5 ${inMonth ? "" : "bg-slate-50/60 text-slate-400"} ${mode === "week" ? "min-h-[320px]" : ""}`}>
                <div className={`mb-1 text-xs ${k === today ? "inline-grid h-5 w-5 place-items-center rounded-full bg-brand-blue font-semibold text-white" : "text-slate-500"}`}>{d.getDate()}</div>
                <div className="space-y-1">
                  {(byDay.get(k) ?? []).map((p) => (
                    <button key={p.id} draggable={p.status !== "published"} onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)} onClick={() => setSelected(p)}
                      className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] ${STATUS_LABEL[p.status].cls} ${p.status === "planned" ? "border border-dashed border-slate-300" : ""}`}>
                      {new Date(p.publishedAt ?? p.scheduledAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: tz })} {p.topic}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <PostCard post={selected} authorName={authorName}
              onChange={(p) => { setSelected(p); load(); }}
              onDelete={() => { setSelected(null); load(); }} />
            <button className="btn-ghost mt-2 w-full" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
