// clusterpedia Worker — served at the root of clusterpedia.bisks.net.
//
// A Wikipedia clone where every write (an article edit, a talk-page post) is a
// real atproto record: the browser signs in with atproto OAuth (see
// public/lib/oauth.js, copied from sites/padmoot) and writes a
// net.bisks.clusterpedia.revision (or .talk) record straight to the user's own
// PDS with dpopFetch — same pattern as docmoot/padmoot. This Worker never
// holds anyone's credentials; it only ever reads records back *out* of the
// author's own PDS to verify them, which is proof enough that the author
// really did have write access to that DID's repo (you cannot forge a record
// inside someone else's repo).
//
// The Wiki Durable Object is the live index: current article text, a
// numbered revision history, talk threads, and per-DID contribution lists —
// all keyed off records whose authenticity was checked against the author's
// PDS, not off anything the client merely claims.
//
// Edit gating — "Shimmer Math Labs' Simcluster Checker" — restricts WRITES
// (not reads, not talk posts) to two groups relative to @bisks.net (the
// project's home identity, did:plc:f6n22z62adionrvb5s6n6vfk — see
// notes/30-identity-and-did.md):
//   - "members": bisks.net's mutuals (moots) — same follows∩followers
//     definition as sites/simcluster's lib/moots.js.
//   - "1-hop adjacent": anyone who shares a mutual connection with
//     bisks.net, i.e. at least one of *their* moots is also one of
//     bisks.net's moots.
// Talk pages need only a verified login, same as real wikis: discussion is
// open, editing the mainspace is not.

interface DurableObjectId {
  toString(): string;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T = unknown>(options?: {
    prefix?: string;
    reverse?: boolean;
    limit?: number;
  }): Promise<Map<string, T>>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  WIKI: DurableObjectNamespace;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

const GENERIC_TITLE = "clusterpedia — the encyclopedia gated by your moots";
const GENERIC_DESC =
  "A Wikipedia clone with real atproto login. Articles, revision histories, talk pages, profiles — edits are screened by Shimmer Math Labs' Simcluster Checker, which only lets in bisks.net's mutuals and mutuals-of-mutuals. Anyone can read and discuss.";
const GENERIC_OG_URL = "https://clusterpedia.bisks.net/";

const ARTICLE_RE = /^\/wiki\/([^/]+)\/?$/;

async function renderArticleShell(env: Env, request: Request, slug: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();
  try {
    const stub = env.WIKI.get(env.WIKI.idFromName("singleton"));
    const res = await stub.fetch(new Request(new URL(`/article/${encodeURIComponent(slug)}`, request.url)));
    const article = (await res.json()) as { exists: boolean; title?: string; summary?: string; content?: string };
    if (!article.exists) throw new Error("no article");
    const title = article.title?.trim() || slug;
    const desc = truncate(
      article.summary?.trim() || (article.content || "").replace(/\s+/g, " "),
      280,
    ) || `An article on clusterpedia.`;
    const ogUrl = `https://clusterpedia.bisks.net/wiki/${encodeURIComponent(slug)}`;
    // GENERIC_OG_URL ("https://clusterpedia.bisks.net/") is also a *prefix* of
    // the shareUrl template literal built client-side in index.html's script
    // (".../wiki/${encodeURIComponent(slug)}"), so a bare .split/.join on that
    // string would mangle the script too — anchor the match to the og:url
    // meta tag's quoted attribute so only that one occurrence is touched.
    html = html
      .split(GENERIC_TITLE).join(esc(`${title} — clusterpedia`))
      .split(GENERIC_DESC).join(esc(desc))
      .split(`content="${GENERIC_OG_URL}"`).join(`content="${ogUrl}"`);
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
  } catch {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const stub = env.WIKI.get(env.WIKI.idFromName("singleton"));
      const inner = new URL(request.url);
      inner.pathname = url.pathname.slice(4) || "/";
      return stub.fetch(new Request(inner, request));
    }

    const articleMatch = url.pathname.match(ARTICLE_RE);
    if (articleMatch && request.method === "GET") {
      return renderArticleShell(env, request, decodeURIComponent(articleMatch[1]));
    }

    // SPA fallback: any other GET without a file extension is a client route
    // (/, /wiki/<slug>/edit, /wiki/<slug>/history, /wiki/<slug>/talk,
    // /user/<handle>) — serve the same shell and let public/index.html's
    // router read location.pathname.
    if (request.method === "GET" && !/\.[a-zA-Z0-9]+$/.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }

    return env.ASSETS.fetch(request);
  },
};

