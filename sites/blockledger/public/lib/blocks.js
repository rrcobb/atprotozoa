// blocks.js — given a set of "mutual" profiles, find block edges *within*
// that set: any mutual who has blocked another mutual.
//
// app.bsky.graph.block records live in the blocker's own PDS repo and are
// ordinary public repo data — com.atproto.repo.listRecords is an
// unauthenticated read on any PDS (CORS *), no special "who blocks who"
// endpoint needed, no login. That's the same public-repo trick
// identity.js's resolvePds exists for. Copied from beefcheck/metamoots's
// PDS-crawl + pooledEach pattern (copy, don't abstract).

import { resolvePds, pooledEach } from "./identity.js";

const BLOCK_PAGES = 6; // <= 600 blocks scanned per mutual
const CONCURRENCY = 8;
export const MUTUAL_SCAN_CAP = 250; // keep a huge follow graph from taking forever

async function listBlockSubjects(pdsBase, did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < BLOCK_PAGES; p++) {
    const u = new URL(`${pdsBase.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set("repo", did);
    u.searchParams.set("collection", "app.bsky.graph.block");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      const r = await fetch(u.toString());
      if (!r.ok) break;
      d = await r.json();
    } catch {
      break;
    }
    for (const rec of d.records || []) {
      const subject = rec.value && rec.value.subject;
      if (subject) out.push({ subject, createdAt: rec.value.createdAt || null });
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// mutuals: array of { did, handle, displayName, avatar }.
// Returns { edges, scanned, capped } — edges are
// { blocker, blocked, createdAt }, both endpoints drawn from `mutuals`.
export async function findBlockEdges(mutuals, { onProgress } = {}) {
  const capped = mutuals.length > MUTUAL_SCAN_CAP;
  const pool = capped ? mutuals.slice(0, MUTUAL_SCAN_CAP) : mutuals;
  const mutualDids = new Set(pool.map((m) => m.did));
  const byDid = new Map(pool.map((m) => [m.did, m]));
  const edges = [];
  let scanned = 0;

  await pooledEach(pool, CONCURRENCY, async (m) => {
    try {
      const pds = await resolvePds(m.did);
      if (pds) {
        const blocks = await listBlockSubjects(pds, m.did);
        for (const b of blocks) {
          if (b.subject !== m.did && mutualDids.has(b.subject)) {
            edges.push({ blocker: m, blocked: byDid.get(b.subject), createdAt: b.createdAt });
          }
        }
      }
    } catch {
      // one mutual's PDS being unreachable shouldn't sink the whole scan
    } finally {
      scanned++;
      if (onProgress) onProgress(scanned, pool.length);
    }
  });

  return { edges, scanned, capped };
}
