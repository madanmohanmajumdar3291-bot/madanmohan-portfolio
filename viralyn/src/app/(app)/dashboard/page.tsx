import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { aiAvailable } from "@/lib/ai/client";

function greeting(tz: string) {
  let hour = new Date().getUTCHours();
  try { hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date())); } catch {}
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const PIPELINE = ["Plan", "Research", "Write", "Review", "Schedule", "Publish"] as const;

export default async function Dashboard() {
  const user = await requireUser();
  const mine = eq(schema.posts.userId, user.id);
  const [[settings], [awaiting], [published], logs, [latest]] = await Promise.all([
    db.select().from(schema.settings).where(eq(schema.settings.userId, user.id)),
    db.select({ n: count() }).from(schema.posts).where(and(mine, eq(schema.posts.status, "awaiting_approval"))),
    db.select({ n: count() }).from(schema.posts).where(and(mine, eq(schema.posts.status, "published"))),
    db.select().from(schema.agentLogs).where(eq(schema.agentLogs.userId, user.id)).orderBy(desc(schema.agentLogs.createdAt)).limit(12),
    db.select().from(schema.posts).where(mine).orderBy(desc(schema.posts.createdAt)).limit(1),
  ]);

  const status = !aiAvailable() ? { text: "Needs attention", cls: "bg-amber-50 text-amber-700", note: "AI is not configured on the server." }
    : settings?.paused ? { text: "Paused", cls: "bg-slate-100 text-slate-600", note: "" }
    : { text: "Active", cls: "bg-emerald-50 text-emerald-700", note: "" };

  // Real stage status for the most recent post; stages not built yet are shown as unavailable.
  const stage = (s: (typeof PIPELINE)[number]) => {
    if (s === "Research" || s === "Schedule" || s === "Publish") return { text: "Unavailable", cls: "text-slate-400" };
    if (!latest) return { text: "Waiting", cls: "text-slate-400" };
    if (s === "Plan") return { text: "Done", cls: "text-emerald-600" };
    if (s === "Write") return { text: "Done", cls: "text-emerald-600" };
    return latest.status === "needs_revision" ? { text: "Failed", cls: "text-red-600" } : { text: "Passed", cls: "text-emerald-600" };
  };

  const stats = [
    { label: "Posts published", value: String(published.n), note: "" },
    { label: "Impressions", value: "Unavailable", note: "Analytics not connected" },
    { label: "Engagements", value: "Unavailable", note: "Analytics not connected" },
    { label: "Awaiting approval", value: String(awaiting.n), note: "", href: "/posts?tab=awaiting_approval" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting(user.timezone)}, {user.name.split(" ")[0]}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className={`badge ${status.cls}`}>{status.text}</span>
          <span>Mode: Approval Required</span>
          <span>· Next scheduled post: none (scheduling unavailable)</span>
          {status.note && <span className="text-amber-700">· {status.note}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <div className="text-xs font-medium text-slate-500">{s.label}</div>
            <div className={`mt-1 text-2xl font-semibold ${s.value === "Unavailable" ? "text-base text-slate-400" : ""}`}>
              {s.href ? <Link href={s.href}>{s.value}</Link> : s.value}
            </div>
            {s.note && <div className="text-[11px] text-slate-400">{s.note}</div>}
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Pipeline{latest ? `: ${latest.topic}` : ""}</h2>
          {!latest && <Link href="/chat" className="text-sm font-medium text-brand-blue">Draft your first post →</Link>}
        </div>
        <ol className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {PIPELINE.map((s, i) => {
            const st = stage(s);
            return (
              <li key={s} className="rounded-xl bg-slate-50 p-3 text-center">
                <div className="text-[11px] text-slate-400">{i + 1}</div>
                <div className="text-sm font-medium">{s}</div>
                <div className={`text-xs ${st.cls}`}>{st.text}</div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold">Recent activity</h2>
        {logs.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {logs.map((l) => (
              <li key={l.id} className="flex gap-3 py-2 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${l.status === "error" ? "bg-red-500" : l.status === "warn" ? "bg-amber-400" : "bg-emerald-400"}`} />
                <span className="flex-1 text-slate-700">{l.message}</span>
                <time className="shrink-0 text-xs text-slate-400">{l.createdAt.toLocaleString("en-US", { timeZone: user.timezone, dateStyle: "short", timeStyle: "short" })}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
