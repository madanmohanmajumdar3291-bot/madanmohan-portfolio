"use client";
import { useEffect, useRef, useState } from "react";
import { FORMATS } from "@/lib/ai/formats";
import type { PostDTO } from "@/lib/types";

type Check = { check: string; result: "pass" | "warn" | "fail"; reason: string };
const TONE = { pass: "text-emerald-600 bg-emerald-50", warn: "text-amber-600 bg-amber-50", fail: "text-red-600 bg-red-50" } as const;
const ICON = { pass: "✓", warn: "!", fail: "✕" } as const;

export function PostEditor({ onCreated, onClose }: { onCreated: (p: PostDTO) => void; onClose: () => void }) {
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<string>("how-to");
  const [pillar, setPillar] = useState("");
  const [pillars, setPillars] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetch("/api/settings").then((r) => r.json()).then((s) => setPillars((s.pillars ?? []).map((p: { name: string }) => p.name))); }, []);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!content.trim()) { setChecks([]); return; }
    timer.current = setTimeout(async () => {
      const res = await fetch("/api/posts/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) });
      if (res.ok) setChecks(await res.json());
    }, 500);
  }, [content]);

  async function save() {
    setBusy(true); setError("");
    const res = await fetch("/api/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, format, pillar: pillar || null, content }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.issues?.[0]?.message ?? data.error ?? "Save failed.");
    onCreated(data);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[92vh] w-full max-w-4xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Write a post yourself</h2>
          <button className="btn-ghost px-3 py-1" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="grid gap-5 md:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3"><label className="label" htmlFor="pe-topic">Topic</label><input id="pe-topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What is this post about?" /></div>
              <div><label className="label" htmlFor="pe-format">Format</label>
                <select id="pe-format" className="input" value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map((f) => <option key={f}>{f}</option>)}</select></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="pe-pillar">Pillar</label>
                <select id="pe-pillar" className="input" value={pillar} onChange={(e) => setPillar(e.target.value)}><option value="">None</option>{pillars.map((p) => <option key={p}>{p}</option>)}</select></div>
            </div>
            <div>
              <label className="label" htmlFor="pe-content">Post</label>
              <textarea id="pe-content" className="input min-h-[300px] leading-relaxed" value={content} onChange={(e) => setContent(e.target.value)} maxLength={3000} placeholder="Write it the way you'd post it on LinkedIn." />
              <div className="mt-1 text-right text-xs text-slate-400">{content.length}/3000</div>
            </div>
          </div>
          <aside className="space-y-3">
            <h3 className="text-sm font-semibold">Checks</h3>
            {checks.length === 0 ? <p className="text-xs text-slate-500">Start typing to see checks.</p> : (
              <ul className="space-y-2">{checks.map((c) => (
                <li key={c.check} className="flex gap-2 text-xs"><span className={`badge ${TONE[c.result]} h-5 w-5 justify-center`}>{ICON[c.result]}</span>
                  <span><b className="text-slate-700">{c.check}</b> <span className="text-slate-500">{c.reason}</span></span></li>))}</ul>
            )}
            <p className="text-xs text-slate-500">These checks run without AI. When you save, AI review also runs if it&apos;s available; otherwise Accuracy, Voice, Safety and Privacy are marked &quot;not checked&quot;.</p>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            <button className="btn-primary w-full" disabled={busy || topic.trim().length < 3 || !content.trim()} onClick={save}>{busy ? "Reviewing…" : "Save & review"}</button>
          </aside>
        </div>
      </div>
    </div>
  );
}
