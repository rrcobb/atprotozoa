// Pure rules for Chess Heart (a dating sim) — no DOM, so tests can import it.
// You're a pawn with ten days to win someone's heart before the board closes.
// Six of ten pieces turn up each game. Each day you pick one piece, one of three
// places on offer, one way to approach them (named for how a piece moves), and
// maybe a gift. Or you work a shift, or practise charm. Random events interrupt,
// and once someone trusts you they test you with a scene. There are many endings.
export const APPROACHES = [
  { id: "direct", glyph: "♜", name: "say it straight", text: "Tell them exactly how you feel, no detours." },
  { id: "sidelong", glyph: "♝", name: "flirt sideways", text: "Come at it on the diagonal: a compliment that could mean two things." },
  { id: "leap", glyph: "♞", name: "do something unexpected", text: "Hop right over the small talk and do something ridiculous." },
  { id: "advance", glyph: "♟", name: "one square at a time", text: "Ask about their day. Remember the answer. Repeat." },
  { id: "bold", glyph: "♛", name: "go all out", text: "Grand gesture. Flowers, a band, the whole board." },
  { id: "castle", glyph: "♚", name: "offer shelter", text: "Bring soup. Bring a blanket. Tuck them safely behind the wall." },
];
export const SPOTS = [
  { id: "library", glyph: "📚", name: "the library" },
  { id: "cafe", glyph: "☕", name: "the Fianchetto Café" },
  { id: "hall", glyph: "🏟️", name: "the tournament hall" },
  { id: "garden", glyph: "🌳", name: "the walled garden" },
  { id: "tower", glyph: "⏰", name: "the clock tower" },
  { id: "rooftop", glyph: "🌙", name: "the moonlit rooftop" },
];
export const GIFTS = [
  { id: "book", glyph: "📖", name: "an opening book", price: 2 },
  { id: "tea", glyph: "🫖", name: "a pot of tea", price: 2 },
  { id: "trophy", glyph: "🏆", name: "a tiny trophy", price: 3 },
  { id: "bouquet", glyph: "💐", name: "a bouquet", price: 3 },
  { id: "watch", glyph: "⌚", name: "a pocket watch", price: 2 },
  { id: "poem", glyph: "📜", name: "a hand-written sonnet", price: 1 },
];

const ids = APPROACHES.map((a) => a.id);
// love gets +3, likes +1, ouches -2, everything else 0
const P = (love, like = [], ouch = []) => {
  const p = Object.fromEntries(ids.map((a) => [a, 0]));
  p[love] = 3; for (const a of like) p[a] = 1; for (const a of ouch) p[a] = -2;
  return p;
};

