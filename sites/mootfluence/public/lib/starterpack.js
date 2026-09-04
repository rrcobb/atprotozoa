// starterpack.js — turn a ranked moot list into a real Bluesky starter pack,
// written straight to the signed-in user's own PDS. This is the one
// authenticated write mootfluence does (see oauth.js for the scoped-down
// login). Copy, don't abstract: the applyWrites chunking pattern is trimmed
// from sites/velvetrope/public/lib/atproto.js's applyListWrites.
//
// A starter pack is three record types working together:
//   1. app.bsky.graph.list (purpose #referencelist) — the container.
//   2. app.bsky.graph.listitem, one per member — created via
//      com.atproto.repo.applyWrites so a many-member pack is one request
//      per ~190 members instead of one per member.
//   3. app.bsky.graph.starterpack — references the list by AT-URI.
// The list has to exist first (its own createRecord call, not folded into
// the applyWrites batch) because we need its server-assigned rkey/URI before
// any listitem or the starterpack record can point back to it.
//
// Bluesky's own starter-pack UI caps membership at 150 — a real product
// constraint, not a default-caution number we invented — so the caller's
// dids are truncated to that if there are more.
const MAX_MEMBERS = 150;
const APPLY_WRITES_CHUNK = 190; // atproto caps applyWrites at 200 writes/request

async function createRecord(session, dpopFetch, collection, record) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: session.did, collection, record }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `createRecord ${collection} failed (${res.status})`);
  return body; // { uri, cid, ... }
}

async function applyWrites(session, dpopFetch, writes) {
  const base = session.pdsUrl.replace(/\/$/, "");
  for (let i = 0; i < writes.length; i += APPLY_WRITES_CHUNK) {
    const chunk = writes.slice(i, i + APPLY_WRITES_CHUNK);
    const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.applyWrites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, writes: chunk }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `applyWrites failed (${res.status})`);
  }
}

/**
 * @param {object} session - an oauth.js session (already signed in)
 * @param {function} dpopFetch - oauth.js's dpopFetch, bound to that session
 * @param {{name: string, description?: string, memberDids: string[]}} opts
 * @param {(step: string) => void} [onStep]
 * @returns {Promise<{ listUri: string, starterPackUri: string, url: string }>}
 */
export async function createStarterPack(session, dpopFetch, { name, description, memberDids }, onStep) {
  const members = memberDids.filter((d) => d !== session.did).slice(0, MAX_MEMBERS);
  if (!members.length) throw new Error("no moots to add — nothing to pack");

  const createdAt = new Date().toISOString();

  if (onStep) onStep("creating the list…");
  const list = await createRecord(session, dpopFetch, "app.bsky.graph.list", {
    $type: "app.bsky.graph.list",
    purpose: "app.bsky.graph.defs#referencelist",
    name,
    description,
    createdAt,
  });

  if (onStep) onStep(`adding ${members.length} moot${members.length === 1 ? "" : "s"}…`);
  const writes = members.map((did) => ({
    $type: "com.atproto.repo.applyWrites#create",
    collection: "app.bsky.graph.listitem",
    value: {
      $type: "app.bsky.graph.listitem",
      subject: did,
      list: list.uri,
      createdAt,
    },
  }));
  await applyWrites(session, dpopFetch, writes);

  if (onStep) onStep("creating the starter pack…");
  const pack = await createRecord(session, dpopFetch, "app.bsky.graph.starterpack", {
    $type: "app.bsky.graph.starterpack",
    name,
    description,
    list: list.uri,
    createdAt,
  });

  const rkey = pack.uri.split("/").pop();
  const url = `https://bsky.app/starter-pack/${session.handle || session.did}/${rkey}`;

  return { listUri: list.uri, starterPackUri: pack.uri, url };
}
