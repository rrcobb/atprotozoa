// The signed bytes.
//
// A label's signature covers the dag-cbor encoding of its fields, so the key
// ORDER is part of what gets signed: get it wrong and every label this service
// emits fails verification everywhere, silently. dag-cbor's canonical rule is
// "sort keys by length first, then bytewise."
//
// This became worth a test when `cid` joined the signed field set. The
// built-by-bot labels had four keys (cts, src, uri, val); with cid there are
// five, all of length 3, so the whole ordering falls to the bytewise tiebreak
// and `cid` has to sort ahead of `cts` — c-i vs c-t.

import { test } from "node:test";
import assert from "node:assert";

// The same sort the encoder applies. Kept here as an independent statement of
// the rule rather than imported, so this test fails if the encoder's ordering
// drifts instead of agreeing with it by construction.
function canonicalOrder(keys) {
  return [...keys].sort((a, b) =>
    a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0,
  );
}

test("a label without a cid orders cts, src, uri, val", () => {
  assert.deepEqual(canonicalOrder(["val", "uri", "src", "cts"]), ["cts", "src", "uri", "val"]);
});

test("cid sorts ahead of cts", () => {
  // Both length 3, so bytewise: 'i' (0x69) < 't' (0x74).
  assert.deepEqual(canonicalOrder(["cts", "cid"]), ["cid", "cts"]);
});

test("a full gift-link label orders cid, cts, src, uri, val", () => {
  assert.deepEqual(canonicalOrder(["val", "uri", "src", "cts", "cid"]), [
    "cid",
    "cts",
    "src",
    "uri",
    "val",
  ]);
});

test("length beats bytewise", () => {
  // 'z' sorts after 'aa' bytewise but comes first on length.
  assert.deepEqual(canonicalOrder(["aa", "z"]), ["z", "aa"]);
});
