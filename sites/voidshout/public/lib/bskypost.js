// bskypost.js — hydrates a Shout's optional sourcePostUri into the real,
// current Bluesky post it points at (text, author, images/embeds). The
// Shout record itself stays text-only forever (net.bisks.void.shout has no
// embed field) — CAR import only ever stores provenance (sourcePostUri),
// and every render re-fetches the canonical post from the public AppView
// live, so an edit/delete on the original bsky.app post is reflected here
// too instead of a copy frozen at import time.

const APPVIEW = "https://public.api.bsky.app";
const cache = new Map(); // at:// uri -> post object, or null if unresolved

/** @param {string[]} uris @returns {Promise<Map<string, object|null>>} */
export async function fetchCanonicalPosts(uris) {
  const need = [...new Set(uris.filter(Boolean))].filter((u) => !cache.has(u));
  for (let i = 0; i < need.length; i += 25) {
    const batch = need.slice(i, i + 25);
    const qs = batch.map((u) => `uris=${encodeURIComponent(u)}`).join("&");
    try {
      const r = await fetch(`${APPVIEW}/xrpc/app.bsky.feed.getPosts?${qs}`);
      if (r.ok) {
        const j = await r.json();
        const found = new Set();
        for (const p of j.posts || []) {
          cache.set(p.uri, p);
          found.add(p.uri);
        }
        for (const u of batch) if (!found.has(u)) cache.set(u, null);
      } else {
        for (const u of batch) cache.set(u, null);
      }
    } catch {
      for (const u of batch) cache.set(u, null);
    }
  }
  const out = new Map();
  for (const u of uris) if (u) out.set(u, cache.get(u) ?? null);
  return out;
}
