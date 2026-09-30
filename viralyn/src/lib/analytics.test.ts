import { test } from "node:test";
import assert from "node:assert/strict";
import { confidence, describeComparison, engagementRate, groupStats, linkedinIdFrom, parseCsv, toMetricRows } from "./analytics";

test("parses quoted CSV", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\n'), [["a", "b"], ["x, y", 'he said "hi"']]);
});

test("maps export headers", () => {
  const { rows, missing } = toMetricRows(parseCsv("Post URL,Impressions,Reactions,Comments,Reposts\nhttps://www.linkedin.com/feed/update/urn:li:share:7100000000000000001,\"1,200\",30,4,2\n"));
  assert.deepEqual(missing, []);
  assert.deepEqual(rows[0], { ref: "https://www.linkedin.com/feed/update/urn:li:share:7100000000000000001", impressions: 1200, reactions: 30, comments: 4, reposts: 2 });
});

test("reports a missing reference column", () => {
  assert.deepEqual(toMetricRows(parseCsv("Impressions\n5\n")).missing, ["a post URL or post id column"]);
});

test("extracts ids from urls and urns", () => {
  assert.equal(linkedinIdFrom("urn:li:share:7100000000000000001"), "7100000000000000001");
  assert.equal(linkedinIdFrom("https://www.linkedin.com/posts/me_topic-activity-7100000000000000002-abcd"), "7100000000000000002");
  assert.equal(linkedinIdFrom("nonsense"), null);
});

test("engagement rate and confidence", () => {
  assert.equal(engagementRate({ impressions: 100, reactions: 5, comments: 3, reposts: 2 }), 0.1);
  assert.equal(engagementRate({ impressions: 0 }), null);
  assert.equal(confidence(3), "low");
  assert.equal(confidence(10), "medium");
});

test("comparison states sample size and confidence", () => {
  const items = [{ f: "list", r: 0.1 }, { f: "list", r: 0.2 }, { f: "news", r: 0.05 }];
  const s = groupStats(items, (x) => x.f, (x) => x.r, () => null);
  assert.match(describeComparison("posts", s)!, /2 vs 1 posts, low confidence/);
});