// --- atproto identity + record verification --------------------------------

const PLC_DIR = "https://plc.directory";

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

// Verify that `uri` really is a record the claimed author wrote to their own
// PDS, and that it matches the expected collection. This is the only identity
// check this Worker does — no session, no cookie, no bearer token ever
// touches it. Returns the record's `value` plus a resolved display handle.
async function verifyOwnRecord(
  uri: string,
  expectCollection: string,
): Promise<{ did: string; handle: string; value: any } | { error: string; status: number }> {
  const parsed = parseAtUri(uri);
  if (!parsed) return { error: "not a valid at:// record uri", status: 400 };
  if (parsed.collection !== expectCollection) return { error: "wrong record type", status: 400 };
  const doc = await resolveDidDoc(parsed.did);
  if (!doc) return { error: "couldn't resolve that DID's identity", status: 400 };
  const pds = pdsFromDoc(doc);
  if (!pds) return { error: "couldn't resolve that DID's PDS", status: 400 };
  const rec = await getPdsRecord(pds, parsed.did, parsed.collection, parsed.rkey);
  if (!rec || !rec.value) return { error: "record not found on the author's PDS", status: 404 };
  return { did: parsed.did, handle: handleFromDoc(doc, parsed.did), value: rec.value };
}

// --- Shimmer Math Labs' Simcluster Checker ---------------------------------
//
// "member" = a mutual (moots — follows∩followers) of @bisks.net.
// "1-hop adjacent" = shares at least one mutual with @bisks.net (one of the
// candidate's own moots is also one of bisks.net's moots). Same public-AppView
// moots definition as sites/simcluster/public/lib/moots.js, just computed
// server-side since this gate has to be enforced, not merely displayed.

const ANCHOR_DID = "did:plc:f6n22z62adionrvb5s6n6vfk"; // bisks.net
const PUB = "https://api.bsky.app/xrpc";
const GRAPH_PAGES = 12; // ~1200 follows / ~1200 followers scanned, same cap as moots.js
const ANCHOR_TTL_MS = 12 * 60 * 60 * 1000;
const EDITOR_TTL_MS = 60 * 60 * 1000;

