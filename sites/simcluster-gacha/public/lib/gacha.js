// gacha.js — turns a cluster.js banner into an actual gacha: rarity tiers,
// weighted pulls, a pity counter, and a persisted collection. All state is
// client-side (localStorage), scoped per banner owner (did) so pulling on
// @norvid-studies and pulling on @cee.wtf keep separate pity/collections.

export const TIERS = ["SSR", "SR", "R", "N"];

export const TIER_META = {
  SSR: { label: "SSR", color: "#ffd24e", glow: "#ffe89a", weight: 0.03 },
  SR: { label: "SR", color: "#c084fc", glow: "#e2bbff", weight: 0.12 },
  R: { label: "R", color: "#4ea1ff", glow: "#a9d3ff", weight: 0.25 },
  N: { label: "N", color: "#9aa0ad", glow: "#cfd3da", weight: 0.6 },
};

const PITY_LIMIT = 10; // guaranteed SSR if you haven't hit one in this many pulls

// Rank the pool by followersCount and cut it into rarity tiers by
// percentile. Self is always a featured SSR (the banner headliner) — it's
// removed from wherever its stats would've landed and pinned to SSR instead,
// same as how a real gacha banner's rate-up character isn't subject to the
// normal pool math.
export function buildBanner(cluster) {
  const sorted = [...cluster.pool].sort(
    (a, b) => b.followersCount - a.followersCount,
  );
  const n = sorted.length;
  const tiers = { SSR: [], SR: [], R: [], N: [] };

  sorted.forEach((p, i) => {
    const pct = n <= 1 ? 0 : i / n;
    let tier;
    if (pct < 0.04) tier = "SSR";
    else if (pct < 0.2) tier = "SR";
    else if (pct < 0.5) tier = "R";
    else tier = "N";
    tiers[tier].push(p);
  });

  tiers.SSR.unshift({ ...cluster.self, featured: true });

  return {
    ownerDid: cluster.did,
    ownerHandle: cluster.handle,
    tiers,
    all: [tiers.SSR[0], ...sorted],
    counts: cluster.counts,
    kind: cluster.kind,
  };
}

function rollTier(rng = Math.random) {
  const r = rng();
  let acc = 0;
  for (const t of TIERS) {
    acc += TIER_META[t].weight;
    if (r < acc) return t;
  }
  return "N";
}

// Walk down from the rolled tier to find a non-empty pool; SSR always has at
// least `self`, so this can never fall through empty-handed.
function resolveTier(banner, tier) {
  const start = TIERS.indexOf(tier);
  for (let i = start; i < TIERS.length; i++) {
    if (banner.tiers[TIERS[i]].length) return TIERS[i];
  }
  for (let i = start - 1; i >= 0; i--) {
    if (banner.tiers[TIERS[i]].length) return TIERS[i];
  }
  return "SSR";
}

function pickFrom(list, rng = Math.random) {
  return list[Math.floor(rng() * list.length)];
}

const pityKey = (did) => `simcluster-gacha:pity:${did}`;
const collectionKey = (did) => `simcluster-gacha:collection:${did}`;

export function getPity(did) {
  return Number(localStorage.getItem(pityKey(did)) || "0");
}
function setPity(did, n) {
  localStorage.setItem(pityKey(did), String(n));
}

export function getCollection(did) {
  try {
    return JSON.parse(localStorage.getItem(collectionKey(did)) || "{}");
  } catch {
    return {};
  }
}
function addToCollection(did, card, tier) {
  const col = getCollection(did);
  const key = card.did;
  const prev = col[key];
  col[key] = {
    handle: card.handle,
    displayName: card.displayName,
    avatar: card.avatar,
    tier,
    featured: !!card.featured,
    count: (prev?.count || 0) + 1,
  };
  localStorage.setItem(collectionKey(did), JSON.stringify(col));
  return col;
}

// One pull. Applies + updates the pity counter for banner.ownerDid.
export function pull(banner, rng = Math.random) {
  const pityCount = getPity(banner.ownerDid);
  let tier = rollTier(rng);
  let pityBroke = false;

  if (tier !== "SSR" && pityCount + 1 >= PITY_LIMIT) {
    tier = "SSR";
    pityBroke = true;
  }
  tier = resolveTier(banner, tier);

  const card = pickFrom(banner.tiers[tier], rng);
  const nextPity = tier === "SSR" ? 0 : pityCount + 1;
  setPity(banner.ownerDid, nextPity);

  const isNew = !getCollection(banner.ownerDid)[card.did];
  addToCollection(banner.ownerDid, card, tier);

  return { card, tier, pityBroke, isNew, pityCount: nextPity, pityLimit: PITY_LIMIT };
}

export function pullMany(banner, count, rng = Math.random) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(pull(banner, rng));
  return out;
}

// Pseudo-stats straight off the real profile numbers — no invented lore,
// just followers/follows/posts dressed up as ATK/DEF/SPD.
export function statsFor(profile) {
  const fmt = (n) => Math.max(1, n || 0).toLocaleString();
  return {
    atk: fmt(profile.followersCount),
    def: fmt(profile.followsCount),
    spd: fmt(profile.postsCount),
  };
}
