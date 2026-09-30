import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { completeAuthorization, LinkedInError } from "@/lib/linkedin";
import { logAction } from "@/lib/log";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/settings?linkedin=${q}`, req.url));
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code || !state) return back("denied");
  try {
    await completeAuthorization(user.id, code, state);
    // Resume any publishing that was paused because the token expired.
    await db.update(schema.settings).set({ paused: false }).where(eq(schema.settings.userId, user.id));
    await logAction(user.id, "linkedin", "LinkedIn connected.");
    return back("connected");
  } catch (err) {
    await logAction(user.id, "linkedin", `LinkedIn connection failed: ${(err as Error).message}`, { status: "error" });
    return back(err instanceof LinkedInError ? "failed" : "error");
  }
}
