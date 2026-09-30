"use client";
import { useEffect, useRef, useState } from "react";
import type { PostDTO } from "@/lib/types";
import { PostCard } from "./PostCard";

type Msg = { id: string; role: "user" | "assistant"; content: string; toolCalls?: unknown[] | null; createdAt: string; error?: boolean };

const postIds = (calls: unknown[] | null | undefined) =>
  (calls ?? []).flatMap((c) => (c && typeof c === "object" && "postId" in c ? [String((c as { postId: string }).postId)] : []));

const SUGGESTIONS = [
  "Write a how-to post about writing better commit messages",
  "Got my first client for my attendance app today. Turn it into a storytelling post",
  "What posts have I drafted so far?",
];

export function ChatPanel({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [posts, setPosts] = useState<Record<string, PostDTO>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState("You");
  const bottom = useRef<HTMLDivElement>(null);

  async function load(q = "") {
    const res = await fetch(`/api/chat${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
      setPosts(Object.fromEntries(data.posts.map((p: PostDTO) => [p.id, p])));
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
    fetch("/api/me").then((r) => r.ok && r.json()).then((d) => d?.name && setAuthor(d.name));
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput(""); setBusy(true);
    const temp: Msg = { id: `tmp-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, temp]);
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessages((m) => [...m, { id: `err-${Date.now()}`, role: "assistant", content: data.error ?? "Request failed.", createdAt: new Date().toISOString(), error: true }]);
      return;
    }
    setPosts((p) => ({ ...p, ...Object.fromEntries(data.posts.map((x: PostDTO) => [x.id, x])) }));
    setMessages((m) => [...m, data.message]);
  }

  function updatePost(p: PostDTO & { __new?: boolean }) {
    setPosts((all) => ({ ...all, [p.id]: p }));
    if (p.__new) setMessages((m) => [...m, { id: `dup-${p.id}`, role: "assistant", content: "Here's the duplicate.", toolCalls: [{ postId: p.id }], createdAt: new Date().toISOString() }]);
  }

  return (
    <div className={`flex min-h-0 flex-col ${compact ? "h-full" : "card h-[calc(100dvh-8rem)]"}`}>
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-blue to-brand-purple text-sm text-white">✦</div>
        <div className="mr-auto">
          <div className="text-sm font-semibold">Ask Viralyn</div>
          <div className="text-[11px] text-slate-500">Drafts are reviewed and never published without your approval</div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); load(query); }} className="hidden sm:block">
          <input className="input w-40 py-1.5 text-xs" placeholder="Search chat…" value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) load(); }} />
        </form>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {loaded && messages.length === 0 && (
          <div className="mx-auto max-w-md py-10 text-center">
            <h2 className="text-lg font-semibold">What should we write today?</h2>
            <p className="mb-5 text-sm text-slate-500">Tell me what happened, what you care about, or a topic to cover.</p>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="btn-ghost w-full justify-start text-left text-xs">{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "max-w-[85%] space-y-3" : "max-w-full space-y-3"}>
              <div className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-gradient-to-r from-brand-blue to-brand-purple text-white" : m.error ? "bg-red-50 text-red-700" : "bg-white text-slate-800 shadow-card"}`}>
                {m.content}
              </div>
              {postIds(m.toolCalls).map((id) => posts[id] && (
                <PostCard key={id} post={posts[id]} authorName={author} onChange={updatePost} />
              ))}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-brand-purple" />Viralyn is working: writing and reviewing can take a little while…</div>}
        <div ref={bottom} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-slate-200 p-3">
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={compact ? 2 : 2} maxLength={4000}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder='e.g. "Write a post about my Expo build failure, storytelling format"' className="input resize-none" />
          <button className="btn-primary h-10" disabled={busy || !input.trim()}>Send</button>
        </div>
      </form>
    </div>
  );
}
