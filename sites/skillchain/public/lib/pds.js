// pds.js — reading and writing skillchain records. Every player's ships and
// duels live in their own PDS; the "world" is whoever holds those collections.
import { dpopFetch } from "./oauth.js";

export const SHIP = "net.bisks.skillchain.ship";
export const DUEL = "net.bisks.skillchain.duel";
const RELAY = "https://bsky.network";
const APPVIEW = "https://public.api.bsky.app";
const PLC = "https://plc.directory";

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url.split("?")[0].split("/").pop()}`);
  return r.json();
}

export async function resolveActor(actor) {
  actor = actor.trim().replace(/^@/, "");
  if (actor.startsWith("did:")) return actor;
  const d = await getJson(`${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
  return d.did;
}

const pdsCache = new Map();
export async function pdsFor(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  let doc;
  if (did.startsWith("did:web:")) doc = await getJson(`https://${did.slice(8)}/.well-known/did.json`);
  else doc = await getJson(`${PLC}/${did}`);
  const svc = (doc.service || []).find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
  if (!svc) throw new Error("no PDS in DID document");
  pdsCache.set(did, svc.serviceEndpoint.replace(/\/$/, ""));
  return pdsCache.get(did);
}

// Every record in one repo's collection, paged until the cursor runs out.
export async function listAll(did, collection) {
  const pds = await pdsFor(did);
  const out = [];
  let cursor;
  do {
    const p = new URLSearchParams({ repo: did, collection, limit: "100" });
    if (cursor) p.set("cursor", cursor);
    const d = await getJson(`${pds}/xrpc/com.atproto.repo.listRecords?${p}`);
    for (const r of d.records || []) {
      out.push({ did, rkey: r.uri.split("/").pop(), cid: r.cid, value: r.value });
    }
    cursor = d.cursor;
  } while (cursor);
  return out;
}

// Every DID that holds the collection (the "world" roster), to exhaustion.
export async function listPilots(collection = SHIP, onPage) {
  const dids = [];
  let cursor;
  do {
    const p = new URLSearchParams({ collection, limit: "1000" });
    if (cursor) p.set("cursor", cursor);
    const d = await getJson(`${RELAY}/xrpc/com.atproto.sync.listReposByCollection?${p}`);
    for (const r of d.repos || []) dids.push(r.did);
    cursor = d.repos?.length ? d.cursor : undefined;
    if (onPage) onPage(dids.length);
  } while (cursor);
  return dids;
}

const profCache = new Map();
export async function profiles(dids) {
  const need = dids.filter((d) => !profCache.has(d));
  for (let i = 0; i < need.length; i += 25) { // getProfiles accepts 25 actors per call
    const chunk = need.slice(i, i + 25);
    try {
      const q = chunk.map((d) => `actors=${encodeURIComponent(d)}`).join("&");
      const d = await getJson(`${APPVIEW}/xrpc/app.bsky.actor.getProfiles?${q}`);
      for (const p of d.profiles || []) profCache.set(p.did, p);
    } catch {}
    for (const d of chunk) if (!profCache.has(d)) profCache.set(d, { did: d, handle: d });
  }
  return dids.map((d) => profCache.get(d));
}

export function newRkey(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function write(session, method, body) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: session.did, ...body }),
  });
  if (!res.ok) throw new Error(`${method} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export const putShip = (session, rkey, record) =>
  write(session, "putRecord", { collection: SHIP, rkey, record: { $type: SHIP, ...record } });
export const putDuel = (session, rkey, record) =>
  write(session, "putRecord", { collection: DUEL, rkey, record: { $type: DUEL, ...record } });
