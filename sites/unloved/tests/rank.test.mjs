import test from "node:test";
import assert from "node:assert";
import { rank, isUnloved } from "../public/lib/rank.js";

test("isUnloved needs zero likes, reposts and quotes", () => {
  assert.ok(isUnloved({ likeCount: 0, repostCount: 0, quoteCount: 0 }));
  assert.ok(!isUnloved({ likeCount: 1, repostCount: 0, quoteCount: 0 }));
  assert.ok(!isUnloved({ likeCount: 0, repostCount: 0, quoteCount: 2 }));
});

test("smaller followers rank first", () => {
  const r = rank([
    { authorDid: "a", followers: 5000, indexedAt: 1 },
    { authorDid: "b", followers: 3, indexedAt: 1 },
  ]);
  assert.equal(r[0].authorDid, "b");
});

test("many posts from one small follower still let a bigger follower in", () => {
  const items = [0, 1, 2, 3, 4].map((i) => ({ authorDid: "small", followers: 2, indexedAt: i }));
  items.push({ authorDid: "mid", followers: 200, indexedAt: 1 });
  const r = rank(items);
  const midPos = r.findIndex((x) => x.authorDid === "mid");
  assert.ok(midPos < 5);
});
