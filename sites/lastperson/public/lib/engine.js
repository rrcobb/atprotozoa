// LP1 — the tournament engine. Pure integer code, no DOM, no network, no
// Math.random. Runs identically in a worker, on the main thread, and in node.
//
// RULES (algorithm version "LP1"; any change to these bumps the version)
//   roster   N entrants, indexed 0..N-1 in canonical (sorted, deduplicated) order.
//   seed     64 hex chars (SHA-256). Split into four little 32-bit words w0..w3.
//   shuffle  Fisher–Yates over indices 0..N-1, i from N-1 down to 1:
//              j = floor(h(w, SHUF, i) / 2^32 * (i+1))   (bias <= i/2^32)
//            round 0 = the shuffled array. Bracket order never depends on DID text.
//   pairing  in each round, survivors s[0..L-1] pair as (s[2j], s[2j+1]).
//            If L is odd the last survivor gets a BYE: it advances unplayed.
//            A bye is not a match and eliminates nobody.
//   match    match (r, j) between a = s[2j] and b = s[2j+1]: winner is b if
//            top bit of h(w, r, j) is set, else a. Depends only on (seed, r, j),
//            so any batch size / worker split yields identical results.
//   totals   N entrants -> exactly N-1 matches, one champion (N >= 1).
//
// h() is murmur3's fmix32 chained over the seed words. It is well mixed but NOT
// cryptographic: this is deterministic entertainment, not a lottery.

export const ALGO = "LP1";
const SHUF = 0xffffff01; // domain tag for the shuffle stream (round numbers are tiny)

export function fmix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function seedWords(hex) {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("seed must be 64 lowercase hex chars");
  const w = new Uint32Array(4);
  for (let i = 0; i < 4; i++) {
    // little-endian read of 8 hex chars: bytes b0 b1 b2 b3 -> b0 | b1<<8 | ...
    const s = hex.slice(i * 8, i * 8 + 8);
    w[i] = (parseInt(s.slice(0, 2), 16) | (parseInt(s.slice(2, 4), 16) << 8) |
      (parseInt(s.slice(4, 6), 16) << 16) | (parseInt(s.slice(6, 8), 16) << 24)) >>> 0;
  }
  return w;
}

// h(w, a, b): hash of the seed with a two-integer coordinate.
export function hash2(w, a, b) {
  let h = fmix32((w[0] ^ Math.imul(a, 0x9e3779b1)) >>> 0);
  h = fmix32((h ^ w[1] ^ Math.imul(b, 0x85ebca77)) >>> 0);
  h = fmix32((h + w[2] + Math.imul(b ^ a, 0xc2b2ae3d)) >>> 0);
  return fmix32((h ^ w[3]) >>> 0);
}

export const matchPicksSecond = (w, r, j) => (hash2(w, r, j) >>> 31) === 1;

export function roundSizes(N) {
  const sizes = [];
  if (N <= 0) return sizes;
  let L = N;
  sizes.push(L);
  while (L > 1) { L = (L + 1) >> 1; sizes.push(L); }
  return sizes; // sizes.length - 1 = number of rounds
}

// An incrementally steppable tournament, so the same run can be sliced into
// any batch size (worker, main-thread fallback, tests) without changing results.
export class Tournament {
  constructor(N, seedHex) {
    if (!Number.isInteger(N) || N < 0) throw new Error("N must be a non-negative integer");
    this.N = N;
    this.seedHex = seedHex;
    this.w = seedWords(seedHex);
    this.sizes = roundSizes(N);
    this.R = Math.max(0, this.sizes.length - 1);
    this.rounds = this.sizes.map((n, r) => new Uint32Array(n));
    for (let i = 0; i < N; i++) this.rounds[0][i] = i;
    this.phase = N < 2 ? "done" : "shuffle";
    this.si = N - 1;      // shuffle cursor
    this.r = 0;           // current round being played
    this.j = 0;           // next match in current round
    this.matches = 0;     // matches played
    this.byes = 0;
    this.champion = N >= 1 && N < 2 ? 0 : -1;
  }
  // Rebuild a finished tournament from the survivor arrays a worker sent back.
  static fromRounds(N, seedHex, rounds, stats) {
    const t = Object.create(Tournament.prototype);
    t.N = N; t.seedHex = seedHex; t.w = seedWords(seedHex);
    t.rounds = rounds; t.sizes = rounds.map((a) => a.length); t.R = Math.max(0, rounds.length - 1);
    t.phase = "done"; t.matches = stats.matches; t.byes = stats.byes; t.champion = stats.champion;
    return t;
  }
  get done() { return this.phase === "done"; }
  get expectedMatches() { return Math.max(0, this.N - 1); }

