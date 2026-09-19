import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAQAMAT,
  MAQAM_KEYS,
  IQAAT,
  IQA_KEYS,
  freqFromSemitones,
  degreeFreq,
  pickKey,
  pickDegree,
} from "../public/lib/theory.js";

test("freqFromSemitones: an octave up doubles frequency", () => {
  assert.equal(freqFromSemitones(220, 12), 440);
});

test("freqFromSemitones: unison returns the tonic unchanged", () => {
  assert.equal(freqFromSemitones(220, 0), 220);
});

test("degreeFreq: degree 0 is the tonic", () => {
  assert.equal(degreeFreq(220, MAQAMAT.rast, 0), 220);
});

test("degreeFreq: the written octave degree doubles the tonic", () => {
  const len = MAQAMAT.rast.degrees.length - 1;
  assert.equal(degreeFreq(220, MAQAMAT.rast, len), 440);
});

test("degreeFreq: wraps below the tonic for a pedal an octave down", () => {
  const len = MAQAMAT.rast.degrees.length - 1;
  assert.equal(degreeFreq(220, MAQAMAT.rast, -len), 110);
});

test("degreeFreq: octaveShift stacks an extra octave on top", () => {
  const len = MAQAMAT.rast.degrees.length - 1;
  assert.equal(degreeFreq(220, MAQAMAT.rast, 0, 1), 440);
  assert.equal(degreeFreq(220, MAQAMAT.rast, len, 1), 880);
});

test("every maqam starts on the tonic and closes exactly one octave up", () => {
  for (const key of MAQAM_KEYS) {
    const degrees = MAQAMAT[key].degrees;
    assert.equal(degrees[0], 0, `${key} should start on the tonic`);
    assert.equal(degrees[degrees.length - 1], 12, `${key} should close the octave`);
  }
});

test("every iqa pattern is 8 steps of D/T/k/.", () => {
  for (const key of IQA_KEYS) {
    const pattern = IQAAT[key].pattern;
    assert.equal(pattern.length, 8, `${key} should be 8 steps`);
    assert.ok(/^[DTk.]+$/.test(pattern), `${key} should only use D/T/k/. steps`);
  }
});

test("pickKey always returns one of the given keys", () => {
  for (let i = 0; i < 50; i++) {
    const k = pickKey(MAQAM_KEYS, () => i / 50);
    assert.ok(MAQAM_KEYS.includes(k));
  }
});

test("pickDegree avoids repeating the previous degree when the maqam has options", () => {
  const maqam = MAQAMAT.rast;
  const len = maqam.degrees.length - 1;
  for (let i = 0; i < 100; i++) {
    const degree = pickDegree(maqam, 2, Math.random);
    assert.notEqual(degree, 2);
    assert.ok(degree >= 0 && degree < len);
  }
});

test("pickDegree returns 0 for a single-degree maqam rather than looping forever", () => {
  const oneDegree = { degrees: [0, 12] };
  assert.equal(pickDegree(oneDegree, 0, Math.random), 0);
});
