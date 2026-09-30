// Single-series horizontal bars: one hue, value labels in text ink, hover tooltip, doubles as a table.
export function BarList({ rows, format, empty = "Not enough data yet." }: {
  rows: { label: string; value: number; note?: string }[]; format: (v: number) => string; empty?: string;
}) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="group" title={`${r.label}: ${format(r.value)}${r.note ? ` (${r.note})` : ""}`}>
            <td className="w-32 truncate py-1.5 pr-3 align-middle text-slate-600">{r.label}</td>
            <td className="py-1.5 align-middle">
              <div className="h-3 rounded-r bg-brand-blue transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            </td>
            <td className="w-28 whitespace-nowrap py-1.5 pl-3 text-right align-middle tabular-nums text-slate-700">
              {format(r.value)}{r.note && <span className="ml-1 text-xs text-slate-400">{r.note}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