async function graphAllDids(endpoint: string, key: string, did: string): Promise<string[]> {
  const out: string[] = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d: any;
    try {
      const r = await fetch(u.toString());
      if (!r.ok) break;
      d = await r.json();
    } catch {
      break;
    }
    for (const it of d[key] || []) if (it?.did) out.push(it.did);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

async function computeMoots(did: string): Promise<string[]> {
  const [follows, followers] = await Promise.all([
    graphAllDids("app.bsky.graph.getFollows", "follows", did),
    graphAllDids("app.bsky.graph.getFollowers", "followers", did),
  ]);
  const followerSet = new Set(followers);
  const out = new Set<string>();
  for (const f of follows) if (f !== did && followerSet.has(f)) out.add(f);
  return [...out];
}

async function getAnchorMoots(storage: DurableObjectStorage): Promise<Set<string>> {
  const cached = await storage.get<{ dids: string[]; fetchedAt: number }>("checker:anchorMoots");
  if (cached && Date.now() - cached.fetchedAt < ANCHOR_TTL_MS) return new Set(cached.dids);
  const dids = await computeMoots(ANCHOR_DID);
  await storage.put("checker:anchorMoots", { dids, fetchedAt: Date.now() });
  return new Set(dids);
}
async function getEditorMoots(storage: DurableObjectStorage, did: string): Promise<string[]> {
  const key = `checker:editorMoots:${did}`;
  const cached = await storage.get<{ dids: string[]; fetchedAt: number }>(key);
  if (cached && Date.now() - cached.fetchedAt < EDITOR_TTL_MS) return cached.dids;
  const dids = await computeMoots(did);
  await storage.put(key, { dids, fetchedAt: Date.now() });
  return dids;
}

interface CheckResult {
  did: string;
  member: boolean;
  adjacent: boolean;
  allowed: boolean;
}

async function checkAccess(storage: DurableObjectStorage, did: string): Promise<CheckResult> {
  if (did === ANCHOR_DID) return { did, member: true, adjacent: true, allowed: true };
  const anchorMoots = await getAnchorMoots(storage);
  if (anchorMoots.has(did)) return { did, member: true, adjacent: true, allowed: true };
  const mine = await getEditorMoots(storage, did);
  const adjacent = mine.some((d) => anchorMoots.has(d));
  return { did, member: false, adjacent, allowed: adjacent };
}

// --- Wiki Durable Object ----------------------------------------------------
//
// One singleton instance holds the whole encyclopedia. Storage keys:
//   article:<slug>            current title/content/summary + who/when
//   rev:<slug>:<8-digit idx>   one immutable revision (full content + uri)
//   talk:<slug>:<8-digit idx>  one talk-page post
//   contrib:<did>:<ts>:<idx>   a pointer used to build a profile's history
//   seen:<at-uri>              replay guard — each PDS record applies once
//   checker:*                  Simcluster Checker caches (see above)

const MAX_TITLE = 200;
const MAX_CONTENT = 50_000;
const MAX_SUMMARY = 300;
const MAX_TALK = 5_000;
const MAX_RECORD_AGE_MS = 15 * 60 * 1000;
const REV_COLLECTION = "net.bisks.clusterpedia.revision";
const TALK_COLLECTION = "net.bisks.clusterpedia.talk";

function pad(n: number): string {
  return String(n).padStart(8, "0");
}

interface Article {
  slug: string;
  title: string;
  content: string;
  summary: string;
  revCount: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: { did: string; handle: string };
}

export class Wiki {
  private state: DurableObjectState;
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const method = request.method;

    try {
      if (parts.length === 1 && parts[0] === "list" && method === "GET") {
        return json(await this.listArticles());
      }
      if (parts[0] === "article" && parts[1]) {
        const slug = decodeURIComponent(parts[1]);
        if (parts.length === 2 && method === "GET") return json(await this.getArticle(slug));
        if (parts.length === 3 && parts[2] === "history" && method === "GET")
          return json(await this.getHistory(slug));
        if (parts.length === 4 && parts[2] === "rev" && method === "GET")
          return json(await this.getRevision(slug, Number(parts[3])));
        if (parts.length === 3 && parts[2] === "talk" && method === "GET")
          return json(await this.getTalk(slug));
        if (parts.length === 3 && parts[2] === "edit" && method === "POST")
          return this.handleEdit(slug, request);
        if (parts.length === 3 && parts[2] === "talk" && method === "POST")
          return this.handleTalk(slug, request);
      }
      if (parts[0] === "user" && parts[1] && method === "GET") {
        return json(await this.getUser(decodeURIComponent(parts[1])));
      }
      if (parts[0] === "check" && parts[1] && method === "GET") {
        return json(await checkAccess(this.storage, decodeURIComponent(parts[1])));
      }
    } catch (e: any) {
      return json({ error: e?.message || "internal error" }, 500);
    }
    return json({ error: "not found" }, 404);
  }

  private async listArticles() {
    const map = await this.storage.list<Article>({ prefix: "article:" });
    const arr = [...map.values()];
    arr.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return {
      articles: arr.map((a) => ({
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        updatedAt: a.updatedAt,
        updatedBy: a.updatedBy,
        revCount: a.revCount,
      })),
    };
  }

  private async getArticle(slug: string) {
    const a = await this.storage.get<Article>(`article:${slug}`);
    if (!a) return { exists: false, slug };
    return { exists: true, ...a };
  }

  private async getHistory(slug: string) {
    const map = await this.storage.list<any>({ prefix: `rev:${slug}:`, reverse: true });
    return {
      slug,
      revisions: [...map.values()].map((r) => ({
        idx: r.idx,
        did: r.did,
        handle: r.handle,
        summary: r.summary,
        title: r.title,
        createdAt: r.createdAt,
        uri: r.uri,
      })),
    };
  }

  private async getRevision(slug: string, idx: number) {
    if (!Number.isFinite(idx) || idx < 1) return { error: "bad revision index" };
    const r = await this.storage.get<any>(`rev:${slug}:${pad(idx)}`);
    if (!r) return { error: "no such revision" };
    return r;
  }

  private async getTalk(slug: string) {
    const map = await this.storage.list<any>({ prefix: `talk:${slug}:` });
    return { slug, posts: [...map.values()] };
  }

  private async getUser(handleOrDid: string) {
    let did = handleOrDid;
    let handle = handleOrDid;
    if (!did.startsWith("did:")) {
      try {
        const r = await fetch(
          `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handleOrDid)}`,
        );
        if (r.ok) {
          const d = (await r.json()) as { did?: string };
          if (d.did) did = d.did;
        }
      } catch {}
    }
    let profile: any = null;
    try {
      const r = await fetch(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
      if (r.ok) profile = await r.json();
    } catch {}
    if (profile?.handle) handle = profile.handle;

    const map = await this.storage.list<any>({ prefix: `contrib:${did}:`, reverse: true });
    const access = await checkAccess(this.storage, did);
    return {
      did,
      handle,
      displayName: profile?.displayName || handle,
      avatar: profile?.avatar || "",
      access,
      contributions: [...map.values()],
    };
  }

  private async handleEdit(slug: string, request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);

    if (await this.storage.get(`seen:${body.uri}`)) return json({ error: "already applied" }, 409);

    const verified = await verifyOwnRecord(body.uri, REV_COLLECTION);
    if ("error" in verified) return json(verified, verified.status);
    const { did, handle, value: v } = verified;

    if (v.slug !== slug) return json({ error: "record slug doesn't match this article" }, 400);
    const title = String(v.title || "").slice(0, MAX_TITLE).trim();
    const content = String(v.content || "").slice(0, MAX_CONTENT);
    const summary = String(v.summary || "").slice(0, MAX_SUMMARY).trim();
    if (!title || !content) return json({ error: "record is missing a title or content" }, 400);

    const createdAtMs = Date.parse(v.createdAt || "");
    const validAt = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
    if (Date.now() - validAt > MAX_RECORD_AGE_MS)
      return json({ error: "that record is too old to apply — write a fresh one" }, 400);

    const access = await checkAccess(this.storage, did);
    if (!access.allowed) return json({ error: "not cleared by the Simcluster Checker", access }, 403);

    const artKey = `article:${slug}`;
    const existing = await this.storage.get<Article>(artKey);
    const idx = (existing?.revCount || 0) + 1;
    const createdAt = new Date(validAt).toISOString();

    await this.storage.put(`rev:${slug}:${pad(idx)}`, {
      idx,
      did,
      handle,
      title,
      content,
      summary,
      uri: body.uri,
      createdAt,
    });
    const article: Article = {
      slug,
      title,
      content,
      summary,
      revCount: idx,
      createdAt: existing?.createdAt || createdAt,
      updatedAt: createdAt,
      updatedBy: { did, handle },
    };
    await this.storage.put(artKey, article);
    await this.storage.put(`seen:${body.uri}`, true);
    await this.storage.put(`contrib:${did}:${padTs(validAt)}:${idx}`, {
      type: "edit",
      slug,
      title,
      summary,
      uri: body.uri,
      createdAt,
    });

    return json({ ok: true, slug, idx, access });
  }

  private async handleTalk(slug: string, request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);

    if (await this.storage.get(`seen:${body.uri}`)) return json({ error: "already applied" }, 409);

    const verified = await verifyOwnRecord(body.uri, TALK_COLLECTION);
    if ("error" in verified) return json(verified, verified.status);
    const { did, handle, value: v } = verified;

    if (v.slug !== slug) return json({ error: "record slug doesn't match this talk page" }, 400);
    const text = String(v.body || "").slice(0, MAX_TALK).trim();
    if (!text) return json({ error: "empty post" }, 400);

    const createdAtMs = Date.parse(v.createdAt || "");
    const validAt = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
    if (Date.now() - validAt > MAX_RECORD_AGE_MS)
      return json({ error: "that record is too old to apply — write a fresh one" }, 400);

    const map = await this.storage.list<any>({ prefix: `talk:${slug}:` });
    const idx = map.size + 1;
    const createdAt = new Date(validAt).toISOString();
    const post = { idx, did, handle, body: text, uri: body.uri, createdAt };
    await this.storage.put(`talk:${slug}:${pad(idx)}`, post);
    await this.storage.put(`seen:${body.uri}`, true);
    await this.storage.put(`contrib:${did}:${padTs(validAt)}:${idx}`, {
      type: "talk",
      slug,
      summary: truncate(text, 120),
      uri: body.uri,
      createdAt,
    });

    return json({ ok: true, slug, idx });
  }
}

function padTs(ms: number): string {
  return String(Math.floor(ms)).padStart(14, "0");
}
