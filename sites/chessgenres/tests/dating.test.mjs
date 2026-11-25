import test from "node:test";
import assert from "node:assert";
import { CAST, APPROACHES, SPOTS, GIFTS, EVENTS, ENDING_KEYS, newGame, date, work, practice, buy, resolve, confess, endingKey, endingTitle, endingText, charmAdj, heartsOf, DAYS, LOVE, FRIEND, ROSTER_SIZE, MAX_CHARM } from "../public/dating-logic.js";

const quiet = (o = {}) => newGame({ seed: 1, quiet: true, roster: CAST.map((c) => c.id).slice(0, 6), ...o }); // knight bishop rook queen king pawn

test("every cast member loves exactly one approach and has lines, spots, a gift and a scene", () => {
  assert.equal(CAST.length, 10);
  for (const c of CAST) {
    assert.deepEqual(Object.keys(c.prefs).sort(), APPROACHES.map((a) => a.id).sort());
    assert.equal(Object.values(c.prefs).filter((d) => d === 3).length, 1);
    for (const d of Object.values(c.prefs)) assert.ok(c.say[d], c.id + " missing line for " + d);
    assert.ok(Object.values(c.prefs).includes(-2), c.id + " needs a thing they hate");
    assert.ok(c.spots.fav.length === 2 && SPOTS.some((x) => x.id === c.spots.hate) && !c.spots.fav.includes(c.spots.hate));
    assert.ok(c.spots.fav.every((x) => SPOTS.some((y) => y.id === x)));
    assert.ok(GIFTS.some((x) => x.id === c.gift));
    assert.equal(c.scene.choices.length, 3);
    assert.deepEqual(c.scene.choices.map((x) => x.v).sort(), [0, 1, 2]);
    assert.ok(c.win && c.true);
  }
});
test("a game seats six of ten, offers three spots, and different seeds differ", () => {
  const g = newGame({ seed: 5 });
  assert.equal(g.roster.length, ROSTER_SIZE); assert.equal(new Set(g.roster).size, ROSTER_SIZE);
  assert.equal(g.spotsToday.length, 3);
  const rosters = new Set(Array.from({ length: 20 }, (_, i) => newGame({ seed: i }).roster.join()));
  assert.ok(rosters.size > 5);
});
test("shuffling mixes up what each person loves but keeps one love each", () => {
  const g = newGame({ seed: 3, shuffle: true });
  let changed = 0;
  for (const id of g.roster) {
    assert.equal(Object.values(g.prefs[id]).filter((d) => d === 3).length, 1);
    if (JSON.stringify(g.prefs[id]) !== JSON.stringify(CAST.find((c) => c.id === id).prefs)) changed++;
  }
  assert.ok(changed >= 1);
});
test("dates raise one heart, cool the others, and clamp at zero", () => {
  const g = quiet();
  date(g, "knight", "leap");
  assert.equal(g.aff.knight, 3); assert.equal(g.aff.bishop, 0);
  date(g, "knight", "leap"); date(g, "bishop", "bold");
  assert.equal(g.aff.knight, 5); assert.equal(g.aff.bishop, 0);
  assert.equal(date(g, "knight", "nope"), null);
  assert.equal(date(g, "gm", "leap"), null); // not on this roster
});
test("places and gifts add to a date and are remembered", () => {
  const g = quiet(); const fav = CAST[0].spots.fav[0];
  g.spotsToday = [fav, "cafe", "garden"];
  date(g, "knight", "leap", fav); assert.equal(g.aff.knight, 4); assert.equal(g.seenSpot.knight[fav], "fav");
  g.spotsToday = [fav, "cafe", "garden"];
  assert.equal(date(g, "knight", "leap", "library"), null); // not offered today
  assert.equal(date(g, "knight", "leap", null, "trophy"), null); // not owned
  g.coins = 5; buy(g, "trophy"); assert.equal(g.coins, 2); assert.equal(g.inv.trophy, 1);
  g.spotsToday = ["library", "cafe", "garden"];
  date(g, "knight", "leap", "library", "trophy"); // +3 -1 +4
  assert.equal(g.aff.knight, 4 + 6); assert.equal(g.inv.trophy, 0); assert.equal(g.seenGift.knight.trophy, "love");
  assert.equal(buy(g, "bouquet"), null); // 2 coins, costs 3
});
test("working earns coins, practising raises charm to a cap, both cool everyone", () => {
  const g = quiet();
  date(g, "knight", "leap"); const c0 = g.coins;
  assert.ok(work(g)); assert.equal(g.coins, c0 + 3); assert.equal(g.aff.knight, 2); assert.equal(g.day, 3);
  for (let i = 0; i < MAX_CHARM; i++) assert.ok(practice(g));
  assert.equal(g.charm, MAX_CHARM); assert.equal(practice(g), null);
  assert.equal(charmAdj(-2, 3), 0); assert.equal(charmAdj(0, 1), 1); assert.equal(charmAdj(3, 3), 4); assert.equal(charmAdj(3, 1), 3);
});
test("ten days then confession; loving approach wins", () => {
  const g = quiet();
  for (let i = 0; i < DAYS; i++) assert.ok(date(g, "rook", "direct"));
  assert.equal(g.phase, "confess");
  assert.equal(date(g, "rook", "direct"), null);
  assert.ok(g.aff.rook >= LOVE);
  assert.equal(confess(g, "rook").kind, "checkmate");
  assert.equal(g.phase, "over");
});
test("scenes trigger once trust builds and the answer changes the ending", () => {
  const g = newGame({ seed: 2, roster: CAST.map((c) => c.id).slice(0, 6) }); g.pending = null; g.spotsToday = [];
  for (let i = 0; i < 3; i++) { g.pending = null; assert.ok(date(g, "knight", "leap")); }
  assert.equal(g.pending.type, "scene"); assert.equal(g.pending.who, "knight");
  assert.equal(date(g, "knight", "leap"), null); // blocked until you answer
  const good = g.pending.choices.findIndex((c) => c.v === 2);
  const aff = g.aff.knight;
  assert.equal(resolve(g, good).v, 2); assert.equal(g.aff.knight, aff + 4); assert.equal(g.scenes.knight, 2);
  while (g.phase === "play") { g.pending = null; date(g, "knight", "leap"); }
  const e = confess(g, "knight"); assert.equal(e.kind, "checkmate"); assert.ok(e.true);
  assert.equal(endingKey(e), "true:knight");
});
test("events pause the day, resolve with a choice and change things", () => {
  let g, seed = 0;
  do { g = newGame({ seed: seed++ }); g.day = 2; g.pending = null; } while (false);
  // roll days until one has an event pending
  for (seed = 0; seed < 200; seed++) { g = newGame({ seed }); for (let i = 0; i < 6 && !g.pending; i++) { work(g); } if (g.pending) break; }
  assert.ok(g.pending && g.pending.type === "event");
  assert.equal(date(g, g.roster[0], "direct"), null);
  assert.equal(resolve(g, 99), null);
  assert.ok(resolve(g, 0)); assert.equal(g.pending, null);
  assert.ok(EVENTS.length >= 6);
});
test("endings: rejected, friends, stalemate, tycoon, fork, crowd", () => {
  let g = quiet(); for (let i = 0; i < DAYS; i++) date(g, "king", "leap");
  assert.equal(confess(g, "king").kind, "rejected");
  g = quiet(); for (let i = 0; i < 4; i++) date(g, "queen", "bold");
  for (let i = DAYS - 4; i > 0; i--) date(g, "queen", "sidelong");
  assert.equal(confess(g, "queen").kind, "friends");
  g = quiet(); for (let i = 0; i < DAYS; i++) date(g, "queen", "sidelong");
  assert.equal(confess(g, null).kind, "stalemate");
  g = quiet(); g.coins = 40; for (let i = 0; i < DAYS; i++) date(g, "queen", "sidelong");
  assert.equal(confess(g, null).kind, "tycoon");
  g = quiet(); g.phase = "confess"; g.aff.knight = LOVE; g.aff.rook = LOVE + 3;
  const f = confess(g, "all"); assert.equal(f.kind, "fork"); assert.ok(endingText(f).includes("fork"));
  g = quiet(); g.phase = "confess"; g.aff.knight = LOVE;
  assert.equal(confess(g, "all").kind, "crowd");
});
test("every ending has a key, a title and text; gallery has no duplicates", () => {
  assert.equal(new Set(ENDING_KEYS).size, ENDING_KEYS.length);
  for (const k of ENDING_KEYS) assert.ok(endingTitle(k), k);
  for (const c of CAST) {
    assert.ok(endingText({ kind: "checkmate", who: c.id }).length > 20);
    assert.ok(endingText({ kind: "checkmate", who: c.id, true: true }).includes("True"));
    assert.equal(endingKey({ kind: "checkmate", who: c.id }), "checkmate:" + c.id);
  }
  assert.ok(heartsOf(quiet(), "knight") === 0);
});
test("a fully random player always reaches a legal ending", () => {
  for (let seed = 0; seed < 50; seed++) {
    const g = newGame({ seed, shuffle: seed % 2 === 0 }); const r = (n) => Math.floor(g.rand() * n);
    let guard = 0;
    while (g.phase === "play" && guard++ < 200) {
      if (g.pending) { resolve(g, r(g.pending.choices.length)); continue; }
      const k = r(5);
      if (k === 0) work(g); else if (k === 1) { practice(g) || work(g); }
      else date(g, g.roster[r(g.roster.length)], APPROACHES[r(APPROACHES.length)].id, g.rand() < 0.5 ? g.spotsToday[r(3)] : null);
    }
    assert.equal(g.phase, "confess"); assert.ok(g.day <= DAYS);
    assert.ok(confess(g, [null, "all", g.roster[0]][r(3)])); assert.ok(ENDING_KEYS.includes(endingKey(g.ending)));
  }
});
