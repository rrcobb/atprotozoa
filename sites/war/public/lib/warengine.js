// warengine.js — pure card-game logic for the WAR site. No DOM, no network,
// no atproto: just deck building and round resolution, so it's easy to reason
// about (and easy to unit-test by hand in a console) separately from the PDS
// plumbing in index.html.
//
// A "ruleset" is a plain object of string-valued knobs (see DEFAULT_RULES).
// Everything downstream — deck construction, war depth, bust handling — reads
// off it, so a ruleset fetched from a PDS record works exactly like the
// hardcoded default.

export const DEFAULT_RULES = {
  warCards: "3", // how many face-down cards are laid before the flip in a war
  aceRank: "high", // "high" (beats king) or "low" (below 2)
  midWarBust: "concede", // "concede" (can't cover a war = lose the game) or "split" (pot splits, game continues)
  roundCap: "none", // "none", "26", or "52" — cap the game length, most cards wins at the cap
  jokers: "off", // "off" or "on" — 2 wild jokers that beat every other card
};

export const RULES_CATALOG = [
  {
    key: "warCards",
    label: "War pot size",
    hint: "face-down cards laid before the deciding flip in a war",
    options: [
      { value: "1", label: "1 card" },
      { value: "2", label: "2 cards" },
      { value: "3", label: "3 cards (classic)" },
    ],
  },
  {
    key: "aceRank",
    label: "Aces",
    hint: "",
    options: [
      { value: "high", label: "high — beats the king" },
      { value: "low", label: "low — below a 2" },
    ],
  },
  {
    key: "midWarBust",
    label: "Can't cover a war",
    hint: "what happens when a side doesn't have enough cards left to lay down",
    options: [
      { value: "concede", label: "concede the game (classic)" },
      { value: "split", label: "pot splits evenly, game continues" },
    ],
  },
  {
    key: "roundCap",
    label: "Game length",
    hint: "",
    options: [
      { value: "none", label: "play to the last card (classic)" },
      { value: "26", label: "cap at 26 rounds — most cards wins" },
      { value: "52", label: "cap at 52 rounds — most cards wins" },
    ],
  },
  {
    key: "jokers",
    label: "Jokers",
    hint: "adds 2 wild cards that beat everything, including each other (which starts a war)",
    options: [
      { value: "off", label: "off — classic 52-card deck" },
      { value: "on", label: "on — 2 jokers added" },
    ],
  },
];

export function normalizeRules(raw) {
  const out = { ...DEFAULT_RULES };
  if (raw && typeof raw === "object") {
    for (const { key, options } of RULES_CATALOG) {
      const v = raw[key];
      if (typeof v === "string" && options.some((o) => o.value === v)) out[key] = v;
    }
  }
  return out;
}

const SUITS = ["♠", "♥", "♦", "♣"];
const RANK_LABEL = { 11: "J", 12: "Q", 13: "K", 14: "A" };

export function makeDeck(rules) {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit, label: `${RANK_LABEL[rank] || rank}${suit}` });
    }
  }
  if (rules.jokers === "on") {
    deck.push({ rank: 15, suit: null, label: "🃏" }, { rank: 15, suit: null, label: "🃏" });
  }
  return deck;
}

export function shuffle(deck) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Alternating deal into two equal-length decks. Top of a deck is index 0.
export function deal(deck) {
  const a = [], b = [];
  deck.forEach((c, i) => (i % 2 === 0 ? a : b).push(c));
  return [a, b];
}

function cardValue(card, rules) {
  if (card.rank === 15) return 100; // joker beats everything
  if (card.rank === 14 && rules.aceRank === "low") return 1;
  return card.rank;
}

// Plays one full round (including any chained wars) against the given decks,
// MUTATING them in place (shift from the top, push winnings to the bottom —
// exactly how the physical game works, which is also why persisting these
// arrays wholesale to a PDS record is enough to resume a game later).
// Returns { events: string[], gameOver: null | { winner, reason } }.
export function playRound(playerDeck, computerDeck, rules) {
  const events = [];
  const pot = [];

  let pLast = playerDeck.shift();
  let cLast = computerDeck.shift();
  pot.push(pLast, cLast);
  events.push(`you flip ${pLast.label} · computer flips ${cLast.label}`);

  let diff = cardValue(pLast, rules) - cardValue(cLast, rules);

  while (diff === 0) {
    const need = Number(rules.warCards) + 1;
    const playerShort = playerDeck.length < need;
    const computerShort = computerDeck.length < need;

    if (playerShort || computerShort) {
      if (rules.midWarBust === "split") {
        events.push("neither side can fully cover the war — the pot splits and the game continues");
        const half = Math.floor(pot.length / 2);
        playerDeck.push(...pot.slice(0, half));
        computerDeck.push(...pot.slice(half, half * 2));
        return { events, gameOver: null, final: { player: pLast, computer: cLast } };
      }
      const winner = playerShort ? "computer" : "player";
      events.push(
        playerShort
          ? "you can't cover the war and concede the game"
          : "the computer can't cover the war and concedes the game",
      );
      return { events, gameOver: { winner, reason: "war-bust" }, final: { player: pLast, computer: cLast } };
    }

    events.push(`war! ${rules.warCards} card(s) face-down each`);
    for (let i = 0; i < Number(rules.warCards); i++) {
      pot.push(playerDeck.shift(), computerDeck.shift());
    }
    pLast = playerDeck.shift();
    cLast = computerDeck.shift();
    pot.push(pLast, cLast);
    events.push(`face-up: you ${pLast.label} · computer ${cLast.label}`);
    diff = cardValue(pLast, rules) - cardValue(cLast, rules);
  }

  if (diff > 0) {
    events.push(`you take the pot (${pot.length} cards)`);
    playerDeck.push(...pot);
  } else {
    events.push(`computer takes the pot (${pot.length} cards)`);
    computerDeck.push(...pot);
  }

  const final = { player: pLast, computer: cLast };
  if (playerDeck.length === 0) return { events, gameOver: { winner: "computer", reason: "out-of-cards" }, final };
  if (computerDeck.length === 0) return { events, gameOver: { winner: "player", reason: "out-of-cards" }, final };
  return { events, gameOver: null, final };
}
