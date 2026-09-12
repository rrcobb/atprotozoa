// block.js — bulk-create real app.bsky.graph.block records on the signed-in
// user's own PDS, one applyWrites call per chunk. The chunking (190 writes —
// atproto caps applyWrites at 200/request) is trimmed straight from
// sites/listenheimer's public/lib/modlist.js createModList, swapping "add a
// listitem per member" for "add a block per member" (copy, don't abstract).
const APPLY_WRITES_CHUNK = 190;

/**
 * @param {object} session - an oauth.js session (already signed in)
 * @param {function} dpopFetch - oauth.js's dpopFetch, bound to that session
 * @param {string[]} dids - DIDs to block (caller should have already dropped session.did)
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ blocked: number, failed: { did: string, error: string }[] }>}
 */
export async function bulkBlock(session, dpopFetch, dids, onProgress) {
  const base = session.pdsUrl.replace(/\/$/, "");
  const createdAt = new Date().toISOString();
  let blocked = 0;
  const failed = [];

  for (let i = 0; i < dids.length; i += APPLY_WRITES_CHUNK) {
    const chunk = dids.slice(i, i + APPLY_WRITES_CHUNK);
    const writes = chunk.map((did) => ({
      $type: "com.atproto.repo.applyWrites#create",
      collection: "app.bsky.graph.block",
      value: {
        $type: "app.bsky.graph.block",
        subject: did,
        createdAt,
      },
    }));

    try {
      const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.applyWrites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: session.did, writes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || `applyWrites failed (${res.status})`);
      blocked += chunk.length;
    } catch (err) {
      // A whole chunk failing (rather than one bad record) is the common
      // case here — applyWrites is all-or-nothing per request — so fall back
      // to one create per DID in this chunk, to salvage the rest of it
      // instead of losing the whole batch to one bad subject.
      for (const did of chunk) {
        try {
          const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.createRecord`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              repo: session.did,
              collection: "app.bsky.graph.block",
              record: { $type: "app.bsky.graph.block", subject: did, createdAt },
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.message || `createRecord failed (${res.status})`);
          blocked++;
        } catch (e2) {
          failed.push({ did, error: e2.message || String(e2) });
        }
      }
    }

    if (onProgress) onProgress(Math.min(i + chunk.length, dids.length), dids.length);
  }

  return { blocked, failed };
}
