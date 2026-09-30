import { authed } from "@/lib/api";

export const GET = authed(async (_req, user) => user);
