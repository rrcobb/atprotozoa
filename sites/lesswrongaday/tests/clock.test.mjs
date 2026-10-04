import test from "node:test";
import assert from "node:assert";
import { replayDate, shift, clamp } from "../public/clock.js";

test("replay starts at 2012-01-01 on the anchor day", () => {
  assert.equal(replayDate("2026-10-04"), "2012-01-01");
  assert.equal(replayDate("2026-10-05"), "2012-01-02");
  assert.equal(replayDate("2027-01-01"), "2012-03-30"); // 89 days in, leap-year 2012
});
test("before the anchor clamps to the start", () => {
  assert.equal(replayDate("2020-01-01"), "2012-01-01");
});
test("shift and clamp", () => {
  assert.equal(shift("2012-02-28", 2), "2012-03-01");
  assert.equal(clamp("2030-01-01", "2026-10-04"), "2026-10-04");
});
