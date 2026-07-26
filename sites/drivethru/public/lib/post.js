// post.js — fire the "order" as a real Bluesky post tagging @buildthis.bisks.net.
//
// This is the whole trick of drivethru: it's not a special API, it's the exact
// same mechanism as manually typing "@buildthis.bisks.net build me a ___" into
// Bluesky. The bot's watcher (sites/buildthis/src/index.ts, runWatcher) only
// picks up posts that show up as a real "mention" notification, which the
// AppView only generates for a genuine app.bsky.richtext.facet#mention — not
// just the substring "@buildthis.bisks.net" in the text. So this file's only
// real job is building that facet correctly (UTF-8 byte offsets, not JS string
// indices — same lesson as trigrams/public/lib/post.js).
//
// Writes go to the user's own PDS via the OAuth session's dpopFetch. Nothing is
// stored on drivethru's end — the order lives on the orderer's own repo, same
// as any other post they make.

import { dpopFetch } from "./oauth.js";

// The buildthis bot's DID (same constant sites/trigrams/wrangler.toml uses for
// BOT_IDENTIFIER — stable across handle changes, not a secret).
export const BUILDTHIS_DID = "did:plc:wlj4p2kazhifag6w4nanjnee";
export const BUILDTHIS_HANDLE = "@buildthis.bisks.net";

function pdsXrpc(session, method) {
  return `${session.pdsUrl.replace(/\/$/, "")}/xrpc/${method}`;
}

// Build the post text as "@buildthis.bisks.net <order>", with a mention facet
// over the handle substring pointing at the bot's DID.
export function buildOrderPost(orderText) {
  const text = `${BUILDTHIS_HANDLE} ${orderText}`.trim();
  const enc = new TextEncoder();
  const byteStart = 0;
  const byteEnd = enc.encode(BUILDTHIS_HANDLE).length;
  const facets = [
    {
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#mention", did: BUILDTHIS_DID }],
    },
  ];
  return { text, facets };
}

// Fire: create the order post. Returns the created record { uri, cid }.
export async function firePost(session, orderText) {
  const { text, facets } = buildOrderPost(orderText);
  const record = {
    $type: "app.bsky.feed.post",
    text,
    facets,
    createdAt: new Date().toISOString(),
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
  return res.json(); // { uri, cid }
}
