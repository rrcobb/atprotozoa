// Write one net.bisks.buildthis.request record per build run, into the BOT'S OWN
// repo. Called from reply.mjs, which already holds the bot's session and already
// knows everything this needs — the same data box-build.sh stamps into the built
// site's .buildthis.json, except durable, queryable, and in one place instead of
// scattered one-file-per-site.
//
// Why the bot's repo and not the requester's: the bot has no write access to
// anyone else's PDS, and the record is the bot's account of what it did. The
// requester is a field (did + handle), which is what makes "what has this person
// asked for" a filter rather than a crawl. See notes/ideas/00-index.md item 15b.
//
// Best-effort by construction: every failure here is caught and logged by the
// caller. A build that shipped and replied must never go red because a
// bookkeeping record didn't write.

const PDS = "https://bsky.social";
const APPVIEW = "https://public.api.bsky.app";

const COLLECTION = "net.bisks.buildthis.request";

// Derive a stable record key from the tagging post's AT-URI. An at:// post uri is
// at://<did>/app.bsky.feed.post/<rkey>, and that trailing rkey is a TID — unique
// across the network in practice, already rkey-legal (13 chars of base32-sortable),
// and stable for the life of the post. So the same tag re-run (a requeue, a
// backfill pass over a build that already has a record) OVERWRITES its record in
// place rather than leaving two accounts of one request.
//
// The authorship prefix is dropped deliberately: including the requester's DID
// would blow past the 512-byte rkey limit and buys nothing, since post TIDs don't
// collide in the volume this bot sees. Falls back to a hash-ish slug for anything
// that isn't shaped like a post uri, so a malformed uri can't throw here.
export function rkeyForPost(postUri) {
  const m = /^at:\/\/[^/]+\/[^/]+\/([A-Za-z0-9._~-]{1,64})$/.exec(postUri || "");
  if (m) return m[1];
  let h = 0;
  for (const ch of String(postUri || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `x${h.toString(36)}`;
}

// Resolve a handle to its DID. The record's identity field is the DID — handles
// get renamed and reassigned, and a request history keyed on a handle would
// silently re-attribute someone's asks to whoever took the name next.
//
// box-build.sh only carries AUTHOR (a handle), but MENTION_URI embeds the
// author's DID: at://<did>/app.bsky.feed.post/<tid>. So prefer the uri, which is
// free and can't be wrong, and only fall back to resolving the handle over the
// network when the uri isn't shaped as expected.
export async function requesterIdentity(postUri, handle) {
  const fromUri = /^at:\/\/(did:[^/]+)\//.exec(postUri || "");
  if (fromUri) return { did: fromUri[1], handle: handle || undefined };
  if (!handle) return null;
  try {
    const res = await fetch(
      `${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    );
    if (!res.ok) return null;
    const j = await res.json();
    return j.did ? { did: j.did, handle } : null;
  } catch {
    return null;
  }
}

// Fetch the tagging post's own createdAt, so "when was this asked" is the ask's
// time rather than the build's. Best-effort: absent on failure, which the lexicon
// allows (requestedAt is optional).
async function postCreatedAt(postUri) {
  try {
    const res = await fetch(
      `${APPVIEW}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(postUri)}`,
    );
    if (!res.ok) return undefined;
    const j = await res.json();
    const rec = j?.posts?.[0]?.record;
    return typeof rec?.createdAt === "string" ? rec.createdAt : undefined;
  } catch {
    return undefined;
  }
}

// Clamp a string to a lexicon maxGraphemes budget. The brief is a third-party
// post and can be long (MAX_BRIEF_CHARS is 20k); a record that exceeds its own
// schema is worse than a truncated one.
function clamp(s, maxGraphemes) {
  if (!s) return undefined;
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let out = "";
  let n = 0;
  for (const { segment } of seg.segment(s)) {
    if (n >= maxGraphemes) return `${out}…`;
    out += segment;
    n++;
  }
  return out;
}

// Build the record body from a build run's facts. Pure — no network, no env — so
// the backfill script can reuse it with values read from a .buildthis.json stamp.
export function buildRequestRecord({
  requester,
  postUri,
  threadRootUri,
  brief,
  note,
  disposition,
  partial,
  site,
  siteUrl,
  edit,
  commit,
  liveStatus,
  requestedAt,
  builtAt,
  maintenance,
  source = "build",
}) {
  // A maintenance pass shipped real work to main; it just has no one site to
  // name. Counting it as outcome "none" would put a run that fixed nine sites
  // in the same bucket as one that built nothing.
  const shipped =
    disposition === "success" || disposition === "partial" || disposition === "maintenance";
  const rec = {
    $type: COLLECTION,
    requester: { did: requester.did, ...(requester.handle ? { handle: requester.handle } : {}) },
    postUri,
    brief: clamp(brief, 8000) ?? "",
    disposition,
    outcome: shipped ? "shipped" : "none",
    createdAt: new Date().toISOString(),
    source,
  };
  if (threadRootUri && threadRootUri !== postUri) rec.threadRootUri = threadRootUri;
  if (note) rec.note = clamp(note, 1000);
  if (partial) rec.partial = true;
  if (site) rec.site = site;
  if (siteUrl) rec.siteUrl = siteUrl;
  if (typeof edit === "boolean") rec.edit = edit;
  if (commit) rec.commit = commit;
  if (liveStatus) rec.liveStatus = liveStatus;
  if (maintenance) rec.maintenance = clamp(maintenance, 300);
  if (requestedAt) rec.requestedAt = requestedAt;
  if (builtAt) rec.builtAt = builtAt;
  return rec;
}

// putRecord (not createRecord) so a re-run of the same tag replaces its record
// rather than adding a second account of one request.
export async function putRequestRecord(session, record, rkey) {
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: COLLECTION,
      rkey,
      record,
    }),
  });
  if (!res.ok) throw new Error(`putRecord ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.uri;
}

// The whole write, from a build run's environment. Returns the record's AT-URI,
// or null when there's nothing to write (no tagging post to key on, or no
// resolvable requester). Throws on a genuine write failure — the caller decides
// whether that's fatal (it isn't).
export async function writeRequestRecord(session, env, extra = {}) {
  const postUri = (env.MENTION_URI || "").trim();
  if (!postUri) return null;
  const requester = await requesterIdentity(postUri, (env.AUTHOR || "").trim());
  if (!requester) return null;

  const record = buildRequestRecord({
    requester,
    postUri,
    threadRootUri: (env.REPLY_ROOT_URI || "").trim() || undefined,
    brief: (env.BRIEF || "").trim(),
    note: (env.BUILD_NOTE || "").trim() || undefined,
    disposition: (env.DISPOSITION || "").trim() || "incomplete",
    partial: (env.BUILD_ERROR || "").trim() === "partial",
    site: (env.BUILD_RESULT || "").trim() || undefined,
    edit: env.BUILD_IS_EDIT ? env.BUILD_IS_EDIT === "true" : undefined,
    commit: (env.BUILD_COMMIT || "").trim() || undefined,
    liveStatus: (env.LIVE_STATUS || "").trim() || undefined,
    maintenance: (env.BUILD_MAINTENANCE || "").trim() || undefined,
    requestedAt: await postCreatedAt(postUri),
    builtAt: new Date().toISOString(),
    ...extra,
  });

  return putRequestRecord(session, record, rkeyForPost(postUri));
}

export { COLLECTION };
