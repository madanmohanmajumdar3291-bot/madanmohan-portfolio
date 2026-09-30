import { requireUser } from "@/lib/auth";
import { getAccount } from "@/lib/linkedin";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const li = await getAccount(user.id);
  const linkedin = !li ? "none" : li.status === "connected" ? "connected" : "expired";
  return <Shell user={{ name: user.name }} linkedin={linkedin}>{children}</Shell>;
}
