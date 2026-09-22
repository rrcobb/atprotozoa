// Unit tests for public/lib/mood.js — the pure tone-reading logic, tested
// without a browser since it never touches the DOM or the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeMood, moodFor, hsl, MOODS } from "../public/lib/mood.js";

test("analyzeMood returns null for an empty post list", () => {
  assert.equal(analyzeMood([]), null);
});

test("a clearly positive, low-key post reads positive valence, low intensity", () => {
  const mood = analyzeMood([{ text: "had a really nice, relaxing day, thanks everyone" }]);
  assert.ok(mood.valence > 0, `expected positive valence, got ${mood.valence}`);
  assert.ok(mood.intensity < 0.3, `expected low intensity, got ${mood.intensity}`);
});

test("a shouty, negative post reads negative valence, high intensity", () => {
  const mood = analyzeMood([{ text: "THIS IS TERRIBLE AND AWFUL AND I HATE IT!!!" }]);
  assert.ok(mood.valence < 0, `expected negative valence, got ${mood.valence}`);
  assert.ok(mood.intensity > 0.5, `expected high intensity, got ${mood.intensity}`);
});

test("neutral, flat text lands near the 'numb' anchor", () => {
  const mood = analyzeMood([{ text: "the meeting is at 3pm in room 4" }]);
  assert.equal(mood.label, "numb");
});

test("analyzeMood averages across every post given, not just the first", () => {
  const allHappy = analyzeMood([{ text: "great day, love this" }, { text: "amazing, so glad" }]);
  const mixed = analyzeMood([{ text: "great day, love this" }, { text: "worst day, hate this" }]);
  assert.ok(allHappy.valence > mixed.valence);
});

test("moodFor always resolves to one of the named anchors", () => {
  const names = new Set(MOODS.map((m) => m.name));
  for (const [v, i] of [[1, 1], [-1, 0], [0, 0], [-0.5, 0.9]]) {
    assert.ok(names.has(moodFor(v, i).label));
  }
});

test("hsl formats a well-formed CSS hsl() string", () => {
  assert.equal(hsl(200.4, 68.9, 41.2), "hsl(200 69% 41%)");
});
