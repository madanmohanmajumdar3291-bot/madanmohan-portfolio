"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceEditor } from "@/components/VoiceEditor";
import { StrategyEditor } from "@/components/StrategyEditor";
import { PublishingSettings } from "@/components/PublishingSettings";
import { Suspense } from "react";

const STEPS = ["Welcome", "My Voice", "Goals", "Pillars", "Audience", "Schedule & LinkedIn", "First experience", "Activate"] as const;

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [exp, setExp] = useState("");
  const [expId, setExpId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function saveExperience() {
    const res = await fetch("/api/experiences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: exp }) });
    if (res.ok) { setExpId((await res.json()).id); next(); } else setStatus((await res.json().catch(() => ({}))).error ?? "Save failed.");
  }
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));

  async function finish() {
    await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ onboarded: true }) });
    if (expId) {
      setStatus("Writing and reviewing your first draft…");
      const res = await fetch(`/api/experiences/${expId}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ format: "storytelling" }) });
      if (res.ok) { router.push("/posts?tab=all"); router.refresh(); return; }
      setStatus(`Couldn't draft yet: ${(await res.json().catch(() => ({}))).error ?? "unknown error"}. You can draft it later from your Inbox.`);
      await new Promise((r) => setTimeout(r, 2500));
    }
    router.push("/chat"); router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-6 flex gap-1">
        {STEPS.map((s, i) => <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-gradient-to-r from-brand-blue to-brand-purple" : "bg-slate-200"}`} title={s} />)}
      </ol>
      <div className="card p-6 sm:p-8">
        {step === 0 && (
          <div className="py-6 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Welcome to Viralyn</h1>
            <p className="mt-2 text-slate-500">Your AI co-writer for LinkedIn. It learns your voice, turns what actually happened into posts, and never publishes anything without your approval.</p>
            <button className="btn-primary mt-6" onClick={next}>Get started</button>
          </div>
        )}
        {step === 1 && (<><h2 className="mb-1 text-xl font-semibold">Teach Viralyn your voice</h2><p className="mb-4 text-sm text-slate-500">Paste 3–20 of your past LinkedIn posts. You can skip this and do it later.</p><VoiceEditor onDone={next} /><button className="btn-ghost mt-4" onClick={next}>Skip for now</button></>)}
        {step === 2 && (<><h2 className="mb-4 text-xl font-semibold">What are your goals?</h2><StrategyEditor sections={["goals"]} onSaved={next} cta="Continue" /></>)}
        {step === 3 && (<><h2 className="mb-4 text-xl font-semibold">Choose your content pillars</h2><StrategyEditor sections={["pillars"]} onSaved={next} cta="Continue" /></>)}
        {step === 4 && (<><h2 className="mb-4 text-xl font-semibold">Who do you want to reach?</h2><StrategyEditor sections={["audience", "avoid"]} onSaved={next} cta="Continue" /></>)}
        {step === 5 && (<><h2 className="mb-4 text-xl font-semibold">When should you post?</h2><Suspense><PublishingSettings /></Suspense><button className="btn-primary mt-6" onClick={next}>Continue</button></>)}
        {step === 6 && (
          <>
            <h2 className="mb-1 text-xl font-semibold">Add your first experience</h2>
            <p className="mb-4 text-sm text-slate-500">Something that actually happened recently: a win, a mistake, a lesson. Viralyn will draft your first post from it.</p>
            <textarea className="input min-h-[100px]" value={exp} onChange={(e) => setExp(e.target.value)} placeholder="Got my first client for the attendance app…" />
            {status && <p className="mt-2 text-sm text-red-600">{status}</p>}
            <div className="mt-4 flex gap-2"><button className="btn-primary" disabled={exp.trim().length < 5} onClick={saveExperience}>Save</button><button className="btn-ghost" onClick={next}>Skip</button></div>
          </>
        )}
        {step === 7 && (
          <div className="py-4 text-center">
            <h2 className="text-xl font-semibold">You&apos;re ready</h2>
            <p className="mt-2 text-sm text-slate-500">Viralyn starts in 🟡 <b>Approval Required</b> mode: nothing is posted without your explicit approval.</p>
            {status && <p className="mt-3 text-sm text-slate-600">{status}</p>}
            <button className="btn-primary mt-6" disabled={!!status} onClick={finish}>Activate Viralyn</button>
          </div>
        )}
      </div>
    </div>
  );
}
