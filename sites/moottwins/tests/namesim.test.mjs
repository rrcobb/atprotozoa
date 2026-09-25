// Unit tests for public/lib/namesim.js's findNameTwins — the display-name
// lookalike detector, independent of any pfp comparison.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findNameTwins, normalize, levenshtein } from "../public/lib/namesim.js";

test("normalize lowercases, strips accents and punctuation", () => {
  assert.equal(normalize("José García!"), "jose garcia");
  assert.equal(normalize("  Sam_Lee-99  "), "sam lee 99");
});

test("levenshtein is 0 for identical strings and counts edits otherwise", () => {
  assert.equal(levenshtein("sam", "sam"), 0);
  assert.equal(levenshtein("sam lee", "sam lea"), 1);
});

test("flags near-identical display names one letter apart", () => {
  const people = [{ displayName: "Sam Lee" }, { displayName: "Sam Lea" }];
  const twins = findNameTwins(people);
  assert.equal(twins.length, 1);
  assert.equal(twins[0].reason, "edit");
});

test("flags a short name sitting inside a longer one (nickname case)", () => {
  const people = [{ displayName: "Samantha" }, { displayName: "Sam" }];
  const twins = findNameTwins(people);
  assert.equal(twins.length, 1);
  assert.equal(twins[0].reason, "contains");
});

test("does not flag unrelated names", () => {
  const people = [{ displayName: "Alex Kim" }, { displayName: "Totally Different" }];
  assert.equal(findNameTwins(people).length, 0);
});

test("falls back to handle when displayName is missing", () => {
  const people = [{ handle: "alexkim.bsky.social" }, { handle: "alexkimm.bsky.social" }];
  assert.equal(findNameTwins(people).length, 1);
});

test("greedily matches so one popular name doesn't eat the whole list", () => {
  const people = [
    { displayName: "Alex" },
    { displayName: "Alex" },
    { displayName: "Alex" },
  ];
  const twins = findNameTwins(people);
  assert.equal(twins.length, 1);
});

test("ignores names shorter than the minimum length", () => {
  const people = [{ displayName: "Jo" }, { displayName: "Jr" }];
  assert.equal(findNameTwins(people).length, 0);
});
