import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";

export default async function InboxPage() {
  const user = await requireUser();
  const items = await db.select().from(schema.experiences).where(eq(schema.experiences.userId, user.id)).orderBy(desc(schema.experiences.createdAt));
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">📥 Experience Inbox</h1>
      <p className="mb-6 text-sm text-slate-500">Things that actually happened to you. Personal posts are written only from these. For now, add experiences by telling Viralyn in chat; a full Inbox with voice notes is coming in Phase 3.</p>
      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">Your Inbox is empty. Tell Viralyn something that happened this week.</div>
      ) : (
        <ul className="space-y-3">
          {items.map((e) => (
            <li key={e.id} className="card flex items-start gap-3 p-4">
              <p className="flex-1 whitespace-pre-wrap text-sm">{e.content}</p>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-slate-500">
                <span className="badge bg-slate-100 text-slate-600">{e.status}</span>
                {e.pillar && <span>{e.pillar}</span>}
                <span>{e.createdAt.toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
