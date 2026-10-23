import test from "node:test";
import assert from "node:assert";
import { summarizePosts, scoreTenets, overall, rankFor } from "../public/lib/honor.js";

const now = Date.parse("2026-03-15T00:00:00Z");

test("summarizePosts counts replies, tribute, alt text, months", () => {
  const recs = [
    { createdAt: "2026-01-02T00:00:00Z", reply: {}, text: "x" },
    { createdAt: "2026-03-02T00:00:00Z", facets: [{ features: [{ $type: "app.bsky.richtext.facet#mention" }] }] },
    { createdAt: "2026-03-03T00:00:00Z", embed: { $type: "app.bsky.embed.images", images: [{ alt: "a cat" }, { alt: "" }] } },
    { createdAt: "2026-03-04T00:00:00Z", embed: { $type: "app.bsky.embed.record" } },
  ];
  const s = summarizePosts(recs, now);
  assert.deepStrictEqual(s, { n: 4, replies: 1, tribute: 2, images: 2, alted: 1, activeMonths: 2, spanMonths: 3 });
});

test("scoreTenets handles empty data as null and claimed as 0/1", () => {
  const s = summarizePosts([], now);
  const sc = scoreTenets({ follows: 0, followers: 10, mutuals: 0 }, s, false);
  assert.strictEqual(sc.reciprocity, null);
  assert.strictEqual(sc.standing, 0);
  assert.strictEqual(sc.tribute, null);
  assert.strictEqual(sc.claimed, 0);
});

test("overall ignores nulls; rank bands", () => {
  assert.strictEqual(overall({ a: 1, b: null, c: 0 }), 0.5);
  assert.strictEqual(rankFor(0.9).name, "Paragon of the Cluster");
  assert.strictEqual(rankFor(0).name, "Dishonored Lurker");
});

test("claimed lifts the overall", () => {
  const s = summarizePosts([], now);
  const a = overall(scoreTenets({ follows: 10, followers: 10, mutuals: 5 }, s, false));
  const b = overall(scoreTenets({ follows: 10, followers: 10, mutuals: 5 }, s, true));
  assert.ok(b > a);
});
