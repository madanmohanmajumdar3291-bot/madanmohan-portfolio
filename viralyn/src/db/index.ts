import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client = globalForDb.pg ?? postgres(process.env.DATABASE_URL ?? "postgres://localhost/viralyn", {
  max: 10,
  prepare: false, // required by connection poolers (e.g. Neon pgbouncer) in transaction mode
});
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export { schema };
