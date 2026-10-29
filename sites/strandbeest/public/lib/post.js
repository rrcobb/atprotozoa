// post.js — pure helpers that turn feed items into sign content.

// Thumbnails a post view carries: up to 4 images (the most an app.bsky post can embed), or one
// link/video thumbnail.
function thumbs(view) {
  const emb = view?.embed || {};
  const media = emb.media || emb; // recordWithMedia nests the media
  if (media.images?.length) return media.images.map((i) => i.thumb).filter(Boolean);
  const one = media.thumbnail || media.external?.thumb;
  return one ? [one] : [];
}

// A reply's root/parent, as a short context line. Deleted/blocked ancestors come back without a record.
function ancestor(v) {
  if (!v?.uri || !v.record) return null;
  const images = thumbs(v);
  const text = (v.record.text || "").trim();
  if (!text && !images.length) return null;
  return { handle: v.author?.handle || v.author?.did || "", text, images };
}

// Reduce a feed item to what a sign shows. Posts with nothing to read are dropped.
export function simplify(item) {
  const p = item?.post;
  if (!p?.uri) return null;
  const text = (p.record?.text || "").trim();
  const emb = p.embed || {};
  const media = emb.media || emb; // recordWithMedia nests the media
  const images = thumbs(p);
  const rec = emb.record?.record || emb.record; // quoted post, if any
  const quote = rec?.value?.text
    ? { handle: rec.author?.handle || "", text: String(rec.value.text).trim() }
    : null;
  const link = media.external?.title || null;
  if (!text && !images.length && !quote && !link) return null;
  const by = item.reason?.$type === "app.bsky.feed.defs#reasonRepost" ? item.reason.by?.handle || "" : "";
  // Thread context, oldest first: the root, then the parent when it is a different post.
  const r = item.reply;
  const thread = [];
  const root = ancestor(r?.root), parent = ancestor(r?.parent);
  if (root) thread.push(root);
  if (parent && r.parent.uri !== r.root?.uri) thread.push(parent);
  return {
    thread,
    uri: p.uri,
    handle: p.author?.handle || p.author?.did || "",
    name: p.author?.displayName || "",
    text, images, quote, link, repostedBy: by,
    likes: p.likeCount || 0, replies: p.replyCount || 0,
  };
}

export const postUrl = (post) => `https://bsky.app/profile/${post.handle}/post/${post.uri.split("/").pop()}`;
