// Pure game rules for breadboard-555. One shared board, a parts stack per
// player. Every function mutates the state it is handed, so the same code runs
// on a plain object (hot-seat, tests) and inside an Automerge handle.change()
// draft. No undefined values are ever stored: Automerge rejects them.
import { newStack, evaluate, fmtHz, KINDS } from "./circuit.js";

export function newGame(clientId) {
  return {
    turn: 0,
    winner: null, // 1 or 2 once somebody's circuit oscillates
    seats: [clientId || null, null], // who sits where (online play)
    stacks: [newStack(), newStack()],
    placed: [], // the one shared board: {id, kind, a, b, by, ohms?, farads?}
    log: "player 1 starts. pick a part from your stack.",
    round: 0, // bumps on every rematch so clients can tell it's a new game
  };
}

const name = (s) => `player ${s + 1}`;
const label = (p) => KINDS[p.kind].label;

// Why a move is not allowed, or null.
export function whyNot(g, seat) {
  if (g.winner) return "the game is over.";
  if (seat !== g.turn) return `it's ${name(g.turn)}'s turn.`;
  return null;
}

function finish(g, seat, verb, part) {
  const res = evaluate(g.placed);
  if (res.ok) {
    g.winner = seat + 1;
    g.result = `${fmtHz(res.hz)} (${res.mode}) after ${g.placed.length} parts`;
    g.log = `${name(seat)} ${verb} a ${label(part)} and the 555 is oscillating at ${fmtHz(res.hz)}.`;
    return;
  }
  const note = res.short ? " 💨 that shorted V+ to GND. smoke everywhere." : "";
  g.turn = 1 - seat;
  g.log = `${name(seat)} ${verb} a ${label(part)}.${note} ${name(g.turn)}: your move.`;
}

// Put a part from the mover's own stack on the board.
export function place(g, seat, partId, a, b) {
  if (whyNot(g, seat) || a === b) return false;
  const i = g.stacks[seat].findIndex((p) => p.id === partId);
  if (i < 0) return false;
  const src = g.stacks[seat][i];
  const rec = { id: src.id, kind: src.kind, a, b, by: seat };
  if (src.ohms) rec.ohms = src.ohms;
  if (src.farads) rec.farads = src.farads;
  g.stacks[seat].splice(i, 1);
  g.placed.push(rec);
  finish(g, seat, "placed", src);
  return true;
}

// Move any part already on the board, yours or your opponent's. That is how
// you advance your own circuit or block theirs.
export function move(g, seat, partId, a, b) {
  if (whyNot(g, seat) || a === b) return false;
  const p = g.placed.find((q) => q.id === partId);
  if (!p) return false;
  p.a = a;
  p.b = b;
  finish(g, seat, "moved", p);
  return true;
}

export function pass(g, seat) {
  if (whyNot(g, seat)) return false;
  g.turn = 1 - seat;
  g.log = `${name(seat)} passed. ${name(g.turn)}: your move.`;
  return true;
}

// Rematch in place so the join link keeps working.
export function rematch(g) {
  g.turn = g.round % 2 === 0 ? 1 : 0; // openers alternate between rematches
  g.winner = null;
  delete g.result;
  g.stacks = [newStack(), newStack()];
  g.placed = [];
  g.round = g.round + 1;
  g.log = `rematch. ${name(g.turn)} starts.`;
}
