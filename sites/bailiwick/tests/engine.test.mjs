import { test } from "node:test";
import assert from "node:assert";
import { newState, dayPlan, resolve, endDay, buy, collectDues, retire, bandFor, BAND_TABLE, dateOf, hash32, DAYS_PER_YEAR } from "../public/engine.js";

const isInts = (o) => JSON.stringify(o, (k, v) => { if (typeof v === "number") assert.ok(Number.isInteger(v), `float at ${k}`); return v; });

test("same seed + day deals the same hand", () => {
  const a = dayPlan(newState(1234)), b = dayPlan(newState(1234));
  assert.deepStrictEqual(a.dice, b.dice);
  assert.deepStrictEqual(a.matters.map((m) => m.title), b.matters.map((m) => m.title));
  assert.notDeepStrictEqual(dayPlan(newState(99)).matters.map((m) => m.title), a.matters.map((m) => m.title));
});

test("band tables are monotonic in the die", () => {
  for (const row of BAND_TABLE) for (let i = 1; i < 6; i++) assert.ok(row[i] >= row[i - 1]);
});

test("resolve spends a die once and a matter once", () => {
  const s = newState(7);
  const plan = dayPlan(s);
  const r = resolve(s, plan.matters[0].key, 0, false);
  assert.ok(r.state && r.result);
  assert.equal(r.state.today.used.length, 1);
  assert.ok(resolve(r.state, plan.matters[1].key, 0, false).error);
  assert.ok(resolve(r.state, plan.matters[0].key, 1, false).error);
  assert.equal(s.today.used.length, 0, "input not mutated");
});

test("a year of play stays integer-only, finite and replayable", () => {
  let s = newState(42);
  for (let d = 0; d < DAYS_PER_YEAR + 40; d++) {
    const plan = dayPlan(s);
    plan.dice.forEach((_, i) => {
      const m = plan.matters.find((x) => !s.today.done.some((q) => q.k === x.key)) || plan.standing[0];
      const r = resolve(s, m.key, i, i % 3 === 0);
      if (r.state) s = r.state;
    });
    if (s.coin >= 60) { const b = buy(s, "mill"); if (b.state) s = b.state; }
    s = endDay(s).state;
    assert.ok(Number.isFinite(s.coin) && s.coin >= 0 && s.grain >= 0);
    assert.ok(s.favor >= 0 && s.favor <= 100 && s.weary >= 0);
  }
  isInts(s);
  assert.ok(s.journal.length <= 60);
  assert.ok(s.totals.days >= DAYS_PER_YEAR);
});

test("feast days add a matter", () => {
  const s = newState(5);
  s.day = 24; // 25 March, Lady Day
  assert.equal(dateOf(24).feast.name, "Lady Day");
  assert.equal(dayPlan(s).matters[0].key, "feast");
});

test("idle dues credit whole hours and keep the remainder", () => {
  let s = newState(3);
  s = collectDues(s, 1000).state;
  const r = collectDues(s, 1000 + 5.5 * 3600000);
  assert.equal(r.hours, 5);
  assert.equal(r.state.coin, s.coin + 5);
  assert.equal(collectDues(r.state, 1000 + 5.5 * 3600000).hours, 0);
});

test("retiring keeps skills and logs the old manor", () => {
  let s = newState(8);
  s.skills.eye.l = 3;
  const n = retire(s, 999);
  assert.equal(n.run, 2);
  assert.equal(n.skills.eye.l, 3);
  assert.equal(n.chronicle.length, 1);
  assert.equal(n.day, 0);
});
