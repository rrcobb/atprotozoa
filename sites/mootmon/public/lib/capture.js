// capture.js — persisted trainer state (localStorage, scoped per trainer
// DID like simcluster-gacha's collection): the dex of everything caught,
// the active party (<=6), and a win/loss record. Also the catch-chance
// roll itself.

const PARTY_MAX = 6;

const dexKey = (did) => `mootmon:dex:${did}`;
const partyKey = (did) => `mootmon:party:${did}`;
const recordKey = (did) => `mootmon:record:${did}`;

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") ?? fallback;
  } catch {
    return fallback;
  }
}

export function getDex(trainerDid) {
  return readJson(dexKey(trainerDid), {});
}

export function getParty(trainerDid) {
  return readJson(partyKey(trainerDid), []);
}

export function getRecord(trainerDid) {
  return readJson(recordKey(trainerDid), { wins: 0, losses: 0 });
}

export function recordResult(trainerDid, won) {
  const r = getRecord(trainerDid);
  if (won) r.wins++;
  else r.losses++;
  localStorage.setItem(recordKey(trainerDid), JSON.stringify(r));
  return r;
}

function saveDex(trainerDid, dex) {
  localStorage.setItem(dexKey(trainerDid), JSON.stringify(dex));
}

function saveParty(trainerDid, party) {
  localStorage.setItem(partyKey(trainerDid), JSON.stringify(party));
}

export function isCaught(trainerDid, monsterDid) {
  return !!getDex(trainerDid)[monsterDid];
}

export function addToDex(trainerDid, monster) {
  const dex = getDex(trainerDid);
  dex[monster.did] = { ...monster, caughtAt: Date.now() };
  saveDex(trainerDid, dex);
  return dex;
}

// Roll a capture. `hpPct` (0..1) is the wild creature's remaining HP —
// lower HP makes the throw easier, same shape as the real games' catch
// formula without copying its exact math.
export function attemptCatch(monster, hpPct, rng = Math.random) {
  const boost = 1.8 - clamp01(hpPct) * 0.8; // 1.0 at full HP, up to 1.64 near 0
  const chance = clamp01(monster.catchRate * boost);
  return { success: rng() < chance, chance };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

export function addToParty(trainerDid, monsterDid) {
  const party = getParty(trainerDid);
  if (party.includes(monsterDid) || party.length >= PARTY_MAX) return party;
  party.push(monsterDid);
  saveParty(trainerDid, party);
  return party;
}

export function removeFromParty(trainerDid, monsterDid) {
  const party = getParty(trainerDid).filter((d) => d !== monsterDid);
  saveParty(trainerDid, party);
  return party;
}

export const MAX_PARTY = PARTY_MAX;
