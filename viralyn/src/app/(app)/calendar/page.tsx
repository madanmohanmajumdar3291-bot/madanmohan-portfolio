import { requireUser } from "@/lib/auth";
import { CalendarView } from "@/components/CalendarView";

export default async function Page() {
  const user = await requireUser();
  return <CalendarView authorName={user.name} tz={user.timezone} />;
}
