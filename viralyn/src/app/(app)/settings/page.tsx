import { VoiceEditor } from "@/components/VoiceEditor";
import { StrategyEditor } from "@/components/StrategyEditor";
import { AccountActions } from "@/components/AccountActions";
import { PublishingSettings } from "@/components/PublishingSettings";
import { Suspense } from "react";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">⚙️ Settings</h1>
      <section className="card p-6"><h2 className="mb-4 text-lg font-semibold">My Voice</h2><VoiceEditor /></section>
      <section className="card p-6"><h2 className="mb-4 text-lg font-semibold">Strategy</h2><StrategyEditor /></section>
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Publishing</h2>
        <p className="mb-4 text-sm text-slate-600">Mode: 🟡 <b>Approval Required</b>. Nothing is published without your explicit Approve, Publish or Schedule.</p>
        <Suspense><PublishingSettings /></Suspense>
      </section>
      <section className="card p-6"><h2 className="mb-4 text-lg font-semibold">Your data</h2><AccountActions /></section>
    </div>
  );
}
