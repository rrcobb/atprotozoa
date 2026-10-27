// Pure helpers: parse a thread link, walk a getPostThread response, lay out tiles.

// Accepts bsky.app post URLs, at:// URIs, or "handle/rkey"-ish pastes.
export function parsePostRef(input) {
  const s = String(input || "").trim().replace(/^@/, "");
  let m = s.match(/^at:\/\/([^/\s]+)\/app\.bsky\.feed\.post\/([A-Za-z0-9]+)/);
  if (m) return { actor: m[1], rkey: m[2] };
  m = s.match(/\/profile\/([^/\s?#]+)\/post\/([A-Za-z0-9]+)/);
  if (m) return { actor: m[1].replace(/^@/, ""), rkey: m[2] };
  return null;
}

function imagesOf(embed) {
  if (!embed) return [];
  const t = embed.$type || "";
  if (t.startsWith("app.bsky.embed.images")) {
    return (embed.images || []).map((i) => ({ src: i.thumb, full: i.fullsize, alt: i.alt || "", video: false }));
  }
  if (t.startsWith("app.bsky.embed.video") && embed.thumbnail) {
    return [{ src: embed.thumbnail, full: embed.thumbnail, alt: embed.alt || "", video: true }];
  }
  if (t.startsWith("app.bsky.embed.recordWithMedia")) return [...imagesOf(embed.media), ...quotedImages(embed.record)];
  if (t === "app.bsky.embed.record#view") return quotedImages(embed);
  return [];
}

// Images inside a quoted post (the thread is often a pile of quote-posts of the art itself).
// Each carries the quoted post's uri/handle so the tile links to the real post.
function quotedImages(view) {
  const rec = view && (view.record && view.record.$type === "app.bsky.embed.record#viewRecord" ? view.record : view.$type === "app.bsky.embed.record#viewRecord" ? view : null);
  if (!rec) return [];
  const out = [];
  for (const e of rec.embeds || []) {
    for (const im of imagesOf(e)) out.push({ ...im, quotedUri: rec.uri, quotedHandle: rec.author?.handle || "" });
  }
  return out;
}

// Flatten a thread (parents above, replies below) into tiles in time order.
// Each tile remembers its post so the UI can link back to it.
// Posts that say they have replies but arrived without any: the appview prunes a
// thread past roughly ten levels deep, so each of these needs its own fetch.
export function truncatedUris(root) {
  const out = [];
  const visit = (n) => {
    if (!n || !n.post) return;
    if (n.post.replyCount > 0 && !(n.replies || []).length) out.push(n.post.uri);
    for (const r of n.replies || []) visit(r);
  };
  visit(root);
  return out;
}

// extraRoots: sub-thread fetches (replies only) stitched in below the main root.
export function collectTiles(root, extraRoots = []) {
  const posts = new Map();
  const visit = (n, dir) => {
    if (!n || !n.post) return; // blocked / notFound nodes carry no post
    posts.set(n.post.uri, n.post);
    if (dir !== "down" && n.parent) visit(n.parent, "up");
    if (dir !== "up") for (const r of n.replies || []) visit(r, "down");
  };
  // Root: walk the ancestor chain up and every reply tree down.
  if (root && root.post) {
    posts.set(root.post.uri, root.post);
    let p = root.parent;
    while (p && p.post) { posts.set(p.post.uri, p.post); p = p.parent; }
    for (const r of root.replies || []) visit(r, "down");
  }
  for (const x of extraRoots) visit(x, "down");
  const sorted = [...posts.values()].sort((a, b) =>
    String(a.record?.createdAt || a.indexedAt).localeCompare(String(b.record?.createdAt || b.indexedAt)));
  const tiles = [];
  const seenSrc = new Set(); // the same art quoted twice is one tile
  for (const p of sorted) {
    for (const im of imagesOf(p.embed)) {
      if (seenSrc.has(im.src)) continue;
      seenSrc.add(im.src);
      tiles.push({ ...im, uri: im.quotedUri || p.uri, handle: im.quotedHandle || p.author?.handle || "", did: p.author?.did || "" });
    }
  }
  return { tiles, postCount: posts.size };
}

export function postUrl(uri, handle) {
  const rkey = uri.split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

// Columns for n tiles on a canvas of roughly the given aspect (w/h).
export function gridDims(n, aspect = 1) {
  if (n <= 0) return { cols: 0, rows: 0 };
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * aspect))));
  return { cols, rows: Math.ceil(n / cols) };
}

// Largest tile edge that keeps the canvas under maxEdge px on its long side.
// maxEdge exists because browsers cap canvas dimensions (Safari/iOS far lower than desktop).
export function fitTile(cols, rows, gap, want, maxEdge) {
  const room = Math.floor((maxEdge - gap * (Math.max(cols, rows) + 1)) / Math.max(cols, rows));
  return Math.max(16, Math.min(want, room));
}
