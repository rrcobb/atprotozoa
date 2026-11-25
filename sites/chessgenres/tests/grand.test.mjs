import { test } from "node:test";
import assert from "node:assert";
import { newGame, myMoves, move, genMoves, wait, genMap, solid, GOAL, SIZE, PROPS, score, rankTitle } from "../public/grand-logic.js";

const clear = (s) => { s.civs = []; s.cars = []; s.cops = []; s.offers = []; s.cash_at = []; s.blocks = []; return s; };

test("on foot moves like a king and not into buildings or water", () => {
  const s = newGame(1);
  const ms = myMoves(s);
  assert.ok(ms.length > 0 && ms.every((m) => Math.max(Math.abs(m.x - s.me.x), Math.abs(m.y - s.me.y)) === 1));
  const w = genMap(3);
  assert.ok(w.map.every((r) => r.length === SIZE) && w.map.length === SIZE);
});

test("the river is crossable only at two bridges, and every seed's streets are connected", () => {
  for (let seed = 1; seed < 40; seed++) {
    const s = newGame(seed);
    const bridges = s.map.join("").split("").filter((c) => c === "=").length;
    assert.equal(bridges, 2);
    // flood fill over street/bridge tiles from the start
    const seen = new Set(["0," + (SIZE - 1)]), q = [[0, SIZE - 1]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && !solid(s, nx, ny) && !seen.has(nx + "," + ny)) { seen.add(nx + "," + ny); q.push([nx, ny]); }
      }
    }
    for (const t of [...s.props, s.spray, ...s.cars, ...s.cash_at]) assert.ok(seen.has(t.x + "," + t.y), `seed ${seed} reachable`);
    assert.equal(s.props.length, 4);
  }
});

test("knights jump the river, sliders do not", () => {
  const s = clear(newGame(2));
  const { vertical, rc } = s.river;
  // find a street square beside the river, not on a bridge lane
  let spot = null;
  for (let a = 0; a < SIZE && !spot; a++) {
    const [x, y] = vertical ? [rc - 1, a] : [a, rc + 1];
    if (s.map[y][x] === "." && s.map[vertical ? y : y - 1][vertical ? rc : x] === "~") spot = { x, y };
  }
  assert.ok(spot);
  s.me = { ...spot, ride: "r", armor: false };
  const far = (m) => (vertical ? m.x > rc : m.y < rc);
  assert.ok(!myMoves(s).some(far));
  s.me.ride = "n";
  assert.ok(myMoves(s).every((m) => !solid(s, m.x, m.y)));
});

test("carjacking swaps rides and raises wanted", () => {
  const s = clear(newGame(1));
  s.me = { x: 2, y: 3, ride: "k", armor: false };
  s.cars = [{ x: 3, y: 3, t: "n" }];
  assert.ok(move(s, 3, 3));
  assert.strictEqual(s.me.ride, "n");
  assert.strictEqual(s.wanted, 1);
  assert.strictEqual(s.cars.length, 0);
});

test("sliders are blocked by bodies", () => {
  const s = clear(newGame(1));
  s.civs = [{ x: 0, y: 8 }]; s.blocks = [];
  s.me = { x: 0, y: 12, ride: "r", armor: false };
  const ys = myMoves(s).filter((m) => m.x === 0).map((m) => m.y);
  assert.ok(ys.includes(8) && !ys.includes(7));
});

test("cash wins the run", () => {
  const s = clear(newGame(1));
  s.me = { x: 0, y: 12, ride: "k", armor: false };
  s.cash = GOAL - 100; s.cash_at = [{ x: 1, y: 12 }];
  move(s, 1, 12);
  assert.strictEqual(s.status, "won");
  assert.ok(score(s) > GOAL);
});

