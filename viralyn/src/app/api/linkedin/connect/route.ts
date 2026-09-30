import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { authorizationUrl, linkedinConfigured } from "@/lib/linkedin";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!linkedinConfigured()) return NextResponse.redirect(new URL("/settings?linkedin=unconfigured", req.url));
  return NextResponse.redirect(await authorizationUrl(user.id));
}
