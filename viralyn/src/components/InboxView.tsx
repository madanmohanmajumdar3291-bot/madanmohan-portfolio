"use client";
import { useEffect, useRef, useState } from "react";
import { FORMATS } from "@/lib/ai/formats";

type Exp = { id: string; content: string; source: string; pillar: string | null; status: string; createdAt: string };
type SpeechRec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

export function InboxView() {
  const [items, setItems] = useState<Exp[] | null>(null);
  const [pillars, setPillars] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [source, setSource] = useState<"text" | "voice">("text");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const [formatFor, setFormatFor] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/experiences").then((r) => r.json()).then(setItems);
    fetch("/api/settings").then((r) => r.json()).then((s) => setPillars((s.pillars ?? []).map((p: { name: string }) => p.name)));
    setSpeechOk(typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window));
  }, []);

  function toggleVoice() {
    if (recording) { rec.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const r = new (W.SpeechRecognition ?? W.webkitSpeechRecognition)!();
    r.lang = navigator.language || "en-US"; r.interimResults = false; r.continuous = true;
    const base = text ? `${text.trim()} ` : "";
    r.onresult = (e) => setText(base + Array.from(e.results).map((x) => x[0].transcript).join(" "));
    r.onend = () => setRecording(false);
    r.onerror = (e) => { setRecording(false); setMsg({ ok: false, text: `Voice note failed: ${e.error}` }); };
    rec.current = r; r.start(); setRecording(true); setSource("voice");
  }

  async function add() {
    setBusy("add"); setMsg(null);
    const res = await fetch("/api/experiences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: text, source }) });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Save failed." });
    setItems((x) => [data, ...(x ?? [])]); setText(""); setSource("text");
  }

  async function patch(id: string, body: object) {
    const res = await fetch(`/api/experiences/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { const e = await res.json(); setItems((x) => (x ?? []).map((i) => (i.id === id ? e : i))); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this experience?")) return;
    const res = await fetch(`/api/experiences/${id}`, { method: "DELETE" });
    if (res.ok) setItems((x) => (x ?? []).filter((i) => i.id !== id));
  }

  async function draft(e: Exp) {
    setBusy(e.id); setMsg(null);
    const res = await fetch(`/api/experiences/${e.id}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ format: formatFor[e.id] ?? "storytelling" }) });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Drafting failed." });
    setItems((x) => (x ?? []).map((i) => (i.id === e.id ? { ...i, status: i.status === "unused" ? "drafted" : i.status } : i)));
    setMsg({ ok: true, text: data.status === "awaiting_approval" ? "Draft ready: see Posts → Awaiting approval." : "Draft created but failed review: see Posts → Drafts for the reason." });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">📥 Experience Inbox</h1>
      <p className="mb-5 text-sm text-slate-500">Things that actually happened. Personal posts are written only from these, and never embellished.</p>

      <div className="card mb-6 space-y-3 p-4">
        <textarea className="input min-h-[90px]" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000}
          placeholder='e.g. "Got my first client for the attendance app" or "Failed an interview question about state management"' />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={busy === "add" || text.trim().length < 5} onClick={add}>{busy === "add" ? "Saving…" : "Save to Inbox"}</button>
          {speechOk ? (
            <button className={`btn-ghost ${recording ? "border-red-300 text-red-600" : ""}`} onClick={toggleVoice}>{recording ? "■ Stop recording" : "🎙 Voice note"}</button>
          ) : <span className="text-xs text-slate-400">Voice notes: Unavailable in this browser</span>}
          <span className="text-xs text-slate-400">Voice is transcribed by your browser. Check the text before saving.</span>
        </div>
        {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      </div>

      {items === null ? <p className="text-sm text-slate-500">Loading…</p> : items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">Your Inbox is empty. Anything happen this week worth sharing?</div>
      ) : (
        <ul className="space-y-3">
          {items.map((e) => (
            <li key={e.id} className="card p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className={`badge ${e.status === "unused" ? "bg-slate-100 text-slate-600" : e.status === "drafted" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{e.status}</span>
                {e.source === "voice" && <span className="badge bg-purple-50 text-purple-700">voice</span>}
                <select className="rounded-md border border-slate-200 px-1 py-0.5" value={e.pillar ?? ""} onChange={(ev) => patch(e.id, { pillar: ev.target.value || null })}>
                  <option value="">No pillar</option>
                  {[...new Set([...pillars, ...(e.pillar ? [e.pillar] : [])])].map((p) => <option key={p}>{p}</option>)}
                </select>
                <span className="ml-auto">{new Date(e.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{e.content}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <select className="input w-auto py-1.5 text-xs" value={formatFor[e.id] ?? "storytelling"} onChange={(ev) => setFormatFor({ ...formatFor, [e.id]: ev.target.value })}>
                  {FORMATS.map((f) => <option key={f}>{f}</option>)}
                </select>
                <button className="btn-primary py-1.5 text-xs" disabled={!!busy} onClick={() => draft(e)}>{busy === e.id ? "Writing & reviewing…" : "Draft a post"}</button>
                <button className="btn-danger ml-auto py-1.5 text-xs" onClick={() => remove(e.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
