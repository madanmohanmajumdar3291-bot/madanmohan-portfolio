"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceEditor } from "@/components/VoiceEditor";
import { StrategyEditor } from "@/components/StrategyEditor";

const STEPS = ["Welcome", "My Voice", "Goals", "Pillars", "Audience", "Activate"] as const;

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));

  async function finish() {
    await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ onboarded: true }) });
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
        {step === 5 && (
          <div className="py-4 text-center">
            <h2 className="text-xl font-semibold">You&apos;re ready</h2>
            <p className="mt-2 text-sm text-slate-500">Viralyn starts in 🟡 <b>Approval Required</b> mode. LinkedIn connection, scheduling and analytics arrive in later releases; until then, drafts stay in Viralyn and nothing is posted anywhere.</p>
            <button className="btn-primary mt-6" onClick={finish}>Activate Viralyn</button>
          </div>
        )}
      </div>
    </div>
  );
}
