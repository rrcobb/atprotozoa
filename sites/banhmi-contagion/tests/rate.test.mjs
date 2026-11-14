import test from "node:test";
import assert from "node:assert";
import { series, jumps, character, cause } from "../public/rate.js";
import { buildModel } from "../public/model.js";

const D = 86400e3;
const mk = (did, day, links = []) => ({ uri: `at://${did}/app.bsky.feed.post/${day}${links.length}`, did, handle: did, name: "", text: "banh mi", createdAt: day * D, links: new Set(links) });

test("series: counts, d1, d2, and the unfinished bin is dropped", () => {
  const posts = [mk("a", 0), mk("a", 1), mk("b", 1), mk("c", 1), mk("a", 2.5)];
  const s = series(posts, 0, 2.5 * D, D);
  assert.deepEqual(s.count, [1, 3]);
  assert.deepEqual(s.d1, [0, 2]);
});

test("a spike is the top jump and its drop is explained by the burst before it", () => {
  const posts = [];
  for (let d = 0; d < 10; d++) posts.push(mk("base", d));
  for (let k = 0; k < 12; k++) posts.push(mk("u" + k, 5.5, ["base"]));
  const m = buildModel(posts);
  const s = series(m.posts, m.posts[0].createdAt, 10 * D, D);
  const [up, down] = jumps(s, 2).sort((x, y) => y.d1 - x.d1);
  assert.equal(up.i, 5);
  assert.equal(down.i, 6);
  assert.ok(up.d1 > 0 && down.d1 < 0);
  assert.match(cause(m, s, up).text, /13 posts from 13 accounts/);
  assert.equal(cause(m, s, up).seed.handle, "base");
  assert.match(cause(m, s, down).text, /didn't repeat/);
  assert.match(character(s).verdict, /burst|spike|steady/);
});

test("flat series reads as steady", () => {
  const posts = []; for (let d = 0; d < 40; d++) { posts.push(mk("a", d)); posts.push(mk("b", d)); }
  assert.match(character(series(posts, 0, 40 * D, D)).verdict, /steady/);
});

import { smooth } from "../public/rate.js";

test("smooth: w=0 is identity, w=1 averages neighbours and shrinks at the ends", () => {
  assert.deepEqual(smooth([1, 2, 3], 0), [1, 2, 3]);
  assert.deepEqual(smooth([0, 3, 0], 1), [1.5, 1, 1.5]);
});

test("series with smoothing derives d1 from the smoothed counts", () => {
  const posts = [mk("a", 0), mk("a", 1), mk("b", 1), mk("c", 1), mk("a", 2)];
  const s = series(posts, 0, 3 * D, D, 1);
  assert.deepEqual(s.count, [2, 5 / 3, 2]); // [1,3,1] smoothed
});

test("communities: a tight pair and a tight trio land in separate groups", () => {
  const posts = [mk("a", 0), mk("b", 1, ["a"]), mk("a", 2, ["b"]), mk("x", 3), mk("y", 4, ["x"]), mk("z", 5, ["x", "y"]), mk("x", 6, ["z"]), mk("lone", 7)];
  const m = buildModel(posts);
  const c = Object.fromEntries(m.nodes.map((n) => [n.did, n.comm]));
  assert.equal(c.a, c.b);
  assert.equal(c.x, c.y); assert.equal(c.y, c.z);
  assert.notEqual(c.a, c.x);
  assert.notEqual(c.lone, c.a);
  assert.equal(m.edges.find((e) => e.a === "a" && e.b === "b").n, 1);
});
