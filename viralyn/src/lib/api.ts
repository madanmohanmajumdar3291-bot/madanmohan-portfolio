import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getUser, type SessionUser } from "./auth";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// In-memory fixed-window limiter. Swap for Redis when running multiple instances.
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { count: 1, reset: now + windowMs }); return; }
  if (++b.count > limit) throw new HttpError(429, "Too many requests. Please slow down.");
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const json = await req.json().catch(() => { throw new HttpError(400, "Invalid JSON"); });
  return schema.parse(json);
}

type Handler = (req: Request, user: SessionUser, ctx: { params: Promise<Record<string, string>> }) => Promise<unknown>;

// Wraps a route: requires auth, rate-limits, and turns errors into honest JSON responses.
export function authed(handler: Handler, opts: { limit?: number } = {}) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      const user = await getUser();
      if (!user) throw new HttpError(401, "Not signed in");
      rateLimit(`${user.id}:${new URL(req.url).pathname}`, opts.limit ?? 60, 60_000);
      const result = await handler(req, user, ctx);
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) return NextResponse.json({ error: "Invalid input", issues: err.issues }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: "Something went wrong on our side." }, { status: 500 });
}
