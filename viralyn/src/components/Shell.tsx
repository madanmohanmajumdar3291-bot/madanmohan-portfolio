"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";
import { ChatPanel } from "./ChatPanel";
import { Notifications } from "./Notifications";

const NAV = [
  { href: "/chat", label: "Ask Viralyn", icon: "💬" },
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/inbox", label: "Inbox", icon: "📥" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/posts", label: "Posts", icon: "✍️" },
  { href: "/analytics", label: "Analytics", icon: "📊" },
  { href: "/activity", label: "Activity", icon: "🧾" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const LI_STATUS = {
  connected: { text: "LinkedIn connected", dot: "bg-emerald-400" },
  expired: { text: "LinkedIn expired", dot: "bg-amber-400" },
  none: { text: "LinkedIn not connected", dot: "bg-slate-500" },
} as const;

export function Shell({ user, linkedin, children }: { user: { name: string }; linkedin: keyof typeof LI_STATUS; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const onChatPage = path.startsWith("/chat");
  const li = LI_STATUS[linkedin];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login"); router.refresh();
  }

  const sidebar = (
    <nav className="flex h-full w-64 flex-col bg-navy-900 px-4 py-5 text-slate-200">
      <div className="mb-8 px-2 text-white"><Logo /></div>
      <ul className="space-y-1">
        {NAV.map((n) => {
          const active = path.startsWith(n.href);
          return (
            <li key={n.href}>
              <Link href={n.href} onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active ? "bg-gradient-to-r from-brand-blue/25 to-brand-purple/25 text-white ring-1 ring-white/10" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
                <span aria-hidden>{n.icon}</span>{n.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto space-y-2">
      <Notifications />
      <div className="rounded-xl bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-blue to-brand-purple text-sm font-semibold text-white">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">{user.name}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><span className={`h-1.5 w-1.5 rounded-full ${li.dot}`} />{li.text}</div>
          </div>
        </div>
        <button onClick={logout} className="mt-3 w-full rounded-lg py-1.5 text-xs text-slate-400 hover:bg-white/5 hover:text-white">Sign out</button>
      </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="btn-ghost px-2 py-1" aria-label="Open menu">☰</button>
          <Logo subtitle={false} />
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10">{children}</main>
      </div>
      {!onChatPage && (
        <>
          <button onClick={() => setChatOpen((v) => !v)}
            className="btn-primary fixed bottom-5 right-5 z-40 rounded-full px-5 py-3 shadow-lg shadow-brand-purple/30">
            💬 {chatOpen ? "Close" : "Ask Viralyn"}
          </button>
          {chatOpen && (
            <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-2xl">
              <ChatPanel compact />
            </aside>
          )}
        </>
      )}
    </div>
  );
}
