// bsky.js — resolve a bsky.app post link to its thread's text, read straight
// from Bluesky's public AppView (CORS *, no auth). Copied+trimmed from the
// resolveDid/jget pattern in immortals/lib/immortal.js (copy, don't abstract).
// A song thread is the root post plus every reply beneath it; we collect all
// of it (not just a single chain) since other people's replies may be mixed
// in — pack.js's chunk headers are what actually pick out the song parts.

const PUB = "https://public.api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
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

async function resolveDid(actor) {
  if (actor.startsWith("did:")) return actor;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve @${actor}`);
  return d.did;
}

function collectTexts(node, out, seen) {
  if (!node || !node.post) return;
  const uri = node.post.uri;
  if (seen.has(uri)) return;
  seen.add(uri);
  const text = node.post.record && node.post.record.text;
  if (text) out.push(text);
  if (Array.isArray(node.replies)) {
    for (const r of node.replies) collectTexts(r, out, seen);
  }
}

// Returns the text of every post in the thread the given link belongs to
// (root + all descendant replies), in no particular order.
export async function fetchThreadTexts(url) {
  const { actor, rkey } = parsePostUrl(url);
  const did = await resolveDid(actor);
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`;

  // Climb to the thread root first, in case the link points mid-thread.
  let data = await jget(
    `${PUB}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=100`,
  );
  let node = data.thread;
  while (node && node.parent && node.parent.post) node = node.parent;
  const rootUri = node && node.post ? node.post.uri : uri;

  // Then pull the whole reply tree from the root.
  data = await jget(
    `${PUB}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(rootUri)}&depth=100&parentHeight=0`,
  );
  const texts = [];
  collectTexts(data.thread, texts, new Set());
  if (!texts.length) throw new Error("no readable posts in that thread");
  return texts;
}
