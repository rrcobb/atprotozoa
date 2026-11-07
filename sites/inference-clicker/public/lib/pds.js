// pds.js — the save file lives in the player's own repo as one record,
// net.bisks.inferenceclicker.save/self. Reading needs no grant; writing is
// covered by the create+update scope in oauth.js.

import { dpopFetch } from "./oauth.js";
import { COLLECTION } from "./game.js";

const xrpc = (pds, m) => `${pds.replace(/\/$/, "")}/xrpc/${m}`;

// -> the record value, or null if this account has no save yet.
export async function readSave(session) {
  const q = new URLSearchParams({ repo: session.did, collection: COLLECTION, rkey: "self" });
  const res = await dpopFetch(session, `${xrpc(session.pdsUrl, "com.atproto.repo.getRecord")}?${q}`);
  if (res.status === 404 || res.status === 400) return null; // RecordNotFound
  if (!res.ok) throw new Error(`could not read save (${res.status})`);
  return (await res.json()).value || null;
}

export async function writeSave(session, record) {
  const res = await dpopFetch(session, xrpc(session.pdsUrl, "com.atproto.repo.putRecord"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: session.did, collection: COLLECTION, rkey: "self", record, validate: false }),
  });
  if (!res.ok) throw new Error(`could not save to your PDS (${res.status}): ${(await res.text()).slice(0, 160)}`);
}
