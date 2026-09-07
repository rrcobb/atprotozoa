// atproto.js — read-side helpers for coliseum. Copy, don't abstract: the
// actor-parsing half is trimmed from alice-meets-bob's/creaturearena's
// atproto.js; the thread-flattening half is new to this site.

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

export function normalizeActor(actor) {
  return (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

export async function resolveDid(actor) {
  const a = normalizeActor(actor);
  if (a.startsWith("did:")) return a;
  const r = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  return r.did;
}

// Turns a bsky.app post link, an at:// URI, or a bare handle/DID into a real
// post AT-URI. A handle/DID with no post attached means "find the liveliest
// thing they've posted lately" — their own recent post with the most replies,
// so a fight is only ever one paste away.
export async function resolveInput(raw) {
  const s = (raw || "").trim();
  if (!s) throw new Error("nothing pasted");

  if (s.startsWith("at://")) {
    return { uri: s, chosen: false };
  }

  const urlMatch = s.match(/bsky\.app\/profile\/([^/\s]+)\/post\/([^/\s?#]+)/i);
  if (urlMatch) {
    const did = await resolveDid(urlMatch[1]);
    return { uri: `at://${did}/app.bsky.feed.post/${urlMatch[2]}`, chosen: false };
  }

  // Bare handle/DID: go find their liveliest post ourselves.
  const did = await resolveDid(s);
  // No arbitrary page cap here on purpose (see notes/40 "question every
  // cap") — one bounded feed page is the actual right size for "their
  // recent posts," not a caution-driven default: getAuthorFeed has no
  // reply-count index to sort server-side, so this is a single request
  // over their newest 100 posts, not a walk that needs more pages to be
  // more correct.
  const feed = await jget(
    `${PUB}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=100&filter=posts_no_replies`
  );
  const posts = (feed.feed || []).map((f) => f.post).filter(Boolean);
  if (!posts.length) throw new Error("they haven't posted anything to fight over");
  posts.sort((a, b) => (b.replyCount || 0) - (a.replyCount || 0));
  const best = posts[0];
  if (!best.replyCount) throw new Error("nobody's replied to any of their posts yet");
  return { uri: best.uri, chosen: true, replyCount: best.replyCount };
}

// depth=1000 is the API's actual max (not a guessed cap) — a coliseum that
// only showed the first page of the fight wouldn't be showing "everyone."
// parentHeight=0: we only care about the post and what happened under it,
// never its ancestors.
export async function getThread(uri) {
  const r = await jget(
    `${PUB}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=1000&parentHeight=0`
  );
  if (r.thread?.$type !== "app.bsky.feed.defs#threadViewPost") {
    throw new Error("that post is gone, blocked, or not found");
  }
  return r.thread;
}

function toNode(view, depth, topAncestorUri) {
  const p = view.post;
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

// Walks the reply tree into a flat list, tagging every node with the
// top-level reply it descends from (topAncestorUri) — that's how the arena
// later sorts everyone into a stand.
function walk(view, depth, topAncestorUri, out) {
  const node = toNode(view, depth, topAncestorUri || view.post.uri);
  out.push(node);
  const kids = (view.replies || []).filter((r) => r?.$type === "app.bsky.feed.defs#threadViewPost");
  for (const kid of kids) {
    walk(kid, depth + 1, topAncestorUri || view.post.uri, out);
  }
  return out;
}

// Returns { root, topLevel, all } — `root` is the post that started it,
// `topLevel` is every direct reply to it (gladiator material), `all` is
// every reply anywhere in the thread (root excluded), each tagged with the
// top-level ancestor it belongs to.
export function flattenThread(threadViewPost) {
  const root = toNode(threadViewPost, 0, threadViewPost.post.uri);
  const topLevelViews = (threadViewPost.replies || []).filter(
    (r) => r?.$type === "app.bsky.feed.defs#threadViewPost"
  );
  const all = [];
  for (const view of topLevelViews) {
    walk(view, 1, view.post.uri, all);
  }
  const topLevel = all.filter((n) => n.depth === 1);
  return { root, topLevel, all };
}

// Picks the two biggest combatants (by score) out of the top-level replies.
// Either or both can come back null — an empty arena, or one gladiator
// warming up alone, are both real states the UI has to render.
export function pickGladiators(topLevel) {
  const sorted = [...topLevel].sort((a, b) => b.score - a.score);
  return { a: sorted[0] || null, b: sorted[1] || null };
}

// Sorts every non-gladiator reply into 'a', 'b', or 'neutral' by which
// top-level reply it descends from.
export function assignTeam(node, gladiators) {
  if (gladiators.a && node.topAncestorUri === gladiators.a.uri) return "a";
  if (gladiators.b && node.topAncestorUri === gladiators.b.uri) return "b";
  return "neutral";
}
