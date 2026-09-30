export function Logo({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-blue to-brand-purple text-lg font-bold text-white shadow-lg shadow-brand-purple/30">V</div>
      <div>
        <div className="text-base font-semibold tracking-tight">Viralyn</div>
        {subtitle && <div className="text-[11px] text-slate-400">AI Personal Brand Engine</div>}
      </div>
    </div>
  );
}
