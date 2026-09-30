import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession } from "@/lib/auth";
import { errorResponse, HttpError, parseBody, rateLimit } from "@/lib/api";

const Body = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  timezone: z.string().max(64).optional(),
});

export async function POST(req: Request) {
  try {
    rateLimit(`register:${req.headers.get("x-forwarded-for") ?? "local"}`, 10, 60 * 60_000);
    const body = await parseBody(req, Body);
    const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, body.email));
    if (existing) throw new HttpError(409, "An account with this email already exists.");
    const [user] = await db.insert(schema.users).values({
      name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 12), timezone: body.timezone || "UTC",
    }).returning();
    await db.insert(schema.settings).values({ userId: user.id });
    await db.insert(schema.voiceProfiles).values({ userId: user.id });
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) { return errorResponse(err); }
}
