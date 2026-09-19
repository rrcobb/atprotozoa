import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeWav, readRingTail } from "../public/lib/wav.js";

function readString(view, offset, len) {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

test("encodeWav writes a valid RIFF/WAVE header for mono PCM16", () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const buf = encodeWav(samples, 44100, 1);
  const view = new DataView(buf);

  assert.equal(readString(view, 0, 4), "RIFF");
  assert.equal(readString(view, 8, 4), "WAVE");
  assert.equal(readString(view, 12, 4), "fmt ");
  assert.equal(view.getUint16(20, true), 1); // PCM
  assert.equal(view.getUint16(22, true), 1); // mono
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint16(34, true), 16); // bits per sample
  assert.equal(readString(view, 36, 4), "data");

  const dataSize = view.getUint32(40, true);
  assert.equal(dataSize, samples.length * 2);
  assert.equal(buf.byteLength, 44 + dataSize);
  assert.equal(view.getUint32(4, true), 36 + dataSize);
});

test("encodeWav clamps out-of-range samples instead of wrapping", () => {
  const buf = encodeWav(new Float32Array([2, -2]), 8000, 1);
  const view = new DataView(buf);
  assert.equal(view.getInt16(44, true), 0x7fff);
  assert.equal(view.getInt16(46, true), -0x8000);
});

test("readRingTail returns the last N samples in chronological order, unwrapped", () => {
  // ring holds [10,11,12,13,14], writeIndex=0 means the buffer just wrapped
  // exactly, so chronological order is the array as-is.
  const ring = new Float32Array([10, 11, 12, 13, 14]);
  const tail = readRingTail(ring, 0, 5, 5);
  assert.deepEqual(Array.from(tail), [10, 11, 12, 13, 14]);
});

test("readRingTail reconstructs order across the wrap point", () => {
  // Wrote 7 samples into a length-5 ring: values 0..6. Final layout is
  // [5, 6, 2, 3, 4] with writeIndex=2 (next write lands on index 2).
  const ring = new Float32Array([5, 6, 2, 3, 4]);
  const tail = readRingTail(ring, 2, 7, 5);
  assert.deepEqual(Array.from(tail), [2, 3, 4, 5, 6]);
});

test("readRingTail caps at how much has actually been written", () => {
  const ring = new Float32Array(10);
  ring[0] = 1; ring[1] = 2; ring[2] = 3;
  const tail = readRingTail(ring, 3, 3, 10);
  assert.deepEqual(Array.from(tail), [1, 2, 3]);
});

test("readRingTail caps at the requested count even when more is available", () => {
  const ring = new Float32Array([1, 2, 3, 4, 5]);
  const tail = readRingTail(ring, 0, 5, 2);
  assert.deepEqual(Array.from(tail), [4, 5]);
});
