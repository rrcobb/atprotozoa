import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../public/lib/circuit.js";

const w = (a, b) => ({ kind: "wire", a, b });
const base = [w("P8", "VCC"), w("P1", "GND"), w("P4", "VCC"), w("P2", "P6")];
const R = (a, b, ohms) => ({ kind: "res", a, b, ohms });
const C = (a, b, farads) => ({ kind: "cap", a, b, farads });

test("classic astable oscillates at 1.44/((R1+2R2)C)", () => {
  const r = evaluate([...base, R("VCC", "P7", 1e3), R("P7", "P6", 10e3), C("P6", "GND", 1e-6)]);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.hz - 1.44 / (21e3 * 1e-6)) < 1e-9);
});
test("feedback oscillator from pin 3 works", () => {
  const r = evaluate([...base, R("P3", "P6", 100e3), C("P6", "GND", 1e-6)]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "pin 3 feedback");
});
test("missing cap fails", () => {
  const r = evaluate([...base, R("P3", "P6", 100e3)]);
  assert.equal(r.ok, false);
});
test("pin 4 floating fails", () => {
  const r = evaluate([w("P8", "VCC"), w("P1", "GND"), w("P2", "P6"), R("P3", "P6", 1e3), C("P6", "GND", 1e-6)]);
  assert.equal(r.ok, false);
});
test("short is smoke", () => {
  const r = evaluate([w("VCC", "GND")]);
  assert.equal(r.short, true);
});
test("wiring pin 7 to pin 6 shorts R2 and fails path A", () => {
  const r = evaluate([...base, w("P7", "P6"), R("VCC", "P7", 1e3), R("P7", "P6", 1e3), C("P6", "GND", 1e-6)]);
  assert.equal(r.ok, false);
});
