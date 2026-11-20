import test from "node:test";
import assert from "node:assert";
import { N, CELLS, CELL_OF_SUM, hilbert, PICTURES, targetPmf, sumPmf, rollFast, randomGene, modelOf, SET } from "../public/lib/dice.js";
import { fibNormals, buildPoly, restProbs, topProbs, TARGET_VOLUME } from "../public/lib/geometry.js";
import { createEvolver } from "../public/lib/evolve.js";
import { makeBody, throwDice, stepWorld } from "../public/lib/physics.js";

const lcg = (seed) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

test("hilbert walk visits every cell once, one step at a time", () => {
  assert.strictEqual(new Set(CELL_OF_SUM).size, CELLS);
  for (let s = 1; s < CELLS; s++) {
    const [a, b] = [hilbert(s - 1), hilbert(s)];
    assert.strictEqual(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1);
  }
});

test("a 7-plane and a 20-plane die close into solids with matching face counts", () => {
  for (const n of [7, 20]) {
    const nr = fibNormals(n);
    const poly = buildPoly(nr, nr.map(() => 1));
    assert.strictEqual(poly.faces.length, n);
    assert.ok(Math.abs(restProbs(poly).reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(Math.abs(topProbs(poly).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
});

test("pushing a plane out shrinks its face to nothing", () => {
  const nr = fibNormals(20);
  const d = nr.map(() => 1);
  const base = buildPoly(nr, d);
  d[0] = 3; // far away: plane no longer touches the solid
  const cut = buildPoly(nr, d);
  assert.strictEqual(cut.faces.length, 19);
  assert.ok(base.faces.some((f) => f.k === 0));
  assert.ok(!cut.faces.some((f) => f.k === 0));
});

test("sum distribution is a pmf and fast rolls follow it", () => {
  const rand = lcg(9);
  const models = SET.map((n) => modelOf(randomGene(n, rand)));
  assert.ok(models.every(Boolean));
  const pmf = sumPmf(models);
  assert.ok(Math.abs(pmf.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const hit = new Array(CELLS + 1).fill(0), R = 40000;
  for (let i = 0; i < R; i++) hit[Math.min(rollFast(models, rand).sum, CELLS)]++;
  let tv = 0;
  for (let s = 0; s <= CELLS; s++) tv += Math.abs(hit[s] / R - pmf[s]);
  assert.ok(tv / 2 < 0.06, "tv " + tv / 2);
});

test("evolution moves the dice toward the picture", () => {
  const rand = lcg(3);
  const ev = createEvolver(targetPmf(PICTURES.heart()), rand);
  const start = ev.best.fit;
  for (let g = 0; g < 250; g++) ev.step();
  assert.ok(ev.best.fit > start + 0.15, `${start} -> ${ev.best.fit}`);
  assert.ok(ev.best.fit > 0.7);
});

test("physics: every die settles with a top face", () => {
  const rand = lcg(11);
  const models = SET.map((n) => modelOf(randomGene(n, rand)));
  const bodies = models.map((m) => makeBody(m.poly));
  for (let throwN = 0; throwN < 4; throwN++) {
    throwDice(bodies, rand);
    let t = 0;
    while (!stepWorld(bodies, 1 / 60, rand) && t < 15) t += 1 / 60;
    assert.ok(t < 15, "never settled");
    for (const b of bodies) assert.ok(b.top >= 0 && b.top < b.poly.faces.length);
  }
});

test("every preset has ink and the volume is normalised", () => {
  for (const [k, f] of Object.entries(PICTURES)) {
    assert.strictEqual(f().length, N);
    assert.ok(f().flat().reduce((a, b) => a + b, 0) > 3, k);
  }
  assert.ok(TARGET_VOLUME > 0);
});
