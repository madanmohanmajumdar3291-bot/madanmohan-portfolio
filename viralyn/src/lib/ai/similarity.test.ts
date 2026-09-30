import { test } from "node:test";
import assert from "node:assert/strict";
import { copiedPhrases, similarity } from "./similarity";

test("identical text is fully similar", () => {
  assert.equal(similarity("one two three four", "one two three four"), 1);
});

test("unrelated text has no similarity", () => {
  assert.equal(similarity("shipping the attendance app today", "failed an interview on state management"), 0);
});

test("detects copied 8-word phrases", () => {
  const sample = "I learned that the hardest part of building software is talking to users early";
  const draft = "Honestly, the hardest part of building software is talking to users early and often.";
  assert.equal(copiedPhrases(draft, [sample]).length > 0, true);
  assert.deepEqual(copiedPhrases("Totally different words here for sure okay then", [sample]), []);
});
