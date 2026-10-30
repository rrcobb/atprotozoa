import test from "node:test";
import assert from "node:assert/strict";
import { graphemeCount, findLinks, findMentions, STAGES } from "../public/lib/checks.js";

const stage = (id) => STAGES.find((s) => s.id === id);

test("graphemes count emoji clusters as one", () => {
  assert.equal(graphemeCount("a👨‍👩‍👧b"), 3);
});
test("length fails over 300", () => {
  assert.equal(stage("length").run("x".repeat(301)).status, "fail");
  assert.equal(stage("length").run("x".repeat(100)).status, "pass");
  assert.equal(stage("length").run("   ").status, "fail");
});
test("links and mentions found", () => {
  assert.deepEqual(findLinks("see https://example.com/a?utm_source=x."), ["https://example.com/a?utm_source=x"]);
  assert.deepEqual(findMentions("hi @Alice.bsky.social, and @bob.dev!"), ["alice.bsky.social", "bob.dev"]);
  assert.equal(stage("links").run("https://example.com/?utm_source=x").status, "warn");
});
test("secrets flagged", () => {
  assert.equal(stage("secrets").run("mail me a@b.com").status, "fail");
  assert.equal(stage("secrets").run("hello @bob.dev").status, "pass");
});
