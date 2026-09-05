// atproto.js — read-side helpers: profile + handle lookups against the public
// AppView. Trimmed from sites/quadrants/public/lib/atproto.js (copy, don't
// abstract). Writing (createRecord) stays in oauth.js's dpopFetch, called
// straight from app.js/profile.js once a session exists.

const PUB = "https://api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export async function getProfile(actor) {
  try {
    return await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
  } catch {
    return null;
  }
}
