// store.js — all the localStorage bookkeeping for unmooted. Everything here
// is per-browser, per-device; there's no server, no account, no global
// database. That's the honest answer to "how would this work statically?" —
// it doesn't watch the firehose, it just remembers what you already checked
// and diffs against your next check of the same handle.

const SNAP_PREFIX = "unmooted:snap:"; // one snapshot per DID, overwritten each check
const HIST_PREFIX = "unmooted:hist:"; // lightweight per-DID check log
const WAVES_KEY = "unmooted:waves"; // cross-handle feed of detected unmootings

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSnapshot(did) {
  return readJSON(SNAP_PREFIX + did);
}

// A big account's follower list can be tens of thousands of profiles —
// localStorage quotas (~5-10MB) are a real, physical browser limit, not a
// caution cap, so saving degrades gracefully instead of just failing: full
// profiles (handle+name+avatar) first, then handle-only, then did-only, then
// give up. Whichever level succeeds is what the next diff has to work with,
// which is why lost/gained rendering below tolerates missing avatar/name.
function saveSnapshot(did, snapshot) {
  const levels = [
    (f) => f,
    (f) => f.map(({ did, handle }) => ({ did, handle })),
    (f) => f.map(({ did }) => ({ did })),
  ];
  for (let i = 0; i < levels.length; i++) {
    const trimmed = { ...snapshot, followers: levels[i](snapshot.followers) };
    if (writeJSON(SNAP_PREFIX + did, trimmed)) {
      return { ok: true, degraded: i > 0 };
    }
  }
  return { ok: false, degraded: false };
}
export { saveSnapshot };

export function loadHistory(did) {
  return readJSON(HIST_PREFIX + did) || [];
}

export function appendHistory(did, entry) {
  const hist = loadHistory(did);
  hist.push(entry);
  writeJSON(HIST_PREFIX + did, hist);
}

export function loadWaves() {
  return readJSON(WAVES_KEY) || [];
}

export function appendWave(wave) {
  const waves = loadWaves();
  waves.push(wave);
  writeJSON(WAVES_KEY, waves);
}

export function forgetHandle(did) {
  try {
    localStorage.removeItem(SNAP_PREFIX + did);
    localStorage.removeItem(HIST_PREFIX + did);
  } catch {}
}

export function forgetEverything() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("unmooted:")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {}
}
