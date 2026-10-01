import { test } from "node:test";
import assert from "node:assert/strict";
import { basicChecks, linkedinUrnFrom } from "./checks";

const by = (checks: ReturnType<typeof basicChecks>, name: string) => checks.find((c) => c.check === name)!;

test("flags avoided words as whole words only", () => {
  assert.equal(by(basicChecks("Some politics talk here and more words to pass length.", { avoidTopics: ["politics"] }), "Relevance").result, "fail");
  assert.equal(by(basicChecks("Geopolitical maps are fun and this sentence is long enough to pass.", { avoidTopics: ["politic"] }), "Relevance").result, "pass");
});

test("length, hashtags, paragraphs, repeated openings", () => {
  assert.equal(by(basicChecks("x".repeat(3001)), "Length").result, "fail");
  assert.equal(by(basicChecks("short"), "Length").result, "warn");
  assert.equal(by(basicChecks("A post that is long enough to count as a real post here. #a #b #c #d"), "Spam").result, "warn");
  assert.equal(by(basicChecks(Array(70).fill("word").join(" ")), "Readability").result, "warn");
  assert.equal(by(basicChecks("Same hook\n\nbody text that is long enough to be a reasonable LinkedIn post.", { recentOpenings: ["same hook"] }), "Spam").result, "warn");
});

test("parses LinkedIn post links", () => {
  assert.equal(linkedinUrnFrom("https://www.linkedin.com/feed/update/urn:li:activity:7100000000000000001/"), "urn:li:activity:7100000000000000001");
  assert.equal(linkedinUrnFrom("https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A7100000000000000002"), "urn:li:share:7100000000000000002");
  assert.equal(linkedinUrnFrom("https://www.linkedin.com/posts/madan_react-activity-7100000000000000003-AbCd?utm_source=share"), "urn:li:activity:7100000000000000003");
  assert.equal(linkedinUrnFrom("https://example.com/whatever"), null);
});