  // Do up to `budget` units of work. Returns true when finished.
  step(budget) {
    const w = this.w;
    if (this.phase === "shuffle") {
      const a = this.rounds[0];
      let i = this.si;
      while (i >= 1 && budget > 0) {
        const j = Math.floor(hash2(w, SHUF, i) / 4294967296 * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
        i--; budget--;
      }
      this.si = i;
      if (i < 1) this.phase = "play";
    }
    while (this.phase === "play" && budget > 0) {
      const cur = this.rounds[this.r], nxt = this.rounds[this.r + 1];
      const L = cur.length, pairs = L >> 1, r = this.r;
      let j = this.j;
      const end = Math.min(pairs, j + budget);
      budget -= end - j;
      for (; j < end; j++) {
        nxt[j] = (hash2(w, r, j) >>> 31) ? cur[2 * j + 1] : cur[2 * j];
      }
      this.matches += end - this.j;
      this.j = j;
      if (j >= pairs) {
        if (L & 1) { nxt[pairs] = cur[L - 1]; this.byes++; }
        this.r++; this.j = 0;
        if (this.r >= this.R) { this.phase = "done"; this.champion = this.rounds[this.R][0]; }
      }
    }
    return this.done;
  }

  runAll(batch = 1 << 20) { while (!this.step(batch)); return this; }

  // Two 32-bit running hashes over every survivor array: a compact fingerprint
  // of the whole bracket, used for replay verification.
  checksum() {
    let a = 0x811c9dc5, b = 0x01000193 ^ this.N;
    for (const arr of this.rounds) {
      a = Math.imul(a ^ arr.length, 0x01000193); b = fmix32(b ^ arr.length);
      for (let i = 0; i < arr.length; i++) {
        a = Math.imul(a ^ arr[i], 0x01000193);
        b = Math.imul(b + arr[i] + 0x9e3779b9 | 0, 0x85ebca6b) ^ (b >>> 15);
      }
    }
    return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
  }

  // Bracket position (index into round 0) of entrant e.
  positionOf(e) {
    const a = this.rounds[0];
    for (let i = 0; i < a.length; i++) if (a[i] === e) return i;
    return -1;
  }

  // Full trace for entrant e: every round it appeared in, who it faced, and how
  // it ended. Requires a finished tournament.
  trace(e) {
    let pos = this.positionOf(e);
    if (pos < 0) return null;
    const steps = [];
    let r = 0;
    const startPos = pos;
    for (; r < this.R; r++) {
      const cur = this.rounds[r], L = cur.length;
      if ((L & 1) && pos === L - 1) {
        steps.push({ round: r, pos, bye: true, opponent: -1, won: true });
        pos >>= 1; continue;
      }
      const opp = cur[pos ^ 1];
      const winner = this.rounds[r + 1][pos >> 1];
      const won = winner === e;
      steps.push({ round: r, pos, bye: false, opponent: opp, won, match: pos >> 1 });
      if (!won) return { entrant: e, startPos, steps, eliminatedRound: r, eliminatedBy: opp, champion: false };
      pos >>= 1;
    }
    return { entrant: e, startPos, steps, eliminatedRound: -1, eliminatedBy: -1, champion: this.champion === e };
  }

  // Chain of eliminators: who beat e, who beat them, ... up to the champion.
  eliminatorChain(e) {
    const chain = [];
    let cur = e;
    for (let guard = 0; guard <= this.R + 1; guard++) {
      const t = this.trace(cur);
      if (!t || t.eliminatedBy < 0) break;
      chain.push({ by: t.eliminatedBy, round: t.eliminatedRound });
      cur = t.eliminatedBy;
    }
    return chain;
  }

  // Count of matches played in rounds before `r` plus the first `j` of round r.
  // matchesBefore(r, j) = eliminations resolved when playback reaches (r, j).
  matchesBefore(r, j = 0) {
    let c = 0;
    for (let k = 0; k < r && k < this.R; k++) c += this.sizes[k] >> 1;
    return c + j;
  }
}

// ---- hex / hashing helpers (WebCrypto exists in browsers, workers, node >= 19) ----
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const GENESIS_PHRASE = "THERE CAN ONLY BE ONE. UNFORTUNATELY.";
export const genesisSeed = () => sha256Hex(`${ALGO}|genesis|${GENESIS_PHRASE}`);
export const seedCommitment = (seedHex) => sha256Hex(`${ALGO}|commit|${seedHex}`);
// Seed of tournament k+1 = H(version, previous seed, previous champion DID, previous tournament id).
export const chainSeed = (prevSeed, champDid, prevId) =>
  sha256Hex(`${ALGO}|chain|${prevSeed}|${champDid}|${prevId}`);
export const tournamentId = (n) => String(n).padStart(6, "0");
