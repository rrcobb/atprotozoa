import test from "node:test";
import assert from "node:assert/strict";
import { harvest, cleanText, tokenize, fill, harvestStyle, harvestSubstance, habitWords, mulberry32 } from "../public/lib/remix.js";

const A = ["lol the weather is so bad today!!", "honestly the traffic is so bad today lol", "the coffee is so good today!!", "ok the mood is so weird today lol"];
const B = ["Kubernetes operators reconcile state. Kubernetes again.", "I love Rust borrow checker errors", "Rust borrow checker saves me"];

test("cleanText strips links and mentions", () => {
  assert.equal(cleanText("hi @bob.bsky.social see https://x.com/a ok"), "hi see ok");
});

test("tokenize round-trips", () => {
  const t = "hey, it's #fun 🎉\nok";
  assert.equal(tokenize(t).map((x) => x.s).join(""), t);
});

test("harvest keeps A's skeleton and takes B's substance", () => {
  const r = harvest({ styleTexts: A, substanceTexts: B, count: 6, seed: 7 });
  assert.ok(r.works.length > 0);
  for (const w of r.works) {
    assert.match(w.text, /today/);
    assert.match(w.text, /so/);
    assert.ok(/kubernetes|rust|borrow|checker|operators|reconcile|state|errors|saves|again/i.test(w.text), w.text);
  }
  assert.equal(r.lowerStyle, true);
  assert.ok(r.works.every((w) => w.text === w.text.toLowerCase()));
});

test("deterministic per seed", () => {
  const a = harvest({ styleTexts: A, substanceTexts: B, count: 4, seed: 3 }).works.map((w) => w.text);
  const b = harvest({ styleTexts: A, substanceTexts: B, count: 4, seed: 3 }).works.map((w) => w.text);
  assert.deepEqual(a, b);
});

test("throws with nothing to swap", () => {
  assert.throws(() => harvest({ styleTexts: ["the and of"], substanceTexts: B }));
});
