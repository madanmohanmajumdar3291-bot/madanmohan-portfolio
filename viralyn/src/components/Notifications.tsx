"use client";
import { useEffect, useState } from "react";

type N = { id: string; title: string; body: string; read: boolean; createdAt: string; kind: string };

export function Notifications() {
  const [items, setItems] = useState<N[]>([]);
  const [open, setOpen] = useState(false);
  const load = () => fetch("/api/notifications").then((r) => (r.ok ? r.json() : [])).then(setItems).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, []);
  const unread = items.filter((n) => !n.read);

  async function toggle() {
    setOpen(!open);
    if (!open && unread.length) {
      await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: unread.map((n) => n.id) }) });
      setTimeout(load, 3000);
    }
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white">
        <span aria-hidden>🔔</span>Notifications
        {unread.length > 0 && <span className="ml-auto rounded-full bg-brand-purple px-1.5 text-[11px] font-semibold text-white">{unread.length}</span>}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 max-h-96 w-80 overflow-y-auto rounded-xl bg-white p-2 text-slate-800 shadow-2xl">
          {items.length === 0 ? <p className="p-3 text-sm text-slate-500">No notifications.</p> : items.map((n) => (
            <div key={n.id} className={`rounded-lg p-2 text-sm ${n.read ? "" : "bg-blue-50"}`}>
              <div className="font-medium">{n.title}</div>
              <div className="text-xs text-slate-500">{n.body}</div>
              <div className="text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
