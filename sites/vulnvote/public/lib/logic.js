// logic.js — pure vote logic for vulnvote: id normalisation, alias dedupe and
// voter weighting. No DOM, no network, so tests/logic.test.mjs can run it.

export const DAY = 86400000;

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,100}$/;

// CVE ids are upper-case, GHSA ids are "GHSA-" + lower-case groups; anything
// else OSV knows (RUSTSEC-…, PYSEC-…, GO-…) keeps its case.
export function normaliseId(raw) {
  const s = String(raw || "").trim().replace(/^https?:\/\/.*\//, "");
  if (/^cve-/i.test(s)) return s.toUpperCase();
  if (/^ghsa-/i.test(s)) return "GHSA-" + s.slice(5).toLowerCase();
  return s;
}

export function validId(id) {
  return ID_RE.test(id);
}

// One entry per real-world vulnerability: prefer the CVE id, else the GHSA.
export function pickCanonical(ids) {
  const list = ids.map(normaliseId).filter(validId);
  return list.find((i) => i.startsWith("CVE-")) || list.find((i) => i.startsWith("GHSA-")) || list.sort()[0] || null;
}

// Votes are {did, subject, aliases[], dir, severity|null, title, official, at}.
// Union every id that any vote lists as an alias of another, so a vote on
// GHSA-x and a vote on CVE-y land in one group when either vote links them.
export function groupVotes(votes) {
  const parent = new Map();
  const find = (a) => {
    if (!parent.has(a)) parent.set(a, a);
    while (parent.get(a) !== a) {
      parent.set(a, parent.get(parent.get(a)));
      a = parent.get(a);
    }
    return a;
  };
  const union = (a, b) => parent.set(find(a), find(b));
  for (const v of votes) {
    find(v.subject);
    for (const al of v.aliases || []) union(v.subject, al);
  }
  const groups = new Map();
  for (const v of votes) {
    const root = find(v.subject);
    let g = groups.get(root);
    if (!g) groups.set(root, (g = { ids: new Set(), votes: [] }));
    g.ids.add(v.subject);
    for (const al of v.aliases || []) g.ids.add(al);
    g.votes.push(v);
  }
  const out = [];
  for (const g of groups.values()) {
    // One voter, one vote per vulnerability, however many aliases they used.
    const latest = new Map();
    for (const v of g.votes) {
      const prev = latest.get(v.did);
      if (!prev || v.at >= prev.at) latest.set(v.did, v);
    }
    const ids = [...g.ids];
    out.push({ id: pickCanonical(ids), ids, votes: [...latest.values()] });
  }
  return out;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Accounts under a week old count a tenth; full weight at a year.
export function ageWeight(createdMs, now) {
  if (!createdMs) return 0.5; // creation date unknown (not plc, or lookup failed)
  const days = Math.max(0, (now - createdMs) / DAY);
  return Math.min(1, 0.1 + (0.9 * days) / 365);
}

// vouches: [{from, to}] — each distinct voucher adds their own age weight, so
// a pile of day-old sock accounts vouching adds almost nothing.
export function vouchWeights(vouches, ages, now) {
  const seen = new Set();
  const sums = new Map();
  for (const { from, to } of vouches) {
    if (from === to || seen.has(from + ">" + to)) continue;
    seen.add(from + ">" + to);
    sums.set(to, (sums.get(to) || 0) + ageWeight(ages.get(from), now));
  }
  const out = new Map();
  for (const [did, sum] of sums) out.set(did, 1 + 0.5 * Math.log2(1 + sum));
  return out;
}

// Calibration: how far a voter's severity calls sit from the median of
// everyone else's on the same vulnerability. Needs ≥3 comparable calls, else
// neutral (1). 0 off → 1.25, 5 off → 0.5 (floor).
export function calibrationWeights(groups) {
  const diffs = new Map();
  for (const g of groups) {
    const rated = g.votes.filter((v) => v.severity != null);
    if (rated.length < 4) continue;
    for (const v of rated) {
      const others = rated.filter((o) => o !== v).map((o) => o.severity);
      const d = Math.abs(v.severity - median(others));
      const a = diffs.get(v.did) || [];
      a.push(d);
      diffs.set(v.did, a);
    }
  }
  const out = new Map();
  for (const [did, a] of diffs) {
    if (a.length < 3) continue;
    const mad = a.reduce((x, y) => x + y, 0) / a.length;
    out.set(did, Math.min(1.25, Math.max(0.5, 1.25 - mad / 4)));
  }
  return out;
}

export function voterWeights(groups, vouches, ages, now) {
  const vw = vouchWeights(vouches, ages, now);
  const cw = calibrationWeights(groups);
  const dids = new Set(groups.flatMap((g) => g.votes.map((v) => v.did)));
  const out = new Map();
  for (const did of dids) {
    const parts = { age: ageWeight(ages.get(did), now), vouch: vw.get(did) || 1, calib: cw.get(did) || 1 };
    out.set(did, { ...parts, total: parts.age * parts.vouch * parts.calib });
  }
  return out;
}

export function scoreGroup(g, weights) {
  let up = 0, down = 0, ups = 0, downs = 0, sevSum = 0, sevW = 0, latest = 0;
  for (const v of g.votes) {
    const w = weights.get(v.did)?.total ?? 0.5;
    if (v.dir > 0) { up += w; ups++; } else { down += w; downs++; }
    if (v.severity != null) { sevSum += w * v.severity; sevW += w; }
    if (v.at > latest) latest = v.at;
  }
  const title = g.votes.map((v) => v.title).find(Boolean) || "";
  const official = g.votes.map((v) => v.official).find(Boolean) || "";
  return {
    id: g.id, ids: g.ids, title, official, latest,
    up, down, ups, downs, net: up - down, voters: g.votes.length,
    severity: sevW ? sevSum / sevW : null,
    sevVoters: g.votes.filter((v) => v.severity != null).length,
    weightTotal: up + down,
  };
}

export const SORTS = {
  top: (a, b) => b.net - a.net || b.voters - a.voters,
  new: (a, b) => b.latest - a.latest,
  severe: (a, b) => (b.severity ?? -1) - (a.severity ?? -1),
  // most weight on both sides
  controversial: (a, b) => Math.min(b.up, b.down) - Math.min(a.up, a.down),
};

// Pull an id + aliases + title out of an OSV vulnerability document.
export function fromOsv(doc) {
  const ids = [doc.id, ...(doc.aliases || [])];
  const sev = doc.database_specific?.severity;
  return {
    id: pickCanonical(ids),
    ids: ids.map(normaliseId).filter(validId),
    title: String(doc.summary || doc.details || "").split("\n")[0].slice(0, 200),
    official: typeof sev === "string" ? sev.slice(0, 20) : "",
  };
}
