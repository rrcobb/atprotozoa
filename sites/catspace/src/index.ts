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
// people's repos — namely the /directory listing (which DIDs have ever
// saved a profile). This repo tried a Registry Durable Object for that once
// (see wrangler.toml's migration history); it got ripped back out, since a
// directory is just an index over records that already live in everyone's
// own PDS. /directory.html now builds that index itself, client-side, via
// listReposByCollection + a live Jetstream feed (public/lib/global-index.js,
// same recipe as sites/steamtags and sites/verdict/crowd) — this Worker just
// serves the static shell. Per-profile visitor counts and the guestbook
// (comments live in each *commenter's own* PDS, so displaying them on
// someone else's profile needs somewhere to collect them) are still open;
// a guestbook would need the same verify-then-trust pattern as
// sites/hyperobject's Pit — the Worker never trusting a client-supplied
// comment body, always reading it back off the claimed author's own PDS.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PLC_DIR = "https://plc.directory";
const BSKY_PUBLIC_API = "https://public.api.bsky.app";
const PROFILE_COLLECTION = "net.bisks.catspace.profile";
const COMMENT_COLLECTION = "net.bisks.catspace.comment";


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

  const views = 0;
  const gbEntries: Array<{ handle: string; text: string }> = [];

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
  // The listing itself is built client-side (public/lib/global-index.js) —
  // this just serves the static shell with the right cache headers.
  const shellRes = await env.ASSETS.fetch(new Request(new URL("/directory.html", request.url), { method: "GET" }));
  const shell = await shellRes.text();
  return new Response(shell, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const catMatch = url.pathname.match(/^\/cat\/([^/]+)\/?$/);
    if (catMatch) return renderCat(env, request, catMatch[1]);

    if (url.pathname === "/directory" || url.pathname === "/directory/") {
      return renderDirectory(env, request);
    }

    return env.ASSETS.fetch(request);
  },
};
