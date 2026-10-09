import test from "node:test";
import assert from "node:assert/strict";
import { levenshtein, didDistance, mutualsOf } from "../public/lib/lev.js";

test("levenshtein basics", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("abc", "abc"), 0);
});
test("didDistance ignores did:plc: prefix", () => {
  assert.equal(didDistance("did:plc:abcd", "did:plc:abce"), 1);
});
test("mutualsOf intersects", () => {
  assert.deepEqual(mutualsOf([{ did: "a" }, { did: "b" }], [{ did: "b" }]), [{ did: "b" }]);
});
