import { db, schema } from "@/db";

export async function logAction(userId: string, action: string, message: string, opts: { postId?: string; status?: "ok" | "warn" | "error" } = {}) {
  await db.insert(schema.agentLogs).values({ userId, action, message, postId: opts.postId ?? null, status: opts.status ?? "ok" });
}
