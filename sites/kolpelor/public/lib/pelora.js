// pelora.js — turns a Bluesky profile (from cluster.js's pool) into a
// θήρ (pelor): type/domain, evolution stage, rarity, and stats, all
// deterministic off the account's real did/handle/counts so the same
// account is always the same beast. Species draw from actual Greek myth
// monsters — no invented lore beyond which domain a name sits in.
// HP/ATK/DEF/SPD are just followers/follows/posts, log-scaled and clamped so
// a mega-account isn't literally unbeatable. Copied and reflavored from
// sites/mootmon/public/lib/monster.js — same math, Greek-myth names.

// Five powers, per @antiali.as's own verse: "Πέντε δυνάμεις, κύκλῳ δεδεμέναι,
// τεύχουσι τὸν πόλεμον· πῦρ, ὕδωρ, ὄρος, ξύλον, ἄστυ. καθ' ἓν δὲ δυσὶ κρατεῖ,
// δυσὶ δ' ἡττᾶται· κρᾶσις οὐδεμία μέση." (Five powers, bound in a circle, wage
// the war: fire, water, mountain, wood, city. Each beats two, loses to two —
// no middle blend.) ORDER below is that circle; typeEdge derives "beats the
// next two, loses to the previous two" straight off it, so every matchup
// between two distinct types has a winner — never a neutral hit.
export const TYPES = [
  { id: "fire", label: "Fire", greek: "Πῦρ", emoji: "\u{1F525}", color: "#ff6b4a" },
  { id: "wood", label: "Wood", greek: "Ξύλον", emoji: "\u{1F332}", color: "#6ee06e" },
  { id: "mountain", label: "Mountain", greek: "Ὄρος", emoji: "\u{26F0}\u{FE0F}", color: "#b89a6b" },
  { id: "city", label: "City", greek: "Ἄστυ", emoji: "\u{1F3DB}\u{FE0F}", color: "#ffd24e" },
  { id: "water", label: "Water", greek: "Ὕδωρ", emoji: "\u{1F30A}", color: "#4ea1ff" },
];

const MOVE_NAME = {
  fire: "Typhonic Blast",
  wood: "Feral Maul",
  mountain: "Petrifying Gaze",
  city: "Gale Talon",
  water: "Maelstrom Coil",
};

// Three evolution stages per domain, stage index matches RARITY[i].stage
// below. `wood` carries two species lines (the old beast- and venom-domain
// monsters, folded into one power per the five-power verse) — which line a
// given pelor draws from is picked deterministically off its did (see
// lineIndexFor), so no species was actually retired, just re-homed. Every
// other domain is a single line, same shape as before.
const SPECIES = {
  fire: [["Kakodaimon", "Chimera", "Typhon"]],
  wood: [
    ["Kynokephalos", "Minotaur", "Cerberus"],
    ["Amphisbaena", "Hydra", "Echidna"],
  ],
  mountain: [["Oread", "Gorgon", "Talos"]],
  city: [["Harpy", "Griffin", "Pegasus"]],
  water: [["Naiad", "Scylla", "Charybdis"]],
};

const RARITY = [
  { id: "legendary", label: "Legendary", color: "#ffd24e", stage: 2, catchRate: 0.12 },
  { id: "rare", label: "Rare", color: "#c084fc", stage: 1, catchRate: 0.3 },
  { id: "uncommon", label: "Uncommon", color: "#4ea1ff", stage: 1, catchRate: 0.5 },
  { id: "common", label: "Common", color: "#9aa0ad", stage: 0, catchRate: 0.75 },
];

// Look up rarity metadata by id — used to reconstitute a bestiary entry from
// a PDS roster record, which only stores the rarity id, not its label/color.
export function rarityMeta(id) {
  return RARITY.find((r) => r.id === id) || RARITY[3];
}

// The world, five homelands now — one per power of "Πέντε δυνάμεις" — plus
// @antiali.as's original reply-thread verse for wood/water/city, which
// already named those three almost exactly right. Fire and mountain used to
// share "Fire-Born Mountain"; the five-power verse splits them into their own
// homes so every domain gets exactly one. The city stays the hub: it hosts
// the gymnasion/rivals shortcuts, the trading counter, the merchants' stalls,
// and the citizens' oracle-stitching.
export const REGIONS = [
  {
    id: "wood",
    name: "Shadowed Wood",
    greek: "Ὕλη Σκιόεσσα",
    verse: "“Πρῶτα μὲν ὕλη σκιόεσσα, θηρῶν μήτηρ ἀρχαίων” · ξύλον",
    blurb: "the mother of ancient beasts keeps her wood dark — every pelor born of ξύλον dens here.",
    emoji: "\u{1F332}",
    type: "wood",
  },
  {
    id: "water",
    name: "Grey-Blue Lake",
    greek: "Λίμνη Γλαυκή",
    verse: "“εἶτα λίμνη γλαυκή, ὅπου νήχονται λέπιδες” · ὕδωρ",
    blurb: "scaled swimmers turn in the shallows — the ὕδωρ domain, and only the ὕδωρ domain.",
    emoji: "\u{1F30A}",
    type: "water",
  },
  {
    id: "fire",
    name: "Smoldering Peak",
    greek: "Ὄρος Πυρίκαυστον",
    verse: "“πῦρ, ἐν ὄρει καιόμενον, οὔποτε σβεννύμενον” · πῦρ",
    blurb: "a peak that never stops burning — the πῦρ domain nests in its throat.",
    emoji: "\u{1F30B}",
    type: "fire",
  },
  {
    id: "mountain",
    name: "Grey Crags",
    greek: "Πέτραι Φαιαί",
    verse: "“ὄρος δ’ ἕτερον, πέτραις φαιαῖς βεβαρημένον, πυρὸς ἄμοιρον” · ὄρος",
    blurb: "cold, unburning stone next door to the volcano — the ὄρος domain holds these slopes instead.",
    emoji: "\u{26F0}\u{FE0F}",
    type: "mountain",
  },
  {
    id: "city",
    name: "Bright City",
    greek: "Ἄστυ Λαμπρόν",
    verse: "“ἄστυ δὲ λαμπρόν, ἀγορὰ μάχης καὶ ἀλλαγῆς σφαιρῶν” · ἄστυ",
    blurb: "the ἄστυ domain circles its rooftops; its true business is the gymnasion's battle-agora, the trading counter, and the merchants' and citizens' stalls.",
    emoji: "\u{1F3DB}\u{FE0F}",
    type: "city",
    isHub: true,
  },
];