// delta per approach: 3 loved, 1 liked, 0 meh, -2 ouch. Everyone loves exactly one approach.
// scene choices: v 2 = the right answer for them, 1 = fine, 0 = a mistake.
export const CAST = [
  { id: "knight", glyph: "♞", name: "Sir Nimbus", blurb: "a knight who has never once gone in a straight line.",
    prefs: P("leap", ["sidelong"], ["bold"]), spots: { fav: ["hall", "rooftop"], hate: "library" }, gift: "trophy",
    say: { 3: "Nimbus laughs so hard his helmet rattles. \"Nobody's ever jumped the conversation before!\"",
           1: "Nimbus tilts his head. \"Hm. Almost an L. I'll allow it.\"",
           0: "Nimbus nods politely and looks at the horizon, as knights do.",
          "-2": "Nimbus winces. \"So much... fanfare. I need to go stand in a corner. Sideways.\"" },
    scene: { text: "Nimbus is stuck at a fork in the garden path and refuses to take either one.", choices: [
      { v: 2, label: "\"Third option: over the hedge.\"", reply: "\"Over. THE HEDGE.\" He vaults it and lands, beaming, on the far side." },
      { v: 1, label: "Pick the left path, decisively.", reply: "\"Fine. Left. Though left is a bit... straight.\"" },
      { v: 0, label: "Take his hand and lead him.", reply: "\"I am a knight. I do not get led.\" He clanks off in a huff." }] },
    win: "Nimbus proposes in three moves: two forward, one to the side. You say yes before the L is finished.",
    true: "Nimbus hops the whole board to reach you, lands on your square, and takes you with him. \"No fork,\" he says. \"Just you.\"" },
  { id: "bishop", glyph: "♝", name: "Bea", blurb: "a bishop who only ever meets people at an angle.",
    prefs: P("sidelong", ["direct"], ["advance"]), spots: { fav: ["library", "garden"], hate: "hall" }, gift: "poem",
    say: { 3: "Bea goes pink. \"You noticed the diagonal. Nobody notices the diagonal.\"",
           1: "Bea blinks. \"Direct. Refreshing. Terrifying. Keep going.\"",
           0: "Bea smiles the smile of someone who has already planned three moves ahead.",
          "-2": "Bea's smile cools. \"One square at a time? I'm a long-range piece. Don't pace me.\"" },
    scene: { text: "Bea hands you a note written diagonally across the page. \"Read it,\" she says. \"If you can.\"", choices: [
      { v: 2, label: "Tilt your head and read it corner to corner.", reply: "Bea's eyes shine. \"Nobody has ever read it the way it was written.\"" },
      { v: 1, label: "Ask her what it says.", reply: "\"Hm. A fair question. A little square, but fair.\"" },
      { v: 0, label: "Turn the page straight and read it normally.", reply: "\"You ruined it,\" she says, gently, crossing out your name." }] },
    win: "Bea takes your arm at an angle that is, mathematically, perfect. \"Same colour squares forever,\" she says.",
    true: "Bea folds the diagonal note into your hand: your name, written across the corner. \"I've been writing it for weeks.\"" },
  { id: "rook", glyph: "♜", name: "Rhea", blurb: "a rook who values plain speech and well-defended files.",
    prefs: P("direct", ["advance", "castle"], ["sidelong"]), spots: { fav: ["tower", "hall"], hate: "rooftop" }, gift: "watch",
    say: { 3: "Rhea's eyes light up. \"Finally. Someone who says what they mean. Open file, open heart.\"",
           1: "Rhea gives a firm nod. \"Steady. I can build a back rank on that.\"",
           0: "Rhea checks her watch, then checks it again, then checks the board.",
          "-2": "Rhea frowns. \"Was that a compliment or a trap? I can't see through diagonals.\"" },
    scene: { text: "Rhea's back rank is cramped. She wonders aloud whether she should castle out of it.", choices: [
      { v: 2, label: "\"Clear the squares between us. I'll hold the door.\"", reply: "Rhea steps next to you and the king-side suddenly looks very safe." },
      { v: 1, label: "\"Just do it, you'll be fine.\"", reply: "\"Hm. Efficient. A bit blunt even for me.\"" },
      { v: 0, label: "Put a casserole on the f1 square.", reply: "\"That is illegal,\" she says. \"It's also a casserole. I'm leaving.\"" }] },
    win: "Rhea shakes your hand once, firmly, and does not let go. \"Connected rooks,\" she says. \"Us.\"",
    true: "Rhea clears the whole file between you with one sweep, looks you in the eye, and says it plainly. It takes four words and no detours." },
  { id: "queen", glyph: "♛", name: "Quinn", blurb: "a queen who can go anywhere and is unimpressed by most places.",
    prefs: P("bold", ["leap"], ["direct"]), spots: { fav: ["rooftop", "hall"], hate: "library" }, gift: "bouquet",
    say: { 3: "Quinn arches an eyebrow, then both. \"A band? For me? Fine. You have my attention. All of it.\"",
           1: "Quinn smirks. \"Reckless. I can work with reckless.\"",
           0: "Quinn examines her nails. They are, naturally, flawless.",
          "-2": "Quinn sighs. \"Honesty. In this economy. Try again with more confetti.\"" },
    scene: { text: "Quinn gestures at the empty chair across from her. \"Convince me you belong on this board.\"", choices: [
      { v: 2, label: "\"I'm a pawn. Give me eight squares and watch.\"", reply: "Quinn actually laughs. \"Eight squares. You'd better mean it.\"" },
      { v: 1, label: "Compliment her crown.", reply: "\"Predictable. But the crown is wonderful.\"" },
      { v: 0, label: "Apologize for taking up space.", reply: "\"Dull,\" Quinn says, and turns her chair around." }] },
    win: "Quinn crowns you herself, in front of everyone, with a tiara she definitely had prepared. \"Do keep up,\" she says, glowing.",
    true: "Quinn clears the board of every piece but the two of you and says, \"I could go anywhere. I'm staying here.\"" },
  { id: "king", glyph: "♚", name: "the King", blurb: "a king who moves one square a turn and has opinions about it.",
    prefs: P("advance", ["bold", "castle"], ["leap"]), spots: { fav: ["garden", "library"], hate: "rooftop" }, gift: "tea",
    say: { 3: "The King places a hand on his crown. \"One square at a time. Yes. That's... that's how it should be done.\"",
           1: "The King allows the faintest nod. \"Ambitious. A little drafty. But ambitious.\"",
           0: "The King contemplates a very small step to the left.",
          "-2": "The King recoils. \"Jumping over pieces? In MY castle? Guards!\" (There are no guards.)" },
    scene: { text: "The King confesses he hasn't left his castle in years. \"It's... drafty out there.\"", choices: [
      { v: 2, label: "\"Let's walk exactly one square past the gate.\"", reply: "He takes the square. Then, after a long moment, another. \"Drafty,\" he says. \"But pleasant.\"" },
      { v: 1, label: "\"Be brave, Your Majesty.\"", reply: "\"Bravery is an overrated opening,\" he mutters, but he's smiling." },
      { v: 0, label: "Drag him out by the cape.", reply: "\"Regicide,\" he whispers, scandalised, and retreats behind his wall." }] },
    win: "The King walks you one square down the aisle, then one more, then one more. By the eighth he is crying a little.",
    true: "The King leaves his castle on his own, crosses the board alone, and kneels, one square at a time, in front of you." },
  { id: "pawn", glyph: "♙", name: "Pippa", blurb: "a pawn who has been staring at the far rank since the first move.",
    prefs: P("castle", ["advance", "direct"], ["bold"]), spots: { fav: ["cafe", "garden"], hate: "tower" }, gift: "book",
    say: { 3: "Pippa sniffles into the blanket. \"Nobody's ever tucked a pawn in. Pawns are what people sacrifice.\"",
           1: "Pippa brightens. \"You asked how I'm doing and you waited for the answer. I'm keeping you.\"",
           0: "Pippa smiles politely and re-counts the squares to the eighth rank. Seven. Still seven.",
          "-2": "Pippa shrinks. \"A grand gesture? I'm one square tall. Please don't make me a spectacle.\"" },
    scene: { text: "Pippa stares at the far rank. \"Eight steps. Do you think anyone actually makes it?\"", choices: [
      { v: 2, label: "\"I'll walk the first step with you.\"", reply: "Pippa takes your hand. \"One,\" she whispers. \"I can do one.\"" },
      { v: 1, label: "\"Statistically, yes.\"", reply: "\"That's... weirdly comforting. Thanks.\"" },
      { v: 0, label: "\"Honestly? Probably not.\"", reply: "Pippa nods slowly and walks away at exactly one square per turn." }] },
    win: "Pippa promotes on the eighth square, turns, and shouts a name to the whole board. It's yours.",
    true: "Pippa reaches the last rank, turns into a queen, and immediately offers you the crown. \"I only wanted to get here with you,\" she says." },
  { id: "arbiter", glyph: "⏱️", name: "Clark", blurb: "an arbiter who has not been late in forty years and will not start now.",
    prefs: P("direct", ["castle"], ["leap"]), spots: { fav: ["tower", "library"], hate: "cafe" }, gift: "watch",
    say: { 3: "Clark stops his clock. \"You said exactly what you meant, exactly when you meant it. I'll allow it.\"",
           1: "Clark makes a note on his clipboard. It's a small checkmark. It's the best you've seen.",
           0: "Clark presses his clock and watches it tick, which is how he says \"I'm busy\".",
          "-2": "Clark's clipboard snaps shut. \"Spontaneity. Without a prior filing. Strike two.\"" },
    scene: { text: "Clark's clock has stopped for the first time in forty years. He stares at it, pale.", choices: [
      { v: 2, label: "Quietly wind it for him, and say nothing.", reply: "The clock ticks. Clark exhales for what feels like a decade. \"Thank you,\" he says, very softly." },
      { v: 1, label: "Ask him the time anyway.", reply: "\"Half past... undefined,\" he mutters. A small laugh escapes." },
      { v: 0, label: "\"Time is a construct, Clark.\"", reply: "Clark removes his glasses and files a formal complaint against you." }] },
    win: "Clark books the chapel for exactly 3:00, arrives at exactly 2:59, and cries at exactly 3:01.",
    true: "Clark stops his clock on purpose, for the first time in forty years, and says it can wait. \"I've got something to say to you first.\"" },
  { id: "gm", glyph: "🎩", name: "Gideon", blurb: "a grandmaster who is certain you've heard of his famous game.",
    prefs: P("sidelong", ["bold"], ["advance"]), spots: { fav: ["hall", "cafe"], hate: "garden" }, gift: "trophy",
    say: { 3: "Gideon beams. \"A compliment with a second meaning! Do you know how rare an elegant flatterer is?\"",
           1: "Gideon straightens his cravat. \"The scale is right, at least. Please continue to be this impressed.\"",
           0: "Gideon begins to tell you about his famous game. You nod. He is still telling it.",
          "-2": "Gideon pauses. \"Slow and steady? Darling, I am not a tortoise, I am a spectacle.\"" },
    scene: { text: "Gideon asks, delighted, whether you've seen his famous game against the Duke. You haven't.", choices: [
      { v: 2, label: "\"Replay it for me, move by move. Slowly.\"", reply: "Gideon sets up the board with trembling hands. Nobody has asked in thirty years." },
      { v: 1, label: "\"I've heard great things.\"", reply: "\"Naturally you have,\" he says, and begins anyway. Pleasantly." },
      { v: 0, label: "\"Never heard of it. Or you.\"", reply: "Gideon clutches his chest, falls on a chaise, and does not get up." }] },
    win: "Gideon publishes a book of your courtship, annotated in the margins, with a diagram of the kiss.",
    true: "Gideon takes you through the famous game in whispers, move by move, and then leaves the last move blank. \"That's the one I've been saving for you.\"" },
  { id: "ghost", glyph: "👻", name: "Ebony", blurb: "the ghost of an en passant that was never played. She appears at odd moments.",
    prefs: P("leap", ["sidelong", "castle"], ["direct"]), spots: { fav: ["rooftop", "tower"], hate: "cafe" }, gift: "poem",
    say: { 3: "Ebony flickers, dazzled. \"You skipped the whole conversation. I haven't been surprised since 1851.\"",
           1: "Ebony drifts closer. \"Not bad. A bit corporeal. But not bad.\"",
           0: "Ebony fades slightly. You are not sure if it was a sigh or a draft.",
          "-2": "Ebony goes translucent. \"Direct? I'm a rule nobody remembers. Don't pin me down.\"" },
    scene: { text: "Ebony fades half out of sight. \"You only get one move to catch me,\" she whispers. \"En passant.\"", choices: [
      { v: 2, label: "Step up beside her at once.", reply: "You land exactly where she was. She materialises, astonished and delighted." },
      { v: 1, label: "Wait and see what she does.", reply: "\"Cautious,\" she says. \"But the moment's gone, so it's a draw.\"" },
      { v: 0, label: "\"You're a ghost. You can't be captured.\"", reply: "\"Exactly,\" she says, flatly, and is gone." }] },
    win: "Ebony takes your hand and for one second she is solid. \"Every other moment counts as a draw,\" she says. \"This one doesn't.\"",
    true: "Ebony steps out of the rulebook entirely and settles beside you, solid, permanent, no longer a rule you can only play once." },
  { id: "librarian", glyph: "📚", name: "Opal", blurb: "the librarian of the opening book. She knows every first move and wants to hear yours.",
    prefs: P("advance", ["sidelong"], ["bold"]), spots: { fav: ["library", "garden"], hate: "hall" }, gift: "book",
    say: { 3: "Opal closes her book. \"You asked, you remembered, you asked again. That's a mainline.\"",
           1: "Opal tilts her glasses. \"That was a clever sideline. Footnoted.\"",
           0: "Opal turns a page. It doesn't seem to be the right page.",
          "-2": "Opal puts a finger to her lips. \"A band? In my library? I'm filing a complaint with myself.\"" },
    scene: { text: "Opal's opening book is missing a page. \"Gone,\" she whispers. \"I've never lost a line before.\"", choices: [
      { v: 2, label: "\"Let's find another copy and read it together.\"", reply: "Opal's smile is slow and warm. \"Together,\" she repeats, as if testing a new move." },
      { v: 1, label: "\"We can improvise the line.\"", reply: "\"Improvise,\" she says, dubiously, writing it down anyway." },
      { v: 0, label: "\"It's just a book.\"", reply: "The silence is the loudest you've ever heard. Opal asks you to leave." }] },
    win: "Opal marks your page with a pressed flower and writes your name in the margin of every book she owns.",
    true: "Opal hands you the missing page. She had it all along. \"I wanted to see whether you'd stay for the whole line,\" she says." },
];

