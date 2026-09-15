// backlinks.js — reconstructs a reply tree past app.bsky.feed.getPostThread's
// depth=1000 ceiling (see atproto.js's getThread) using blue.cerulea.backlinks,
// a full-network backlink index. Surveyed in notes/ideas/cerulea-backlinks.md:
// coliseum was the clearest concrete fit found there, since a chain of
// single-reply flame-war exchanges is exactly the shape that can nest past 1000
// levels deep while the AppView's own thread view quietly stops showing more.
//
// Cerulea only indexes the *reference* ($.reply.parent -> parent URI), not post
// content, so this walks the reply tree node-by-node (unbounded depth — the
// whole point) and then bulk-hydrates every discovered URI with
// app.bsky.feed.getPosts (25 per call, a real batch endpoint, not a paginated
// walk) to get back the text/author/counts a coliseum needs.

const CERULEA = "https://backlinks.cerulea.blue/xrpc/blue.cerulea.backlinks.listBacklinks";
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

// Every URI backlinking to `target` via $.reply.parent — i.e. every direct
// reply. Pages until Cerulea's cursor runs out; no depth limit here (that's
// the ceiling this whole module exists to get around), only the per-node
// pagination Cerulea itself requires.
async function directReplyUris(target) {
  const out = [];
  let cursor;
  do {
    const url = new URL(CERULEA);
    url.searchParams.set("target", target);
    if (cursor) url.searchParams.set("cursor", cursor);
    const page = await jget(url.toString());
    for (const group of page.backlinks || []) {
      if (group.location === "$.reply.parent") out.push(...group.uris);
    }
    cursor = page.cursor || undefined;
  } while (cursor);
  return out;
}

// Breadth-first walk of the whole descendant tree, one level at a time (each
// level fetched concurrently). Returns a parent map and a discovery-ordered
// list — no cap on how many levels deep this goes.
async function walkDescendants(rootUri) {
  const parentOf = new Map();
  const order = [];
  const seen = new Set([rootUri]);
  let frontier = [rootUri];
  while (frontier.length) {
    const results = await Promise.all(frontier.map((uri) => directReplyUris(uri).catch(() => [])));
    const next = [];
    frontier.forEach((parent, i) => {
      for (const child of results[i]) {
        if (seen.has(child)) continue;
        seen.add(child);
        parentOf.set(child, parent);
        order.push(child);
        next.push(child);
      }
    });
    frontier = next;
  }
  return { parentOf, order };
}

async function hydrate(uris) {
  const views = new Map();
  for (let i = 0; i < uris.length; i += 25) {
    const batch = uris.slice(i, i + 25);
    const qs = batch.map((u) => `uris=${encodeURIComponent(u)}`).join("&");
    const r = await jget(`${PUB}/app.bsky.feed.getPosts?${qs}`);
    for (const p of r.posts || []) views.set(p.uri, p);
  }
  return views;
}

function toNode(p, depth, topAncestorUri) {
  return {
    uri: p.uri,
    cid: p.cid,
    depth,
    topAncestorUri,
    author: {
      did: p.author.did,
      handle: p.author.handle,
      displayName: p.author.displayName || p.author.handle,
      avatar: p.author.avatar || "",
    },
    text: p.record?.text || "",
    likeCount: p.likeCount || 0,
    repostCount: p.repostCount || 0,
    replyCount: p.replyCount || 0,
    indexedAt: p.indexedAt,
    score: (p.likeCount || 0) + (p.repostCount || 0) + (p.replyCount || 0) * 2,
  };
}

// Same { root, topLevel, all } shape flattenThread() produces from
// getPostThread, but built by walking Cerulea's backlink index instead — no
// depth ceiling, at the cost of one paginated cursor walk per node plus
// batched hydration instead of a single AppView call. Nodes Cerulea saw but
// that have since been deleted/blocked (getPosts drops them silently) are
// skipped rather than crashing the walk.
export async function getThreadViaBacklinks(rootUri) {
  const { parentOf, order } = await walkDescendants(rootUri);
  const views = await hydrate([rootUri, ...order]);

  const depthOf = new Map([[rootUri, 0]]);
  const topAncestorOf = new Map();
  const all = [];
  for (const uri of order) {
    const parent = parentOf.get(uri);
    const depth = (depthOf.get(parent) ?? 0) + 1;
    depthOf.set(uri, depth);
    const topAncestor = depth === 1 ? uri : topAncestorOf.get(parent);
    topAncestorOf.set(uri, topAncestor);
    const view = views.get(uri);
    if (!view) continue;
    all.push(toNode(view, depth, topAncestor));
  }

  const rootView = views.get(rootUri);
  if (!rootView) throw new Error("root post vanished before it could be rehydrated");
  const root = toNode(rootView, 0, rootUri);
  const topLevel = all.filter((n) => n.depth === 1);
  return { root, topLevel, all };
}
