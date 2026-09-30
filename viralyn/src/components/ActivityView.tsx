"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Log = { id: string; action: string; status: string; message: string; postId: string | null; createdAt: string };

export function ActivityView() {
  const params = useSearchParams();
  const [postId, setPostId] = useState(params.get("postId") ?? "");
  const [action, setAction] = useState("");
  const [logs, setLogs] = useState<Log[] | null>(null);

  useEffect(() => { fetch(`/api/activity${postId ? `?postId=${postId}` : ""}`).then((r) => r.json()).then(setLogs); }, [postId]);
  const actions = [...new Set((logs ?? []).map((l) => l.action))].sort();
  const shown = (logs ?? []).filter((l) => !action || l.action === action);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">🧾 Activity log</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-auto" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a}>{a}</option>)}
        </select>
        {postId && <button className="btn-ghost" onClick={() => setPostId("")}>Clear post filter</button>}
      </div>
      {logs === null ? <p className="text-sm text-slate-500">Loading…</p> : (
        <div className="card divide-y divide-slate-100">
          {shown.length === 0 && <p className="p-4 text-sm text-slate-500">Nothing yet.</p>}
          {shown.map((l) => (
            <div key={l.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${l.status === "error" ? "bg-red-500" : l.status === "warn" ? "bg-amber-400" : "bg-emerald-400"}`} />
              <span className="badge bg-slate-100 text-slate-600">{l.action}</span>
              <span className="min-w-0 flex-1 text-slate-700">{l.message}</span>
              {l.postId && !postId && <button className="text-xs text-brand-blue" onClick={() => setPostId(l.postId!)}>this post</button>}
              <time className="text-xs text-slate-400">{new Date(l.createdAt).toLocaleString()}</time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