export const DAYS = 10;
export const ROSTER_SIZE = 6; // six of the ten pieces turn up each game; more than that and ten days can't cover everyone
export const LOVE = 22; // a loved approach in a favourite place is +4 a day, so six great days, or a few more with some learning, wins
export const FRIEND = 11; // half of LOVE
export const MAX = 40;
export const SCENE_AT = 8; // trust needed before someone tests you
export const WORK_PAY = 3;
export const MAX_CHARM = 3; // at 3 nothing is ever a disaster and loved dates gain a bonus; more would be redundant
export const TYCOON = 12; // coins enough to retire rich instead of dating

export function newRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// opts: { seed, shuffle (mix up what each loves), roster (ids), quiet (no events or scenes) }
export function newGame(opts = {}) {
  const seed = opts.seed ?? ((Math.random() * 1e9) | 0), rand = newRng(seed);
  const roster = opts.roster || shuffle(CAST.map((c) => c.id), rand).slice(0, ROSTER_SIZE);
  const aff = {}, seen = {}, seenSpot = {}, seenGift = {}, prefs = {}, scenes = {};
  for (const id of roster) {
    aff[id] = 0; seen[id] = {}; seenSpot[id] = {}; seenGift[id] = {};
    const c = cast(id);
    prefs[id] = opts.shuffle ? Object.fromEntries(shuffle(ids, rand).map((a, i) => [a, Object.values(c.prefs).sort((x, y) => y - x)[i]])) : { ...c.prefs };
  }
  const g = { day: 1, aff, seen, seenSpot, seenGift, last: null, phase: "play", ending: null, roster, prefs, scenes, rand, quiet: !!opts.quiet, shuffled: !!opts.shuffle,
    coins: 3, charm: 0, inv: {}, pending: null, spotsToday: [], log: [] };
  startDay(g);
  return g;
}

