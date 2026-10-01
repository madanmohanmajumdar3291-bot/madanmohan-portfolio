import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, fromOpenAI, toOpenAI } from "./nvidia";

test("converts tool use and results to OpenAI format", () => {
  const out = toOpenAI("sys", [
    { role: "user", content: "write a post" },
    { role: "assistant", content: [{ type: "text", text: "On it." }, { type: "tool_use", id: "t1", name: "draft_post", input: { topic: "x" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "done", is_error: true }] },
  ]);
  assert.deepEqual(out, [
    { role: "system", content: "sys" },
    { role: "user", content: "write a post" },
    { role: "assistant", content: "On it.", tool_calls: [{ id: "t1", type: "function", function: { name: "draft_post", arguments: '{"topic":"x"}' } }] },
    { role: "tool", tool_call_id: "t1", content: "ERROR: done" },
  ]);
});

test("normalizes tool calls and stop reasons", () => {
  const r = fromOpenAI({ choices: [{ message: { content: "", tool_calls: [{ id: "c1", function: { name: "get_post_history", arguments: '{"limit":3}' } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  assert.equal(r.stop_reason, "tool_use");
  assert.deepEqual(r.content, [{ type: "tool_use", id: "c1", name: "get_post_history", input: { limit: 3 } }]);
  assert.deepEqual(r.usage, { input_tokens: 10, output_tokens: 5 });
  assert.equal(fromOpenAI({ choices: [{ message: { content: "hi" }, finish_reason: "length" }] }).stop_reason, "max_tokens");
});

test("flags invalid tool arguments instead of throwing", () => {
  const r = fromOpenAI({ choices: [{ message: { tool_calls: [{ id: "c", function: { name: "x", arguments: "{bad" } }] } }] });
  assert.deepEqual(r.content[0], { type: "tool_use", id: "c", name: "x", input: { __invalid_json: "{bad" } });
});

test("extracts JSON from fenced or chatty replies", () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here: {"a":{"b":2}} thanks'), { a: { b: 2 } });
  assert.throws(() => extractJson("no json here"));
});
