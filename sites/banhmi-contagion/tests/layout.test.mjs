import test from "node:test";
import assert from "node:assert";
import { makeLayout } from "../public/layout.js";
import { buildModel } from "../public/model.js";

const D = 86400e3;
const mk = (did, day, links = []) => ({ uri: `at://${did}/app.bsky.feed.post/${day}`, did, handle: did, name: "", text: "banh mi", createdAt: day * D, links: new Set(links) });

test("d3 layout: interacting accounts end up closer than strangers", () => {
  const g = (p, k) => [mk(p + "0", k), ...[1, 2, 3, 4].map((i) => mk(p + i, k + i, [p + "0", p + (i - 1)]))];
  const m = buildModel([...g("a", 0), ...g("b", 10)]);
  const L = makeLayout(m, 1);
  while (L.step(50)) { /* settle */ }
  const at = (id) => m.nodes.find((n) => n.did === id);
  const d = (p, q) => Math.hypot(at(p).x - at(q).x, at(p).y - at(q).y);
  assert.ok(d("a0", "a3") < d("a0", "b3"), `${d("a0", "a3")} vs ${d("a0", "b3")}`);
  assert.ok(m.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
});
