// catspace Worker — catspace.bisks.net
//
// A cat's profile itself is a net.bisks.catspace.profile record ("self")
// living in its owner's own PDS — this Worker never stores profile content,
// same as sites/commonplace. /cat/<handle> resolves the handle, fetches the
// record straight off the owner's PDS, and stamps it into public/cat.html's
// {{TOKEN}} template (same string-replace trick as commonplace/didscope) so
// every profile gets its own real OG card instead of one generic one.
//
// The one thing a single PDS can't answer: anything that spans *multiple*
// people's repos. That's what the Registry Durable Object is for — a shared
// index over three things no PDS query can give us:
//   - the /directory listing (which DIDs have ever saved a profile)
//   - per-profile visitor counts (a retro "visitor #000042" counter)
//   - the guestbook (comments live in each *commenter's own* PDS, so
//     displaying them on someone else's profile needs somewhere to collect
//     them — same verify-then-trust pattern as sites/hyperobject's Pit: the
//     Worker never trusts a client-supplied comment body, it reads the
//     record back off the claimed author's own PDS after they hand back the
//     record's at:// uri).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  REGISTRY: DurableObjectNamespace;
}

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
  put(entries: Record<string, unknown>): Promise<void>;
  list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
}

const PLC_DIR = "https://plc.directory";
const BSKY_PUBLIC_API = "https://public.api.bsky.app";
const PROFILE_COLLECTION = "net.bisks.catspace.profile";
const COMMENT_COLLECTION = "net.bisks.catspace.comment";
const MAX_RECORD_AGE_MS = 15 * 60 * 1000;
const MAX_GUESTBOOK_ENTRIES = 50;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

// --- identity + PDS record helpers (same shape as sites/commonplace) -------

