// Rosters: a frozen, canonically ordered list of DIDs. The engine only sees N;
// a roster maps entrant index <-> DID.
//
// Canonical order: plain UTF-16 code-unit order of the full DID string (what
// JS's default sort and `<` do), duplicates removed. Entrant index = position.

import { sha256Hex } from "./engine.js";

// Synthetic DIDs: did:example:<6 chars of base32 in ASCII-ascending alphabet>.
// Ascending alphabet + fixed width means index order == lexicographic order, so
// the roster is canonical without ever materialising N strings (10M strings
// would not fit in a tab). `did:example` is the DID spec's reserved demo method:
// these can never collide with a real account.
const ALPHA = "234567abcdefghijklmnopqrstuvwxyz";
const SYN_PREFIX = "did:example:";
const SYN_WIDTH = 6; // 32^6 = 2^30 identities

export const SYNTHETIC_MAX = 1 << 30;

export function syntheticRoster(n) {
  return {
    kind: "synthetic",
    n,
    label: "SYNTHETIC DEMO ROSTER (did:example — no real accounts)",
    id: `synthetic-${n}`,
    didAt(i) {
      let s = "";
      for (let k = 0; k < SYN_WIDTH; k++) { s = ALPHA[i & 31] + s; i = Math.floor(i / 32); }
      return SYN_PREFIX + s;
    },
    indexOf(did) {
      if (!did.startsWith(SYN_PREFIX) || did.length !== SYN_PREFIX.length + SYN_WIDTH) return -1;
      let v = 0;
      for (const ch of did.slice(SYN_PREFIX.length)) {
        const d = ALPHA.indexOf(ch);
        if (d < 0) return -1;
        v = v * 32 + d;
      }
      return v < n ? v : -1;
    },
  };
}

// Real roster from an array of DID strings. Sorts and dedupes; the snapshot id
// is the SHA-256 of the canonical newline-joined list, so two people with the
// same DIDs get the same id.
export async function realRoster(dids, meta = {}) {
  const sorted = [...new Set(dids)].sort();
  const id = (await sha256Hex(sorted.join("\n"))).slice(0, 16);
  return {
    kind: "real",
    n: sorted.length,
    label: "INDEXED PUBLIC DIDS" + (meta.partial ? " (PARTIAL INDEX)" : ""),
    id: `real-${id}`,
    meta,
    didAt: (i) => sorted[i],
    indexOf(did) {
      let lo = 0, hi = sorted.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1, v = sorted[mid];
        if (v === did) return mid;
        if (v < did) lo = mid + 1; else hi = mid - 1;
      }
      return -1;
    },
  };
}

export const isDid = (s) => /^did:[a-z]+:[A-Za-z0-9._:%-]+$/.test(s);
// Strip a leading "@" and whitespace so "@alice.bsky.social" works.
export const cleanInput = (s) => s.trim().replace(/^@+/, "").trim();
