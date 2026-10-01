"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PostDTO } from "@/lib/types";
import { PostCard } from "./PostCard";
import { PostEditor } from "./PostEditor";

const TABS = [
  { key: "all", label: "All", match: () => true },
  { key: "drafts", label: "Drafts", match: (p: PostDTO) => ["draft", "needs_revision", "planned"].includes(p.status) },
  { key: "awaiting_approval", label: "Awaiting approval", match: (p: PostDTO) => p.status === "awaiting_approval" },
  { key: "approved", label: "Approved", match: (p: PostDTO) => p.status === "approved" },
  { key: "scheduled", label: "Scheduled", match: (p: PostDTO) => p.status === "scheduled" },
  { key: "published", label: "Published", match: (p: PostDTO) => p.status === "published" },
  { key: "failed", label: "Failed", match: (p: PostDTO) => p.status === "failed" },
];

export function PostsList({ authorName }: { authorName: string }) {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "all");
  const [posts, setPosts] = useState<PostDTO[] | null>(null);
  const [writing, setWriting] = useState(false);

  useEffect(() => { fetch("/api/posts").then((r) => r.json()).then(setPosts); }, []);

  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  const shown = (posts ?? []).filter(active.match);

  function change(p: PostDTO & { __new?: boolean }) {
    setPosts((all) => p.__new ? [p, ...(all ?? [])] : (all ?? []).map((x) => (x.id === p.id ? p : x)));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">✍️ Posts</h1>
        <button className="btn-primary" onClick={() => setWriting(true)}>+ Write a post</button>
      </div>
      {writing && <PostEditor onClose={() => setWriting(false)} onCreated={(p) => { setPosts((all) => [p, ...(all ?? [])]); setWriting(false); setTab("all"); }} />}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-card">
        {TABS.map((t) => {
          const n = (posts ?? []).filter(t.match).length;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${tab === t.key ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {t.label} <span className="opacity-60">{n}</span>
            </button>
          );
        })}
      </div>
      {posts === null ? <p className="text-sm text-slate-500">Loading…</p>
        : shown.length === 0 ? <div className="card p-8 text-center text-sm text-slate-500">No posts here yet.</div>
        : <div className="space-y-4">{shown.map((p) => (
            <div key={p.id}>
              <PostCard post={p} authorName={authorName} onChange={change} onDelete={(id) => setPosts((all) => (all ?? []).filter((x) => x.id !== id))} />
              <div className="mt-1 px-1 text-[11px] text-slate-400">Created {new Date(p.createdAt).toLocaleString()} · updated {new Date(p.updatedAt).toLocaleString()}</div>
            </div>
          ))}</div>}
    </div>
  );
}
