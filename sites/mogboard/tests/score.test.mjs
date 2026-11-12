import test from "node:test";
import assert from "node:assert";
import { countWords, perDay, scoreboard, daysBetween } from "../public/lib/score.js";

test("countWords skips urls and bare punctuation", () => {
  assert.equal(countWords("hello there https://x.com/a — ok"), 3);
  assert.equal(countWords(""), 0);
});

test("perDay drops replies to other people, keeps self-replies", () => {
  const rec = (text, parent) => ({ value: { text, createdAt: "2026-11-05T12:00:00", reply: parent && { parent: { uri: parent } } } });
  const m = perDay("did:a", [rec("one two"), rec("three", "at://did:b/app.bsky.feed.post/1"), rec("four five six", "at://did:a/app.bsky.feed.post/2")], "2026-11-01", "2026-11-30");
  assert.deepEqual(m.get("2026-11-05"), { words: 5, posts: 2, images: 0 });
});

test("scoreboard counts mogs, wins and streaks", () => {
  const mk = (arr) => new Map(arr.map(([d, w]) => [d, { words: w, posts: 1, images: 0 }]));
  const days = daysBetween("2026-11-01", "2026-11-03");
  assert.deepEqual(days, ["2026-11-01", "2026-11-02", "2026-11-03"]);
  const a = { handle: "a", days: mk([["2026-11-01", 100], ["2026-11-02", 10]]) };
  const b = { handle: "b", days: mk([["2026-11-01", 50], ["2026-11-02", 10], ["2026-11-03", 5]]) };
  const s = scoreboard([a, b], days);
  const ra = s.ranked.find((r) => r.handle === "a");
  assert.equal(ra.mogs, 1);
  assert.equal(ra.wins, 1);
  assert.equal(s.ranked.find((r) => r.handle === "b").wins, 1);
  assert.equal(s.winners[1].tie, true);
  assert.equal(s.h2h[0][1], 1);
  assert.equal(s.ranked.find((r) => r.handle === "b").streak, 3);
});
