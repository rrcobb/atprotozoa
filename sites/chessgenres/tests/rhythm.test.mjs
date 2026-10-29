import test from "node:test";
import assert from "node:assert";
import { laneOf, buildChart, newSong, press, tick, finished, grade, judge, OPERA_GAME } from "../public/rhythm-logic.js";

test("rhythm lanes and chords", () => {
  assert.equal(laneOf("e4"), 0); assert.equal(laneOf("Nf3"), 1); assert.equal(laneOf("O-O-O"), 2); assert.equal(laneOf("Qb8+"), 3);
  const chart = buildChart(OPERA_GAME);
  const caps = OPERA_GAME.filter((m) => m.includes("x")).length;
  assert.equal(chart.length, OPERA_GAME.length + caps);
});
test("rhythm judging windows", () => {
  assert.equal(judge(0.02), "perfect"); assert.equal(judge(-0.08), "great"); assert.equal(judge(0.15), "good"); assert.equal(judge(0.3), null);
});
test("rhythm press, miss, finish", () => {
  const s = newSong(["e4", "e5"], 120);
  assert.equal(press(s, 0, s.notes[0].t + 0.01), "perfect");
  assert.equal(press(s, 0, s.notes[0].t), null); // already hit
  assert.equal(press(s, 3, s.notes[1].t), null); // wrong lane
  tick(s, s.notes[1].t + 1);
  assert.equal(s.counts.miss, 1); assert.equal(s.combo, 0);
  assert.ok(finished(s, s.notes[1].t + 1));
  assert.equal(grade(s), "C");
});
