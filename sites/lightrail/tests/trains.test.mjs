import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { buildRows, trainsFromDir, stationBoard, countdown } from "../public/lib/trains.js";

const line = JSON.parse(readFileSync(new URL("../public/data/line.json", import.meta.url)));

test("rows cover every station once, Hunt Valley first", () => {
  const rows = buildRows(line).filter((r) => r.kind === "station");
  const names = rows.map((r) => line.stations.find((s) => s.id === r.id).name);
  assert.strictEqual(names[0], "Hunt Valley");
  assert.strictEqual(new Set(rows.map((r) => r.id)).size, rows.length);
  assert.strictEqual(rows.length, line.stations.length);
  const i = names.indexOf("Mt. Royal / MICA");
  assert.strictEqual(names[i + 1], "Penn Station");
});

test("trains group by vehicle and the soonest stop is next", () => {
  const [pa, pb] = Object.keys(line.platforms).filter((p) => line.platforms[p].d === 0);
  const now = 1_000_000;
  const trains = trainsFromDir(
    { [pa]: [{ seconds_left: 300, time: "6:00 PM", vehicle: "7011" }], [pb]: [{ seconds_left: 120, time: "5:57 PM", vehicle: "7011" }] },
    line.platforms, 0, now);
  assert.strictEqual(trains.length, 1);
  assert.strictEqual(trains[0].next.st, line.platforms[pb].st);
  const board = stationBoard([trains], line.platforms[pa].st);
  assert.strictEqual(board[0].arriveAt, now + 300000);
});

test("countdown wording", () => {
  assert.strictEqual(countdown(10_000, 0), "arriving");
  assert.strictEqual(countdown(300_000, 0), "5 min");
});
