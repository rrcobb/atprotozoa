// Unit tests for public/lib/global-index.js's computeEloBoard and
// public/lib/records.js's voteRkey — the two pieces of pure logic here that
// are worth checking by hand every time rather than eyeballing the page:
// the elo math itself, and the consent-gate rule that a vote about anyone
// not currently on the roster never counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEloBoard } from "../public/lib/global-index.js";
import { voteRkey } from "../public/lib/vote-key.js";

const A = "did:plc:aaaa";
const B = "did:plc:bbbb";
const C = "did:plc:cccc";

function v(subjectA, subjectB, winner, createdAt) {
  return { subjectA, subjectB, winner, createdAt: Date.parse(createdAt) };
}

test("a single win moves both elos symmetrically off 1000", () => {
  const board = computeEloBoard([v(A, B, A, "2026-01-01T00:00:00Z")], [A, B]);
  assert.equal(board.get(A).elo, 1016);
  assert.equal(board.get(B).elo, 984);
  assert.equal(board.get(A).wins, 1);
  assert.equal(board.get(B).losses, 1);
});

test("an opted-in account with zero battles still appears at the starting elo", () => {
  const board = computeEloBoard([], [A]);
  assert.equal(board.get(A).elo, 1000);
  assert.equal(board.get(A).wins, 0);
});

test("a vote about someone not on the roster is never counted — the consent gate", () => {
  // C never opted in — a vote naming C must not move C's (nonexistent) elo,
  // must not move A's elo either, and C must not appear on the board at all.
  const board = computeEloBoard([v(A, C, A, "2026-01-01T00:00:00Z")], [A, B]);
  assert.equal(board.get(A).elo, 1000);
  assert.equal(board.has(C), false);
});

test("an account dropping out of the roster stops its past battles from counting", () => {
  const votes = [v(A, B, A, "2026-01-01T00:00:00Z")];
  const stillIn = computeEloBoard(votes, [A, B]);
  const optedOut = computeEloBoard(votes, [A]); // B has since opted out
  assert.notEqual(stillIn.get(A).elo, 1000);
  assert.equal(optedOut.get(A).elo, 1000);
  assert.equal(optedOut.has(B), false);
});

test("votes replay in createdAt order regardless of array order", () => {
  const early = v(A, B, A, "2026-01-01T00:00:00Z");
  const late = v(A, B, B, "2026-01-02T00:00:00Z");
  const forward = computeEloBoard([early, late], [A, B]);
  const backward = computeEloBoard([late, early], [A, B]);
  assert.equal(forward.get(A).elo, backward.get(A).elo);
  assert.equal(forward.get(B).elo, backward.get(B).elo);
});

test("voteRkey is order-independent — A-vs-B and B-vs-A land on the same rkey", () => {
  const thread = "at://did:plc:root/app.bsky.feed.post/abc123";
  assert.equal(voteRkey(A, B, thread), voteRkey(B, A, thread));
});

test("voteRkey differs for a different thread on the same matchup", () => {
  const t1 = "at://did:plc:root/app.bsky.feed.post/abc123";
  const t2 = "at://did:plc:root/app.bsky.feed.post/xyz789";
  assert.notEqual(voteRkey(A, B, t1), voteRkey(A, B, t2));
});