export function cast(id) { return CAST.find((c) => c.id === id); }
export function tierOf(delta) { return delta >= 3 ? "loved" : delta >= 1 ? "liked" : delta === 0 ? "meh" : "ouch"; }
export function heartsOf(g, id) { return Math.floor(g.aff[id] / (MAX / 8)); } // 0-8 hearts shown
export const spotOf = (id) => SPOTS.find((x) => x.id === id);
export const giftOf = (id) => GIFTS.find((x) => x.id === id);

// charm lifts the floor: shrugs become small smiles, disasters become shrugs, and at full charm the loved get more
export function charmAdj(d, charm) {
  if (d <= 0) return d + Math.min(charm, d === 0 ? 1 : 2);
  return d + (charm >= MAX_CHARM ? 1 : 0);
}
export function spotBonus(c, spot) { return !spot ? 0 : c.spots.fav.includes(spot) ? 1 : c.spots.hate === spot ? -1 : 0; }
export function giftBonus(c, gift) { return !gift ? 0 : c.gift === gift ? 4 : 1; }

function cool(g, except, by = 1) {
  for (const id of g.roster) if (id !== except) g.aff[id] = Math.max(0, g.aff[id] - by);
}
const top = (g) => g.roster.reduce((best, id) => (g.aff[id] > g.aff[best] ? id : best), g.roster[0]);

