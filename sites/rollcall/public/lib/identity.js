// identity.js — resolve a handle to a DID, resolve any DID's document (for
// its current handle claim and home PDS), and batch-fetch profile text off
// the public AppView. Copied and trimmed from sites/listcheck's lib/identity.js
// (copy, don't abstract); swapped its single-profile getProfile() for a DID
// doc resolver (rollcall needs the handle *as claimed in the DID document*,
// not just whatever the AppView currently has cached — see public/lib/status.js)
// and a batched getProfiles() (25 actors/call — one request per 25 list
// members instead of one per member).

const PUB = "https://public.api.bsky.app/xrpc";

// A rollcall run can make a lot of small requests (one per list member,
// across three different hosts) — no single one should be able to hang the
// whole run. Past this, jget() aborts and the caller's existing try/catch
// treats it the same as any other failed lookup for that member.
const FETCH_TIMEOUT_MS = 8000;

export async function jget(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let r;
  try {
    r = await fetch(url, { signal: ctrl.signal });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("timed out");
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    try { e.body = await r.json(); } catch {}
    throw e;
  }
  return r.json();
}

// Forgiving about paste formats: @handle, bsky.app profile URL, at:// URI, DID.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

const didDocCache = new Map(); // did -> resolved doc info (see below), cached for the lifetime of the tab

// Resolves a DID straight to its DID document (plc.directory for did:plc,
// the domain's /.well-known/did.json for did:web) — this is the "looked up
// through the did:plc or equivalent" step: the handle it reports is the
// account's own current claim (alsoKnownAs), not a possibly-stale AppView
// cache. A 404 here (or a plc.directory response with no working service
// entry) means the DID itself no longer resolves — for a DID that was once a
// real list member, that's a deleted/retired account, not a typo.
export async function resolveDidDoc(did) {
  if (didDocCache.has(did)) return didDocCache.get(did);
  let result;
  try {
    let doc;
    if (did.startsWith("did:web:")) {
      const host = decodeURIComponent(did.slice("did:web:".length)).replace(/:/g, "/");
      doc = await jget(`https://${host}/.well-known/did.json`);
    } else if (did.startsWith("did:plc:")) {
      doc = await jget(`https://plc.directory/${encodeURIComponent(did)}`);
    } else {
      result = { did, doc: null, pds: null, handle: null, resolved: false, unsupportedMethod: true, reason: `unsupported DID method` };
      didDocCache.set(did, result);
      return result;
    }
    const svc = (doc.service || []).find(
      (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    const aka = (doc.alsoKnownAs || []).find((a) => a.startsWith("at://"));
    result = {
      did,
      doc,
      pds: (svc && svc.serviceEndpoint) || null,
      handle: aka ? aka.slice("at://".length) : null,
      resolved: true,
    };
  } catch (err) {
    // A did:plc 404 means the DID is tombstoned or never existed; a did:web
    // failure could also just be a hosting hiccup, but there's no way to
    // tell the difference from here without hitting the PDS itself, which
    // status.js does next.
    result = { did, doc: null, pds: null, handle: null, resolved: false, reason: err.message || "resolution failed" };
  }
  didDocCache.set(did, result);
  return result;
}

// Thin wrapper for callers (the CAR download path) that only need the PDS
// endpoint, not the full doc-resolution result.
export async function resolvePds(did) {
  return (await resolveDidDoc(did)).pds;
}

// One request per 25 actors instead of one per actor. Unknown/unresolvable
// DIDs are silently omitted from the AppView's response rather than erroring
// the whole batch, so the caller just won't find them in the returned map.
export async function getProfilesBatch(dids) {
  const out = new Map();
  const chunks = [];
  for (let i = 0; i < dids.length; i += 25) chunks.push(dids.slice(i, i + 25));
  await pooledEach(chunks, 4, async (chunk) => {
    const qs = chunk.map((d) => `actors=${encodeURIComponent(d)}`).join("&");
    let d;
    try {
      d = await jget(`${PUB}/app.bsky.actor.getProfiles?${qs}`);
    } catch {
      return;
    }
    for (const p of d.profiles || []) {
      out.set(p.did, {
        did: p.did,
        handle: p.handle,
        displayName: p.displayName || "",
        avatar: p.avatar || "",
        description: p.description || "",
      });
    }
  });
  return out;
}

// Run `fn` over `items` with at most `limit` in flight at once.
export async function pooledEach(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
}
