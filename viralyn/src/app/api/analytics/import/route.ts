import { z } from "zod";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, HttpError, parseBody } from "@/lib/api";
import { engagementRate, linkedinIdFrom, parseCsv, toMetricRows } from "@/lib/analytics";
import { logAction } from "@/lib/log";

const Body = z.object({ csv: z.string().min(1).max(2_000_000) });

// Imports LinkedIn's analytics export (saved as CSV). Rows are matched to published posts by LinkedIn post id.
export const POST = authed(async (req, user) => {
  const { csv } = await parseBody(req, Body);
  const { rows, missing } = toMetricRows(parseCsv(csv));
  if (missing.length) throw new HttpError(400, `Couldn't read this file: it needs ${missing.join(", ")}.`);

  const posts = await db.select({ id: schema.posts.id, urn: schema.posts.linkedinPostId }).from(schema.posts)
    .where(and(eq(schema.posts.userId, user.id), isNotNull(schema.posts.linkedinPostId)));
  const byId = new Map(posts.map((p) => [linkedinIdFrom(p.urn!), p.id]));

  let matched = 0;
  const unmatched: string[] = [];
  for (const r of rows) {
    const postId = byId.get(linkedinIdFrom(r.ref));
    if (!postId) { unmatched.push(r.ref); continue; }
    await db.insert(schema.analytics).values({
      postId, impressions: r.impressions ?? null, reactions: r.reactions ?? null, comments: r.comments ?? null, reposts: r.reposts ?? null,
      engagementRate: engagementRate(r), source: "import",
    });
    matched++;
  }
  await logAction(user.id, "analytics", `Imported analytics: ${matched} matched, ${unmatched.length} unmatched.`);
  return { matched, unmatched: unmatched.slice(0, 20), unmatchedCount: unmatched.length, total: rows.length };
}, { limit: 10 });
