// atproto.js — read-only profile lookup against the public AppView. Trimmed
// from sites/quadrants/public/lib/atproto.js (copy, don't abstract): this
// site only ever reads one profile per handle, no follow-graph walk needed.

const PUB = "https://api.bsky.app/xrpc";

export async function getProfile(actor) {
  const r = await fetch(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}
