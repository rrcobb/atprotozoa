// post.js — turn a vibe-store order into a real app.bsky.feed.post tagging
// @buildthis.bisks.net, so it lands as a genuine build request the bot's own
// mention-watcher picks up (see sites/buildthis/src/index.ts: it only acts on
// notification reason "mention", which requires a real mention *facet*, not
// just the substring "@buildthis.bisks.net" in the text).
//
// Trimmed from sites/slop-shop/public/lib/post.js (drop the image-upload half —
// an order is text-only). Writes go to the shopper's own PDS via the OAuth
// session's dpopFetch, so the request is authentically from them, not the shop.

import { dpopFetch } from "./oauth.js";

// Public identifiers, not secrets — the same values buildthis's own
// wrangler.toml declares in [vars] (BOT_DID) and every reply already carries
// the handle in plain text.
export const BOT_HANDLE = "buildthis.bisks.net";
const BOT_DID = "did:plc:wlj4p2kazhifag6w4nanjnee";

const MAX_GRAPHEMES = 300;

// Compose the order into post text, tagging the bot. Truncates the order
// itself (not the tag) so the mention always survives the 300-grapheme cap.
export function buildOrderText(order) {
  const suffix = ` @${BOT_HANDLE}`;
  const prefix = "🛒 order from the vibe store: ";
  const budget = MAX_GRAPHEMES - [...prefix].length - [...suffix].length;
  const trimmed = truncateGraphemes(order.trim(), budget);
  return `${prefix}${trimmed}${suffix}`;
}

function truncateGraphemes(s, max) {
  const chars = [...s];
  if (chars.length <= max) return s;
  return chars.slice(0, Math.max(0, max - 1)).join("").trimEnd() + "…";
}

// A single mention facet pointing at BOT_DID, at whatever byte offset
// "@buildthis.bisks.net" landed at after composition. Byte offsets (atproto
// facets are UTF-8 byte ranges, not JS string indices) matter here since the
// order text ahead of the tag can contain multi-byte characters.
function botMentionFacet(text) {
  const tag = `@${BOT_HANDLE}`;
  const idx = text.lastIndexOf(tag);
  if (idx === -1) return [];
  const enc = new TextEncoder();
  const byteStart = enc.encode(text.slice(0, idx)).length;
  const byteEnd = byteStart + enc.encode(tag).length;
  return [
    {
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#mention", did: BOT_DID }],
    },
  ];
}

function pdsXrpc(session, method) {
  return `${session.pdsUrl.replace(/\/$/, "")}/xrpc/${method}`;
}

// Fire the order as a real post from the signed-in shopper's own account.
// Returns the created record { uri, cid }.
export async function fireOrder(session, order) {
  const text = buildOrderText(order);
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    facets: botMentionFacet(text),
  };
  const res = await dpopFetch(session, pdsXrpc(session, "com.atproto.repo.createRecord"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record,
    }),
  });
  if (!res.ok) {
    throw new Error(`createRecord failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

// Not-signed-in fallback: bsky.app's own composer auto-facets @handle
// mentions in the prefilled text when the post is actually sent, so a plain
// intent-compose link still produces a real, bot-visible mention.
export function orderIntentUrl(order) {
  const text = buildOrderText(order);
  return `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
}
