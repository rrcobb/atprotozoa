import test from "node:test";
import assert from "node:assert";
import { joinList, parseNations, buildStatement, checklist } from "../public/lib/statement.js";

test("joinList", () => {
  assert.equal(joinList(["A"]), "A");
  assert.equal(joinList(["A", "B"]), "A and B");
  assert.equal(joinList(["A", "B", "C"]), "A, B, and C");
});

test("parseNations splits on newline, comma, semicolon", () => {
  assert.deepEqual(parseNations("Duwamish\n- Suquamish; Muckleshoot, "), ["Duwamish", "Suquamish", "Muckleshoot"]);
});

test("no nations -> empty statement, never a placeholder", () => {
  assert.equal(buildStatement({ place: "Seattle", nations: [] }), "");
});

test("unknown status says nothing about treaties", () => {
  const s = buildStatement({ place: "Seattle", nations: ["Duwamish"], status: "unknown", timeImmemorial: true });
  assert.ok(!/ceded|treaty/i.test(s));
  assert.ok(s.includes("Duwamish"));
});

test("treaty sentence needs a named treaty", () => {
  const s = buildStatement({ place: "X", nations: ["A"], status: "treaty", treaty: "" });
  assert.ok(!/treaty/i.test(s));
  assert.ok(buildStatement({ place: "X", nations: ["A"], status: "treaty", treaty: "Treaty 6" }).includes("Treaty 6"));
});

test("spoken format drops the action, line format is one sentence", () => {
  const o = { place: "X", nations: ["A", "B"], action: "I donate monthly", status: "unceded" };
  assert.ok(!buildStatement({ ...o, format: "spoken" }).includes("donate"));
  assert.ok(buildStatement({ ...o, format: "full" }).includes("donate"));
  assert.equal(buildStatement({ ...o, format: "line" }).split(". ").length, 1);
});

test("checklist flags missing action", () => {
  assert.ok(checklist({ nations: ["A"] }).some((w) => /commitment/.test(w)));
});
