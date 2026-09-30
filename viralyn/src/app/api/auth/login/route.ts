import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession } from "@/lib/auth";
import { errorResponse, HttpError, parseBody, rateLimit } from "@/lib/api";

const Body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, Body);
    rateLimit(`login:${body.email}`, 10, 15 * 60_000);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, body.email));
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) throw new HttpError(401, "Email or password is incorrect.");
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) { return errorResponse(err); }
}
