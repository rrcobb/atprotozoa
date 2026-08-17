// roster.js — persisted player state (localStorage, scoped per player DID,
// same shape as sites/mootmon/public/lib/capture.js): the bestiary of every
// pelor ever bound, the active party (<=6), the win/loss record, how far up
// the gymnasion ladder the player has climbed, Zeus's fortune (gold, dug-up
// gear) and each bound pelor's battle-win-driven evolution. Also the
// bind-chance roll itself. app.js layers a PDS write-through on top of this
// for signed-in players (see records.js) — this module never talks to the
// network.

import { rarityMeta, speciesForStage } from "./pelora.js";

const PARTY_MAX = 6;
const DIG_COOLDOWN_MS = 15 * 60 * 1000; // one dig per homeland per 15 minutes

const bestiaryKey = (did) => `kolpelor:bestiary:${did}`;
const partyKey = (did) => `kolpelor:party:${did}`;
const recordKey = (did) => `kolpelor:record:${did}`;
const goldKey = (did) => `kolpelor:gold:${did}`;
const gearKey = (did) => `kolpelor:gear:${did}`;
const digKey = (did, regionId) => `kolpelor:dig:${did}:${regionId}`;
const begKey = (did) => `kolpelor:beg:${did}`;
const BEG_COOLDOWN_MS = 10 * 60 * 1000; // one alms-round per 10 minutes — "they give little," not a tap-to-farm loop

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") ?? fallback;
  } catch {
    return fallback;
  }
}

export function getBestiary(playerDid) {
  return readJson(bestiaryKey(playerDid), {});
}

export function getParty(playerDid) {
  return readJson(partyKey(playerDid), []);
}

export function getRecord(playerDid) {
  return readJson(recordKey(playerDid), { wins: 0, losses: 0, ladderRank: 0, aristos: false });
}

export function recordResult(playerDid, won, ladderRank) {
  const r = getRecord(playerDid);
  if (won) r.wins++;
  else r.losses++;
  if (typeof ladderRank === "number" && ladderRank > r.ladderRank) r.ladderRank = ladderRank;
  localStorage.setItem(recordKey(playerDid), JSON.stringify(r));
  return r;
}

export function setAristos(playerDid) {
  const r = getRecord(playerDid);
  r.aristos = true;
  localStorage.setItem(recordKey(playerDid), JSON.stringify(r));
  return r;
}

function saveBestiary(playerDid, bestiary) {
  localStorage.setItem(bestiaryKey(playerDid), JSON.stringify(bestiary));
}

function saveParty(playerDid, party) {
  localStorage.setItem(partyKey(playerDid), JSON.stringify(party));
}

export function isBound(playerDid, peloraDid) {
  return !!getBestiary(playerDid)[peloraDid];
}

export function addToBestiary(playerDid, pelor) {
  const bestiary = getBestiary(playerDid);
  const startStage = rarityMeta(pelor.rarity).stage;
  bestiary[pelor.did] = {
    ...pelor,
    boundAt: Date.now(),
    evoStage: typeof pelor.evoStage === "number" ? pelor.evoStage : startStage,
    wins: pelor.wins || 0,
    equipped: pelor.equipped || null,
  };
  saveBestiary(playerDid, bestiary);
  return bestiary;
}

// Called for every player pelor that fought and survived a won battle —
// "τῷ θηρὶ δὲ νίκη φέρει αὔξησιν" (victory brings the beast growth). Every
// third such win it climbs one evolution stage (species advances, stats grow
// ~15%), capped at stage 2 — a pelor bound already at stage 2 (legendary)
// just racks up wins with no further form change.
export function registerVictory(playerDid, peloraDid) {
  const bestiary = getBestiary(playerDid);
  const p = bestiary[peloraDid];
  if (!p) return null;
  p.wins = (p.wins || 0) + 1;
  const prevSpecies = p.species;
  let evolved = false;
  if (p.wins % 3 === 0 && typeof p.evoStage === "number" && p.evoStage < 2) {
    p.evoStage += 1;
    p.species = speciesForStage(p.type, p.evoStage, p.did);
    p.stats = growStats(p.stats);
    evolved = true;
  }
  saveBestiary(playerDid, bestiary);
  return { pelor: p, evolved, prevSpecies };
}

