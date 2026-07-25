// post-reply.mjs — an admin tool to post (or delete) a reply AS the bot,
// outside the normal build flow. For corrections and manual bot posts: e.g.
// "that build actually shipped now" or "remove a mistargeted reply". The normal
// build reply is reply.mjs; this is the by-hand escape hatch, run on the box
// (which has BOT_APP_PASSWORD in /etc/buildthis/env) so no secret leaves it.
//
// Usage (post a reply):
//   source /etc/buildthis/env
//   PARENT_URI=at://… PARENT_CID=bafy… ROOT_URI=at://… ROOT_CID=bafy… \
//     TEXT="it's actually live now: https://favstar.bisks.net" \
//     node sites/buildthis/builder/post-reply.mjs
//   - ROOT_URI/ROOT_CID default to PARENT_URI/PARENT_CID (reply to a top-level post).
//   - Any https URL in TEXT gets a link facet; any @handle.tld gets a mention facet
//     if its DID is resolvable (best-effort resolveHandle).
//
// Usage (delete a bot post):
//   source /etc/buildthis/env
//   DELETE_URI=at://did:plc:…/app.bsky.feed.post/rkey \
//     node sites/buildthis/builder/post-reply.mjs
//   - Only deletes a post in the bot's OWN repo (the DID must match the session).

const PDS = "https://bsky.social";
const APPVIEW = "https://public.api.bsky.app";

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function login() {
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier: reqEnv("BOT_IDENTIFIER"),
      password: reqEnv("BOT_APP_PASSWORD"),
    }),
  });
  if (!res.ok) throw new Error(`createSession ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return { accessJwt: j.accessJwt, did: j.did };
}

// Link facets for every https URL in the text. atproto facets use UTF-8 BYTE
// offsets, not JS string indices.
function linkFacets(text) {
  const enc = new TextEncoder();
  const facets = [];
  const re = /https?:\/\/[^\s]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    // Trim trailing punctuation that isn't part of the URL.
    let url = m[0].replace(/[.,!?)]+$/, "");
    const at = m.index;
    const byteStart = enc.encode(text.slice(0, at)).length;
    const byteEnd = byteStart + enc.encode(url).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
    });
  }
  return facets;
}

// Mention facets for every @handle.tld we can resolve to a DID (best-effort).
async function mentionFacets(text) {
  const enc = new TextEncoder();
  const facets = [];
  const re = /@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const handle = m[1];
    let did = null;
    try {
      const u = new URL(`${APPVIEW}/xrpc/com.atproto.identity.resolveHandle`);
      u.searchParams.set("handle", handle);
      const r = await fetch(u);
      if (r.ok) did = (await r.json()).did;
    } catch {
      // best-effort — an unresolvable handle just renders as plain text
    }
    if (!did) continue;
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    const byteEnd = byteStart + enc.encode(m[0]).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#mention", did }],
    });
  }
  return facets;
}

async function postReply(session) {
  const text = reqEnv("TEXT");
  const parentUri = reqEnv("PARENT_URI");
  const parentCid = reqEnv("PARENT_CID");
  const rootUri = process.env.ROOT_URI || parentUri;
  const rootCid = process.env.ROOT_CID || parentCid;

  const facets = [...linkFacets(text), ...(await mentionFacets(text))];
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    reply: {
      root: { uri: rootUri, cid: rootCid },
      parent: { uri: parentUri, cid: parentCid },
    },
    ...(facets.length ? { facets } : {}),
  };
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record,
    }),
  });
  if (!res.ok) throw new Error(`createRecord ${res.status}: ${await res.text()}`);
  const j = await res.json();
  console.log(`posted: ${j.uri}`);
  console.log(`  text: ${JSON.stringify(text)}`);
}

async function deletePost(session, uri) {
  // at://<did>/app.bsky.feed.post/<rkey>
  const m = uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
  if (!m) throw new Error(`DELETE_URI is not a post uri: ${uri}`);
  const [, did, rkey] = m;
  if (did !== session.did) {
    throw new Error(`refusing to delete: ${did} is not the bot's own repo (${session.did})`);
  }
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.deleteRecord`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      rkey,
    }),
  });
  if (!res.ok) throw new Error(`deleteRecord ${res.status}: ${await res.text()}`);
  console.log(`deleted: ${uri}`);
}

async function main() {
  const session = await login();
  if (process.env.DELETE_URI) {
    await deletePost(session, process.env.DELETE_URI);
  } else {
    await postReply(session);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
