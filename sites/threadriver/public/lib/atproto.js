// atproto.js — resolve a pasted Bluesky post (bsky.app link or at:// URI) to
// a canonical at:// post URI, download its full thread from the public
// AppView, then flatten the reply tree into sankey nodes/links.
//
// getPostThread supports depth up to 1000 and parentHeight up to 1000 in one
// request — that's the API's own ceiling, not a self-imposed cap, so this
// always asks for the max rather than paginating or picking something
// smaller "to be safe" (see notes/40-new-site-playbook.md's standing orders
// on bulk reads and on not capping out of habitual caution).

export const APPVIEW = "https://public.api.bsky.app/xrpc";

const T_POST = "app.bsky.feed.defs#threadViewPost";
const T_NOTFOUND = "app.bsky.feed.defs#notFoundPost";
const T_BLOCKED = "app.bsky.feed.defs#blockedPost";

export async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Forgiving parse of a pasted post reference: an at:// URI, a bsky.app
// permalink, or just "handle-or-did / rkey" pasted loosely.
export function parsePostRef(input) {
  const s = (input || "").trim();
  if (!s) throw new Error("paste a Bluesky post link or an at:// URI first");

  let m = /^at:\/\/([^/\s]+)\/app\.bsky\.feed\.post\/([a-zA-Z0-9._~-]+)/.exec(s);
  if (m) return { actor: m[1], rkey: m[2] };

  m = /bsky\.app\/profile\/([^/\s?#]+)\/post\/([a-zA-Z0-9._~-]+)/i.exec(s);
  if (m) return { actor: decodeURIComponent(m[1]), rkey: m[2] };

  throw new Error("couldn't find a post in that — paste a bsky.app post link or an at:// URI");
}

export async function resolveActorDid(actor) {
  if (actor.startsWith("did:")) return actor;
  const handle = actor.replace(/^@/, "");
  const d = await jget(`${APPVIEW}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  if (!d.did) throw new Error(`couldn't resolve "${handle}"`);
  return d.did;
}

export function rkeyOf(uri) {
  return (uri || "").split("/").pop() || "";
}

export function didOf(uri) {
  const m = /^at:\/\/([^/]+)\//.exec(uri || "");
  return m ? m[1] : null;
}

export async function resolvePostUri(input) {
  const { actor, rkey } = parsePostRef(input);
  const did = await resolveActorDid(actor);
  return `at://${did}/app.bsky.feed.post/${rkey}`;
}

export async function fetchThread(uri) {
  const u = new URL(APPVIEW + "/app.bsky.feed.getPostThread");
  u.searchParams.set("uri", uri);
  u.searchParams.set("depth", "1000");
  u.searchParams.set("parentHeight", "1000");
  const d = await jget(u.toString());
  return d.thread;
}

export function bskyUrlFor(post) {
  return `https://bsky.app/profile/${post.author.did}/post/${rkeyOf(post.uri)}`;
}

let stubSeq = 0;
function stubId(parentId, kind) {
  stubSeq++;
  return `${parentId || "root"}#${kind}${stubSeq}`;
}

// Flattens one threadViewPost (its own downward reply tree only — never an
// ancestor's siblings, see buildGraph) into nodes/links, returning the
// {posts, engagement} weight of the subtree rooted here so the caller can
// wire up the incoming link's value.
function flatten(threadNode, depth, parentId, nodes, links) {
  if (!threadNode) return { posts: 0, engagement: 0 };

  if (threadNode.$type === T_NOTFOUND) {
    const id = stubId(parentId, "deleted");
    nodes.push({ id, depth, stub: "deleted" });
    if (parentId) links.push({ source: parentId, target: id, posts: 1, engagement: 1 });
    return { posts: 1, engagement: 1 };
  }
  if (threadNode.$type === T_BLOCKED) {
    const id = stubId(parentId, "blocked");
    nodes.push({ id, depth, stub: "blocked" });
    if (parentId) links.push({ source: parentId, target: id, posts: 1, engagement: 1 });
    return { posts: 1, engagement: 1 };
  }
  if (threadNode.$type !== T_POST || !threadNode.post) {
    return { posts: 0, engagement: 0 };
  }

  const post = threadNode.post;
  const id = post.uri;
  const ownEngagement = (post.likeCount || 0) + (post.repostCount || 0) + (post.replyCount || 0) + (post.quoteCount || 0);

  nodes.push({
    id,
    depth,
    author: post.author,
    text: (post.record && post.record.text) || "",
    likeCount: post.likeCount || 0,
    repostCount: post.repostCount || 0,
    replyCount: post.replyCount || 0,
    quoteCount: post.quoteCount || 0,
    indexedAt: post.indexedAt,
    url: bskyUrlFor(post),
  });

  const replies = Array.isArray(threadNode.replies) ? threadNode.replies : [];
  let childPosts = 0;
  let childEngagement = 0;
  for (const r of replies) {
    const res = flatten(r, depth + 1, id, nodes, links);
    childPosts += res.posts;
    childEngagement += res.engagement;
  }

  const posts = 1 + childPosts;
  const engagement = Math.max(1, ownEngagement + childEngagement);
  if (parentId) links.push({ source: parentId, target: id, posts, engagement });
  return { posts, engagement };
}

// Builds the full sankey graph for a thread, climbing to the true root first
// (so pasting a mid-thread reply still shows the whole conversation, not
// just what's downstream of it) and ignoring ancestors' sibling replies —
// this is only ever walking the single lineage back up, then the requested
// post's own subtree back down.
export function buildGraph(threadRoot) {
  if (!threadRoot || threadRoot.$type !== T_POST || !threadRoot.post) {
    throw new Error("that post looks deleted, blocked, or otherwise unavailable");
  }

  const ancestors = [];
  let cur = threadRoot;
  while (cur.parent && cur.parent.$type === T_POST) {
    ancestors.unshift(cur.parent);
    cur = cur.parent;
  }

  const nodes = [];
  const links = [];

  let parentId = null;
  ancestors.forEach((a, i) => {
    const post = a.post;
    nodes.push({
      id: post.uri,
      depth: i,
      author: post.author,
      text: (post.record && post.record.text) || "",
      likeCount: post.likeCount || 0,
      repostCount: post.repostCount || 0,
      replyCount: post.replyCount || 0,
      quoteCount: post.quoteCount || 0,
      indexedAt: post.indexedAt,
      url: bskyUrlFor(post),
      isAncestor: true,
    });
    if (parentId) links.push({ source: parentId, target: post.uri, posts: null, engagement: null });
    parentId = post.uri;
  });

  const rootDepth = ancestors.length;
  const totals = flatten(threadRoot, rootDepth, parentId, nodes, links);

  // The ancestor chain is a single unbranching lineage, so every link in it
  // carries the same total weight — everything below flows through all of it.
  for (const l of links) {
    if (l.posts === null) {
      l.posts = totals.posts;
      l.engagement = totals.engagement;
    }
  }

  const rootId = ancestors.length ? ancestors[0].post.uri : threadRoot.post.uri;
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
  return { nodes, links, rootId, maxDepth, totalPosts: totals.posts, totalEngagement: totals.engagement, ancestorCount: ancestors.length };
}
