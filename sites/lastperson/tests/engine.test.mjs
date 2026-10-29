import test from "node:test";
import assert from "node:assert/strict";
import { Tournament, genesisSeed, chainSeed, roundSizes } from "../public/lib/engine.js";
import { syntheticRoster, realRoster } from "../public/lib/roster.js";

const SEED = await genesisSeed();

function verify(N, seed = SEED) {
  const t = new Tournament(N, seed).runAll(997);
  assert.equal(t.matches, Math.max(0, N - 1), `N=${N} matches`);
  if (N === 0) { assert.equal(t.champion, -1); return t; }
  assert.equal(t.rounds[t.R].length, 1);
  // each entrant appears exactly once in round 0
  const seen = new Uint8Array(N);
  for (const e of t.rounds[0]) { assert.equal(seen[e], 0); seen[e] = 1; }
  // every winner was in its match; every entrant is eliminated at most once
  const eliminated = new Uint8Array(N);
  let played = 0;
  for (let r = 0; r < t.R; r++) {
    const cur = t.rounds[r], nxt = t.rounds[r + 1];
    const pairs = cur.length >> 1;
    for (let j = 0; j < pairs; j++) {
      const a = cur[2 * j], b = cur[2 * j + 1], w = nxt[j];
      assert.ok(w === a || w === b);
      const loser = w === a ? b : a;
      assert.equal(eliminated[loser], 0); eliminated[loser] = 1; played++;
    }
    if (cur.length & 1) assert.equal(nxt[pairs], cur[cur.length - 1]); // bye advances
  }
  assert.equal(played, N - 1);
  const champ = t.champion;
  assert.equal(eliminated[champ], 0);
  assert.equal(eliminated.reduce((s, v) => s + v, 0), N - 1);
  return t;
}

test("bracket integrity for edge and odd sizes", () => {
  for (const N of [0, 1, 2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 100, 1000, 12345]) verify(N);
});

test("randomized sizes", () => {
  let x = 12345;
  for (let i = 0; i < 25; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; verify(1 + (x % 5000)); }
});

test("N=0 and N=1 handled explicitly", () => {
  assert.deepEqual(roundSizes(0), []);
  const t0 = new Tournament(0, SEED); assert.ok(t0.done); assert.equal(t0.champion, -1);
  const t1 = new Tournament(1, SEED); assert.ok(t1.done); assert.equal(t1.champion, 0); assert.equal(t1.matches, 0);
});

test("replay is bit-for-bit identical regardless of batch size", () => {
  const a = new Tournament(54321, SEED).runAll(1 << 20);
  for (const batch of [1, 7, 1000, 65536]) {
    const b = new Tournament(54321, SEED).runAll(batch);
    assert.equal(b.checksum(), a.checksum());
    assert.equal(b.champion, a.champion);
    for (let r = 0; r <= a.R; r++) assert.deepEqual(b.rounds[r], a.rounds[r]);
  }
});

test("different seeds give different brackets; same seed identical", async () => {
  const s2 = await chainSeed(SEED, "did:example:222222", "000001");
  assert.notEqual(s2, SEED);
  assert.notEqual(new Tournament(5000, s2).runAll().checksum(), new Tournament(5000, SEED).runAll().checksum());
});

test("outcomes are not biased by entrant index (champion spread, first-round coin)", async () => {
  let lowHalf = 0, T = 400, a2 = 0, a2n = 0;
  let s = SEED;
  for (let i = 0; i < T; i++) {
    s = await chainSeed(s, "x", String(i));
    const t = new Tournament(64, s).runAll();
    if (t.champion < 32) lowHalf++;
    for (let j = 0; j < t.rounds[0].length / 2; j++) { a2n++; if (t.rounds[1][j] === t.rounds[0][2 * j + 1]) a2++; }
  }
  assert.ok(Math.abs(lowHalf / T - 0.5) < 0.1, "champion index spread " + lowHalf / T);
  assert.ok(Math.abs(a2 / a2n - 0.5) < 0.02, "match coin " + a2 / a2n);
});

test("trace gives exact paths; absent entrants are null", () => {
  const N = 1000, t = verify(N);
  for (const e of [0, 1, 499, 999, t.champion]) {
    const tr = t.trace(e);
    assert.ok(tr);
    let pos = tr.startPos;
    for (const st of tr.steps) {
      assert.equal(t.rounds[st.round][st.pos], e);
      if (!st.bye) assert.equal(t.rounds[st.round][st.pos ^ 1], st.opponent);
      if (st.won) pos >>= 1;
    }
    if (tr.champion) { assert.equal(tr.eliminatedRound, -1); assert.equal(e, t.champion); }
    else {
      assert.ok(tr.eliminatedBy >= 0);
      const chain = t.eliminatorChain(e);
      assert.equal(t.trace(chain[chain.length - 1].by).champion, true);
    }
  }
  assert.equal(t.trace(N + 5), null);
});

test("synthetic roster: canonical order, round-trip, absent DIDs", () => {
  const r = syntheticRoster(100000);
  let prev = "";
  for (let i = 0; i < 100000; i += 997) { const d = r.didAt(i); assert.ok(d > prev); prev = d; assert.equal(r.indexOf(d), i); }
  assert.equal(r.indexOf("did:plc:abcdefghijklmnopqrstuvwx"), -1);
  assert.equal(r.indexOf(r.didAt(100000)), -1); // valid shape, past the roster end
});

test("real roster: sorted, deduped, binary search, stable id", async () => {
  const a = await realRoster(["did:plc:b", "did:plc:a", "did:plc:b", "did:plc:c"]);
  const b = await realRoster(["did:plc:c", "did:plc:a", "did:plc:b"]);
  assert.equal(a.n, 3); assert.equal(a.id, b.id);
  assert.equal(a.didAt(0), "did:plc:a"); assert.equal(a.indexOf("did:plc:c"), 2); assert.equal(a.indexOf("did:plc:z"), -1);
});

test("timing report (informational)", () => {
  for (const N of [100000, 1000000]) {
    const t0 = performance.now();
    const t = new Tournament(N, SEED).runAll();
    console.log(`  N=${N}: ${(performance.now() - t0).toFixed(0)} ms, ${t.matches} matches`);
    assert.equal(t.matches, N - 1);
  }
});
