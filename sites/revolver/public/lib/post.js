// post.js — fire the loser's dare as a real Bluesky post, automatically, the
// instant a round resolves. Adapted from drivethru/public/lib/post.js's
// firePost, which does the same createRecord dance for a different write.
//
// Writes go to the loser's own PDS via their OAuth session's dpopFetch —
// nothing is proxied through this server, and nothing is stored here. The
// post lives on the loser's own repo, same as any post they'd make by hand;
// the difference (and the whole point of this file) is that no click is
// required at the moment it happens. The consent for that already happened
// earlier, at the explanation gate before login — see index.html.

import { dpopFetch } from "./oauth.js";

function pdsXrpc(session, method) {
  return `${session.pdsUrl.replace(/\/$/, "")}/xrpc/${method}`;
}

// Same 300-grapheme-budget shape as the old compose-intent text, but now also
// returns real facets: a mention over "@winnerHandle" and a link over the
// round URL (byte offsets, not JS string indices — a plain-text @mention or
// URL in an API-created record isn't clickable unless a facet says so; the
// Bluesky composer used to do that detection for us, an API call doesn't).
export function buildDarePost(winnerHandle, winnerDid, dareText, roundUrl) {
  const mention = `@${winnerHandle}`;
  const prefix = `lost a round of revolver to ${mention} — as promised:\n\n"`;
  const suffix = `"\n\n${roundUrl}`;
  const budget = 300 - prefix.length - suffix.length;
  const body = dareText.length > budget ? dareText.slice(0, Math.max(0, budget - 1)) + "…" : dareText;
  const text = prefix + body + suffix;

  const enc = new TextEncoder();
  const facets = [];
  const mentionIndex = prefix.indexOf(mention);
  if (winnerDid && mentionIndex !== -1) {
    const byteStart = enc.encode(prefix.slice(0, mentionIndex)).length;
    const byteEnd = byteStart + enc.encode(mention).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#mention", did: winnerDid }],
    });
  }
  const urlIndexInSuffix = suffix.lastIndexOf(roundUrl);
  if (urlIndexInSuffix !== -1) {
    const byteStart = enc.encode(prefix + body + suffix.slice(0, urlIndexInSuffix)).length;
    const byteEnd = byteStart + enc.encode(roundUrl).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: roundUrl }],
    });
  }
  return { text, facets };
}

// Fire: create the dare post on the loser's own repo. Returns the created
// record { uri, cid }.
export async function fireDarePost(session, text, facets) {
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

// AT URI (at://did/app.bsky.feed.post/<rkey>) -> a bsky.app link, using the
// poster's own handle (nicer than the DID in the URL, same as the app does).
export function bskyPostUrl(handle, atUri) {
  const rkey = String(atUri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}
