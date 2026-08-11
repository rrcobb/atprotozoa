// atproto.js — read-side helper: resolve a handle/DID/URL to a full public
// profile. Copy, don't abstract: trimmed from alice-meets-bob's atproto.js
// (drops PDS/repo-record reads — a battle only needs the public profile).

const PUB = "https://public.api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Forgiving handle/DID/URL parsing, copied from alice-meets-bob's resolveDid.
export function normalizeActor(actor) {
  return (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

// Fetches the full public profile (app.bsky.actor.getProfile) for a
// handle, DID, or bsky.app profile URL. Throws if the actor can't be found.
export async function getProfile(actor) {
  const a = normalizeActor(actor);
  if (!a) throw new Error("empty handle");
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(a)}`);
}
