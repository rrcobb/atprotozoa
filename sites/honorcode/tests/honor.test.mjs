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

import { findClaims, isClaimText, buildTimeline } from "../public/lib/honor.js";

test("claims need a quote of the handle's post with just the word claim", () => {
  const did = "did:plc:me";
  const q = (text, uri) => ({ uri: "at://norvid/app.bsky.feed.post/" + text, value: { text, createdAt: "2026-02-01T00:00:00Z", embed: { $type: "app.bsky.embed.record", record: { uri } } } });
  const posts = [
    q("claim", `at://${did}/app.bsky.feed.post/1`),
    q("Claim.", `at://${did}/app.bsky.feed.post/2`),
    q("claim this", `at://${did}/app.bsky.feed.post/3`),
    q("claim", "at://did:plc:other/app.bsky.feed.post/4"),
    { uri: "x", value: { text: "claim", createdAt: "2026-02-01T00:00:00Z" } },
  ];
  assert.strictEqual(findClaims(posts, did).length, 2);
  assert.ok(isClaimText(" “Claim!” "));
  assert.ok(!isClaimText("claimed"));
});

test("timeline scores monthly and hatches badges, claim included", () => {
  const now = Date.parse("2026-04-15T00:00:00Z");
  const recs = [
    { createdAt: "2026-01-02T00:00:00Z", text: "a" },
    { createdAt: "2026-02-02T00:00:00Z", reply: {}, text: "b" },
  ];
  const claims = [{ t: Date.parse("2026-03-10T00:00:00Z"), target: "at://did:plc:me/app.bsky.feed.post/1" }];
  const { points, badges } = buildTimeline(recs, claims, now);
  assert.strictEqual(points.length, 4);
  assert.ok(points[3].score > points[1].score);
  const titles = badges.map((b) => b.title);
  assert.ok(titles.includes("First Word") && titles.includes("Claimed") && titles.includes("First Answer"));
  assert.strictEqual(buildTimeline([], [], now).points.length, 0);
});
