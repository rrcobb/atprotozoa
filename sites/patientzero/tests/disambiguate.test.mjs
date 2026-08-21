// Unit tests for the no-embeddings sense-clustering heuristic —
// @fieldleveltech.org asked for vector embeddings to split "NPCs" (the
// video-game term vs the political P-zombie meme) into distinct outbreaks;
// builder/INSTRUCTIONS.md bans Workers AI/embeddings outright, so this tests
// the keyword-co-occurrence stand-in instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, signalTokens, clusterPosts } from "../public/lib/disambiguate.js";

function post(text) {
  return { record: { text } };
}

// ---- tokenize / signalTokens -----------------------------------------------

test("tokenize lowercases, strips urls and mentions, splits on punctuation", () => {
  assert.deepEqual(
    tokenize("Check https://example.com/x out @someone.bsky.social said NPCs!!"),
    ["check", "out", "said", "npcs"],
  );
});

test("signalTokens drops stopwords and phrase tokens, keeps content words", () => {
  const phraseTokens = new Set(["npcs"]);
  const bag = signalTokens("these npcs in the game have great dialogue and quests", phraseTokens);
  assert.equal(bag.has("npcs"), false); // phrase word dropped
  assert.equal(bag.has("the"), false); // stopword dropped
  assert.equal(bag.has("game"), true);
  assert.equal(bag.has("dialogue"), true);
  assert.equal(bag.has("quests"), true);
});

// ---- clusterPosts -----------------------------------------------------------

function gamePost(i) {
  return post(`npcs in this game have such good dialogue, the quest design and boss fights are great too #${i}`);
}
function politicalPost(i) {
  return post(`libs are all npcs honestly, conservative brained zombies who never think for themselves #${i}`);
}

test("clusterPosts refuses to split a too-small sample (avoids noise)", () => {
  const posts = [gamePost(1), gamePost(2), politicalPost(1), politicalPost(2)];
  const result = clusterPosts(posts, "npcs");
  assert.equal(result.clustered, false);
});

test("clusterPosts splits a genuinely bimodal phrase into two senses", () => {
  const posts = [];
  for (let i = 0; i < 15; i++) posts.push(gamePost(i));
  for (let i = 0; i < 15; i++) posts.push(politicalPost(i));

  const result = clusterPosts(posts, "npcs");
  assert.equal(result.clustered, true);
  assert.ok(result.senses.length >= 2);

  const totalClustered = result.senses.reduce((n, s) => n + s.posts.length, 0);
  assert.ok(totalClustered >= 20); // most of the 30 posts landed in a sense

  // every post in the "game" sense actually mentions a game-flavored term
  const gameSense = result.senses.find((s) => s.terms.includes("game") || s.terms.includes("dialogue") || s.terms.includes("quest"));
  assert.ok(gameSense, "expected a sense labeled with game vocabulary");
  for (const p of gameSense.posts) {
    assert.ok(/game|dialogue|quest|boss/.test(p.record.text));
  }

  // every post in the "political" sense actually mentions political vocabulary
  const politicalSense = result.senses.find((s) => s !== gameSense);
  for (const p of politicalSense.posts) {
    assert.ok(/libs|conservative|zombies/.test(p.record.text));
  }
});

test("clusterPosts declines to split a phrase that's really just one topic", () => {
  const posts = [];
  for (let i = 0; i < 30; i++) posts.push(post(`everyone is saying skibidi today, skibidi toilet skibidi #${i}`));
  const result = clusterPosts(posts, "skibidi");
  assert.equal(result.clustered, false);
});

test("clusterPosts never assigns a post to more than one sense", () => {
  const posts = [];
  for (let i = 0; i < 15; i++) posts.push(gamePost(i));
  for (let i = 0; i < 15; i++) posts.push(politicalPost(i));
  const result = clusterPosts(posts, "npcs");
  const seen = new Set();
  for (const sense of result.senses) {
    for (const p of sense.posts) {
      assert.equal(seen.has(p), false, "post assigned to two senses");
      seen.add(p);
    }
  }
});
