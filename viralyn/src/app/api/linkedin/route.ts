import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed } from "@/lib/api";
import { getAccount, linkedinConfigured } from "@/lib/linkedin";
import { logAction } from "@/lib/log";

export const GET = authed(async (_req, user) => {
  const acc = await getAccount(user.id);
  return { configured: linkedinConfigured(), status: acc?.status ?? "none", expiresAt: acc?.expiresAt ?? null, scopes: acc?.scopes ?? [] };
});

export const DELETE = authed(async (_req, user) => {
  await db.delete(schema.linkedinAccounts).where(eq(schema.linkedinAccounts.userId, user.id));
  await logAction(user.id, "linkedin", "LinkedIn disconnected.");
  return { ok: true };
});
