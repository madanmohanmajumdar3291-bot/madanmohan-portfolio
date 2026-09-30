"use client";
import { useRouter } from "next/navigation";

export function AccountActions() {
  const router = useRouter();
  async function del() {
    if (prompt('This permanently deletes your account and all data. Type "DELETE" to confirm.') !== "DELETE") return;
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) { router.push("/register"); router.refresh(); } else alert("Delete failed.");
  }
  return (
    <div className="flex flex-wrap gap-3">
      <a className="btn-ghost" href="/api/account/export">Export all my data (JSON)</a>
      <button className="btn-danger" onClick={del}>Delete account & all data</button>
    </div>
  );
}
