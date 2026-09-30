import { db, schema } from "@/db";

export type NotificationKind =
  | "approval_needed" | "about_to_publish" | "published" | "publish_failed"
  | "linkedin_expired" | "weekly_prompt";

/** In-app notifications. Email and browser push need a provider and are not wired up yet. */
export async function notify(userId: string, kind: NotificationKind, title: string, body: string, postId?: string) {
  await db.insert(schema.notifications).values({ userId, kind, title, body, postId: postId ?? null });
}