// ---------- random events ----------
export const EVENTS = [
  { id: "rain", text: "A downpour hits the board. {top} is standing there without cover, and you have one umbrella.", choices: [
    { label: "Share it with {top}.", ops: [["aff", "top", 3], ["coins", -1]], text: "You walk {top} home under a tiny umbrella. You are both wet. You are both happy." },
    { label: "Run for the café, alone.", ops: [["coins", 1]], text: "You dash for cover and find a lost coin and a hot drink." }] },
  { id: "blitz", text: "A blitz tournament is starting in the hall. The prize is a handful of coins.", choices: [
    { label: "Enter.", gamble: { p: 0.5, win: [["coins", 4], ["aff", "rand", 1]], lose: [["coins", -1]], winText: "You win on time! Coins, plus {rand} saw the whole thing.", loseText: "You flag in a won position. The entry fee is gone." } },
    { label: "Watch from the stands.", ops: [["aff", "rand", 1]], text: "You cheer from the back and {rand} cheers next to you." }] },
  { id: "rival", text: "A smooth rival is circling {top}. {top} is clearly flattered.", choices: [
    { label: "Challenge the rival to a game.", gamble: { p: 0.5, win: [["aff", "top", 4]], lose: [["aff", "top", -3]], winText: "You mate the rival in twelve. {top} is thrilled.", loseText: "You blunder a rook. {top} winces." } },
    { label: "Step back, gracefully.", ops: [["charm", 1]], text: "You say nothing and learn something about patience. Charm +1." },
    { label: "Spread a small rumour about the rival.", ops: [["aff", "top", 1], ["aff", "rand", -2]], text: "It works. It also gets around. {rand} heard about it." }] },
  { id: "coins", text: "There's a purse on the pavement, heavy with coins. There's a name stitched on it.", choices: [
    { label: "Keep it.", ops: [["coins", 3]], text: "Finders keepers. You feel only a little bad." },
    { label: "Return it.", ops: [["aff", "rand", 2]], text: "The owner is {rand}, who is touched you bothered." }] },
  { id: "gossip", text: "The board is buzzing: you've been seen with someone. People are asking.", choices: [
    { label: "Confirm it.", ops: [["aff", "last", 2], ["cool", "all", 1]], text: "You own it. Whoever you were seen with glows. Everyone else goes a little cool." },
    { label: "Laugh it off.", ops: [["aff", "last", -2]], text: "You laugh it off. The person you were seen with does not laugh." }] },
  { id: "letter", text: "A love letter lands on your desk. It is addressed to someone else.", choices: [
    { label: "Deliver it, sealed.", ops: [["aff", "rand", 2]], text: "{rand} reads it, glances at you, and blushes. It wasn't from you. They like that you're honest." },
    { label: "Read it first.", ops: [["charm", 1], ["aff", "rand", -1]], text: "It's very good writing. You steal two lines. Charm +1. {rand} notices the broken seal." }] },
  { id: "study", text: "A grandmaster is giving a free evening lecture on the art of conversation.", choices: [
    { label: "Take notes.", ops: [["charm", 1]], text: "You write down every word. Charm +1." },
    { label: "Skip it and pick up some shifts.", ops: [["coins", 3]], text: "You come home tired and richer by three coins." }] },
  { id: "stranger", text: "A stranger in a cloak offers to sell you a secret about {top} for two coins.", choices: [
    { label: "Pay for it.", ops: [["coins", -2], ["aff", "top", 3]], text: "It's a good secret. {top} is stunned that you knew it." },
    { label: "Decline politely.", ops: [["aff", "top", 1]], text: "{top} saw you turn it down. They liked that." }] },
];

