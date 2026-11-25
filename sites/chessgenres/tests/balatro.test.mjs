import test from "node:test";
import assert from "node:assert";
import * as B from "../public/balatro-logic.js";

const c = (t, col = "w", id = Math.random()) => ({ id, t, col });

// A simple bot: plays its best subset, discards the rest when behind, buys jokers.
function subsets(hand) {
  const out = [], n = hand.length;
  for (let m = 1; m < 1 << n; m++) {
    let bits = 0; for (let i = 0; i < n; i++) if (m >> i & 1) bits++;
    if (bits > 5) continue;
    out.push(hand.filter((_, i) => m >> i & 1));
  }
  return out;
}
export function bot(seed, maxAnte = 40) {
  const run = B.newRun(seed); B.startRound(run);
  let guard = 0;
  while (guard++ < 5000 && run.ante < maxAnte) {
    if (run.status === "playing") {
      const r = run.round;
      let best = null, bs = -1;
      for (const s of subsets(r.hand)) { const v = B.score(s, run.jokers, B.scoreOpts(run)).total; if (v > bs) { bs = v; best = s; } }
      const need = (r.target - r.score) / r.hands;
      if (bs < need && r.discards > 0) {
        const keep = new Set(best.map((x) => x.id));
        const toss = r.hand.filter((x) => !keep.has(x.id)).slice(0, 5);
        if (toss.length && B.discard(run, toss.map((x) => x.id))) continue;
      }
      B.play(run, best.map((x) => x.id));
    } else if (run.status === "shop" || run.status === "won") {
      if (run.status === "won" && !run.endless) { B.advance(run); continue; }
      for (const o of run.shop.other) if (o.kind === "level" && !B.whyNot(run, o) && run.money >= 8) B.buy(run, o);
      for (const o of run.shop.jokers.slice().sort((a, b) => b.price - a.price)) { if (!B.whyNot(run, o)) B.buy(run, o); }
      B.advance(run);
    } else break;
  }
  return run;
}

test("classify keeps old hands and adds five of a kind", () => {
  assert.equal(B.classify([c("q"), c("q"), c("q"), c("q"), c("q")]).name, "five of a kind");
  assert.equal(B.classify([c("q"), c("q")]).name, "pair");
});
test("levels raise hand value; debuff by colour", () => {
  const two = [c("q"), c("q")];
  assert.equal(B.score(two).total, 28 * 2);
  assert.ok(B.score(two, [], { levels: { pair: 3 } }).total > 56);
  assert.equal(B.score([c("q", "w"), c("q", "w")], [], { debuffCol: "w" }).total, 20);
});
test("joker order matters: additive before multiplicative", () => {
  const J = (id) => B.JOKERS.find((j) => j.id === id);
  const hand = [c("k"), c("r")];
  const a = B.score(hand, [J("fork"), J("castling")].map((j) => ({ ...j })), {});
  const b = B.score(hand, [J("castling"), J("tempo")].map((j) => ({ ...j })), {});
  assert.ok(a.log.some((e) => e.k === "joker"));
  assert.ok(b.total > 0);
  const mult = B.score([c("n"), c("n")], [{ ...J("fork") }, { ...J("castling"), fx: () => ({ xmult: 2 }) }], {});
  const rev = B.score([c("n"), c("n")], [{ ...J("castling"), fx: () => ({ xmult: 2 }) }, { ...J("fork") }], {});
  assert.ok(mult.total > rev.total);
});
test("growing joker, deck surgery and the shop", () => {
  const run = B.newRun("abc"); B.startRound(run);
  run.jokers.push({ ...B.JOKERS.find((j) => j.id === "pawnstorm") });
  const pawns = run.round.hand.filter((x) => x.t === "p").slice(0, 2);
  if (pawns.length === 2) { B.play(run, pawns.map((x) => x.id)); assert.equal(run.jokers[0].n, 2); }
  run.status = "playing";
  run.items = [{ id: "purge" }, { id: "clone" }, ];
  const card = run.round.hand[0];
  const before = run.deck.length;
  assert.ok(B.useItem(run, 0, [card.id]));
  assert.equal(run.deck.length, before - 1);
  const card2 = run.round.hand[0];
  assert.ok(B.useItem(run, 0, [card2.id]));
  assert.equal(run.deck.length, before);
  assert.equal(B.useItem(run, 0, []), null);
});
test("clearing a blind pays out and opens a shop; buying and selling work", () => {
  const run = B.newRun("shop"); B.startRound(run);
  run.round.target = 1;
  B.play(run, [run.round.hand[0].id]);
  assert.equal(run.status, "shop");
  assert.ok(run.payout.total >= 3);
  assert.equal(run.shop.jokers.length, 3);
  run.money = 50;
  const o = run.shop.jokers[0];
  assert.ok(B.buy(run, o)); assert.equal(run.jokers.length, 1);
  assert.ok(!B.buy(run, o));
  const lv = run.shop.other.find((x) => x.kind === "level");
  assert.ok(B.buy(run, lv)); assert.equal(run.levels[lv.name], 2);
  const m = run.money; assert.ok(B.sellJoker(run, 0)); assert.ok(run.money > m);
  const rr = run.money; assert.ok(B.reroll(run)); assert.equal(run.money, rr - 2);
  B.advance(run);
  assert.equal(run.status, "playing"); assert.equal(run.blind, 1);
});
test("seeded runs repeat", () => {
  const a = B.newRun("daily"), b = B.newRun("daily");
  B.startRound(a); B.startRound(b);
  assert.deepEqual(a.round.hand.map((x) => x.id), b.round.hand.map((x) => x.id));
});
test("boss rules apply", () => {
  const run = B.newRun("boss"); run.blind = 2; run.ante = 3; B.startRound(run);
  const boss = run.round.boss;
  assert.ok(boss);
  assert.equal(run.round.target, B.targetFor(3, 2, boss));
  assert.equal(B.targetFor(0, 2), 200);
  assert.ok(B.targetFor(9, 0) > B.targetFor(7, 0));
});
test("bot balance: usually dies before the end, sometimes goes deep", () => {
  let wins = 0, sum = 0; const N = 40;
  for (let i = 0; i < N; i++) { const r = bot("seed" + i, B.ANTES); if (r.ante >= B.ANTES) wins++; sum += r.ante + r.blind / 3; }
  console.log("bot avg ante reached", (sum / N).toFixed(2), "wins", wins + "/" + N);
  assert.ok(sum / N > 2.5, "too hard");
  assert.ok(wins < N * 0.8, "too easy");
});
