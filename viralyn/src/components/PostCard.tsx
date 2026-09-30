"use client";
import { useState } from "react";
import { STATUS_LABEL, type PostDTO } from "@/lib/types";

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
            <div className="text-xs text-slate-500">Preview · not posted</div>
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
      {post.status === "approved" && (
        <p className="mx-4 mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Approved. Nothing has been posted: LinkedIn publishing is <b>Unavailable</b> until you connect an account (coming in a later release).
        </p>
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
            {post.status === "approved" && <button className="btn-ghost" disabled={!!busy} onClick={() => act("unapprove")}>Undo approval</button>}
            {!["published", "publishing"].includes(post.status) && <button className="btn-ghost" disabled={!!busy} onClick={() => setEditing(true)}>Edit</button>}
            {post.status === "needs_revision" && <button className="btn-ghost" disabled={!!busy} onClick={() => act("review")}>{busy === "review" ? "Reviewing…" : "Re-run review"}</button>}
            <button className="btn-ghost" disabled={!!busy} onClick={() => act("duplicate")}>Duplicate</button>
            {onDelete && <button className="btn-danger ml-auto" disabled={!!busy} onClick={remove}>Delete</button>}
          </>
        )}
      </div>
    </article>
  );
}
