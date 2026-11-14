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
