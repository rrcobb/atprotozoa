// roster.js — persisted player state (localStorage, scoped per player DID,
// same shape as sites/mootmon/public/lib/capture.js): the bestiary of every
// pelor ever bound, the active party (<=6), the win/loss record, and how far
// up the gymnasion ladder the player has climbed. Also the bind-chance roll
// itself. app.js layers a PDS write-through on top of this for signed-in
// players (see records.js) — this module never talks to the network.

const PARTY_MAX = 6;

const bestiaryKey = (did) => `kolpelor:bestiary:${did}`;
const partyKey = (did) => `kolpelor:party:${did}`;
const recordKey = (did) => `kolpelor:record:${did}`;

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
  bestiary[pelor.did] = { ...pelor, boundAt: Date.now() };
  saveBestiary(playerDid, bestiary);
  return bestiary;
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

// Hydrate from a PDS roster record (source of truth for party/record once
// signed in). `bestiary` is merged on top of what's already local rather than
// replacing it outright — the roster record only carries the active party
// (see net.bisks.kolpelor.roster), so a wholesale overwrite would silently
// drop any pelora this browser bound but never fielded.
export function replaceState(playerDid, { party, bestiary, record }) {
  if (party) saveParty(playerDid, party);
  if (bestiary) saveBestiary(playerDid, { ...getBestiary(playerDid), ...bestiary });
  if (record) localStorage.setItem(recordKey(playerDid), JSON.stringify(record));
}

export const MAX_PARTY = PARTY_MAX;
