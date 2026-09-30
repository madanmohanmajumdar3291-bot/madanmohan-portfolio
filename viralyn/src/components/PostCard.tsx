"use client";
import { useState } from "react";
import { STATUS_LABEL, type PostDTO } from "@/lib/types";
import { FORMATS } from "@/lib/ai/formats";

const toLocalInput = (iso: string | null) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const ICON = { pass: "✓", warn: "!", fail: "✕" } as const;
const TONE = { pass: "text-emerald-600 bg-emerald-50", warn: "text-amber-600 bg-amber-50", fail: "text-red-600 bg-red-50" } as const;

export function PostCard({ post, authorName, onChange, onDelete }: {
  post: PostDTO; authorName: string; onChange: (p: PostDTO) => void; onDelete?: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(post.content);
  const [expanded, setExpanded] = useState(false);
  const [showReview, setShowReview] = useState(post.status === "needs_revision");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState(toLocalInput(post.scheduledAt));
  const [draftFormat, setDraftFormat] = useState<string>("how-to");
  const [draftTopic, setDraftTopic] = useState("");
  const status = STATUS_LABEL[post.status];
  const long = post.content.length > 320;

  async function act(action: string, extra: object = {}) {
    setBusy(action); setError("");
    const res = await fetch(`/api/posts/${post.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setError(data.error ?? "Action failed.");
    if (action === "duplicate") return onChange({ ...data, __new: true } as PostDTO);
    onChange(data); setEditing(false); setText(data.content);
  }

  async function remove() {
    if (!confirm("Delete this post? This can't be undone.")) return;
    setBusy("delete");
    const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    setBusy("");
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Delete failed.");
    onDelete?.(post.id);
  }

  if (post.status === "planned") {
    return (
      <article className="card border-dashed p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className={`badge ${status.cls}`}>{status.text}</span>
          <span className="font-medium text-slate-700">{post.pillar}</span>
          {post.scheduledAt && <span>· slot {new Date(post.scheduledAt).toLocaleString()}</span>}
        </div>
        <p className="mb-3 text-sm text-slate-500">An open slot. Nothing is written until you give it a topic.</p>
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1" placeholder="Topic for this slot" value={draftTopic} onChange={(e) => setDraftTopic(e.target.value)} />
          <select className="input w-auto" value={draftFormat} onChange={(e) => setDraftFormat(e.target.value)}>
            {FORMATS.map((f) => <option key={f}>{f}</option>)}
          </select>
          <button className="btn-primary" disabled={!!busy || draftTopic.trim().length < 3} onClick={() => act("draft", { format: draftFormat, topic: draftTopic })}>
            {busy === "draft" ? "Writing & reviewing…" : "Draft it"}
          </button>
          {onDelete && <button className="btn-danger" disabled={!!busy} onClick={remove}>Remove</button>}
        </div>
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </article>
    );
  }

  const checks = post.reviewResults ?? [];
  const fails = checks.filter((c) => c.result === "fail").length;
  const warns = checks.filter((c) => c.result === "warn").length;

  return (
    <article className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
        <span className={`badge ${status.cls}`}>{status.text}</span>
        {post.isDemo && <span className="badge bg-purple-100 text-purple-700">DEMO DATA</span>}
        <span className="font-medium text-slate-700">{post.topic}</span>
        <span>· {post.format}{post.pillar ? ` · ${post.pillar}` : ""}</span>
      </div>

      {/* LinkedIn-style preview */}
      <div className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand-blue to-brand-purple font-semibold text-white">{authorName.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="text-sm font-semibold">{authorName}</div>
            <div className="text-xs text-slate-500">{post.status === "published" ? "Posted on LinkedIn" : "Preview · not posted"}</div>
          </div>
        </div>
        {editing ? (
          <textarea className="input min-h-[220px] font-[inherit] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} />
        ) : (
          <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800">
            {long && !expanded ? <>{post.content.slice(0, 320)}… <button className="text-slate-500 hover:underline" onClick={() => setExpanded(true)}>see more</button></> : post.content}
          </div>
        )}
        {editing && <div className="mt-1 text-right text-xs text-slate-400">{text.length}/3000</div>}
      </div>

      {checks.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2">
          <button className="text-xs font-medium text-slate-600" onClick={() => setShowReview((v) => !v)}>
            Review: {checks.length - fails - warns} passed{warns ? `, ${warns} warning${warns > 1 ? "s" : ""}` : ""}{fails ? `, ${fails} failed` : ""} {showReview ? "▴" : "▾"}
          </button>
          {showReview && (
            <ul className="mt-2 space-y-1">
              {checks.map((c) => (
                <li key={c.check} className="flex items-start gap-2 text-xs">
                  <span className={`badge ${TONE[c.result]} w-5 justify-center`}>{ICON[c.result]}</span>
                  <span className="w-20 shrink-0 font-medium text-slate-700">{c.check}</span>
                  <span className="text-slate-500">{c.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {post.status === "failed" && post.lastError && (
        <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"><b>Publishing failed:</b> {post.lastError}</p>
      )}
      {post.status === "scheduled" && post.scheduledAt && (
        <p className="mx-4 mb-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Scheduled for {new Date(post.scheduledAt).toLocaleString()}. You&apos;ll be notified 2 hours before; unschedule any time to cancel.
          {post.lastError && <> Last attempt failed: {post.lastError} (retrying)</>}
        </p>
      )}
      {post.status === "published" && (
        <p className="mx-4 mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Published {post.publishedAt ? new Date(post.publishedAt).toLocaleString() : ""}.{" "}
          {post.linkedinPostId && <a className="font-medium underline" target="_blank" rel="noreferrer" href={`https://www.linkedin.com/feed/update/${encodeURIComponent(post.linkedinPostId)}/`}>View on LinkedIn</a>}
          <span className="block text-emerald-700/70">Sync status: unverified. If you edit or delete it on LinkedIn, Viralyn can&apos;t see that (LinkedIn restricts read access for personal accounts).</span>
        </p>
      )}
      {scheduling && (
        <div className="mx-4 mb-2 flex flex-wrap items-center gap-2">
          <input type="datetime-local" className="input w-auto" value={when} onChange={(e) => setWhen(e.target.value)} />
          <button className="btn-primary" disabled={!!busy} onClick={async () => { await act("schedule", { at: new Date(when).toISOString() }); setScheduling(false); }}>Confirm schedule</button>
          <button className="btn-ghost" onClick={() => setScheduling(false)}>Cancel</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
        {editing ? (
          <>
            <button className="btn-primary" disabled={!!busy || !text.trim()} onClick={() => act("edit", { content: text })}>{busy === "edit" ? "Reviewing…" : "Save & re-review"}</button>
            <button className="btn-ghost" onClick={() => { setEditing(false); setText(post.content); }}>Cancel</button>
          </>
        ) : (
          <>
            {post.status === "awaiting_approval" && <button className="btn-primary" disabled={!!busy} onClick={() => act("approve")}>{busy === "approve" ? "…" : "Approve"}</button>}
            {["approved", "failed"].includes(post.status) && <button className="btn-primary" disabled={!!busy} onClick={() => confirm("Publish this to your LinkedIn now?") && act("publish")}>{busy === "publish" ? "Publishing…" : post.status === "failed" ? "Retry publish" : "Publish now"}</button>}
            {["approved", "failed", "scheduled"].includes(post.status) && <button className="btn-ghost" disabled={!!busy} onClick={() => setScheduling(true)}>{post.status === "scheduled" ? "Reschedule" : "Schedule"}</button>}
            {post.status === "scheduled" && <button className="btn-ghost" disabled={!!busy} onClick={() => act("unschedule")}>Unschedule</button>}
            {post.status === "approved" && <button className="btn-ghost" disabled={!!busy} onClick={() => act("unapprove")}>Undo approval</button>}
            {!["published", "publishing", "scheduled"].includes(post.status) && <button className="btn-ghost" disabled={!!busy} onClick={() => setEditing(true)}>Edit</button>}
            {post.status === "needs_revision" && <button className="btn-ghost" disabled={!!busy} onClick={() => act("review")}>{busy === "review" ? "Reviewing…" : "Re-run review"}</button>}
            <button className="btn-ghost" disabled={!!busy} onClick={() => act("duplicate")}>Duplicate</button>
            {onDelete && post.status !== "published" && <button className="btn-danger ml-auto" disabled={!!busy} onClick={remove}>Delete</button>}
          </>
        )}
      </div>
    </article>
  );
}
