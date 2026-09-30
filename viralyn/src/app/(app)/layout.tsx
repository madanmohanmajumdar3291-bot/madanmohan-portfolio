import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [li] = await db.select({ status: schema.linkedinAccounts.status }).from(schema.linkedinAccounts).where(eq(schema.linkedinAccounts.userId, user.id));
  const linkedin = !li ? "none" : li.status === "connected" ? "connected" : "expired";
  return <Shell user={{ name: user.name }} linkedin={linkedin}>{children}</Shell>;
}
