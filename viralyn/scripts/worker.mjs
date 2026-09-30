// Background scheduler: ticks the app's cron endpoint every minute. Run alongside `npm start`.
const url = `${process.env.APP_URL ?? "http://localhost:3000"}/api/cron`;
const secret = process.env.CRON_SECRET;
if (!secret) { console.error("CRON_SECRET is required"); process.exit(1); }

async function tick() {
  try {
    const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.due) console.log(new Date().toISOString(), res.status, JSON.stringify(body));
  } catch (err) {
    console.error(new Date().toISOString(), "tick failed:", err.message);
  }
}
await tick();
setInterval(tick, 60_000);
