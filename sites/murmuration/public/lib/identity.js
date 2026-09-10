// identity.js — resolve a Bluesky handle to a DID and its full follow list,
// then batch-fetch profiles for the ones we're actually going to render as
// birds. Reads Bluesky's PUBLIC AppView anonymously (api.bsky.app, CORS *,
// no auth) plus a repo CAR download for the bulk follow read. Copied and
// trimmed from sites/kevinmoot/public/lib/{identity,bfs}.js (copy, don't
// abstract).

import { fetchRepoRecordsWithKeys } from "./car.js";

const PUB = "https://api.bsky.app/xrpc";

// Paginated fallback only kicks in if the CAR read itself fails (oversized
// repo, PDS unreachable/non-CORS, malformed CAR) — see fetchFollows() below.
// 400 pages / ~40,000 follows is a backstop against a runaway loop, not a
// data cap: per notes/40-new-site-playbook.md's 2026-08-28 standing order, a
// page count that trades correctness for speed isn't a real limit, it's a
// forgotten default. Matches every other moot-family site's GRAPH_PAGES.
const GRAPH_PAGES = 400;

export async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Forgiving about paste formats — handle, @mention, profile URL, or a bare DID.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

export const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

export async function getProfile(did) {
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  return profileOf(p);
}

// Batch-fetch profiles, 25 actors per request (AppView's cap).
export async function getProfiles(dids) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.set(p.did, profileOf(p));
    } catch {
      // partial data is fine — missing profiles just render as bare handles
    }
  }
  return out;
}

async function resolvePds(did) {
  try {
    let doc;
    if (did.startsWith("did:web:")) {
      const host = decodeURIComponent(did.slice("did:web:".length)).replace(/:/g, "/");
      doc = await jget(`https://${host}/.well-known/did.json`);
    } else {
      doc = await jget(`https://plc.directory/${encodeURIComponent(did)}`);
    }
    const svc = (doc.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    return (svc && svc.serviceEndpoint) || null;
  } catch {
    return null;
  }
}

async function paginatedFollows(did, onProgress) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/app.bsky.graph.getFollows`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const it of d.follows || []) out.push(it.did);
    cursor = d.cursor;
    if (onProgress) onProgress(out.length);
    if (!cursor) break;
  }
  return out;
}

// Every DID `did` follows, read as one repo CAR download (no page cap) —
// falls back to a paginated getFollows walk only if the CAR read fails.
// See sites/kevinmoot/public/lib/bfs.js's header for the full reasoning.
export async function fetchFollows(did, onProgress) {
  try {
    const pds = await resolvePds(did);
    if (!pds) throw new Error("no PDS");
    if (onProgress) onProgress("downloading your repo...");
    const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.graph.follow");
    return records.map((r) => r.value && r.value.subject).filter(Boolean);
  } catch {
    if (onProgress) onProgress("repo read failed, paginating instead...");
    return paginatedFollows(did, (n) => onProgress && onProgress(`${n} follows so far...`));
  }
}