test("cops capture you with real moves; lives, armour and spray", () => {
  const s = clear(newGame(1));
  s.wanted = 1; s.me = { x: 3, y: 3, ride: "k", armor: false }; s.cash = 100;
  s.cops = [{ x: 3, y: 0, t: "r" }];
  wait(s);
  assert.strictEqual(s.status, "playing"); // first capture costs a life, not the run
  assert.strictEqual(s.lives, 2);
  assert.strictEqual(s.cash, 50);
  assert.deepEqual([s.me.x, s.me.y], [s.home.x, s.home.y]);
  const t = clear(newGame(1));
  t.lives = 1; t.wanted = 1; t.me = { x: 3, y: 3, ride: "k", armor: false }; t.cops = [{ x: 3, y: 0, t: "r" }];
  wait(t);
  assert.strictEqual(t.status, "lost");
  const a = clear(newGame(1));
  a.wanted = 1; a.me = { x: 3, y: 3, ride: "q", armor: true }; a.cops = [{ x: 3, y: 0, t: "r" }];
  wait(a);
  assert.strictEqual(a.status, "playing"); assert.strictEqual(a.me.armor, false); assert.strictEqual(a.lives, 3); assert.strictEqual(a.cops.length, 0);
  const u = clear(newGame(1));
  u.wanted = 2; u.cops = [{ x: 0, y: 0, t: "n" }]; u.me = { x: u.spray.x - 1, y: u.spray.y, ride: "k", armor: false };
  if (u.map[u.spray.y][u.spray.x - 1] === ".") { move(u, u.spray.x, u.spray.y); assert.strictEqual(u.wanted, 0); assert.strictEqual(u.cops.length, 0); }
});

test("a taxi fare pays on delivery and fails on the clock", () => {
  const s = clear(newGame(4));
  s.me = { x: 0, y: 12, ride: "r", armor: false };
  s.offers = [{ x: 0, y: 9, kind: "taxi", ttl: 30 }];
  move(s, 0, 9);
  assert.equal(s.job.kind, "taxi");
  const to = s.job.to, fare = s.job.fare;
  s.cash = 0;
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: to.x + dx, y: to.y + dy })).find((p) => p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE && !solid(s, p.x, p.y));
  s.me = { ...nb, ride: "k", armor: false };
  move(s, to.x, to.y);
  assert.equal(s.job, null);
  assert.ok(s.cash >= fare);
  const t = clear(newGame(4));
  t.me = { x: 0, y: 12, ride: "r", armor: false };
  t.job = { kind: "taxi", to: { x: 12, y: 0 }, fare: 100, deadline: t.turn };
  wait(t);
  assert.equal(t.job, null); assert.equal(t.failed, 1);
});

test("a heist gives loot and stars; banking at a safehouse pays and clears the heat", () => {
  const s = clear(newGame(5));
  s.me = { x: 0, y: 12, ride: "k", armor: false };
  s.offers = [{ x: 1, y: 12, kind: "heist", ttl: 30 }];
  move(s, 1, 12);
  assert.equal(s.loot, 450); assert.ok(s.wanted >= 3);
  const sf = s.props.find((p) => p.type === "safe"); sf.owned = true;
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: sf.x + dx, y: sf.y + dy })).find((p) => p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE && !solid(s, p.x, p.y));
  s.me = { ...nb, ride: "k", armor: false }; s.cops = [];
  const c0 = s.cash;
  move(s, sf.x, sf.y);
  assert.equal(s.cash, c0 + 450); assert.equal(s.wanted, 0); assert.equal(s.job, null); assert.equal(s.done, 1);
});

test("lying low on a property for sale buys it; the garage swaps your ride", () => {
  const s = clear(newGame(6));
  const g = s.props.find((p) => p.type === "garage");
  s.me = { x: g.x, y: g.y, ride: "k", armor: false };
  s.cash = 100; wait(s); assert.equal(g.owned, false);
  s.cash = PROPS.garage.price; wait(s); assert.equal(g.owned, true); assert.equal(s.cash, 0);
  const stock = g.stock;
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: g.x + dx, y: g.y + dy })).find((p) => p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE && !solid(s, p.x, p.y));
  s.me = { ...nb, ride: "k", armor: false };
  move(s, g.x, g.y);
  assert.equal(s.me.ride, stock);
  assert.equal(rankTitle(s), "errand boy");
});

test("high wanted levels raise roadblocks", () => {
  const s = clear(newGame(7));
  s.wanted = 5; s.me = { x: 6, y: 6, ride: "q", armor: false };
  for (let i = 0; i < 12 && s.status === "playing"; i++) { s.cops = []; wait(s); s.wanted = 5; if (s.blocks.length) break; }
  assert.ok(s.blocks.length > 0 && s.blocks.length <= 3);
});

test("knight moves", () => {
  const ms = genMoves("n", 4, 4, () => false, () => true);
  assert.ok(ms.length > 0 && ms.every((m) => Math.abs(m.x - 4) * Math.abs(m.y - 4) === 2));
});
