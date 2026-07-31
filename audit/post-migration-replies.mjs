// Post one in-thread reply per migrated site, noting the new bisks.net/<name>
// path. Reuses the same createSession + facet + reply-threading logic as
// sites/buildthis/builder/post-reply.mjs, but drives all 5 at once and resolves
// each parent post's CID + root ref from the public API (we only stored URIs).
//
// Needs the bot creds in the environment:
//   BOT_IDENTIFIER=did:plc:wlj4p2kazhifag6w4nanjnee \
//   BOT_APP_PASSWORD=<app password> \
//   node audit/post-migration-replies.mjs
//
// Add DRY_RUN=1 to print what it *would* post (resolves CIDs, builds records)
// without logging in or writing anything.

const PDS = "https://bsky.social";
const APPVIEW = "https://public.api.bsky.app";

// site -> { parentUri, text }. parentUri is the requester's tagging post (from
// each site's .buildthis.json mentionUri); the reply lands right on it.
const REPLIES = [
  {
    site: "wheelhouse",
    parentUri: "at://did:plc:cwa5qtro5bhfz25opigbe6qi/app.bsky.feed.post/3mrkpieehlk2f",
    text: "moved wheelhouse to a new home: https://bisks.net/wheelhouse — the old wheelhouse.bisks.net subdomain never actually came up (hit a Cloudflare limit), so it lives on a path now and works. give it a spin 🎡",
  },
  {
    site: "solvers",
    parentUri: "at://did:plc:7zre4plmd5jllccww575j6sb/app.bsky.feed.post/3mrl6bjsvc22a",
    text: "solvers is live again at a new URL: https://bisks.net/solvers (magnetostatics at https://bisks.net/solvers/magnetostatics). the old solvers.bisks.net subdomain never provisioned — a zone-level cap, not your solver — so it's on a path now. ⚡",
  },
  {
    site: "mcskeets",
    parentUri: "at://did:plc:xb2urvqt5f4zzccjs46hysbf/app.bsky.feed.post/3mrksa234j22v",
    text: "mcskeets moved: https://bisks.net/mcskeets — the mcskeets.bisks.net subdomain never came up (Cloudflare custom-domain cap), so your DID value meal is served on a path now. soft-serve machine still down, obviously 🍦",
  },
  {
    site: "ratioed",
    parentUri: "at://did:plc:hsqwcidfez66lwm3gxhfv5in/app.bsky.feed.post/3mrjqyimcv22p",
    text: "ratioed is back up at a new address: https://bisks.net/ratioed — the ratioed.bisks.net subdomain never resolved (a zone cap on my end), so the leaderboard lives on a path now. 📉",
  },
  {
    site: "the-place",
    parentUri: "at://did:plc:f6n22z62adionrvb5s6n6vfk/app.bsky.feed.post/3mrkmmy35xc22",
    text: "the place moved to https://bisks.net/the-place — the-place.bisks.net never provisioned (Cloudflare custom-domain cap), so the shared canvas is on a path now. one canvas, everyone draws, resets at 00:00 UTC. 🎨",
  },
];

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

// Resolve a post's CID + its thread root (uri+cid) from the public API.
async function resolvePostRefs(uri) {
  const u = new URL(`${APPVIEW}/xrpc/app.bsky.feed.getPostThread`);
  u.searchParams.set("uri", uri);
  u.searchParams.set("depth", "0");
  const r = await fetch(u);
  if (!r.ok) throw new Error(`getPostThread ${r.status} for ${uri}: ${await r.text()}`);
  const j = await r.json();
  const post = j.thread?.post;
  if (!post) throw new Error(`no post in thread for ${uri}`);
  const parentCid = post.cid;
  // root: if the post is itself a reply, use its record's reply.root; else it's the root.
  const replyRoot = post.record?.reply?.root;
  const root = replyRoot ? { uri: replyRoot.uri, cid: replyRoot.cid } : { uri, cid: parentCid };
  return { parentUri: uri, parentCid, rootUri: root.uri, rootCid: root.cid };
}

function linkFacets(text) {
  const enc = new TextEncoder();
  const facets = [];
  const re = /https?:\/\/[^\s]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let url = m[0].replace(/[.,!?)]+$/, "");
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    const byteEnd = byteStart + enc.encode(url).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
    });
  }
  return facets;
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

async function postReply(session, refs, text) {
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    reply: {
      root: { uri: refs.rootUri, cid: refs.rootCid },
      parent: { uri: refs.parentUri, cid: refs.parentCid },
    },
    facets: linkFacets(text),
  };
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.accessJwt}` },
    body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
  });
  if (!res.ok) throw new Error(`createRecord ${res.status}: ${await res.text()}`);
  return (await res.json()).uri;
}

async function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const resolved = [];
  for (const r of REPLIES) {
    const refs = await resolvePostRefs(r.parentUri);
    resolved.push({ ...r, refs });
    console.log(`[${r.site}] parent=${refs.parentCid.slice(0, 12)}… root=${refs.rootUri === refs.parentUri ? "(self)" : refs.rootCid.slice(0, 12) + "…"}`);
    console.log(`   → ${r.text}`);
  }
  if (dryRun) {
    console.log("\nDRY_RUN=1 — resolved all refs, posted nothing.");
    return;
  }
  const session = await login();
  for (const r of resolved) {
    const uri = await postReply(session, r.refs, r.text);
    console.log(`posted [${r.site}]: ${uri}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
