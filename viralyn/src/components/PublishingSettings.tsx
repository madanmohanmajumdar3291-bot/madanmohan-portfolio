"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type LI = { configured: boolean; status: "none" | "connected" | "expired"; expiresAt: string | null; scopes: string[] };
const LI_MSG: Record<string, [boolean, string]> = {
  connected: [true, "LinkedIn connected."], denied: [false, "LinkedIn connection was cancelled."],
  failed: [false, "LinkedIn rejected the connection. Check the Activity log for the reason."], error: [false, "Something went wrong connecting LinkedIn."],
  unconfigured: [false, "LinkedIn isn't configured on this server (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET / ENCRYPTION_KEY)."],
};

export function PublishingSettings() {
  const params = useSearchParams();
  const [li, setLi] = useState<LI | null>(null);
  const [s, setS] = useState<{ frequency: string; postingTimes: string[]; maxPostsPerDay: number; paused: boolean; pausedUntil: string | null } | null>(null);
  const [tz, setTz] = useState("");
  const [msg, setMsg] = useState("");
  const flash = params.get("linkedin") ? LI_MSG[params.get("linkedin")!] : null;

  const load = () => {
    fetch("/api/linkedin").then((r) => r.json()).then(setLi);
    fetch("/api/settings").then((r) => r.json()).then(setS);
    fetch("/api/me").then((r) => r.json()).then((u) => setTz(u.timezone));
  };
  useEffect(load, []);
  if (!li || !s) return <p className="text-sm text-slate-500">Loading…</p>;

  async function save(body: object) {
    const res = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setMsg(res.ok ? "Saved." : (await res.json().catch(() => ({}))).error ?? "Save failed.");
    load();
  }
  async function disconnect() {
    if (!confirm("Disconnect LinkedIn? Scheduled posts will fail until you reconnect.")) return;
    await fetch("/api/linkedin", { method: "DELETE" }); load();
  }
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [tz];
  const pausedNow = s.paused || (s.pausedUntil && new Date(s.pausedUntil) > new Date());

  return (
    <div className="space-y-6">
      {flash && <p className={`rounded-lg px-3 py-2 text-sm ${flash[0] ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{flash[1]}</p>}
      <div>
        <h3 className="mb-2 text-sm font-semibold">LinkedIn</h3>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`badge ${li.status === "connected" ? "bg-emerald-50 text-emerald-700" : li.status === "expired" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
            {li.status === "connected" ? "Connected" : li.status === "expired" ? "Expired" : "Not connected"}
          </span>
          {li.expiresAt && li.status === "connected" && <span className="text-xs text-slate-500">Token valid until {new Date(li.expiresAt).toLocaleDateString()}</span>}
          {!li.configured ? <span className="text-xs text-slate-500">Unavailable: LinkedIn app credentials aren&apos;t configured on the server.</span>
            : <a className="btn-primary" href="/api/linkedin/connect">{li.status === "none" ? "Connect LinkedIn" : "Reconnect"}</a>}
          {li.status !== "none" && <button className="btn-ghost" onClick={disconnect}>Disconnect</button>}
        </div>
        <p className="mt-1 text-xs text-slate-500">Uses LinkedIn&apos;s official Sign In + Share on LinkedIn APIs. Viralyn never sees your password.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Frequency</label>
          <select className="input" value={s.frequency} onChange={(e) => save({ frequency: e.target.value })}>
            {["1/week", "3/week", "5/week", "daily"].map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Max posts per day</label>
          <input type="number" min={1} max={5} className="input" defaultValue={s.maxPostsPerDay} onBlur={(e) => save({ maxPostsPerDay: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} />
        </div>
        <div>
          <label className="label">Preferred times (comma separated, 24h)</label>
          <input className="input" defaultValue={s.postingTimes.join(", ")} placeholder="09:00, 17:30"
            onBlur={(e) => save({ postingTimes: e.target.value.split(",").map((t) => t.trim()).filter((t) => /^\d{2}:\d{2}$/.test(t)) })} />
        </div>
        <div>
          <label className="label">Time zone</label>
          <select className="input" value={tz} onChange={(e) => save({ timezone: e.target.value })}>
            {zones.map((z) => <option key={z}>{z}</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-500">Viralyn doesn&apos;t claim any time is universally &quot;optimal&quot;. Time-of-day performance appears in Analytics once you have your own data.</p>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">Status: <b>{pausedNow ? `Paused${s.pausedUntil && !s.paused ? ` until ${new Date(s.pausedUntil).toLocaleString()}` : ""}` : "Active"}</b></span>
        {pausedNow ? <button className="btn-primary" onClick={() => save({ paused: false, pausedUntil: null })}>Resume publishing</button>
          : <button className="btn-danger" onClick={() => save({ paused: true })}>⏸ Pause all publishing</button>}
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}
