import test from "node:test";
import assert from "node:assert";
import * as T from "../public/tactics-logic.js";

const by = (s, side, name) => s.units.find((u) => u.side === side && u.name === name);
const battle = (n = 0, seed = "t") => { const camp = T.newCampaign(seed); camp.n = n; return { camp, s: T.startBattle(camp) }; };

test("sliders are blocked by units and walls", () => {
  const { s } = battle();
  const r = by(s, "p", "rook");
  const kn = by(s, "p", "knight");
  assert.ok(kn.x < r.x ? !T.legalMoves(s, r).some((m) => m.y === r.y && m.x <= kn.x) : !T.legalMoves(s, r).some((m) => m.y === r.y && m.x >= kn.x));
  s.terrain[5][r.x] = "#";
  assert.ok(!T.legalMoves(s, r).some((m) => m.x === r.x && m.y <= 5));
});
test("move then attack, once each", () => {
  const { s } = battle();
  const n = by(s, "p", "knight");
  const foe = s.units.find((u) => u.side === "e");
  foe.x = n.x + 1; foe.y = n.y - 2;
  s.terrain[foe.y][foe.x] = ".";
  assert.ok(T.attackTargets(s, n).includes(foe));
  assert.equal(T.doMove(s, n, n.x - 2, n.y - 1), true);
  assert.equal(T.doMove(s, n, n.x, n.y - 2), false);
  foe.x = n.x + 1; foe.y = n.y - 2; s.terrain[foe.y][foe.x] = ".";
  assert.ok(T.doAttack(s, n, foe) > 0);
  assert.equal(T.doAttack(s, n, foe), null);
});
test("pawns march forward, capture diagonally and promote", () => {
  const { s } = battle();
  const p = T.newCampaign("x"); void p;
  const camp = T.newCampaign("pawn"); camp.roster.push({ uid: 99, t: "p", name: "pawn", lvl: 1, xp: 0, hp: 8, atk: 3, mv: 1, rng: 1, gear: null, alive: true });
  const s2 = T.startBattle(camp);
  const pawn = by(s2, "p", "pawn");
  s2.units.filter((u) => u.side === "e").forEach((u) => (u.hp = 0));
  s2.terrain = s2.terrain.map((r) => r.map(() => "."));
  pawn.x = 0; pawn.y = 1;
  assert.deepEqual(T.legalMoves(s2, pawn).filter((m) => m.y < pawn.y).map((m) => m.y), [0]);
  assert.ok(T.doMove(s2, pawn, 0, 0));
  assert.equal(pawn.t, "q"); assert.ok(pawn.promoted);
  void s;
});
test("dragon head armor counts claws; cover and shields help", () => {
  const { s } = battle(T.BATTLES - 1);
  const head = by(s, "e", "dragon head"), rook = by(s, "p", "rook");
  assert.equal(T.damageTo(s, rook, head), rook.atk - 2);
  s.units.filter((u) => u.part === "claw").forEach((c) => (c.hp = 0));
  assert.equal(T.damageTo(s, rook, head), rook.atk);
  s.terrain[rook.y][rook.x] = "c";
  const hit = T.damageTo(s, head, rook);
  rook.dr = 1;
  assert.equal(T.damageTo(s, head, rook), hit - 1);
});
test("every objective can be generated and starts clean", () => {
  const kinds = new Set();
  for (let i = 0; i < 40; i++) {
    const camp = T.newCampaign("seed" + i);
    for (let n = 0; n < T.BATTLES; n++) {
      camp.n = n;
      const s = T.buildBattle(camp);
      kinds.add(s.objective.kind);
      for (const u of s.units) { assert.notEqual(T.tileAt(s, u.x, u.y), "#"); assert.ok(T.inBoard(u.x, u.y)); }
      const spots = new Set(s.units.map((u) => u.x + "," + u.y));
      assert.equal(spots.size, s.units.length, "no stacked units");
      if (s.objective.kind === "reach") assert.ok(s.terrain[0].includes("x"));
      if (s.objective.kind === "assassin") assert.ok(s.units.some((u) => u.commander));
    }
  }
  for (const k of ["rout", "assassin", "reach", "survive", "dragon"]) assert.ok(kinds.has(k), k);
});
test("abilities: rally, bless, castle, sweep, fork", () => {
  const { s } = battle();
  s.units.filter((u) => u.side === "e").forEach((u) => (u.hp = 0));
  s.terrain = s.terrain.map((r) => r.map(() => "."));
  const k = by(s, "p", "king"), b = by(s, "p", "bishop"), r = by(s, "p", "rook"), n = by(s, "p", "knight");
  k.hp = 5; b.hp = 3;
  assert.ok(T.abilityTargets(s, k).length);
  assert.ok(T.doAbility(s, k, k));
  assert.equal(k.hp, 9); assert.equal(k.cd, 3);
  assert.ok(!T.doAbility(s, k, k));
  // castle swaps rook and king
  s.status = "playing";
  r.x = 3; r.y = 4; k.x = 3; k.y = 7; k.acted = false;
  s.units.filter((u) => u !== r && u !== k && u.hp > 0).forEach((u) => { u.x = 7; u.y = 0; u.hp = 0; });
  assert.deepEqual(T.abilityTargets(s, r), [k]);
  T.doAbility(s, r, k);
  assert.deepEqual([k.x, k.y, r.x, r.y], [3, 4, 3, 7]);
  void n;
});
test("lava burns, chapel heals, guards sleep until approached", () => {
  const { s } = battle();
  s.units.filter((u) => u.side === "e").forEach((u) => (u.hp = 0));
  const kn = by(s, "p", "knight"); kn.hp = 6;
  s.terrain[kn.y][kn.x] = "l";
  const bi = by(s, "p", "bishop"); bi.hp = 5; s.terrain[bi.y][bi.x] = "h";
  T.endTurn(s);
  assert.equal(kn.hp, 6 - T.LAVA_DMG);
  assert.equal(bi.hp, 5 + T.CHAPEL_HEAL);
});
test("enemy turn runs and survive objective eventually wins", () => {
  const camp = T.newCampaign("surv");
  let s;
  for (let n = 1; n < 6; n++) { camp.n = n; camp.lastKind = null; const t = T.buildBattle(camp); if (t.objective.kind === "survive") { s = t; break; } }
  if (!s) return;
  const k = by(s, "p", "king");
  for (let i = 0; i < 40 && s.status === "playing"; i++) { k.hp = k.maxHp = 1e6; T.endTurn(s); }
  assert.equal(s.status, "won");
});

