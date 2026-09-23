// subatomic — Worker for subatomic.bisks.net.
//
// "reddit but atproto": post a link or self-post to a board (a freeform
// community tag), upvote/downvote, comment. Every post, vote, and comment is
// a net.bisks.subatomic.* record the browser (public/lib/oauth.js) writes
// straight to the poster's *own* PDS. This Worker never holds anyone's
// credentials — a caller only ever hands it an at:// uri (or, for
// withdrawing a vote, a did + subject), and verifyOwnRecord /
// verifyRecordAbsent read the claimed author's own repo to confirm the
// record really is (or isn't) there before applying anything. Verified
// records are folded into a KV-backed index, the shared, best-effort view
// every visitor sees — same recipe as sites/hyperobject's PitStore /
// sites/thewell's WellStore / sites/clusterpedia's WikiStore. The PDS
// records remain the durable source of truth; this index may be stale or
// drop a record if two writes race, an acceptable tradeoff at this scale
// (notes/11-durable-objects.md — no Durable Objects here).
//
// Votes use a deterministic rkey (sha256(subject uri), hex, first 32 chars —
// see expectedRkey / oauth.js's voteRkey) so a voter has at most one live
// vote record per post: casting a new vote overwrites it via putRecord,
// withdrawing it deletes it. That lets this Worker recompute a post's score
// as a running delta instead of re-listing every vote on every request.
//
// KV keys:
//   post:<uri-encoded post at-uri>              one post
//   vote:<uri-encoded subject at-uri>:<did>      one voter's current vote on a post
//   comment:<uri-encoded post at-uri>:<uri-encoded comment at-uri>   one comment
//   seen:<at-uri>                                replay guard for posts/comments

interface KVNamespace {
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  SUB_STATE: KVNamespace;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        });
      }
      return new SubStore(env.SUB_STATE).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// --- atproto identity + record verification --------------------------------

const PLC_DIR = "https://plc.directory";
const APPVIEW = "https://public.api.bsky.app/xrpc";

const POST_COLLECTION = "net.bisks.subatomic.post";
const VOTE_COLLECTION = "net.bisks.subatomic.vote";
const COMMENT_COLLECTION = "net.bisks.subatomic.comment";

const MAX_TITLE = 300;
const MAX_BODY = 10000;
const MAX_URL = 2000;
const MAX_COMMENT = 5000;
const MAX_BOARD = 30;
const MAX_RECORD_AGE_MS = 15 * 60 * 1000;