function nameOf(id) { return id ? cast(id).name : "someone"; }
function fill(text, ctx) { return text.replace(/\{top\}/g, nameOf(ctx.top)).replace(/\{rand\}/g, nameOf(ctx.rand)); }
function startDay(g) {
  g.spotsToday = shuffle(SPOTS.map((x) => x.id), g.rand).slice(0, 3); // a choice of three, never all six: that's the decision
  if (g.quiet || g.day === 1 || g.rand() > 0.5) return;
  const ev = EVENTS[Math.floor(g.rand() * EVENTS.length)];
  const ctx = { top: top(g), rand: g.roster[Math.floor(g.rand() * g.roster.length)] };
  g.pending = { type: "event", id: ev.id, ctx, text: fill(ev.text, ctx), choices: ev.choices.map((c) => ({ label: fill(c.label, ctx) })) };
}

function resolveTarget(g, t, ctx) {
  if (t === "top") return ctx.top;
  if (t === "rand") return ctx.rand;
  if (t === "last") return g.last && g.last.who ? g.last.who : ctx.top;
  return null;
}
function applyOps(g, ops, ctx) {
  for (const [op, a, b] of ops) {
    if (op === "aff") { const id = resolveTarget(g, a, ctx); g.aff[id] = Math.min(MAX, Math.max(0, g.aff[id] + b)); }
    else if (op === "coins") g.coins = Math.max(0, g.coins + a);
    else if (op === "charm") g.charm = Math.min(MAX_CHARM, g.charm + a);
    else if (op === "cool") cool(g, null, b);
  }
}