function growStats(stats) {
  const grow = (n) => Math.max(n + 1, Math.round(n * 1.15));
  return { hp: grow(stats.hp), atk: grow(stats.atk), def: grow(stats.def), spd: grow(stats.spd) };
}

// ---------- Zeus's fortune: gold, dug-up gear, equip ----------

export function getGold(playerDid) {
  return readJson(goldKey(playerDid), 0);
}

export function addGold(playerDid, delta) {
  const g = Math.max(0, getGold(playerDid) + delta);
  localStorage.setItem(goldKey(playerDid), JSON.stringify(g));
  return g;
}

export function getGearInventory(playerDid) {
  return readJson(gearKey(playerDid), []);
}

export function addGear(playerDid, gearId) {
  const inv = getGearInventory(playerDid);
  inv.push(gearId);
  localStorage.setItem(gearKey(playerDid), JSON.stringify(inv));
  return inv;
}

function removeOneGear(playerDid, gearId) {
  const inv = getGearInventory(playerDid);
  const idx = inv.indexOf(gearId);
  if (idx >= 0) inv.splice(idx, 1);
  localStorage.setItem(gearKey(playerDid), JSON.stringify(inv));
  return inv;
}

// Move a dug-up gear item from inventory onto a bound pelor, swapping back
// whatever it had equipped (if anything) into inventory.
export function equipGear(playerDid, peloraDid, gearId) {
  const bestiary = getBestiary(playerDid);
  const p = bestiary[peloraDid];
  if (!p) return null;
  removeOneGear(playerDid, gearId);
  if (p.equipped) addGear(playerDid, p.equipped);
  p.equipped = gearId;
  saveBestiary(playerDid, bestiary);
  return p;
}

export function unequipGear(playerDid, peloraDid) {
  const bestiary = getBestiary(playerDid);
  const p = bestiary[peloraDid];
  if (!p || !p.equipped) return null;
  addGear(playerDid, p.equipped);
  p.equipped = null;
  saveBestiary(playerDid, bestiary);
  return p;
}

// One dig per homeland per DIG_COOLDOWN_MS — keeps "search the earth" a
// once-in-a-while flourish rather than a click-to-farm-gold loop.
export function canDig(playerDid, regionId) {
  const last = Number(localStorage.getItem(digKey(playerDid, regionId)) || 0);
  return Date.now() - last >= DIG_COOLDOWN_MS;
}

export function markDug(playerDid, regionId) {
  localStorage.setItem(digKey(playerDid, regionId), String(Date.now()));
}

// ---------- the city's other business: selling spoils, begging alms ----------
// Per @antiali.as's verse: "Νόμισμα κερδαίνεις ἱδρῶτι μάχης, ἢ σκῦλα πωλῶν
// ἐμπόροις· ἢν δὲ πένῃ, αἰτεῖς πολίτας ἐλεημοσύνην — ὀλίγον μὲν δίδουσιν,
// οὐδεὶς δ’ ἀρνεῖται πάμπαν." (You earn coin by the sweat of battle, or by
// selling spoils to merchants; if you're poor, you ask the citizens for
// alms — they give little, but none ever refuse outright.) Battle gold is
// awarded straight from app.js's endBattle; this is the other two legs.

// Sell one unequipped gear item from inventory for `value` χρυσός (see
// treasure.js's gearSellValue — kept there so roster.js stays pure state,
// no game-balance numbers).
export function sellGear(playerDid, gearId, value) {
  removeOneGear(playerDid, gearId);
  return addGold(playerDid, value);
}

export function canBeg(playerDid) {
  const last = Number(localStorage.getItem(begKey(playerDid)) || 0);
  return Date.now() - last >= BEG_COOLDOWN_MS;
}