export function regionOf(typeId) {
  return REGIONS.find((r) => r.type === typeId) || REGIONS[0];
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const log10 = (n) => Math.log10(Math.max(0, n) + 1);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Rank a pool by followersCount and cut into rarity tiers by percentile,
// same shape as simcluster-gacha's buildBanner tiering.
export function tierOf(profile, pool) {
  const sorted = [...pool].sort((a, b) => b.followersCount - a.followersCount);
  const n = sorted.length || 1;
  const i = sorted.findIndex((p) => p.did === profile.did);
  const pct = i < 0 ? 1 : i / n;
  if (pct < 0.04) return RARITY[0];
  if (pct < 0.2) return RARITY[1];
  if (pct < 0.5) return RARITY[2];
  return RARITY[3];
}

// Which species line within a domain a given did draws from — most domains
// have exactly one, `wood` has two (see SPECIES above). Salted differently
// from the type roll itself so the two hashes don't correlate.
function lineIndexFor(typeId, did) {
  const lines = SPECIES[typeId] || SPECIES.fire;
  return lines.length > 1 ? hashStr(String(did) + ":line") % lines.length : 0;
}

// Turn a hydrated profile (from cluster.js) into a battle-ready pelor.
// `pool` is the full cluster pool, used only to rank rarity percentile.
export function peloraFor(profile, pool) {
  const type = TYPES[hashStr(profile.did) % TYPES.length];
  const rarity = tierOf(profile, pool);
  const species = speciesForStage(type.id, rarity.stage, profile.did);

  const hp = clamp(30 + Math.round(14 * log10(profile.followersCount)), 24, 150);
  const atk = clamp(9 + Math.round(9 * log10(profile.followersCount)), 6, 80);
  const def = clamp(9 + Math.round(9 * log10(profile.followsCount)), 6, 80);
  const spd = clamp(9 + Math.round(9 * log10(profile.postsCount)), 6, 80);

  return {
    did: profile.did,
    handle: profile.handle,
    displayName: profile.displayName || profile.handle,
    avatar: profile.avatar || "",
    type: type.id,
    species,
    rarity: rarity.id,
    rarityLabel: rarity.label,
    rarityColor: rarity.color,
    catchRate: rarity.catchRate,
    stats: { hp, atk, def, spd },
  };
}

export function typeMeta(id) {
  return TYPES.find((t) => t.id === id) || TYPES[0];
}

// Species name for a given domain + evolution stage (0/1/2), on the species
// line `did` deterministically belongs to (see lineIndexFor). Used both by
// peloraFor above and by roster.js's registerVictory to advance a bound
// pelor's form on the stage climb — "victory brings growth... it changes
// form, becomes greater." `did` is optional (trainers.js's fixed ladder mons
// have none); omitting it just picks line 0.
export function speciesForStage(typeId, stage, did) {
  const lines = SPECIES[typeId] || SPECIES.fire;
  const line = lines[lineIndexFor(typeId, did)] || lines[0];
  return line[Math.max(0, Math.min(line.length - 1, stage))];
}

export function moveName(typeId) {
  return MOVE_NAME[typeId] || "Strike";
}

// >0 = attacker's domain is strong, <0 = weak. Never 0 for two distinct
// types — "κρᾶσις οὐδεμία μέση," no middle blend: on TYPES' 5-element
// circle, a domain beats the next two and loses to the previous two, which
// covers all four other domains exactly once each.
export function typeEdge(attackerType, defenderType) {
  const ids = TYPES.map((t) => t.id);
  const a = ids.indexOf(attackerType);
  const d = ids.indexOf(defenderType);
  if (a < 0 || d < 0 || a === d) return 0;
  const n = ids.length;
  if (ids[(a + 1) % n] === defenderType || ids[(a + 2) % n] === defenderType) return 1;
  return -1;
}

export function typeMultiplier(attackerType, defenderType) {
  const edge = typeEdge(attackerType, defenderType);
  if (edge > 0) return 1.5;
  if (edge < 0) return 0.67;
  return 1;
}
