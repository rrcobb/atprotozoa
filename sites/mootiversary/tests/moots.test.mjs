import test from "node:test";
import assert from "node:assert";
import { tidToMs, computeMoots, byDay, dayKey } from "../public/moots.js";

test("tidToMs decodes a known TID", () => {
  // 3jzfcijpj2z2a ~ 2023-05-xx (bsky TID)
  const ms = tidToMs("3jzfcijpj2z2a");
  assert.ok(ms > Date.UTC(2023, 0, 1) && ms < Date.UTC(2023, 11, 31));
  assert.equal(tidToMs("self"), null);
  assert.equal(tidToMs("3jzfcijpj2z2!"), null);
});

test("moot date is the later follow", () => {
  const mine = new Map([["a", 1000], ["b", 5000], ["c", 7000]]);
  const theirs = new Map([["a", 3000], ["b", 2000]]);
  const r = computeMoots(mine, new Set(["a", "b"]), theirs);
  assert.deepEqual(r.map((x) => [x.did, x.ms, x.approx]), [["a", 3000, false], ["b", 5000, false]]);
  const r2 = computeMoots(mine, new Set(["c"]), new Map());
  assert.deepEqual(r2, [{ did: "c", ms: 7000, approx: true }]);
});

test("byDay groups", () => {
  const d = Date.UTC(2024, 1, 3, 12);
  const m = byDay([{ did: "a", ms: d }, { did: "b", ms: d + 1000 }]);
  assert.equal(m.get(dayKey(d)).length, 2);
});
