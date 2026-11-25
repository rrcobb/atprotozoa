import test from "node:test";
import assert from "node:assert";
import { laneOf, buildChart, newSong, press, release, tick, finished, grade, judge, badge, calibrate, parseMoves, multiplier, SONGS, DIFFS, OPERA_GAME } from "../public/rhythm-logic.js";
import { replay, randomGame, legalMoves, startPosition } from "../public/rhythm-chess.js";

test("rhythm lanes and chords", () => {
  assert.equal(laneOf("e4"), 0); assert.equal(laneOf("Nf3"), 1); assert.equal(laneOf("O-O-O"), 2); assert.equal(laneOf("Qb8+"), 3);
  const chart = buildChart(OPERA_GAME);
  const caps = OPERA_GAME.filter((m) => m.includes("x") && !m.endsWith("#")).length;
  // every move is one note, captures add a chord note, and the mate is a four-lane finale (3 extra)
  assert.equal(chart.length, OPERA_GAME.length + caps + 3);
  const easy = buildChart(OPERA_GAME, { diff: "easy" });
  assert.equal(easy.length, OPERA_GAME.length + 3); assert.ok(easy.every((n) => n.len === 0));
  assert.ok(chart.some((n) => n.len > 0)); // checks hold
});
test("rhythm judging windows scale with difficulty", () => {
  assert.equal(judge(0.02), "perfect"); assert.equal(judge(-0.08), "great"); assert.equal(judge(0.15), "good"); assert.equal(judge(0.3), null);
  assert.equal(judge(0.15, 0.5), null); assert.equal(judge(0.15, 1.4), "good");
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
test("hold notes: finish the tail, or drop it", () => {
  let s = newSong(["Qb8+", "e4"], { diff: "normal" });
  const n = s.notes[0]; assert.ok(n.len > 0);
  assert.equal(press(s, 3, n.t), "perfect"); assert.equal(n.state, "holding");
  assert.equal(release(s, 3, n.t + n.len), "hold"); assert.equal(s.holds, 1);
  s = newSong(["Qb8+", "e4"], { diff: "normal" });
  press(s, 3, s.notes[0].t);
  assert.equal(release(s, 3, s.notes[0].t + 0.05), "drop"); assert.equal(s.combo, 0); assert.equal(s.drops, 1);
  s = newSong(["Qb8+", "e4"], { diff: "normal" }); // a tail that runs out while held finishes by itself
  press(s, 3, s.notes[0].t); tick(s, s.notes[0].t + s.notes[0].len + 0.01);
  assert.equal(s.notes[0].state, "done");
});
test("composure: misses can end a song on normal but never on easy", () => {
  for (const [diff, failed] of [["normal", true], ["easy", false]]) {
    const s = newSong(Array(40).fill("e4"), { diff });
    tick(s, 1000);
    assert.equal(s.failed, failed); assert.equal(s.hp, 0); assert.equal(badge(s), failed ? "resigned" : "");
  }
});
test("multiplier climbs with combo and is capped", () => {
  assert.equal(multiplier(0), 1); assert.equal(multiplier(10), 2); assert.equal(multiplier(999), 4);
  const s = newSong(Array(30).fill("e4"), 120);
  for (const n of [...s.notes]) press(s, 0, n.t);
  assert.equal(badge(s), "all perfect");
});
test("calibration takes the median lag and ignores strays", () => {
  const clicks = [1, 1.6, 2.2, 2.8, 3.4];
  assert.equal(calibrate(clicks, [1.08, 1.68, 2.28, 2.9, 9]).toFixed(2), "0.08");
  assert.equal(calibrate(clicks, [1.1]), null);
});
test("pgn-ish text is reduced to moves", () => {
  const txt = `[Event "x"]\n1. e4 {best by test} e5 2. Nf3 (2. f4 exf4) Nc6 $1 3.Bb5 a6 1-0`;
  assert.deepEqual(parseMoves(txt), ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
});
test("every song is a legal game and its mate suffix matches", () => {
  assert.ok(SONGS.length >= 6);
  for (const song of SONGS) {
    const r = replay(song.moves);
    assert.equal(r.bad, -1, `${song.name}: illegal move ${song.moves[r.bad]}`);
    assert.deepEqual(r.moves, song.moves, song.name);
  }
});
test("the engine rejects illegal moves and plays random legal games", () => {
  assert.equal(replay(["e4", "e5", "Ke3"]).bad, 2); // king can't go there
  assert.equal(replay(["e5"]).bad, 0);
  assert.equal(legalMoves(startPosition()).length, 20);
  let seed = 5; const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 5; i++) {
    const g = randomGame(rand, 60);
    assert.ok(g.length > 3); assert.equal(replay(g).bad, -1);
  }
});
test("every difficulty builds a chart in time order for every song", () => {
  for (const d of Object.keys(DIFFS)) for (const song of SONGS) {
    const c = buildChart(song.moves, { bpm: song.bpm, diff: d });
    for (let i = 1; i < c.length; i++) assert.ok(c[i].t >= c[i - 1].t);
  }
});
