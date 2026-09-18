// bsky.js — parse a pasted post link and pull its full liker list from the
// public AppView. Parsing copied+trimmed from skeetracker/lib/bsky.js's
// parsePostUrl (copy, don't abstract).

const API = "https://public.api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

export function parsePostUrl(input) {
  const s = (input || "").trim();
  let m = s.match(/bsky\.app\/profile\/([^/?#]+)\/post\/([a-zA-Z0-9]+)/);
  if (m) return { actor: decodeURIComponent(m[1]), rkey: m[2] };
  m = s.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([a-zA-Z0-9]+)/);
  if (m) return { actor: m[1], rkey: m[2] };
  throw new Error("that doesn't look like a bsky.app post link");
}

export async function resolveDid(actor) {
  if (actor.startsWith("did:")) return actor;
  const d = await jget(`${API}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
  if (!d.did) throw new Error(`couldn't resolve @${actor}`);
  return d.did;
}

// Resolve a pasted link straight to its AT-URI, plus the post itself
// (author, text) so the UI can show what was actually looked up.
export async function resolvePost(input) {
  const { actor, rkey } = parsePostUrl(input);
  const did = await resolveDid(actor);
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
  let post = null;
  try {
    const data = await jget(`${API}/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`);
    post = (data.posts || [])[0] || null;
  } catch (_) {
    // getPosts failing (deleted post, blocked) isn't fatal — getLikes below
    // still works off the bare URI, this just loses the preview text.
  }
  return { uri, post, actorLabel: actor };
}

// Every liker of a post, exhausted to the end of the cursor — "who liked
// this post" has no bulk repo-download equivalent (it's an AppView reverse
// index, not a listable collection on the liker's own repo), so pagination
// here is the only way to get the answer, not a shortcut around one. No page
// cap: a "did they like it" comparison is wrong if it silently stops partway
// through a popular post's like count. The onPage callback exists so the UI
// can show live progress on posts with thousands of likes.
//
// MAX_PAGES below is a runaway-loop backstop, not a real limit — 4000 pages
// is 400,000 likes, further than any real post's like count reaches; it only
// exists so a misbehaving AppView response (a cursor that never terminates)
// can't hang the tab forever.
const MAX_PAGES = 4000;

export async function getAllLikers(uri, onPage) {
  const likers = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ uri, limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const data = await jget(`${API}/app.bsky.feed.getLikes?${qs}`);
    for (const l of data.likes || []) {
      if (l && l.actor && l.actor.did) {
        likers.push({
          did: l.actor.did,
          handle: l.actor.handle,
          displayName: l.actor.displayName || "",
          avatar: l.actor.avatar || "",
          createdAt: l.createdAt || l.indexedAt || "",
        });
      }
    }
    if (onPage) onPage(likers.length);
    cursor = data.cursor;
    if (!cursor || !(data.likes || []).length) break;
  }
  return likers;
}

// Just the DIDs of everyone who liked a post, from microcosm.blue's
// Constellation (blue.microcosm.links.getBacklinkDids, source
// app.bsky.feed.like:subject.uri) — it indexes every like record off the
// firehose by the post it points at, 1000 DIDs per page against getLikes'
// 100. Used for post A, where the only question is "is this DID in the set."
// Post B stays on getAllLikers above because the snub list needs each like's
// createdAt and profile, which Constellation doesn't carry. Falls back to
// getAllLikers if Constellation errors. Same recipe as kevinmoot's followers
// read (notes/40, "Ecosystem tools").
const CONSTELLATION = "https://constellation.microcosm.blue";
const MAX_CONSTELLATION_PAGES = 400; // runaway backstop: 400,000 likers

export async function getLikerDids(uri, onPage) {
  const dids = new Set();
  let cursor;
  try {
    for (let page = 0; page < MAX_CONSTELLATION_PAGES; page++) {
      const qs = new URLSearchParams({ subject: uri, source: "app.bsky.feed.like:subject.uri", limit: "1000" });
      if (cursor) qs.set("cursor", cursor);
      const data = await jget(`${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinkDids?${qs}`);
      const batch = data.linking_dids || [];
      for (const did of batch) dids.add(did);
      if (onPage) onPage(dids.size);
      cursor = data.cursor;
      if (!cursor || !batch.length) break;
    }
    return dids;
  } catch (e) {
    console.warn("constellation failed, falling back to getLikes", e);
    const likers = await getAllLikers(uri, onPage);
    return new Set(likers.map((l) => l.did));
  }
}

export function bskyPostUrl(handle, uri) {
  const rkey = String(uri || "").split("/").pop();
  return `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${rkey}`;
}
