import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/register", "/api/auth"];

// Cheap cookie-presence gate; every page and API route still validates the session server-side.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.has("viralyn_session") && !pathname.startsWith("/api")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
