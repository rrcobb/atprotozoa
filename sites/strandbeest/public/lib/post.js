// post.js — pure helpers that turn feed items into sign content.

// Reduce a feed item to what a sign shows. Posts with nothing to read are dropped.
export function simplify(item) {
  const p = item?.post;
  if (!p?.uri) return null;
  const text = (p.record?.text || "").trim();
  const emb = p.embed || {};
  const media = emb.media || emb; // recordWithMedia nests the media
  const image = media.images?.[0]?.thumb || media.thumbnail || media.external?.thumb || null;
  const rec = emb.record?.record || emb.record; // quoted post, if any
  const quote = rec?.value?.text
    ? { handle: rec.author?.handle || "", text: String(rec.value.text).trim() }
    : null;
  const link = media.external?.title || null;
  if (!text && !image && !quote && !link) return null;
  const by = item.reason?.$type === "app.bsky.feed.defs#reasonRepost" ? item.reason.by?.handle || "" : "";
  return {
    uri: p.uri,
    handle: p.author?.handle || p.author?.did || "",
    name: p.author?.displayName || "",
    text, image, quote, link, repostedBy: by,
    likes: p.likeCount || 0, replies: p.replyCount || 0,
  };
}

export const postUrl = (post) => `https://bsky.app/profile/${post.handle}/post/${post.uri.split("/").pop()}`;
