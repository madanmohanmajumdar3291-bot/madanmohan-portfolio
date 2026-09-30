"use client";
import { useEffect, useState } from "react";
import type { VoiceProfile } from "@/db/schema";

const FIELDS: { key: keyof VoiceProfile; label: string }[] = [
  { key: "summary", label: "Summary" }, { key: "tone", label: "Tone" }, { key: "sentenceLength", label: "Sentence length" },
  { key: "formality", label: "Formality" }, { key: "humor", label: "Humor" }, { key: "hookStyle", label: "Hook style" },
  { key: "paragraphStructure", label: "Paragraphs" }, { key: "emojiUsage", label: "Emojis" }, { key: "ctaStyle", label: "Calls to action" },
  { key: "vocabulary", label: "Vocabulary" },
];
const SEP = "\n---\n";

export function VoiceEditor({ onDone }: { onDone?: () => void }) {
  const [samples, setSamples] = useState("");
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/voice").then((r) => r.json()).then((v) => { if (v?.samples?.length) setSamples(v.samples.join(SEP)); setProfile(v?.profile ?? null); });
  }, []);

  const list = samples.split(/\n-{3,}\n/).map((s) => s.trim()).filter(Boolean);

  async function analyze() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/voice/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ samples: list }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.issues?.[0]?.message ?? data.error ?? "Analysis failed." });
    setProfile(data.profile); setMsg({ ok: true, text: "Voice profile built. Review and edit it below." });
  }

  async function save() {
    if (!profile) return;
    setBusy(true);
    const res = await fetch("/api/voice", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(profile) });
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: "Save failed." });
    if (res.ok) onDone?.();
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Your past posts ({list.length}/20, need at least 3)</label>
        <textarea className="input min-h-[200px]" value={samples} onChange={(e) => setSamples(e.target.value)}
          placeholder={"Paste a post here…\n---\nPaste another post…\n---\nAnd another…"} />
        <p className="mt-1 text-xs text-slate-500">Separate posts with a line containing only <code>---</code>. Viralyn learns how you write and never copies your phrases.</p>
      </div>
      <button className="btn-primary" disabled={busy || list.length < 3 || list.length > 20} onClick={analyze}>{busy ? "Analyzing…" : "Analyze my voice"}</button>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      {profile && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-4">
          <h3 className="text-sm font-semibold">Your writing profile</h3>
          {FIELDS.map((f) => (
            <div key={f.key} className="grid gap-1 sm:grid-cols-[140px_1fr] sm:items-center">
              <span className="text-xs font-medium text-slate-500">{f.label}</span>
              <input className="input" value={profile[f.key]} onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })} />
            </div>
          ))}
          <button className="btn-ghost" disabled={busy} onClick={save}>Save profile</button>
        </div>
      )}
    </div>
  );
}
