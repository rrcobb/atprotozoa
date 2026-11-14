import test from "node:test";
import assert from "node:assert/strict";
import { tokenize, detokenize, buildCorpus, Parrot, Trainer, unigramLoss, parrotScore } from "../public/lib/model.js";

function lcg(seed) { let s = seed; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); }
function corpus(n, rand) {
  const subj = ["i", "the cat", "my dog", "everyone", "nobody"], verb = ["loves", "hates", "ignores", "watches"], obj = ["coffee", "the moon", "bluesky", "tiny models", "linear algebra"];
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = (a) => a[Math.floor(rand() * a.length)];
    out.push(`${p(subj)} ${p(verb)} ${p(obj)}. https://x.com/a/b #tag @me.bsky.social`);
  }
  return out;
}

test("tokenize drops urls, keeps hashtags and mentions", () => {
  assert.deepEqual(tokenize("Hello, world! https://a.com/x #Foo @bar.bsky.social don’t"), ["hello", ",", "world", "!", "#foo", "@bar.bsky.social", "don't"]);
});
test("detokenize spaces punctuation", () => {
  assert.equal(detokenize(["hello", ",", "world", "!"]), "hello, world!");
});
test("model beats the unigram baseline and talks back", () => {
  const rand = lcg(7);
  const c = buildCorpus(corpus(400, rand));
  const held = c.posts.filter((_, i) => i % 10 === 3), train = c.posts.filter((_, i) => i % 10 !== 3);
  const m = new Parrot(c.vocab, c.counts);
  const tr = new Trainer(m, train, { epochs: 4, budgetMs: 1e9, rand });
  while (!tr.run(50));
  const ml = held.reduce((a, s) => a + m.postLoss(s), 0) / held.length;
  const base = unigramLoss(c.counts, held);
  assert.ok(ml < base * 0.8, `model ${ml} vs unigram ${base}`);
  assert.ok(parrotScore(ml, base) > 20);
  const out = m.generate([c.index.get("coffee")], { rand });
  assert.ok(out.length > 3, out);
  assert.ok(!out.includes("<"), out);
});
