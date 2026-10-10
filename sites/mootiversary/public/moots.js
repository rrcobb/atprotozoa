// moots.js — pure logic: TID -> date, moot date = the later of the two follows.

const B32 = "234567abcdefghijklmnopqrstuvwxyz";

// A record key made by the PDS is a TID: 13 base32-sortable chars encoding
// microseconds since the epoch (top bit 0, low 10 bits are a clock id).
// Returns ms since epoch, or null if rkey isn't a TID.
export function tidToMs(rkey) {
  if (typeof rkey !== "string" || rkey.length !== 13) return null;
  let v = 0n;
  for (const ch of rkey) {
    const i = B32.indexOf(ch);
    if (i < 0) return null;
    v = (v << 5n) | BigInt(i);
  }
  const ms = Number((v >> 10n) / 1000n);
  // sanity: Bluesky launched 2022; anything outside is a non-TID rkey
  if (ms < Date.UTC(2022, 0, 1) || ms > Date.now() + 86400000) return null;
  return ms;
}

export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

// mine: Map<did, ms> of when I followed them. theirs: Map<did, ms> of when
// they followed me (may be missing). followers: Set<did>.
// Returns [{ did, ms, approx }] for every mutual.
export function computeMoots(mine, followers, theirs) {
  const out = [];
  for (const [did, myMs] of mine) {
    if (!followers.has(did)) continue;
    const t = theirs.get(did);
    const known = typeof t === "number";
    out.push({ did, ms: known ? Math.max(myMs, t) : myMs, approx: !known });
  }
  return out;
}

// Group by UTC day: Map<"yyyy-mm-dd", moot[]>
export function byDay(moots) {
  const m = new Map();
  for (const x of moots) {
    const k = dayKey(x.ms);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}
