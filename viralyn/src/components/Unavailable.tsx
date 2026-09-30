export function Unavailable({ title, icon, phase, children }: { title: string; icon: string; phase: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{icon} {title}</h1>
      <div className="card p-8 text-center">
        <span className="badge mb-3 bg-slate-100 text-slate-600">Unavailable</span>
        <p className="text-sm text-slate-600">{children}</p>
        <p className="mt-2 text-xs text-slate-400">Planned for {phase}. Nothing on this page is simulated.</p>
      </div>
    </div>
  );
}
