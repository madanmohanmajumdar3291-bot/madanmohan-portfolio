import { VoiceEditor } from "@/components/VoiceEditor";
import { StrategyEditor } from "@/components/StrategyEditor";
import { AccountActions } from "@/components/AccountActions";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">⚙️ Settings</h1>
      <section className="card p-6"><h2 className="mb-4 text-lg font-semibold">My Voice</h2><VoiceEditor /></section>
      <section className="card p-6"><h2 className="mb-4 text-lg font-semibold">Strategy</h2><StrategyEditor /></section>
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Posting mode</h2>
        <p className="text-sm text-slate-600">🟡 <b>Approval Required</b>. Nothing is ever published without your explicit approval. LinkedIn connection and publishing: <span className="badge bg-slate-100 text-slate-600">Unavailable</span> (coming in Phase 4).</p>
      </section>
      <section className="card p-6"><h2 className="mb-4 text-lg font-semibold">Your data</h2><AccountActions /></section>
    </div>
  );
}
