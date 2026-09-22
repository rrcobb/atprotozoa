import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCycle, LURE_MODES } from "../public/lib/cycle.js";

test("every declared mode builds a cycle with at least one event", () => {
  for (const mode of LURE_MODES) {
    const { events, cycleMs } = buildCycle(mode);
    assert.ok(events.length > 0, `${mode} has no events`);
    assert.ok(cycleMs > 0, `${mode} has a non-positive cycle length`);
  }
});

test("every event fires strictly inside its own cycle", () => {
  for (const mode of LURE_MODES) {
    const { events, cycleMs } = buildCycle(mode);
    for (const e of events) {
      assert.ok(e.at >= 0 && e.at < cycleMs, `${mode} event at ${e.at} outside [0, ${cycleMs})`);
    }
  }
});

test("clicks mode is four evenly-spaced clicks — the bsk-bsk-bsk-bsk bit", () => {
  const { events } = buildCycle("clicks");
  assert.equal(events.length, 4);
  assert.ok(events.every((e) => e.type === "click"));
  const gaps = events.slice(1).map((e, i) => e.at - events[i].at);
  assert.ok(gaps.every((g) => g === gaps[0]));
});

test("all mode includes every lure type exactly once each per cycle (clicks burst counts once)", () => {
  const { events } = buildCycle("all");
  const types = new Set(events.map((e) => e.type));
  assert.deepEqual([...types].sort(), ["chirp", "click", "squeak"]);
  assert.equal(events.filter((e) => e.type === "chirp").length, 1);
  assert.equal(events.filter((e) => e.type === "squeak").length, 1);
});

test("an unknown mode falls back to 'all' rather than throwing", () => {
  assert.deepEqual(buildCycle("nonsense"), buildCycle("all"));
});
