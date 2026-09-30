import test from "node:test";
import assert from "node:assert";
import { generate, analyzeAvatar, analyzePosts, rng } from "../public/lib/fakehub.js";

const posts = Array.from({ length: 30 }, (_, i) => ({
  text: `thinking about pipelines and gardens number ${i}? 🎉`,
  createdAt: new Date(Date.now() - i * 86400000).toISOString(),
}));
const profile = { did: "did:plc:abc123", handle: "a.test", description: "hello. i make things", followersCount: 5 };

test("deterministic per did", () => {
  const a = generate({ profile, posts, avatar: null });
  const b = generate({ profile, posts, avatar: null });
  assert.deepStrictEqual(a.prs, b.prs);
  assert.strictEqual(a.counts.length, 371);
});

test("shape", () => {
  const m = generate({ profile, posts, avatar: analyzeAvatar(new Uint8ClampedArray(32 * 32 * 4).fill(200)) });
  assert.strictEqual(m.repos.length, 6);
  assert.strictEqual(m.prs.length, 6);
  assert.ok(m.arch.name);
  assert.ok(m.total > 0);
});

test("no posts still works", () => {
  const m = generate({ profile, posts: [], avatar: null });
  assert.strictEqual(m.commits.length, 8);
});

test("avatar stats", () => {
  const px = new Uint8ClampedArray(4 * 4); // 4 red pixels
  for (let i = 0; i < 4; i++) { px[i * 4] = 255; px[i * 4 + 3] = 255; }
  const a = analyzeAvatar(px);
  assert.ok(a.sat > 0.9 && a.warmth > 0.9);
  assert.strictEqual(analyzePosts(posts).n, 30);
  assert.ok(rng("x")() < 1);
});
