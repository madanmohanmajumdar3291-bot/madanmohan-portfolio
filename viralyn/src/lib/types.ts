import type { InferSelectModel } from "drizzle-orm";
import type { posts } from "@/db/schema";

type Post = InferSelectModel<typeof posts>;
/** A post as it arrives over JSON (dates become strings). */
export type PostDTO = { [K in keyof Post]: Post[K] extends Date ? string : Post[K] extends Date | null ? string | null : Post[K] };

export const STATUS_LABEL: Record<Post["status"], { text: string; cls: string }> = {
  planned: { text: "Planned", cls: "bg-slate-100 text-slate-600" },
  draft: { text: "Draft", cls: "bg-slate-100 text-slate-700" },
  needs_revision: { text: "Needs revision", cls: "bg-red-50 text-red-700" },
  awaiting_approval: { text: "Awaiting approval", cls: "bg-amber-50 text-amber-700" },
  approved: { text: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  scheduled: { text: "Scheduled", cls: "bg-blue-50 text-blue-700" },
  publishing: { text: "Publishing", cls: "bg-blue-50 text-blue-700" },
  published: { text: "Published", cls: "bg-emerald-100 text-emerald-800" },
  failed: { text: "Failed", cls: "bg-red-100 text-red-800" },
};
