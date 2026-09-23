// Unit tests for public/meaning.js — the IPA assembly + the sound-symbolism
// generator every clicked syllable runs through. Run with `node --test tests/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { consonantIPA, vowelIPA, ipaOf, romanOf, meaning, countSpace, encodeSyllable, decodeSyllable } from "../public/meaning.js";

test("consonantIPA looks up the real IPA symbol for a place/manner/voicing cell", () => {
  assert.equal(consonantIPA("bilabial", "plosive", false), "p");
  assert.equal(consonantIPA("bilabial", "plosive", true), "b");
  assert.equal(consonantIPA("velar", "nasal", true), "ŋ");
});

test("consonantIPA returns null for a cell that doesn't exist on the chart", () => {
  assert.equal(consonantIPA("bilabial", "trill", false), null); // voiceless bilabial trill isn't charted
  assert.equal(consonantIPA("dental", "plosive", false), null); // dental plosive isn't charted
});

test("vowelIPA applies the combining tilde for nasalization", () => {
  assert.equal(vowelIPA("open", "front", false, false), "a");
  assert.equal(vowelIPA("open", "front", false, true), "ã");
});

test("ipaOf concatenates onset + nucleus + coda in order", () => {
  const syl = {
    onset: { place: "bilabial", manner: "plosive", voiced: false },
    nucleus: { height: "open", backness: "front", rounded: false, nasal: false },
    coda: { place: "alveolar", manner: "nasal", voiced: true },
  };
  assert.equal(ipaOf(syl), "pan");
});

test("ipaOf handles a vowel-only syllable (no onset, no coda)", () => {
  const syl = { onset: null, nucleus: { height: "close", backness: "front", rounded: false, nasal: false }, coda: null };
  assert.equal(ipaOf(syl), "i");
});

test("romanOf never returns an empty string for a legal syllable", () => {
  const syl = {
    onset: { place: "uvular", manner: "fricative", voiced: false },
    nucleus: { height: "near-open", backness: "central", rounded: false, nasal: true },
    coda: null,
  };
  const roman = romanOf(syl);
  assert.ok(roman.length > 0);
  assert.ok(roman.endsWith("n")); // nasalization marked in the respelling
});

test("meaning() always ends with a period and starts with a part-of-speech tag", () => {
  const syl = {
    onset: { place: "palatal", manner: "approximant", voiced: true },
    nucleus: { height: "close-mid", backness: "back", rounded: true, nasal: false },
    coda: null,
  };
  const def = meaning(syl);
  assert.match(def, /^(n\.|v\.|adj\.|interj\.) /);
  assert.ok(def.endsWith("."));
});

test("meaning() falls back to an interjection gloss for a vowel-initial syllable", () => {
  const syl = { onset: null, nucleus: { height: "open", backness: "back", rounded: false, nasal: false }, coda: null };
  assert.match(meaning(syl), /^interj\./);
});

test("meaning() appends a coda clause only when a coda is present", () => {
  const base = {
    onset: { place: "alveolar", manner: "fricative", voiced: false },
    nucleus: { height: "close", backness: "front", rounded: false, nasal: false },
  };
  const withoutCoda = meaning({ ...base, coda: null });
  const withCoda = meaning({ ...base, coda: { place: "bilabial", manner: "plosive", voiced: false } });
  assert.ok(!withoutCoda.includes("stops abruptly"));
  assert.ok(withCoda.includes("stops abruptly"));
});

test("encodeSyllable/decodeSyllable round-trips a full onset+coda syllable", () => {
  const syl = {
    onset: { place: "retroflex", manner: "plosive", voiced: true },
    nucleus: { height: "open-mid", backness: "back", rounded: true, nasal: false },
    coda: { place: "velar", manner: "nasal", voiced: true },
  };
  assert.deepEqual(decodeSyllable(encodeSyllable(syl)), syl);
});

test("encodeSyllable/decodeSyllable round-trips ids that contain a hyphen", () => {
  // "lateral-fricative" (manner) and "near-close" (height) both contain "-".
  // app.js joins multiple encoded syllables with "~", not "-", specifically
  // so this doesn't collide with a multi-syllable permalink's separator —
  // this test locks the single-syllable half of that: the encoding itself
  // must stay parseable even though its own value contains a hyphen.
  const syl = {
    onset: { place: "alveolar", manner: "lateral-fricative", voiced: false },
    nucleus: { height: "near-close", backness: "front", rounded: false, nasal: true },
    coda: null,
  };
  assert.deepEqual(decodeSyllable(encodeSyllable(syl)), syl);
});

test("a multi-syllable permalink joined with '~' splits back into the same syllables (hyphenated ids included)", () => {
  const word = [
    { onset: { place: "alveolar", manner: "lateral-approximant", voiced: true }, nucleus: { height: "near-open", backness: "central", rounded: false, nasal: false }, coda: null },
    { onset: null, nucleus: { height: "close-mid", backness: "front", rounded: true, nasal: false }, coda: { place: "uvular", manner: "trill", voiced: true } },
  ];
  const permalink = word.map(encodeSyllable).join("~");
  const decoded = permalink.split("~").map(decodeSyllable);
  assert.deepEqual(decoded, word);
});

test("decodeSyllable returns null for a garbled string instead of throwing", () => {
  assert.equal(decodeSyllable("not-a-real-encoding"), null);
  assert.equal(decodeSyllable(""), null);
});

test("countSpace's total equals onsets * nuclei * codas", () => {
  const { onsets, nuclei, codas, total } = countSpace();
  assert.equal(total, onsets * nuclei * codas);
  assert.ok(onsets > 1 && nuclei > 1 && codas > 1);
});
