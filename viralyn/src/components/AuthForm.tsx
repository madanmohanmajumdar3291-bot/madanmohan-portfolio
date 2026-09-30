"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "./Logo";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Something went wrong.");
    router.push(mode === "register" ? "/onboarding" : "/");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-navy-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center text-white"><Logo /></div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <h1 className="text-xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="text-sm text-slate-500">Your AI co-writer for LinkedIn.</p>
          </div>
          {mode === "register" && (
            <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" required className="input" autoComplete="name" /></div>
          )}
          <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="email" /></div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required minLength={mode === "register" ? 8 : 1} className="input" autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Get started"}</button>
          <p className="text-center text-sm text-slate-500">
            {mode === "login" ? <>New here? <Link className="font-medium text-brand-blue" href="/register">Create an account</Link></> : <>Have an account? <Link className="font-medium text-brand-blue" href="/login">Sign in</Link></>}
          </p>
        </form>
      </div>
    </main>
  );
}
