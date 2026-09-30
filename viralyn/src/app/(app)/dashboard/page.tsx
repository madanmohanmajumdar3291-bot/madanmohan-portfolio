import Link from "next/link";
import { and, asc, count, desc, eq, gt, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { aiAvailable } from "@/lib/ai/client";
import { getAccount } from "@/lib/linkedin";
import { loadAnalytics } from "@/lib/analytics-data";

function greeting(tz: string) {
  let hour = new Date().getUTCHours();
  try { hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date())); } catch {}
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

type Stage = { text: string; cls: string };
const done: Stage = { text: "Done", cls: "text-emerald-600" }, waiting: Stage = { text: "Waiting", cls: "text-slate-400" };

export default async function Dashboard() {
  const user = await requireUser();
  const mine = eq(schema.posts.userId, user.id);
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const [[settings], [awaiting], li, analytics, logs, [next], [recentExp]] = await Promise.all([
    db.select().from(schema.settings).where(eq(schema.settings.userId, user.id)),
    db.select({ n: count() }).from(schema.posts).where(and(mine, eq(schema.posts.status, "awaiting_approval"))),
    getAccount(user.id),
    loadAnalytics(user.id, user.timezone),
    db.select().from(schema.agentLogs).where(eq(schema.agentLogs.userId, user.id)).orderBy(desc(schema.agentLogs.createdAt)).limit(12),
    db.select().from(schema.posts).where(and(mine, gt(schema.posts.scheduledAt, new Date()), inArray(schema.posts.status, ["planned", "awaiting_approval", "needs_revision", "approved", "scheduled"])))
      .orderBy(asc(schema.posts.scheduledAt)).limit(1),
    db.select({ id: schema.experiences.id }).from(schema.experiences).where(and(eq(schema.experiences.userId, user.id), gte(schema.experiences.createdAt, weekAgo))).limit(1),
  ]);

  const paused = settings?.paused || (settings?.pausedUntil && settings.pausedUntil > new Date());
  const problems = [
    !aiAvailable() && "AI is not configured on the server.",
    li?.status === "expired" && "LinkedIn connection expired: reconnect in Settings.",
  ].filter(Boolean) as string[];
  const status = problems.length ? { text: "Needs attention", cls: "bg-amber-50 text-amber-700" }
    : paused ? { text: "Paused", cls: "bg-slate-100 text-slate-600" } : { text: "Active", cls: "bg-emerald-50 text-emerald-700" };

  const fmt = (d: Date) => d.toLocaleString("en-US", { timeZone: user.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const stagesFor = (p: typeof next): Record<string, Stage> => {
    if (!p) return { Plan: waiting, Research: { text: "Unavailable", cls: "text-slate-400" }, Write: waiting, Review: waiting, Schedule: waiting, Publish: waiting };
    const wrote = p.status !== "planned";
    return {
      Plan: done,
      Research: { text: "Unavailable", cls: "text-slate-400" },
      Write: wrote ? done : waiting,
      Review: !wrote ? waiting : p.status === "needs_revision" ? { text: "Failed", cls: "text-red-600" } : { text: "Passed", cls: "text-emerald-600" },
      Schedule: p.status === "scheduled" ? done : p.status === "awaiting_approval" ? { text: "Needs approval", cls: "text-amber-600" } : waiting,
      Publish: li?.status === "connected" ? waiting : { text: "LinkedIn not connected", cls: "text-amber-600" },
    };
  };
  const stages = stagesFor(next);

  const stats = [
    { label: "Posts published", value: String(analytics.publishedCount) },
    { label: "Impressions", value: analytics.totals ? analytics.totals.impressions.toLocaleString() : "Unavailable", note: analytics.totals ? `from ${analytics.withMetrics} posts` : "Import analytics to see this" },
    { label: "Engagements", value: analytics.totals ? (analytics.totals.reactions + analytics.totals.comments + analytics.totals.reposts).toLocaleString() : "Unavailable", note: analytics.totals ? "reactions + comments + reposts" : "Import analytics to see this" },
    { label: "Awaiting approval", value: String(awaiting.n), href: "/posts?tab=awaiting_approval" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting(user.timezone)}, {user.name.split(" ")[0]}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className={`badge ${status.cls}`}>{status.text}</span>
          <span>Mode: Approval Required</span>
          <span>· Next: {next ? `${fmt(next.scheduledAt!)}, ${next.topic}` : "nothing scheduled"}</span>
        </div>
        {problems.map((p) => <p key={p} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{p}</p>)}
      </div>

      {!recentExp && (
        <Link href="/inbox" className="card block bg-gradient-to-r from-brand-blue/10 to-brand-purple/10 p-4 text-sm">
          <b>Anything happen this week worth sharing?</b> Add it to your Inbox and Viralyn can turn it into a post. →
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <div className="text-xs font-medium text-slate-500">{s.label}</div>
            <div className={`mt-1 font-semibold tabular-nums ${s.value === "Unavailable" ? "text-base text-slate-400" : "text-2xl"}`}>
              {s.href ? <Link href={s.href}>{s.value}</Link> : s.value}
            </div>
            {s.note && <div className="text-[11px] text-slate-400">{s.note}</div>}
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Next post pipeline{next ? `: ${next.topic}` : ""}</h2>
          {!next && <Link href="/calendar" className="text-sm font-medium text-brand-blue">Plan your week →</Link>}
        </div>
        <ol className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {Object.entries(stages).map(([s, st], i) => (
            <li key={s} className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-[11px] text-slate-400">{i + 1}</div>
              <div className="text-sm font-medium">{s}</div>
              <div className={`text-xs ${st.cls}`}>{st.text}</div>
            </li>
          ))}
        </ol>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Recent activity</h2><Link href="/activity" className="text-sm text-brand-blue">All activity →</Link></div>
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
