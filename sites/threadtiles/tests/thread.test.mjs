import { test } from "node:test";
import assert from "node:assert";
import { parsePostRef, collectTiles, gridDims, fitTile } from "../public/lib/thread.js";

test("parsePostRef", () => {
  assert.deepEqual(parsePostRef("https://bsky.app/profile/alice.bsky.social/post/3abc"), { actor: "alice.bsky.social", rkey: "3abc" });
  assert.deepEqual(parsePostRef("at://did:plc:xyz/app.bsky.feed.post/3abc"), { actor: "did:plc:xyz", rkey: "3abc" });
  assert.equal(parsePostRef("hello"), null);
});

const post = (id, t, imgs) => ({
  uri: `at://did:plc:a/app.bsky.feed.post/${id}`, author: { handle: "a.test" }, record: { createdAt: t },
  embed: imgs ? { $type: "app.bsky.embed.images#view", images: imgs.map((s) => ({ thumb: s, fullsize: s })) } : undefined,
});

test("collectTiles walks parents and replies, in time order", () => {
  const tree = {
    post: post("2", "2026-01-02", ["b"]),
    parent: { post: post("1", "2026-01-01", ["a1", "a2"]) },
    replies: [{ post: post("4", "2026-01-04", ["d"]), replies: [] }, { post: post("3", "2026-01-03", null), replies: [{ post: post("5", "2026-01-05", ["e"]) }] }, { notFound: true }],
  };
  const { tiles, postCount } = collectTiles(tree);
  assert.deepEqual(tiles.map((t) => t.src), ["a1", "a2", "b", "d", "e"]);
  assert.equal(postCount, 5);
});

test("grid sizing", () => {
  assert.deepEqual(gridDims(9), { cols: 3, rows: 3 });
  assert.equal(gridDims(0).cols, 0);
  assert.ok(fitTile(10, 10, 4, 400, 8192) * 10 + 44 <= 8192);
});

test("fitTile respects a pixel-area cap", () => {
  const t = fitTile(36, 28, 4, 360, 16384, 16e6);
  assert.ok((36 * t + 4 * 37) * (28 * t + 4 * 29) <= 16e6);
  assert.ok(t >= 16);
});
