import test from "node:test";
import assert from "node:assert";
import { tally, normalizeHandle } from "../public/lib/bloom.js";

test("tally weights likes and replies, drops cold-only accounts", () => {
  const rows = tally(
    [{ did: "a" }, { did: "a" }, { did: "b" }],
    [{ did: "a", mood: "pos" }, { did: "c", mood: "neg" }, { did: "b", mood: "neu" }],
  );
  assert.deepEqual(rows.map((r) => [r.did, r.score]), [["a", 5], ["b", 2.5]]);
});
test("handle input loses a leading @", () => {
  assert.equal(normalizeHandle("  @Alice.bsky.social "), "alice.bsky.social");
});
