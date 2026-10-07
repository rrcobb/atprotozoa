import test from "node:test";
import assert from "node:assert";
import { runLean } from "../public/lib/lean.js";

const one = (src) => runLean(src)[0];

test("eval arithmetic and lists", () => {
  assert.equal(one("#eval 2 + 3 * 4").text, "14");
  assert.equal(one("#eval [1,2,3].map (· * 2)").text, "[2, 4, 6]");
  assert.equal(one('#eval "hi".length').text, "2");
});
test("recursion with pattern alternatives", () => {
  const r = runLean("def fib : Nat → Nat\n  | 0 => 0\n  | 1 => 1\n  | n+2 => fib n + fib (n+1)\n#eval fib 15");
  assert.equal(r[0].text, "610");
});
test("theorem statuses", () => {
  assert.equal(one("theorem a : 2 + 2 = 4 := by decide").status, "proved");
  assert.equal(one("theorem b (n : Nat) : n + 0 = n := by simp").status, "tested");
  assert.equal(one("theorem c : 2 + 2 = 5 := by decide").status, "failed");
  assert.equal(one("theorem d (n : Nat) : n = n + 1 := by omega").status, "failed");
  assert.equal(one("theorem e : 1 = 2 := by sorry").status, "sorry");
});
test("inductive + namespace", () => {
  const r = runLean("inductive C | a | b\nnamespace C\ndef flip : C → C\n  | a => b\n  | b => a\nend C\n#eval C.a.flip");
  assert.equal(r[0].text, "C.b");
});
test("errors are reported, not thrown", () => {
  assert.match(one("#eval nope").text, /unknown identifier/);
  assert.match(one("#eval (").text, /expected|unexpected/);
});
test("runaway recursion is caught", () => {
  const r = runLean("def f (n : Nat) : Nat := f (n+1)\n#eval f 0");
  assert.equal(r[0].kind, "error");
});
test("blueskyisms.lean checks out", async () => {
  const fs = await import("node:fs");
  const r = runLean(fs.readFileSync(new URL("../public/examples/blueskyisms.lean", import.meta.url), "utf8"));
  assert.equal(r.length, 7);
  assert.ok(r.every((m) => m.status === "proved"), JSON.stringify(r.filter((m) => m.status !== "proved")));
});