// Alms never refuse outright — this always succeeds once the cooldown clears.
export function begAlms(playerDid, rng = Math.random) {
  localStorage.setItem(begKey(playerDid), String(Date.now()));
  const amount = 1 + Math.floor(rng() * 4);
  return { amount, total: addGold(playerDid, amount) };
}

// Roll a bind. `hpPct` (0..1) is the wild pelor's remaining HP — lower HP
// makes the throw easier, same shape as mootmon's catch formula without
// copying its exact math.
export function attemptBind(pelor, hpPct, rng = Math.random) {
  const boost = 1.8 - clamp01(hpPct) * 0.8; // 1.0 at full HP, up to 1.64 near 0
  const chance = clamp01(pelor.catchRate * boost);
  return { success: rng() < chance, chance };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

export function addToParty(playerDid, peloraDid) {
  const party = getParty(playerDid);
  if (party.includes(peloraDid) || party.length >= PARTY_MAX) return party;
  party.push(peloraDid);
  saveParty(playerDid, party);
  return party;
}

export function removeFromParty(playerDid, peloraDid) {
  const party = getParty(playerDid).filter((d) => d !== peloraDid);
  saveParty(playerDid, party);
  return party;
}

// The city's trading counter: let a bound pelor go for good, out of both the
// bestiary and the active party. Opposite of addToBestiary/addToParty.
export function releaseFromBestiary(playerDid, peloraDid) {
  const bestiary = getBestiary(playerDid);
  delete bestiary[peloraDid];
  saveBestiary(playerDid, bestiary);
  removeFromParty(playerDid, peloraDid);
  return bestiary;
}

// The trading counter's real business, per @antiali.as's verse: apply a
// sealed two-party swap locally (see public/lib/trades.js's isSealed) — let
// go of the pelor I gave (giveDid, already in my bestiary), bind the one I
// received (from the counterparty's own sealed record, so its stats/species
// are exactly what they attested to). Mirrors hydrateFromRemote's snapshot ->
// bestiary-entry conversion in app.js, kept local to roster.js since it's
// pure state, no network.
export function applyTradeSwap(playerDid, giveDid, receiveSnapshot) {
  releaseFromBestiary(playerDid, giveDid);
  const rm = rarityMeta(receiveSnapshot.rarity);
  addToBestiary(playerDid, {
    did: receiveSnapshot.did,
    handle: receiveSnapshot.handle,
    displayName: receiveSnapshot.handle,
    avatar: receiveSnapshot.avatar || "",
    type: receiveSnapshot.type,
    species: receiveSnapshot.species,
    rarity: receiveSnapshot.rarity,
    rarityLabel: rm.label,
    rarityColor: rm.color,
    catchRate: rm.catchRate,
    stats: {
      hp: receiveSnapshot.hp,
      atk: receiveSnapshot.atk,
      def: receiveSnapshot.def,
      spd: receiveSnapshot.spd,
    },
    evoStage: typeof receiveSnapshot.evoStage === "number" ? receiveSnapshot.evoStage : rm.stage,
    wins: receiveSnapshot.wins || 0,
  });
  addToParty(playerDid, receiveSnapshot.did);
}

// Hydrate from a PDS roster record (source of truth for party/record once
// signed in). `bestiary` is merged on top of what's already local rather than
// replacing it outright — the roster record only carries the active party
// (see net.bisks.kolpelor.roster), so a wholesale overwrite would silently
// drop any pelora this browser bound but never fielded.
export function replaceState(playerDid, { party, bestiary, record, gold, gear }) {
  if (party) saveParty(playerDid, party);
  if (bestiary) saveBestiary(playerDid, { ...getBestiary(playerDid), ...bestiary });
  if (record) localStorage.setItem(recordKey(playerDid), JSON.stringify(record));
  if (typeof gold === "number") localStorage.setItem(goldKey(playerDid), JSON.stringify(gold));
  if (gear) localStorage.setItem(gearKey(playerDid), JSON.stringify(gear));
}

export const MAX_PARTY = PARTY_MAX;
