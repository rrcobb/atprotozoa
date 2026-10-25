import test from "node:test";
import assert from "node:assert";
import { parseToppings } from "../public/lib/llm-vision.js";

test("parses a comma list and drops unknown words", () => {
  assert.deepStrictEqual(parseToppings("Mustard, onions, glitter").sort(), ["mustard", "onions"]);
});
test("NONE and PLAIN give nothing", () => {
  assert.deepStrictEqual(parseToppings("NONE"), []);
  assert.deepStrictEqual(parseToppings("plain"), []);
  assert.deepStrictEqual(parseToppings(undefined), []);
});
test("crispy onions does not also count as onions", () => {
  assert.deepStrictEqual(parseToppings("crispy onions, ketchup").sort(), ["crispy onions", "ketchup"]);
});
