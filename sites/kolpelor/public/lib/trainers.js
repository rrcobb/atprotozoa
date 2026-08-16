// trainers.js — the gymnasion ladder: fixed, hand-tuned PvAI opponents, not
// derived from any Bluesky account. Each is a figure from the Odyssey, teams
// scale in size and stats as the ladder climbs. Clearing the whole ladder
// (see LADDER.length in app.js) earns the "ἀριστεύε" (aristos / "best of
// all") title — the Iliad 6.208 line the build brief quoted.
//
// Team entries are shaped like pelora.js's peloraFor() output minus the
// Bluesky-specific fields (did/handle/avatar), so battle.js's ready()/
// strike() work on them unmodified.

function mon(type, species, stats, rarityColor = "#9aa0ad") {
  return {
    did: null,
    handle: null,
    displayName: species,
    avatar: "",
    type,
    species,
    rarity: "trainer",
    rarityLabel: "",
    rarityColor,
    stats,
  };
}

export const LADDER = [
  {
    id: "polyphemus",
    name: "Polyphemus",
    title: "the Cyclops of the sea-cave",
    emoji: "\u{1F441}️",
    quote: "“Nobody is eating me!” he cried — well, somebody is about to.",
    team: [
      mon("stone", "Oread", { hp: 40, atk: 16, def: 14, spd: 10 }),
      mon("beast", "Kynokephalos", { hp: 44, atk: 18, def: 12, spd: 12 }),
    ],
  },
  {
    id: "circe",
    name: "Circe",
    title: "witch of Aeaea",
    emoji: "\u{1F9EA}",
    quote: "Every guest leaves her hall a little more of a beast than they arrived.",
    team: [
      mon("venom", "Amphisbaena", { hp: 46, atk: 20, def: 14, spd: 20 }),
      mon("flame", "Kakodaimon", { hp: 48, atk: 22, def: 14, spd: 16 }),
      mon("venom", "Hydra", { hp: 58, atk: 24, def: 18, spd: 14 }),
    ],
  },
  {
    id: "sirens",
    name: "The Sirens",
    title: "voices on the rocks",
    emoji: "\u{1F3B6}",
    quote: "Wax in your ears, or you'll never leave this arena either.",
    team: [
      mon("storm", "Harpy", { hp: 44, atk: 24, def: 12, spd: 30 }),
      mon("storm", "Griffin", { hp: 56, atk: 26, def: 18, spd: 26 }),
      mon("abyss", "Scylla", { hp: 60, atk: 26, def: 20, spd: 18 }),
    ],
  },
  {
    id: "scylla-charybdis",
    name: "Scylla & Charybdis",
    title: "the strait with no safe side",
    emoji: "\u{1F32C}️",
    quote: "Lose a few to Scylla, or lose the whole ship to Charybdis. Choose.",
    team: [
      mon("abyss", "Scylla", { hp: 62, atk: 30, def: 22, spd: 24 }),
      mon("venom", "Hydra", { hp: 66, atk: 28, def: 24, spd: 18 }),
      mon("abyss", "Charybdis", { hp: 80, atk: 30, def: 24, spd: 14 }),
      mon("beast", "Minotaur", { hp: 70, atk: 32, def: 22, spd: 16 }),
    ],
  },
  {
    id: "poseidon",
    name: "Poseidon",
    title: "earth-shaker, still not over Polyphemus",
    emoji: "\u{1F531}",
    quote: "Every wandering hero answers to me eventually.",
    team: [
      mon("abyss", "Charybdis", { hp: 90, atk: 34, def: 28, spd: 22 }),
      mon("storm", "Pegasus", { hp: 78, atk: 36, def: 24, spd: 34 }),
      mon("stone", "Talos", { hp: 96, atk: 34, def: 34, spd: 16 }),
      mon("beast", "Cerberus", { hp: 92, atk: 38, def: 26, spd: 24 }),
      mon("venom", "Echidna", { hp: 88, atk: 38, def: 28, spd: 20 }),
    ],
  },
];