async function jget(url: string): Promise<any> {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function resolveHandleToDid(handle: string): Promise<string> {
  if (handle.startsWith("did:")) return handle;
  const r = await jget(
    `${BSKY_PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  );
  if (!r.did) throw new Error("couldn't resolve handle");
  return r.did;
}

async function didDoc(did: string): Promise<any> {
  if (did.startsWith("did:plc:")) return jget(`${PLC_DIR}/${did}`);
  if (did.startsWith("did:web:")) {
    const domain = did.replace("did:web:", "").split(":").join("/");
    return jget(`https://${domain}/.well-known/did.json`);
  }
  throw new Error("unsupported did method");
}

async function resolveHandleForDid(did: string): Promise<string> {
  try {
    const doc = await didDoc(did);
    const aka = ((doc?.alsoKnownAs || []) as string[]).find((a) => a.startsWith("at://"));
    if (aka) return aka.slice("at://".length);
  } catch {}
  return did;
}

async function resolvePds(did: string): Promise<string> {
  const doc = await didDoc(did);
  const svc = (doc?.service || []).find(
    (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
  );
  if (!svc?.serviceEndpoint) throw new Error("no PDS found for did");
  return svc.serviceEndpoint;
}

async function getRecord(pdsUrl: string, repo: string, collection: string, rkey: string): Promise<any> {
  const params = new URLSearchParams({ repo, collection, rkey });
  return jget(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
}

function blobUrl(pdsUrl: string, did: string, blob: any): string | null {
  const cid = blob?.ref?.$link || blob?.ref?.toString?.();
  if (!cid) return null;
  const params = new URLSearchParams({ did, cid });
  return `${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.sync.getBlob?${params}`;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trimEnd() + "…";
}

function fillTemplate(html: string, tokens: Record<string, string>): string {
  let out = html;
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const m = /^at:\/\/(did:[^/]+)\/([^/]+)\/([^/]+)$/.exec(String(uri || ""));
  if (!m) return null;
  return { did: m[1], collection: m[2], rkey: m[3] };
}

function freshAt(createdAtIso: string): number {
  const ms = Date.parse(createdAtIso || "");
  return Number.isFinite(ms) ? ms : Date.now();
}

// Same trick as sites/hyperobject's verifyOwnRecord: never trust a client's
// claim about what it wrote, read the record back off the claimed author's
// own PDS. Nobody else can forge a record inside your repo, so that's proof
// enough — no session/cookie/bearer token needed on this Worker at all.
async function verifyOwnRecord(
  uri: string,
  expectedCollection: string,
): Promise<{ did: string; handle: string; pdsUrl: string; value: any } | { error: string; status: number }> {
  const parsed = parseAtUri(uri);
  if (!parsed) return { error: "not a valid at:// record uri", status: 400 };
  if (parsed.collection !== expectedCollection) return { error: "wrong record type", status: 400 };
  let pdsUrl: string;
  try {
    pdsUrl = await resolvePds(parsed.did);
  } catch {
    return { error: "couldn't resolve that DID's PDS", status: 400 };
  }
  let rec: any;
  try {
    rec = await getRecord(pdsUrl, parsed.did, parsed.collection, parsed.rkey);
  } catch {
    return { error: "record not found on your own PDS", status: 404 };
  }
  if (!rec?.value) return { error: "record not found on your own PDS", status: 404 };
  const handle = await resolveHandleForDid(parsed.did);
  return { did: parsed.did, handle, pdsUrl, value: rec.value };
}

// --- Registry Durable Object -------------------------------------------------

interface CatEntry {
  did: string;
  handle: string;
  catName: string;
  mood?: string;
  photoUrl?: string;
  updatedAt: number;
}

interface GuestbookEntry {
  handle: string;
  text: string;
  createdAt: number;
}

export class Registry {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/register" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }
      const uri = typeof body?.uri === "string" ? body.uri : null;
      if (!uri) return json({ error: "missing record uri" }, 400);

      const verified = await verifyOwnRecord(uri, PROFILE_COLLECTION);
      if ("error" in verified) return json(verified, verified.status);
      const parsed = parseAtUri(uri)!;
      if (parsed.rkey !== "self") return json({ error: "profile record must use rkey 'self'" }, 400);

      const { did, handle, pdsUrl, value } = verified;
      const validAt = freshAt(value.updatedAt || value.createdAt);
      if (Date.now() - validAt > MAX_RECORD_AGE_MS) {
        return json({ error: "that profile record is too old to register — save again" }, 400);
      }

      const entry: CatEntry = {
        did,
        handle,
        catName: typeof value.catName === "string" ? value.catName.slice(0, 40) : "Unnamed Cat",
        mood: typeof value.mood === "string" ? value.mood.slice(0, 60) : undefined,
        photoUrl: value.photo ? blobUrl(pdsUrl, did, value.photo) || undefined : undefined,
        updatedAt: Date.now(),
      };
      await this.state.storage.put({ [`cat:${did}`]: entry });
      return json({ ok: true, entry });
    }

    if (url.pathname === "/directory" && request.method === "GET") {
      const entries = await this.state.storage.list<CatEntry>({ prefix: "cat:" });
      const all = [...entries.values()].sort((a, b) => b.updatedAt - a.updatedAt);
      return json({ cats: all, total: all.length });
    }

    const visitMatch = url.pathname.match(/^\/visit\/([^/]+)$/);
    if (visitMatch && request.method === "POST") {
      const did = decodeURIComponent(visitMatch[1]);
      const key = `views:${did}`;
      const current = (await this.state.storage.get<number>(key)) || 0;
      const next = current + 1;
      await this.state.storage.put({ [key]: next });
      return json({ views: next });
    }

    if (url.pathname === "/guestbook" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }
      const uri = typeof body?.uri === "string" ? body.uri : null;
      if (!uri) return json({ error: "missing record uri" }, 400);
      if (await this.state.storage.get(`seen:${uri}`)) {
        return json({ error: "that note was already posted" }, 409);
      }

      const verified = await verifyOwnRecord(uri, COMMENT_COLLECTION);
      if ("error" in verified) return json(verified, verified.status);
      const { handle, value } = verified;

      const subject = typeof value.subject === "string" && value.subject.startsWith("did:") ? value.subject : null;
      const text = typeof value.text === "string" ? value.text.trim().slice(0, 280) : "";
      if (!subject || !text) return json({ error: "comment record needs a subject did and text" }, 400);

      const validAt = freshAt(value.createdAt);
      if (Date.now() - validAt > MAX_RECORD_AGE_MS) {
        return json({ error: "that note is too old to post — sign again" }, 400);
      }

      const key = `gb:${subject}`;
      const existing = (await this.state.storage.get<GuestbookEntry[]>(key)) || [];
      const entry: GuestbookEntry = { handle, text, createdAt: Date.now() };
      const next = [entry, ...existing].slice(0, MAX_GUESTBOOK_ENTRIES);
      await this.state.storage.put({ [key]: next, [`seen:${uri}`]: true });
      return json({ ok: true, entry });
    }

    const gbMatch = url.pathname.match(/^\/guestbook\/([^/]+)$/);
    if (gbMatch && request.method === "GET") {
      const did = decodeURIComponent(gbMatch[1]);
      const entries = (await this.state.storage.get<GuestbookEntry[]>(`gb:${did}`)) || [];
      return json({ entries });
    }

    return json({ error: "not found" }, 404);
  }
}

