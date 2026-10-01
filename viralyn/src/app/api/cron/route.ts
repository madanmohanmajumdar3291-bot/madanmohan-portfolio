import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runScheduler } from "@/lib/publisher";

export const maxDuration = 300;

// Called every minute by `npm run worker` or an external cron service, with the shared CRON_SECRET.
// GET is accepted too, because many cron services only send GET.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runScheduler());
}

export const GET = POST;
