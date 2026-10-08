import test from "node:test";
import assert from "node:assert";
import { lint, summarize, isSimple } from "../public/linter.js";

test("simple words are flagged, incl. inflections", () => {
  assert.ok(isSimple("the"));
  assert.ok(isSimple("Stopped"));
  assert.ok(isSimple("tries"));
  assert.ok(!isSimple("euthyphro"));
});

test("elaborate prose passes", () => {
  const s = summarize(lint("Perspicacious obfuscation notwithstanding, ontological heterogeneity prevails."));
  assert.equal(s.violations, 0);
  assert.equal(s.score, 100);
});

test("plain prose fails", () => {
  const s = summarize(lint("Stop the engine and check the oil."));
  assert.equal(s.clean, 0);
  assert.equal(s.score, 0);
});

test("empty input scores 100", () => {
  assert.equal(summarize(lint("")).score, 100);
});