function finishDay(g) {
  if (g.day >= DAYS) { g.phase = "confess"; g.spotsToday = []; return; }
  g.day++; startDay(g);
}

// Resolve the pending event or scene by choice index (the order shown). Returns { text, v? } or null.
export function resolve(g, i) {
  const p = g.pending;
  if (!p || !(i >= 0 && i < p.choices.length)) return null;
  g.pending = null;
  if (p.type === "event") {
    const c = EVENTS.find((e) => e.id === p.id).choices[i];
    let text;
    if (c.gamble) {
      const win = g.rand() < Math.min(0.9, c.gamble.p + g.charm * 0.1); // charm tilts a coin flip, but never to a sure thing
      applyOps(g, win ? c.gamble.win : c.gamble.lose, p.ctx);
      text = fill(win ? c.gamble.winText : c.gamble.loseText, p.ctx);
    } else { applyOps(g, c.ops, p.ctx); text = fill(c.text, p.ctx); }
    g.last = { who: null, event: true, line: text, tier: "meh" };
    return { text };
  }
  // scene
  const ch = p.choices[i], who = p.who;
  g.aff[who] = Math.min(MAX, Math.max(0, g.aff[who] + (ch.v === 2 ? 4 : ch.v === 1 ? 1 : -3)));
  g.scenes[who] = ch.v;
  g.last = { who, scene: true, line: ch.reply, tier: ch.v === 2 ? "loved" : ch.v === 1 ? "liked" : "ouch" };
  finishDay(g);
  return { text: ch.reply, v: ch.v };
}

// ---------- the daily actions ----------
export const busy = (g) => g.phase !== "play" || !!g.pending;

// Spend today on `who` with `how`, optionally at `spot` (one of today's three) and with a `gift` you own.
// Everyone else drifts one heart colder. Returns the result or null if illegal.
export function date(g, who, how, spot = null, gift = null) {
  if (busy(g)) return null;
  if (!g.roster.includes(who) || !APPROACHES.some((a) => a.id === how)) return null;
  if (spot && !g.spotsToday.includes(spot)) return null;
  if (gift && !(g.inv[gift] > 0)) return null;
  const c = cast(who), base = g.prefs[who][how];
  const sb = spotBonus(c, spot), gb = giftBonus(c, gift);
  const delta = charmAdj(base, g.charm) + sb + gb;
  if (gift) g.inv[gift]--;
  cool(g, who);
  g.aff[who] = Math.min(MAX, Math.max(0, g.aff[who] + delta));
  g.seen[who][how] = tierOf(base);
  if (spot) g.seenSpot[who][spot] = sb > 0 ? "fav" : sb < 0 ? "hate" : "ok";
  if (gift) g.seenGift[who][gift] = gb > 3 ? "love" : "ok";
  const notes = [];
  if (spot) notes.push(sb > 0 ? `${spotOf(spot).name} is one of their favourite places (+1).` : sb < 0 ? `${spotOf(spot).name} is not their kind of place (-1).` : "");
  if (gift) notes.push(gb > 3 ? `${giftOf(gift).name} is exactly what they wanted (+4).` : `${giftOf(gift).name}: a sweet thought (+1).`);
  g.last = { who, how, spot, gift, delta, base, tier: tierOf(base), line: c.say[base], notes: notes.filter(Boolean) };
  const sc = c.scene;
  if (!g.quiet && g.aff[who] >= SCENE_AT && g.scenes[who] === undefined) {
    const order = shuffle([0, 1, 2], g.rand);
    g.pending = { type: "scene", who, text: `${c.name}: ${sc.text}`, choices: order.map((k) => ({ label: sc.choices[k].label, v: sc.choices[k].v, reply: sc.choices[k].reply })) };
    return g.last;
  }
  finishDay(g);
  return g.last;
}

