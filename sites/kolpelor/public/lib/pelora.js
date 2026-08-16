// pelora.js — turns a Bluesky profile (from cluster.js's pool) into a
// θήρ (pelor): type/domain, evolution stage, rarity, and stats, all
// deterministic off the account's real did/handle/counts so the same
// account is always the same beast. Species draw from actual Greek myth
// monsters — no invented lore beyond which domain a name sits in.
// HP/ATK/DEF/SPD are just followers/follows/posts, log-scaled and clamped so
// a mega-account isn't literally unbeatable. Copied and reflavored from
// sites/mootmon/public/lib/monster.js — same math, Greek-myth names.

// A 6-domain cycle instead of a full type-triangle grid: domain i is strong
// against (i+1)%6 and weak against (i-1+6)%6, neutral otherwise.
// Flame -> Beast -> Stone -> Storm -> Abyss -> Venom -> Flame
export const TYPES = [
  { id: "flame", label: "Flame", emoji: "\u{1F525}", color: "#ff6b4a" },
  { id: "beast", label: "Beast", emoji: "\u{1F43A}", color: "#c99a5b" },
  { id: "stone", label: "Stone", emoji: "\u{1FAA8}", color: "#b89a6b" },
  { id: "storm", label: "Storm", emoji: "⚡", color: "#ffd24e" },
  { id: "abyss", label: "Abyss", emoji: "\u{1F30A}", color: "#4ea1ff" },
  { id: "venom", label: "Venom", emoji: "\u{1F40D}", color: "#8fd15b" },
];

const MOVE_NAME = {
  flame: "Typhonic Blast",
  beast: "Feral Maul",
  stone: "Petrifying Gaze",
  storm: "Gale Talon",
  abyss: "Maelstrom Coil",
  venom: "Venom Fang",
};

// Three evolution stages per domain, stage index matches RARITY[i].stage below.
const SPECIES = {
  flame: ["Kakodaimon", "Chimera", "Typhon"],
  beast: ["Kynokephalos", "Minotaur", "Cerberus"],
  stone: ["Oread", "Gorgon", "Talos"],
  storm: ["Harpy", "Griffin", "Pegasus"],
  abyss: ["Naiad", "Scylla", "Charybdis"],
  venom: ["Amphisbaena", "Hydra", "Echidna"],
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

// Turn a hydrated profile (from cluster.js) into a battle-ready pelor.
// `pool` is the full cluster pool, used only to rank rarity percentile.
export function peloraFor(profile, pool) {
  const type = TYPES[hashStr(profile.did) % TYPES.length];
  const rarity = tierOf(profile, pool);
  const species = SPECIES[type.id][rarity.stage];

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

export function moveName(typeId) {
  return MOVE_NAME[typeId] || "Strike";
}

// >0 = attacker's domain is strong, <0 = weak, 0 = neutral.
export function typeEdge(attackerType, defenderType) {
  const a = TYPES.findIndex((t) => t.id === attackerType);
  const d = TYPES.findIndex((t) => t.id === defenderType);
  if (a < 0 || d < 0) return 0;
  const n = TYPES.length;
  if ((a + 1) % n === d) return 1;
  if ((a - 1 + n) % n === d) return -1;
  return 0;
}

export function typeMultiplier(attackerType, defenderType) {
  const edge = typeEdge(attackerType, defenderType);
  if (edge > 0) return 1.5;
  if (edge < 0) return 0.67;
  return 1;
}
