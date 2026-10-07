import test from "node:test";
import assert from "node:assert/strict";
import { tokenize, Markov, train } from "../public/lib/model.js";

test("tokenize normalises urls and mentions", () => {
  const t = tokenize("Hey @bob.bsky.social look https://x.com/a?b=1 #Cool 😀!");
  assert.deepEqual(t.map((x) => x.t), ["hey", "‹@›", "look", "‹url›", "#cool", "😀", "!"]);
});

test("markov: familiar text is less surprising than unseen text, and remove/restore round-trips", () => {
  const m = new Markov();
  const seqs = [];
  for (let i = 0; i < 30; i++) seqs.push(m.add(tokenize("good morning everyone hope you slept well").map((x) => x.t)));
  const fam = m.surprisal(tokenize("good morning everyone").map((x) => x.t));
  const odd = m.surprisal(tokenize("quasar bicycle ferment").map((x) => x.t));
  assert.ok(fam.mean < odd.mean);
  assert.equal(odd.oov, 1);
  const before = m.surprisal(tokenize("good morning everyone").map((x) => x.t)).mean;
  m.remove(seqs[0]); m.restore(seqs[0]);
  assert.equal(m.surprisal(tokenize("good morning everyone").map((x) => x.t)).mean, before);
});

test("train learns that exclamation posts do better in a synthetic corpus, and learn() lowers surprise", async () => {
  const posts = [];
  const words = "cat dog bird fish tree rain sun moon star cloud river stone".split(" ");
  for (let i = 0; i < 600; i++) {
    const excl = i % 2 === 0;
    const text = `${words[i % 12]} ${words[(i * 5) % 12]} ${words[(i * 7) % 12]}${excl ? "!" : ""}`;
    posts.push({ uri: "at://x/p/" + i, text, likes: excl ? 20 : 2, a: "a" + (i % 3) });
  }
  const m = await train(posts, { epochs: 6 });
  assert.ok(m.stats.r > 0.5, "held-out r " + m.stats.r);
  const a = m.score("cat dog bird!"), b = m.score("cat dog bird");
  assert.ok(a.lift > b.lift);
  const weird = "zebra quokka nebula";
  const s0 = m.score(weird).surprisal;
  m.learn(weird); m.learn(weird);
  assert.ok(m.score(weird).surprisal < s0);
});