async function resolveDidDoc(did: string): Promise<any | null> {
  try {
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`${PLC_DIR}/${did}`);
      if (!r.ok) return null;
      return await r.json();
    }
    if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").split(":").join("/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      if (!r.ok) return null;
      return await r.json();
    }
  } catch {}
  return null;
}
function pdsFromDoc(doc: any): string | null {
  const svc = (doc?.service || []).find(
    (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
  );
  return svc?.serviceEndpoint || null;
}
function handleFromDoc(doc: any, fallback: string): string {
  const aka = (doc?.alsoKnownAs || []).find((a: string) => a.startsWith("at://"));
  return aka ? aka.slice("at://".length) : fallback;
}
async function getPdsRecord(pdsUrl: string, did: string, collection: string, rkey: string): Promise<any | null> {
  try {
    const u = `${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`;
    const r = await fetch(u);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const m = /^at:\/\/(did:[^/]+)\/([^/]+)\/([^/]+)$/.exec(String(uri || ""));
  if (!m) return null;
  return { did: m[1], collection: m[2], rkey: m[3] };
}

// sha256(subject uri) hex, first 32 chars — same scheme public/lib's
// voteRkey() uses client-side. A voter has at most one live vote record per
// subject at this rkey, so a repeat vote overwrites in place (putRecord) and
// this Worker can track score as a running delta instead of re-listing every
// vote on every request.
async function expectedRkey(subjectUri: string): Promise<string> {
  const bytes = new TextEncoder().encode(subjectUri);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// The only identity check this Worker does for a create: confirm `uri`
// really is a record the claimed author wrote to their own PDS, matching the
// expected collection, recent enough to be a live write. No session, no
// cookie, no bearer token ever touches it.
async function verifyOwnRecord(
  uri: string,
  expectCollection: string,
): Promise<{ did: string; handle: string; pds: string; value: any; uri: string } | { error: string; status: number }> {
  const parsed = parseAtUri(uri);
  if (!parsed) return { error: "not a valid at:// record uri", status: 400 };
  if (parsed.collection !== expectCollection) return { error: "wrong record type", status: 400 };
  const doc = await resolveDidDoc(parsed.did);
  if (!doc) return { error: "couldn't resolve that DID's identity", status: 400 };
  const pds = pdsFromDoc(doc);
  if (!pds) return { error: "couldn't resolve that DID's PDS", status: 400 };
  const rec = await getPdsRecord(pds, parsed.did, parsed.collection, parsed.rkey);
  if (!rec || !rec.value) return { error: "record not found on the author's PDS", status: 404 };
  const createdAtMs = Date.parse(rec.value?.createdAt || "");
  const validAt = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
  if (Date.now() - validAt > MAX_RECORD_AGE_MS)
    return { error: "that record is too old to apply — write a fresh one", status: 400 };
  return { did: parsed.did, handle: handleFromDoc(doc, parsed.did), pds, value: rec.value, uri };
}

// The check /api/unvote relies on: confirm the given did's PDS has NO record
// at collection/rkey right now. Since only the did's own PDS session could
// ever have deleted that record, a caller can never falsely claim someone
// else's still-live vote was withdrawn — this would just find it still there
// and refuse.
async function verifyRecordAbsent(
  did: string,
  collection: string,
  rkey: string,
): Promise<{ absent: true } | { error: string; status: number }> {
  const doc = await resolveDidDoc(did);
  if (!doc) return { error: "couldn't resolve that DID's identity", status: 400 };
  const pds = pdsFromDoc(doc);
  if (!pds) return { error: "couldn't resolve that DID's PDS", status: 400 };
  const rec = await getPdsRecord(pds, did, collection, rkey);
  if (rec && rec.value) return { error: "that vote record still exists on your PDS", status: 409 };
  return { absent: true };
}

async function resolveProfile(did: string): Promise<{ handle: string; displayName: string; avatar: string }> {
  try {
    const r = await fetch(`${APPVIEW}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    if (!r.ok) throw new Error("no profile");
    const d: any = await r.json();
    return { handle: d.handle || did, displayName: d.displayName || d.handle || did, avatar: d.avatar || "" };
  } catch {
    return { handle: did, displayName: did, avatar: "" };
  }
}

function cleanText(s: unknown, max: number): string {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}
function normalizeBoard(s: unknown): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_BOARD);
}
function cleanUrl(s: unknown): string {
  const v = typeof s === "string" ? s.trim().slice(0, MAX_URL) : "";
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

interface PostEntry {
  uri: string;
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  board: string;
  title: string;
  url: string;
  text: string;
  createdAt: number;
  score: number;
  ups: number;
  downs: number;
  commentCount: number;
}

interface CommentEntry {
  uri: string;
  post: string;
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  text: string;
  createdAt: number;
}

// Reddit's "hot" ranking: log10(magnitude of score) plus a linear nudge from
// age, so a handful of early votes matter more than raw age but a post can't
// coast on votes from a week ago forever. EPOCH is an arbitrary recent
// reference point (2025-01-01T00:00:00Z) — only relative ordering matters.
const HOT_EPOCH_S = 1735689600;
function hotScore(score: number, createdAtMs: number): number {
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  const seconds = createdAtMs / 1000 - HOT_EPOCH_S;
  return sign * order + seconds / 45000;
}

export class SubStore {
  private storage: KVNamespace;

  constructor(storage: KVNamespace) {
    this.storage = storage;
  }

  private async listValues<T>(prefix: string): Promise<{ name: string; value: T }[]> {
    const names: string[] = [];
    let cursor = "";
    do {
      const page = await this.storage.list({ prefix, cursor: cursor || undefined, limit: 1000 });
      names.push(...page.keys.map((k) => k.name));
      cursor = page.list_complete ? "" : page.cursor || "";
    } while (cursor);
    const out: { name: string; value: T }[] = [];
    for (const name of names) {
      const v = await this.storage.get<T>(name, "json");
      if (v !== null) out.push({ name, value: v });
    }
    return out;
  }

  private async alreadySeen(uri: string): Promise<boolean> {
    return !!(await this.storage.get(`seen:${uri}`, "json"));
  }
  private async markSeen(uri: string): Promise<void> {
    await this.storage.put(`seen:${uri}`, "true");
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice("/api".length) || "/";

    try {
      if (path === "/feed" && request.method === "GET") {
        const board = normalizeBoard(url.searchParams.get("board") || "") || null;
        const sort = url.searchParams.get("sort") || "hot";
        return json(await this.getFeed(board, sort === "new" || sort === "top" ? sort : "hot"));
      }
      if (path === "/boards" && request.method === "GET") return json(await this.getBoards());
      if (path === "/post" && request.method === "GET") {
        const uri = url.searchParams.get("uri") || "";
        return json(await this.getPost(uri));
      }
      if (path === "/submit-post" && request.method === "POST") return this.handleSubmitPost(request);
      if (path === "/submit-comment" && request.method === "POST") return this.handleSubmitComment(request);
      if (path === "/vote" && request.method === "POST") return this.handleVote(request);
      if (path === "/unvote" && request.method === "POST") return this.handleUnvote(request);
      if (path === "/my-votes" && request.method === "POST") return this.handleMyVotes(request);
    } catch (e: any) {
      return json({ error: e?.message || "internal error" }, 500);
    }
    return json({ error: "not found" }, 404);
  }

  private async getFeed(board: string | null, sort: "hot" | "new" | "top"): Promise<{ entries: PostEntry[] }> {
    const rows = await this.listValues<PostEntry>("post:");
    let entries = rows.map((r) => r.value);
    if (board) entries = entries.filter((e) => e.board === board);
    if (sort === "new") entries.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === "top") entries.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);
    else entries.sort((a, b) => hotScore(b.score, b.createdAt) - hotScore(a.score, a.createdAt));
    return { entries };
  }

  private async getBoards(): Promise<{ boards: { board: string; count: number }[] }> {
    const rows = await this.listValues<PostEntry>("post:");
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.value.board, (counts.get(r.value.board) || 0) + 1);
    const boards = [...counts.entries()]
      .map(([board, count]) => ({ board, count }))
      .sort((a, b) => b.count - a.count);
    return { boards };
  }

  private async getPost(uri: string): Promise<{ post: PostEntry | null; comments: CommentEntry[] }> {
    if (!uri) return { post: null, comments: [] };
    const post = await this.storage.get<PostEntry>(`post:${encodeURIComponent(uri)}`, "json");
    const rows = await this.listValues<CommentEntry>(`comment:${encodeURIComponent(uri)}:`);
    const comments = rows.map((r) => r.value).sort((a, b) => a.createdAt - b.createdAt);
    return { post, comments };
  }

  private async handleSubmitPost(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);
    if (await this.alreadySeen(body.uri)) return json({ ok: true, alreadyApplied: true });

    const verified = await verifyOwnRecord(body.uri, POST_COLLECTION);
    if ("error" in verified) return json(verified, verified.status);

    const board = normalizeBoard(verified.value?.board);
    if (!board) return json({ error: "record has no valid board" }, 400);
    const title = cleanText(verified.value?.title, MAX_TITLE);
    if (!title) return json({ error: "record has no title" }, 400);
    const linkUrl = cleanUrl(verified.value?.url);
    const text = linkUrl ? "" : cleanText(verified.value?.text, MAX_BODY);

    const createdAtMs = Date.parse(verified.value?.createdAt || "") || Date.now();
    const profile = await resolveProfile(verified.did);

    const entry: PostEntry = {
      uri: body.uri,
      did: verified.did,
      handle: profile.handle || verified.handle,
      displayName: profile.displayName,
      avatar: profile.avatar,
      board,
      title,
      url: linkUrl,
      text,
      createdAt: createdAtMs,
      score: 0,
      ups: 0,
      downs: 0,
      commentCount: 0,
    };
    await this.storage.put(`post:${encodeURIComponent(body.uri)}`, JSON.stringify(entry));
    await this.markSeen(body.uri);
    return json({ ok: true, entry });
  }

  private async handleSubmitComment(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);
    if (await this.alreadySeen(body.uri)) return json({ ok: true, alreadyApplied: true });

    const verified = await verifyOwnRecord(body.uri, COMMENT_COLLECTION);
    if ("error" in verified) return json(verified, verified.status);

    const postUri = typeof verified.value?.post === "string" ? verified.value.post : "";
    const postKey = `post:${encodeURIComponent(postUri)}`;
    const post = await this.storage.get<PostEntry>(postKey, "json");
    if (!post) return json({ error: "that post isn't in the index" }, 404);

    const text = cleanText(verified.value?.text, MAX_COMMENT);
    if (!text) return json({ error: "record has no text" }, 400);

    const createdAtMs = Date.parse(verified.value?.createdAt || "") || Date.now();
    const profile = await resolveProfile(verified.did);

    const entry: CommentEntry = {
      uri: body.uri,
      post: postUri,
      did: verified.did,
      handle: profile.handle || verified.handle,
      displayName: profile.displayName,
      avatar: profile.avatar,
      text,
      createdAt: createdAtMs,
    };
    await this.storage.put(`comment:${encodeURIComponent(postUri)}:${encodeURIComponent(body.uri)}`, JSON.stringify(entry));
    await this.markSeen(body.uri);

    post.commentCount = (post.commentCount || 0) + 1;
    await this.storage.put(postKey, JSON.stringify(post));
    return json({ ok: true, entry });
  }

  private async handleVote(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);

    const verified = await verifyOwnRecord(body.uri, VOTE_COLLECTION);
    if ("error" in verified) return json(verified, verified.status);

    const value = verified.value?.value;
    if (value !== 1 && value !== -1) return json({ error: "vote value must be 1 or -1" }, 400);
    const subject = typeof verified.value?.subject === "string" ? verified.value.subject : "";
    const subjectParsed = parseAtUri(subject);
    if (!subjectParsed || subjectParsed.collection !== POST_COLLECTION)
      return json({ error: "can only vote on subatomic posts" }, 400);

    const parsedVote = parseAtUri(body.uri)!;
    if (parsedVote.rkey !== (await expectedRkey(subject)))
      return json({ error: "vote record must use the deterministic per-subject rkey" }, 400);

    const postKey = `post:${encodeURIComponent(subject)}`;
    const post = await this.storage.get<PostEntry>(postKey, "json");
    if (!post) return json({ error: "that post isn't in the index" }, 404);

    const voteKey = `vote:${encodeURIComponent(subject)}:${verified.did}`;
    const prior = await this.storage.get<{ value: 1 | -1 }>(voteKey, "json");
    const oldValue = prior?.value || 0;
    const delta = value - oldValue;

    if (delta !== 0) {
      post.score += delta;
      if (oldValue === 1) post.ups -= 1;
      if (oldValue === -1) post.downs -= 1;
      if (value === 1) post.ups += 1;
      if (value === -1) post.downs += 1;
      await this.storage.put(postKey, JSON.stringify(post));
    }
    await this.storage.put(voteKey, JSON.stringify({ value }));
    return json({ ok: true, post });
  }

  // Reads this viewer's already-cast vote for a batch of posts (their own
  // current feed page), purely from our own KV — no PDS calls, so it's cheap
  // to call on every load and needs no cap of its own.
  private async handleMyVotes(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { did?: string; uris?: string[] } | null;
    if (!body?.did || !Array.isArray(body.uris)) return json({ votes: {} });
    const votes: Record<string, 1 | -1> = {};
    for (const uri of body.uris) {
      if (typeof uri !== "string") continue;
      const v = await this.storage.get<{ value: 1 | -1 }>(`vote:${encodeURIComponent(uri)}:${body.did}`, "json");
      if (v) votes[uri] = v.value;
    }
    return json({ votes });
  }

  private async handleUnvote(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { did?: string; subject?: string } | null;
    if (!body?.did || !body?.subject) return json({ error: "missing did or subject" }, 400);

    const rkey = await expectedRkey(body.subject);
    const absence = await verifyRecordAbsent(body.did, VOTE_COLLECTION, rkey);
    if ("error" in absence) return json(absence, absence.status);

    const postKey = `post:${encodeURIComponent(body.subject)}`;
    const post = await this.storage.get<PostEntry>(postKey, "json");
    if (!post) return json({ error: "that post isn't in the index" }, 404);

    const voteKey = `vote:${encodeURIComponent(body.subject)}:${body.did}`;
    const prior = await this.storage.get<{ value: 1 | -1 }>(voteKey, "json");
    if (!prior) return json({ ok: true, post, alreadyApplied: true });

    post.score -= prior.value;
    if (prior.value === 1) post.ups -= 1;
    if (prior.value === -1) post.downs -= 1;
    await this.storage.put(postKey, JSON.stringify(post));
    await this.storage.delete(voteKey);
    return json({ ok: true, post });
  }
}
