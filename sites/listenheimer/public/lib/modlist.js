// modlist.js — write a real app.bsky.graph.list (purpose #modlist) full of
// likers straight to the signed-in user's own PDS. Copy, don't abstract: the
// applyWrites chunking pattern is trimmed from sites/mootfluence/public/lib/
// starterpack.js's createStarterPack, swapping the #referencelist +
// starterpack combo for a plain moderation list — once it exists, the user
// can subscribe to it from their own Bluesky moderation settings to mute or
// block everyone on it in one action.
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
 * @returns {Promise<{ listUri: string, url: string }>}
 */
export async function createModList(session, dpopFetch, { name, description, memberDids }, onStep) {
  const members = memberDids.filter((d) => d !== session.did);
  if (!members.length) throw new Error("no likers to add — nothing to list");

  const createdAt = new Date().toISOString();

  if (onStep) onStep("creating the list…");
  const list = await createRecord(session, dpopFetch, "app.bsky.graph.list", {
    $type: "app.bsky.graph.list",
    purpose: "app.bsky.graph.defs#modlist",
    name,
    description,
    createdAt,
  });

  if (onStep) onStep(`adding ${members.length} account${members.length === 1 ? "" : "s"}…`);
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

  const rkey = list.uri.split("/").pop();
  const url = `https://bsky.app/profile/${session.handle || session.did}/lists/${rkey}`;

  return { listUri: list.uri, url, count: members.length };
}
