// Unit tests for public/lib/scoring.js — the house decorum-meter and the
// judge-reply parser are the only logic in this site worth testing without a
// browser; everything else is rendering you'd catch on sight.
import { test } from "node:test";
import assert from "node:assert/strict";
import { heuristicScore, parseJudgeReply, rankFor, nextRankFor, newScenario, RANKS } from "../public/lib/scoring.js";

test("an empty remark scores zero and is marked Vulgar", () => {
  const r = heuristicScore("   ");
  assert.equal(r.score, 0);
  assert.equal(r.verdict, "Vulgar");
});

test("a short, blunt remark scores low", () => {
  const r = heuristicScore("You're stupid.");
  assert.ok(r.score <= 30, `expected a low score, got ${r.score}`);
});

test("crude language is capped low even if otherwise wordy", () => {
  const r = heuristicScore(
    "I dare say, considering your rather impertinent and quite scandalous behaviour, you are simply an idiot.",
  );
  assert.ok(r.score <= 28, `expected the crude cap to apply, got ${r.score}`);
  assert.equal(r.verdict, "Vulgar");
});

test("an elegant, indirect remark scores well above a blunt one", () => {
  const elegant = heuristicScore(
    "How novel of you to notice — I dare say one simply forgets such things, considering your own background.",
  );
  const blunt = heuristicScore("You're stupid.");
  assert.ok(elegant.score > blunt.score, `${elegant.score} should exceed ${blunt.score}`);
});

test("scores are always clamped to 0-100", () => {
  const long = heuristicScore("quite ".repeat(80));
  assert.ok(long.score >= 0 && long.score <= 100);
});

test("parseJudgeReply reads the strict SCORE/VERDICT/REACTION format", () => {
  const parsed = parseJudgeReply("SCORE: 91\nVERDICT: Triumph\nREACTION: The room falls silent, then erupts.");
  assert.equal(parsed.score, 91);
  assert.equal(parsed.verdict, "Triumph");
  assert.equal(parsed.reaction, "The room falls silent, then erupts.");
});

test("parseJudgeReply clamps an out-of-range score", () => {
  const parsed = parseJudgeReply("SCORE: 150\nVERDICT: Triumph\nREACTION: Too much.");
  assert.equal(parsed.score, 100);
});

test("parseJudgeReply throws on a reply with no SCORE line, so callers can fall back", () => {
  assert.throws(() => parseJudgeReply("That was a fine remark, I suppose."));
});

test("rankFor picks the highest rank the standing has reached", () => {
  assert.equal(rankFor(0).title, "Not Received");
  assert.equal(rankFor(149).title, "Not Received");
  assert.equal(rankFor(150).title, "Barely Tolerated");
  assert.equal(rankFor(RANKS[RANKS.length - 1].min + 500).title, RANKS[RANKS.length - 1].title);
});

test("nextRankFor returns null once at the top rank", () => {
  assert.equal(nextRankFor(RANKS[RANKS.length - 1].min), null);
  assert.equal(nextRankFor(0).title, "Barely Tolerated");
});

test("newScenario always substitutes the {n} placeholder", () => {
  for (let i = 0; i < 20; i++) {
    const s = newScenario();
    assert.ok(!s.text.includes("{n}"));
    assert.ok(s.text.includes(s.name));
  }
});
