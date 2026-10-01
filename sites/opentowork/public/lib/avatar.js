// avatar.js — read a profile's avatar (public, no scope needed) and swap it
// (putRecord on app.bsky.actor.profile, which is the one write the OAuth
// scope grants). Reads go to the account's own PDS: com.atproto.repo.getRecord
// and com.atproto.sync.getBlob are unauthenticated.

import { dpopFetch, resolveHandle, resolvePds } from "./oauth.js";

const COLLECTION = "app.bsky.actor.profile";

const xrpc = (pds, m) => `${pds.replace(/\/$/, "")}/xrpc/${m}`;

// -> { did, pds, record, cid, avatar: {cid, mime} | null }. `record` is null if
// the account has no profile record yet.
export async function readProfile(who) {
  const did = who.startsWith("did:") ? who : await resolveHandle(who);
  if (!did) throw new Error("couldn't resolve that handle");
  const pds = await resolvePds(did);
  if (!pds) throw new Error("couldn't find that account's PDS");
  const u = `${xrpc(pds, "com.atproto.repo.getRecord")}?repo=${encodeURIComponent(did)}&collection=${COLLECTION}&rkey=self`;
  const r = await fetch(u);
  if (r.status === 400 || r.status === 404) return { did, pds, record: null, cid: null, avatar: null };
  if (!r.ok) throw new Error(`couldn't read the profile (${r.status})`);
  const j = await r.json();
  const a = j.value?.avatar;
  return {
    did,
    pds,
    record: j.value,
    cid: j.cid,
    avatar: a?.ref?.$link ? { cid: a.ref.$link, mime: a.mimeType || "image/jpeg" } : null,
  };
}

export async function fetchAvatarBytes(pds, did, cid) {
  const u = `${xrpc(pds, "com.atproto.sync.getBlob")}?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`couldn't download the avatar (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function bitmapFromBytes(bytes, mime) {
  return createImageBitmap(new Blob([bytes], { type: mime }));
}

async function uploadBlob(session, bytes, mime) {
  const res = await dpopFetch(session, xrpc(session.pdsUrl, "com.atproto.repo.uploadBlob"), {
    method: "POST",
    headers: { "content-type": mime },
    body: bytes,
  });
  if (!res.ok) throw new Error(`uploadBlob failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).blob;
}

// Replace the avatar, keeping every other profile field. swapRecord makes the
// write fail rather than clobber an edit made elsewhere since we read it.
// Returns the new avatar's cid.
export async function setAvatar(session, profile, bytes, mime) {
  if (!profile.record) throw new Error("this account has no profile record to update");
  const blob = await uploadBlob(session, bytes, mime);
  const record = { ...profile.record, avatar: blob };
  const res = await dpopFetch(session, xrpc(session.pdsUrl, "com.atproto.repo.putRecord"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: COLLECTION,
      rkey: "self",
      record,
      swapRecord: profile.cid,
    }),
  });
  if (!res.ok) throw new Error(`putRecord failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return blob.ref?.$link;
}

// --- the original avatar, kept in this browser so "restore" works --------------
// The PDS may garbage-collect the old blob once the profile stops pointing at
// it, so the original's bytes are saved locally (IndexedDB) before the swap.
// Value: { bytes, mime, appliedCid } — appliedCid is the ringed avatar we published.

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("opentowork-originals", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("o");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function run(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = fn(db.transaction("o", mode).objectStore("o"));
    q.onsuccess = () => res(q.result ?? null);
    q.onerror = () => rej(q.error);
  });
}
export const loadOriginal = (did) => run("readonly", (s) => s.get(did));
export const saveOriginal = (did, value) => run("readwrite", (s) => s.put(value, did));
export const clearOriginal = (did) => run("readwrite", (s) => s.delete(did));
