// post.js — fire a "telepathic transmission" as a real Bluesky post.
//
// This is the whole bit: homoskeeter claims to be a post-quantum, post-agi,
// telepathic messaging layer over atproto, but under the hood a "transmission"
// is just app.bsky.feed.post — the same write any Bluesky client makes. The
// only actual engineering here is a link facet back to the site so the post's
// signature line is clickable, computed in UTF-8 byte offsets (JS string
// indices are the wrong unit whenever the text has multi-byte characters —
// same lesson as trigrams/public/lib/post.js).
//
// Writes go to the user's own PDS via the OAuth session's dpopFetch. Nothing
// is stored on homoskeeter's end — the transmission lives on the sender's own
// repo, same as any other post they make.

import { dpopFetch } from "./oauth.js";

const SIGNATURE_HOST = "homoskeeter.bisks.net";
const SIGNATURE = `\n\n\u{1F4E1} sent telepathically via ${SIGNATURE_HOST}`;

function pdsXrpc(session, method) {
  return `${session.pdsUrl.replace(/\/$/, "")}/xrpc/${method}`;
}

// Build the post text as "<thought>\n\n📡 sent telepathically via
// homoskeeter.bisks.net", with a link facet over the hostname substring.
export function buildTransmission(thought) {
  const text = `${thought.trim()}${SIGNATURE}`;
  const enc = new TextEncoder();
  const byteStart = enc.encode(text.slice(0, text.lastIndexOf(SIGNATURE_HOST))).length;
  const byteEnd = byteStart + enc.encode(SIGNATURE_HOST).length;
  const facets = [
    {
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: `https://${SIGNATURE_HOST}/` }],
    },
  ];
  return { text, facets };
}

// Fire: create the transmission post. Returns the created record { uri, cid }.
export async function fireTransmission(session, thought) {
  const { text, facets } = buildTransmission(thought);
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