function registryStub(env: Env): DurableObjectStub {
  const id = env.REGISTRY.idFromName("global");
  return env.REGISTRY.get(id);
}

async function registryFetch(env: Env, path: string, init?: RequestInit): Promise<any> {
  const res = await registryStub(env).fetch(new Request(`http://registry${path}`, init));
  return res.json();
}

// --- page rendering -----------------------------------------------------

const SITE_ORIGIN = "https://catspace.bisks.net";
const DEFAULT_OG = `${SITE_ORIGIN}/og.png`;

async function renderCat(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const shellRes = await env.ASSETS.fetch(new Request(new URL("/cat.html", request.url), { method: "GET" }));
  const shell = await shellRes.text();
  const handle = decodeURIComponent(rawHandle).trim().replace(/^@/, "");

  let did: string, pdsUrl: string, value: any, displayHandle: string;
  try {
    did = await resolveHandleToDid(handle);
    pdsUrl = await resolvePds(did);
    ({ value } = await getRecord(pdsUrl, did, PROFILE_COLLECTION, "self"));
    displayHandle = await resolveHandleForDid(did);
  } catch {
    return renderClaimPage(shell, handle);
  }

  const url = `${SITE_ORIGIN}/cat/${encodeURIComponent(displayHandle)}`;

  // The directory/counter/guestbook DO is an enrichment, not load-bearing —
  // a hiccup there shouldn't make a real, existing profile look unclaimed.
  let views = 1;
  let gbEntries: GuestbookEntry[] = [];
  try {
    const [visitRes, gbRes] = await Promise.all([
      registryFetch(env, `/visit/${encodeURIComponent(did)}`, { method: "POST" }),
      registryFetch(env, `/guestbook/${encodeURIComponent(did)}`),
    ]);
    views = visitRes?.views || 1;
    gbEntries = gbRes?.entries || [];
  } catch {}

  const catName = value.catName || "Unnamed Cat";
  const mood = value.mood || "Vibing";
  const bio = typeof value.bio === "string" ? value.bio.trim() : "";
  const song = typeof value.song === "string" ? value.song.trim() : "";
  const theme = typeof value.theme === "string" ? value.theme : "bubblegum";
  const top8: string[] = Array.isArray(value.top8) ? value.top8.slice(0, 8) : [];

  const photoSrc = value.photo ? blobUrl(pdsUrl, did, value.photo) : null;
  const photoHtml = photoSrc
    ? `<img class="profile-photo" src="${esc(photoSrc)}" alt="${esc(catName)}" />`
    : `<div class="profile-photo-placeholder">🐈</div>`;

  const songHtml = song ? `<p class="now-purring">🎵 now purring to: <strong>${esc(song)}</strong></p>` : "";
  const bioHtml = bio ? `<div class="bio-block">${esc(bio)}</div>` : "";

  const top8Html = top8.length
    ? `<div class="top8-block"><h3>top 8 friends</h3><div class="top8-grid">${top8
        .map((h) => `<a class="top8-chip" href="/cat/${encodeURIComponent(h.replace(/^@/, ""))}">@${esc(h.replace(/^@/, ""))}</a>`)
        .join("")}</div></div>`
    : "";

  const guestbookHtml = gbEntries.length
    ? gbEntries
        .map((e) => `<p class="guestbook-entry"><strong>@${esc(e.handle)}</strong>: ${esc(e.text)}</p>`)
        .join("")
    : `<p class="empty">no notes yet — be the first!</p>`;

  const title = `${catName} (@${displayHandle})'s page — catspace`;
  const description = bio
    ? truncate(bio, 200)
    : `mood: ${mood}. ${song ? `now purring to ${song}.` : "on catspace, the myspace for cats."}`;

  const shareText = truncate(`${catName} has a catspace page now 🐱✨ ${url}`, 300);
  const shareUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;

  const html = fillTemplate(shell, {
    TITLE: esc(title),
    DESCRIPTION: esc(description),
    URL: url,
    OG_IMAGE: esc(photoSrc || DEFAULT_OG),
    THEME: esc(theme),
    CAT_NAME: esc(catName),
    CAT_NAME_UPPER: esc(catName.toUpperCase()),
    HANDLE: esc(displayHandle),
    MOOD: esc(mood),
    SONG_HTML: songHtml,
    BIO_HTML: bioHtml,
    TOP8_HTML: top8Html,
    PHOTO_HTML: photoHtml,
    VIEWS: String(views).padStart(6, "0"),
    GUESTBOOK_HTML: guestbookHtml,
    SUBJECT_DID: esc(did),
    SHARE_URL: shareUrl,
  });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=30" },
  });
}

