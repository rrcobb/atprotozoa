import test from "node:test";
import assert from "node:assert";
import { classify } from "../public/lib/sentiment.js";

test("warm replies", () => {
  assert.equal(classify("this is great, love it!"), "pos");
  assert.equal(classify("😍🔥"), "pos");
});
test("cold replies", () => {
  assert.equal(classify("this is garbage and you're an idiot"), "neg");
});
test("negation flips", () => {
  assert.equal(classify("this is not good"), "neg");
  assert.equal(classify("I don't hate it"), "pos");
});
test("neutral stays neutral", () => {
  assert.equal(classify("what time is the meeting tomorrow?"), "neu");
  assert.equal(classify("@someone.bsky.social https://example.com"), "neu");
});