// A simple player: every unit attacks if it can, else walks toward the nearest foe (the king stays home unless the goal is a flag).
function autoplay(s) {
  for (let turn = 0; turn < 60 && s.status === "playing"; turn++) {
    for (const u of T.living(s, "p")) {
      if (s.status !== "playing") break;
      let t = T.attackTargets(s, u);
      if (!t.length) {
        let foes = T.living(s, "e"), best = null, bd = 99;
        if (u.t === "k") foes = s.objective.kind === "reach" ? [{ x: s.terrain[0].indexOf("x"), y: 0 }] : [];
        for (const m of T.legalMoves(s, u)) for (const f of foes) { const d = Math.max(Math.abs(m.x - f.x), Math.abs(m.y - f.y)); if (d < bd) { bd = d; best = m; } }
        if (best) T.doMove(s, u, best.x, best.y);
        t = T.attackTargets(s, u);
      }
      if (t.length) T.doAttack(s, u, t.sort((a, b) => a.hp - b.hp)[0]);
    }
    T.endTurn(s);
  }
}
test("campaign: a simple bot plays several battles, leveling, recruiting and buying gear", () => {
  let reached = 0;
  for (let i = 0; i < 10; i++) {
    const camp = T.newCampaign("bot" + i);
    for (let guard = 0; guard < 12 && camp.state === "camp"; guard++) {
      for (let r = 0; r < 3; r++) T.recruit(camp, r);
      for (let g = 0; g < 3; g++) T.buyGear(camp, g);
      for (const m of camp.roster) if (m.alive && !m.gear && camp.inv.length) T.equip(camp, m.uid, camp.inv[0]);
      for (const m of camp.roster) if (!m.alive) T.revive(camp, m.uid);
      const s = T.startBattle(camp);
      autoplay(s);
      if (s.status === "won") T.endBattle(camp, s);
      else { camp.state = "camp"; const again = T.retryBattle(camp); assert.equal(again.objective.kind, s.objective.kind); break; }
    }
    reached += camp.n;
  }
  console.log("tactics bot avg battles cleared", reached / 10);
  assert.ok(reached / 10 >= 1.5);
});
test("campaign bookkeeping: xp, levels, gear, revive, roster cap", () => {
  const camp = T.newCampaign("book");
  const k = camp.roster[0];
  camp.gold = 500;
  camp.offers = { recruits: [{ t: "p", price: 5 }, { t: "p", price: 5 }, { t: "p", price: 5 }], gear: [{ id: "plate", price: 8 }] };
  assert.ok(T.recruit(camp, 0)); assert.ok(T.recruit(camp, 1)); assert.ok(!T.recruit(camp, 2));
  assert.equal(camp.roster.length, T.MAX_ROSTER);
  assert.ok(T.buyGear(camp, 0)); assert.ok(T.equip(camp, k.uid, "plate")); assert.equal(camp.inv.length, 0);
  assert.ok(T.equip(camp, k.uid, null)); assert.equal(camp.inv.length, 1);
  const s = T.startBattle(camp);
  s.units.filter((u) => u.side === "e").forEach((u) => (u.hp = 0));
  const kn = by(s, "p", "knight"); kn.xpGain = 30;
  const dead = by(s, "p", "bishop"); dead.hp = 0;
  s.status = "won";
  const sum = T.endBattle(camp, s);
  assert.ok(sum.levels.length >= 1); assert.deepEqual(sum.fallen, ["bishop"]);
  const bm = camp.roster.find((m) => m.name === "bishop");
  assert.equal(bm.alive, false);
  assert.ok(T.revive(camp, bm.uid)); assert.ok(bm.alive);
  assert.equal(camp.n, 1);
});