// Take a paid shift instead of a date: coins in, everyone cools a little.
export function work(g) {
  if (busy(g)) return null;
  g.coins += WORK_PAY; cool(g, null);
  g.last = { who: null, line: `You work a long shift at the board and earn ${WORK_PAY} coins. Everyone you didn't see misses you a little.`, tier: "meh", work: true };
  finishDay(g);
  return g.last;
}

// Practise conversation instead of a date: permanent charm.
export function practice(g) {
  if (busy(g) || g.charm >= MAX_CHARM) return null;
  g.charm++; cool(g, null);
  g.last = { who: null, line: `You rehearse small talk in the mirror. Charm is now ${g.charm}/${MAX_CHARM}.`, tier: "meh", practice: true };
  finishDay(g);
  return g.last;
}

export function buy(g, gift) {
  const it = giftOf(gift);
  if (!it || g.phase !== "play" || g.coins < it.price) return null;
  g.coins -= it.price; g.inv[gift] = (g.inv[gift] || 0) + 1;
  return it;
}

// ---------- the ending ----------
// who: a roster id, null to walk away, or "all" to try everyone at once.
export function confess(g, who) {
  if (g.phase !== "confess") return null;
  if (who === null) g.ending = g.coins >= TYCOON ? { kind: "tycoon", who: null } : { kind: "stalemate", who: null };
  else if (who === "all") {
    const lovers = g.roster.filter((id) => g.aff[id] >= LOVE);
    g.ending = lovers.length >= 2 ? { kind: "fork", who: lovers[0], other: lovers[1] } : { kind: "crowd", who: null };
  } else {
    if (!g.roster.includes(who)) return null;
    const a = g.aff[who];
    g.ending = { kind: a >= LOVE ? "checkmate" : a >= FRIEND ? "friends" : "rejected", who, aff: a };
    if (g.ending.kind === "checkmate" && g.scenes[who] === 2) g.ending.true = true;
  }
  g.phase = "over";
  return g.ending;
}

export function endingKey(e) {
  return e.kind === "checkmate" ? (e.true ? "true:" : "checkmate:") + e.who : e.kind;
}
export const ENDING_KEYS = [...CAST.map((c) => "checkmate:" + c.id), ...CAST.map((c) => "true:" + c.id), "friends", "rejected", "stalemate", "tycoon", "fork", "crowd"];
export function endingTitle(key) {
  const [k, id] = key.split(":");
  const nm = id ? cast(id).name : "";
  return { checkmate: `checkmate with ${nm}`, true: `true love: ${nm}`, friends: "draw by mutual respect", rejected: "resignation", stalemate: "stalemate", tycoon: "retired rich", fork: "the royal fork", crowd: "swept off the board" }[k];
}

export function endingText(e) {
  if (e.kind === "stalemate") return "You walk away. Nobody is in check, nobody can move, and the board is declared a draw. (Stalemate.)";
  if (e.kind === "tycoon") return "You walk away from every date with a pocketful of coins and buy the whole café. Nobody's heart is broken; your accountant is thrilled. (Retired rich.)";
  if (e.kind === "crowd") return "You stand in the middle of the board and confess to everyone at once. Nobody is sure who you meant. The board politely resets.";
  if (e.kind === "fork") return `You confess to ${cast(e.who).name} and ${cast(e.other).name} at once. They both say yes. Then they find out about each other. It's a royal fork, and you are the piece being forked.`;
  const c = cast(e.who);
  if (e.kind === "checkmate") return (e.true ? c.true : c.win) + (e.true ? " (True ending.)" : " (Checkmate.)");
  if (e.kind === "friends") return `${c.name} smiles. "I like you. Just not like that." You settle for a draw by mutual respect.`;
  return `${c.name} says no. You resign, gracefully, and offer a handshake, which is also declined.`;
}