function renderClaimPage(shell: string, handle: string): Response {
  const url = `${SITE_ORIGIN}/cat/${encodeURIComponent(handle)}`;
  const html = fillTemplate(shell, {
    TITLE: `nobody's built @${esc(handle)}'s cat a page yet — catspace`,
    DESCRIPTION: `@${esc(handle)} hasn't made their cat a catspace page yet. be the one who does.`,
    URL: url,
    OG_IMAGE: DEFAULT_OG,
    THEME: "bubblegum",
    CAT_NAME: `@${esc(handle)}'s cat`,
    CAT_NAME_UPPER: `@${esc(handle.toUpperCase())}'S CAT`,
    HANDLE: esc(handle),
    MOOD: "Unclaimed",
    SONG_HTML: "",
    BIO_HTML: `<div class="bio-block">nobody's built this cat a page yet. <a href="/">sign in and claim it →</a></div>`,
    TOP8_HTML: "",
    PHOTO_HTML: `<div class="profile-photo-placeholder">❔</div>`,
    VIEWS: "000000",
    GUESTBOOK_HTML: `<p class="empty">no notes yet — be the first!</p>`,
    SUBJECT_DID: "",
    SHARE_URL: `https://bsky.app/intent/compose?text=${encodeURIComponent(`is @${handle}'s cat on catspace yet? ${url}`)}`,
  });
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
}

async function renderDirectory(env: Env, request: Request): Promise<Response> {
  const shellRes = await env.ASSETS.fetch(new Request(new URL("/directory.html", request.url), { method: "GET" }));
  const shell = await shellRes.text();

  const dirRes = await registryFetch(env, "/directory");
  const cats: CatEntry[] = dirRes?.cats || [];

  const catsHtml = cats.length
    ? cats
        .map((c) => {
          const photo = c.photoUrl
            ? `<img class="dir-photo" src="${esc(c.photoUrl)}" alt="${esc(c.catName)}" />`
            : `<div class="dir-photo-placeholder">🐈</div>`;
          return `<a class="dir-card" href="/cat/${encodeURIComponent(c.handle)}">
            ${photo}
            <span class="dir-name">${esc(c.catName)}</span>
            <span class="dir-handle">@${esc(c.handle)}</span>
          </a>`;
        })
        .join("")
    : `<p class="empty">no cats yet — <a href="/">be the first</a>.</p>`;

  const html = fillTemplate(shell, {
    COUNT: String(cats.length),
    CATS_HTML: catsHtml,
  });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/register" || url.pathname === "/api/guestbook") {
      const target = url.pathname.replace(/^\/api/, "");
      const body = request.method === "POST" ? await request.text() : undefined;
      const res = await registryStub(env).fetch(
        new Request(`http://registry${target}`, {
          method: request.method,
          headers: { "content-type": "application/json" },
          body,
        }),
      );
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
      });
    }

    const catMatch = url.pathname.match(/^\/cat\/([^/]+)\/?$/);
    if (catMatch) return renderCat(env, request, catMatch[1]);

    if (url.pathname === "/directory" || url.pathname === "/directory/") {
      return renderDirectory(env, request);
    }

    return env.ASSETS.fetch(request);
  },
};
