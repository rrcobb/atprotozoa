import test from "node:test";
import assert from "node:assert";
import { isHotdogPost, findToppings, tally, assignTiers } from "../public/lib/toppings.js";

test("detects hotdog posts", () => {
  assert.ok(isHotdogPost("best hot dogs in town"));
  assert.ok(isHotdogPost("Hotdog time"));
  assert.ok(!isHotdogPost("I like sandwiches"));
});

test("finds toppings and sentiment", () => {
  const t = findToppings("hot dog with mustard and onions. no ketchup, ever");
  const by = Object.fromEntries(t.map((x) => [x.name, x.sentiment]));
  assert.ok("mustard" in by && "onions" in by);
  assert.strictEqual(by.ketchup, -1);
});

test("tally and tiers", () => {
  const mk = (did, text) => ({ uri: did + text, author: { did }, text });
  const rows = tally([mk("a", "hot dog mustard"), mk("b", "hotdog mustard"), mk("c", "hot dog relish"), mk("d", "hot dog with no ketchup, gross")]);
  assert.strictEqual(rows[0].name, "mustard");
  const tiers = assignTiers(rows);
  assert.ok(tiers.S.some((r) => r.name === "mustard"));
  assert.ok(tiers.F.some((r) => r.name === "ketchup"));
});

test("photo-spotted toppings count, without double-counting text", () => {
  const p = { uri: "x", author: { did: "a" }, text: "hot dog with mustard", visual: ["mustard", "relish"] };
  const rows = tally([p]);
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.strictEqual(by.mustard.mentions, 1);
  assert.ok(!by.mustard.posts[0].seen);
  assert.ok(by.relish.posts[0].seen);
});
