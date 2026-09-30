import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { authed } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth";

// Deletes the user and, via ON DELETE CASCADE, every row they own.
export const DELETE = authed(async (_req, user) => {
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  (await cookies()).delete(SESSION_COOKIE);
  return { ok: true };
}, { limit: 3 });
