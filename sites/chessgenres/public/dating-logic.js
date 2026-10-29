// Pure rules for Chess Heart (a dating sim) — no DOM, so tests can import it.
// You're a pawn with ten days to win someone's heart before the board closes.
// Every day you spend it on one piece with one approach named after how a piece
// moves. Each piece loves exactly one approach; finding it is the game.
export const APPROACHES = [
  { id: "direct", glyph: "♜", name: "say it straight", text: "Tell them exactly how you feel, no detours." },
  { id: "sidelong", glyph: "♝", name: "flirt sideways", text: "Come at it on the diagonal: a compliment that could mean two things." },
  { id: "leap", glyph: "♞", name: "do something unexpected", text: "Hop right over the small talk and do something ridiculous." },
  { id: "advance", glyph: "♟", name: "one square at a time", text: "Ask about their day. Remember the answer. Repeat." },
  { id: "bold", glyph: "♛", name: "go all out", text: "Grand gesture. Flowers, a band, the whole board." },
];

// delta per approach: 3 loved, 1 liked, 0 meh, -2 ouch. Each cast member loves one approach.
export const CAST = [
  { id: "knight", glyph: "♞", name: "Sir Nimbus", blurb: "a knight who has never once gone in a straight line.",
    prefs: { leap: 3, sidelong: 1, advance: 0, direct: 0, bold: -2 },
    say: { 3: "Nimbus laughs so hard his helmet rattles. \"Nobody's ever jumped the conversation before!\"",
           1: "Nimbus tilts his head. \"Hm. Almost an L. I'll allow it.\"",
           0: "Nimbus nods politely and looks at the horizon, as knights do.",
          "-2": "Nimbus winces. \"So much... fanfare. I need to go stand in a corner. Sideways.\"" } },
  { id: "bishop", glyph: "♝", name: "Bea", blurb: "a bishop who only ever meets people at an angle.",
    prefs: { sidelong: 3, direct: 1, bold: 0, leap: 0, advance: -2 },
    say: { 3: "Bea goes pink. \"You noticed the diagonal. Nobody notices the diagonal.\"",
           1: "Bea blinks. \"Direct. Refreshing. Terrifying. Keep going.\"",
           0: "Bea smiles the smile of someone who has already planned three moves ahead.",
          "-2": "Bea's smile cools. \"One square at a time? I'm a long-range piece. Don't pace me.\"" } },
  { id: "rook", glyph: "♜", name: "Rhea", blurb: "a rook who values plain speech and well-defended files.",
    prefs: { direct: 3, advance: 1, leap: 0, bold: 0, sidelong: -2 },
    say: { 3: "Rhea's eyes light up. \"Finally. Someone who says what they mean. Open file, open heart.\"",
           1: "Rhea gives a firm nod. \"Steady. I can build a back rank on that.\"",
           0: "Rhea checks her watch, then checks it again, then checks the board.",
          "-2": "Rhea frowns. \"Was that a compliment or a trap? I can't see through diagonals.\"" } },
  { id: "queen", glyph: "♛", name: "Quinn", blurb: "a queen who can go anywhere and is unimpressed by most places.",
    prefs: { bold: 3, leap: 1, sidelong: 0, advance: 0, direct: -2 },
    say: { 3: "Quinn arches an eyebrow, then both. \"A band? For me? Fine. You have my attention. All of it.\"",
           1: "Quinn smirks. \"Reckless. I can work with reckless.\"",
           0: "Quinn examines her nails. They are, naturally, flawless.",
          "-2": "Quinn sighs. \"Honesty. In this economy. Try again with more confetti.\"" } },
  { id: "king", glyph: "♚", name: "the King", blurb: "a king who moves one square a turn and has opinions about it.",
    prefs: { advance: 3, bold: 1, direct: 0, sidelong: 0, leap: -2 },
    say: { 3: "The King places a hand on his crown. \"One square at a time. Yes. That's... that's how it should be done.\"",
           1: "The King allows the faintest nod. \"Ambitious. A little drafty. But ambitious.\"",
           0: "The King contemplates a very small step to the left.",
          "-2": "The King recoils. \"Jumping over pieces? In MY castle? Guards!\" (There are no guards.)" } },
];

export const DAYS = 10;
export const LOVE = 18; // 10 days x the +3 a loved approach gives is 30; 18 is six good days, so a couple of wasted days while you learn them still wins
export const FRIEND = 9; // half of LOVE
export const MAX = 24;

export function newGame() {
  const aff = {}; const seen = {};
  for (const c of CAST) { aff[c.id] = 0; seen[c.id] = {}; }
  return { day: 1, aff, seen, last: null, phase: "play", ending: null };
}

export function cast(id) { return CAST.find((c) => c.id === id); }
export function tierOf(delta) { return delta >= 3 ? "loved" : delta >= 1 ? "liked" : delta === 0 ? "meh" : "ouch"; }

// Spend today on `who` with `how`. Everyone else drifts one heart colder,
// so you can't just poke at all five. Returns the result or null if illegal.
export function date(g, who, how) {
  if (g.phase !== "play") return null;
  const c = cast(who);
  if (!c || !APPROACHES.some((a) => a.id === how)) return null;
  const delta = c.prefs[how];
  for (const o of CAST) {
    if (o.id === who) g.aff[o.id] = Math.min(MAX, Math.max(0, g.aff[o.id] + delta));
    else g.aff[o.id] = Math.max(0, g.aff[o.id] - 1);
  }
  g.seen[who][how] = tierOf(delta);
  g.last = { who, how, delta, tier: tierOf(delta), line: c.say[delta] };
  if (g.day >= DAYS) g.phase = "confess"; else g.day++;
  return g.last;
}

// Day 11: confess to someone, or walk away. Returns the ending.
export function confess(g, who) {
  if (g.phase !== "confess") return null;
  if (who === null) g.ending = { kind: "stalemate", who: null };
  else {
    const a = g.aff[who];
    g.ending = { kind: a >= LOVE ? "checkmate" : a >= FRIEND ? "friends" : "rejected", who, aff: a };
  }
  g.phase = "over";
  return g.ending;
}

export function endingText(e) {
  if (e.kind === "stalemate") return "You walk away. Nobody is in check, nobody can move, and the board is declared a draw. (Stalemate.)";
  const c = cast(e.who);
  if (e.kind === "checkmate") return `${c.name} says yes. It's checkmate — the good kind, where both sides win. You are promoted to partner.`;
  if (e.kind === "friends") return `${c.name} smiles. "I like you. Just not like that." You settle for a draw by mutual respect.`;
  return `${c.name} says no. You resign, gracefully, and offer a handshake, which is also declined.`;
}

export function heartsOf(g, id) { return Math.floor(g.aff[id] / 3); } // 0-8 hearts shown
