// commonplace Worker — commonplace.bisks.net
//
// The composer itself runs entirely client-side (public/index.html), writing
// site.standard.publication / site.standard.document records straight to the
// signed-in user's own PDS. The one thing that needs a server: reading a
// document back. A plain static site would serve the same generic og:image
// for every /read/<did>/<rkey>, so link-unfurl caches (Bluesky's included)
// would show one blank card no matter which post got shared — same problem
// didscope solved with its /s/<handle> route (see sites/didscope/src/index.ts).
//
// Fix: /read/<did>/<rkey> and /pub/<handle> are real per-document/per-person
// URLs. The Worker resolves the DID's PDS, fetches the record(s) straight off
// it (no AppView indexes custom lexicons), and stamps the static templates'
// {{TOKEN}} placeholders before serving — no HTML parser needed, same
// string-replace trick as didscope's renderShare.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PLC_DIR = "https://plc.directory";
const BSKY_PUBLIC_API = "https://public.api.bsky.app";
const PUB_COLLECTION = "site.standard.publication";
const DOC_COLLECTION = "site.standard.document";

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
    const domain = did.replace("did:web:", "").replace(/:/g, "/");
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

async function listRecords(pdsUrl: string, repo: string, collection: string, capPages = 5): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let p = 0; p < capPages; p++) {
    const params = new URLSearchParams({ repo, collection, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    let d: any;
    try {
      d = await jget(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?${params}`);
    } catch {
      break;
    }
    const records = d.records || [];
    out.push(...records);
    cursor = d.cursor;
    if (!cursor || !records.length) break;
  }
  return out;
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

const DEFAULT_OG = "https://commonplace.bisks.net/og.png";

async function renderDocPage(
  env: Env,
  request: Request,
  did: string,
  pdsUrl: string,
  doc: any,
  canonicalUrl: string,
): Promise<Response> {
  const shellRes = await env.ASSETS.fetch(new Request(new URL("/read.html", request.url), { method: "GET" }));
  const shell = await shellRes.text();

  const handle = await resolveHandleForDid(did);

  const title = doc.title || "untitled";
  const description = truncate(doc.description || doc.textContent || "", 300);
  const date = doc.publishedAt ? new Date(doc.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";

  const coverSrc = doc.coverImage ? blobUrl(pdsUrl, did, doc.coverImage) : null;
  const coverHtml = coverSrc ? `<img class="cover" src="${esc(coverSrc)}" alt="" />` : "";
  const ogImage = coverSrc || DEFAULT_OG;

  const tagsHtml = (doc.tags || [])
    .map((t: string) => `<span class="tag-chip">${esc(t)}</span>`)
    .join("");

  let pubNoteHtml = "";
  if (typeof doc.site === "string" && doc.site.startsWith("at://")) {
    try {
      const m = doc.site.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if (m) {
        const [, pubRepo, pubCollection, pubRkey] = m;
        const { value: pub } = await getRecord(pdsUrl, pubRepo, pubCollection, pubRkey);
        pubNoteHtml = `part of <strong>${esc(pub.name || "a publication")}</strong>${pub.url ? ` — <a href="${esc(pub.url)}" target="_blank" rel="noopener">${esc(pub.url)}</a>` : ""}`;
      }
    } catch {}
  } else if (typeof doc.site === "string") {
    pubNoteHtml = `part of <a href="${esc(doc.site)}" target="_blank" rel="noopener">${esc(doc.site)}</a>`;
  }

  const html = fillTemplate(shell, {
    TITLE: esc(title),
    DESCRIPTION: esc(description),
    URL: canonicalUrl,
    OG_IMAGE: esc(ogImage),
    HANDLE: esc(handle),
    DATE: esc(date),
    BODY_HTML: esc(doc.textContent || ""),
    TAGS_HTML: tagsHtml,
    COVER_HTML: coverHtml,
    PUB_NOTE_HTML: pubNoteHtml,
  });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

async function notFoundDocPage(env: Env, request: Request): Promise<Response> {
  const shellRes = await env.ASSETS.fetch(new Request(new URL("/read.html", request.url), { method: "GET" }));
  const shell = await shellRes.text();
  return new Response(shell, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
}

async function renderRead(env: Env, request: Request, rawDid: string, rkey: string): Promise<Response> {
  try {
    const did = decodeURIComponent(rawDid);
    const pdsUrl = await resolvePds(did);
    const { value: doc } = await getRecord(pdsUrl, did, DOC_COLLECTION, rkey);
    const url = `https://commonplace.bisks.net/read/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;
    return await renderDocPage(env, request, did, pdsUrl, doc, url);
  } catch (_) {
    return notFoundDocPage(env, request);
  }
}

// site.standard.document's `path` field is spec'd to combine with the
// publication's `url` into the document's canonical URL (see
// standard.site's document lexicon docs) — readers resolve/verify a post
// by fetching that combined URL, so it has to be a real route, not just
// the bare /pub/<handle> listing page.
async function renderPubDoc(env: Env, request: Request, rawHandle: string, docPath: string): Promise<Response> {
  try {
    const handle = decodeURIComponent(rawHandle).replace(/^@/, "");
    const did = await resolveHandleToDid(handle);
    const pdsUrl = await resolvePds(did);
    const records = await listRecords(pdsUrl, did, DOC_COLLECTION);
    const match = records.find((r: any) => r.value?.path === docPath);
    if (!match) return notFoundDocPage(env, request);
    const url = `https://commonplace.bisks.net/pub/${encodeURIComponent(handle)}${docPath}`;
    return await renderDocPage(env, request, did, pdsUrl, match.value, url);
  } catch (_) {
    return notFoundDocPage(env, request);
  }
}

async function renderPub(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const shellRes = await env.ASSETS.fetch(new Request(new URL("/pub.html", request.url), { method: "GET" }));
  const shell = await shellRes.text();

  try {
    const handle = decodeURIComponent(rawHandle).replace(/^@/, "");
    const did = await resolveHandleToDid(handle);
    const pdsUrl = await resolvePds(did);
    const displayHandle = await resolveHandleForDid(did);

    const records = await listRecords(pdsUrl, did, DOC_COLLECTION);
    const docs = records
      .slice()
      .sort((a, b) => new Date(b.value.publishedAt || 0).getTime() - new Date(a.value.publishedAt || 0).getTime());

    const title = `@${displayHandle} on commonplace`;
    const description = docs.length
      ? `${docs.length} post${docs.length === 1 ? "" : "s"} from @${displayHandle}, written with commonplace.`
      : `@${displayHandle} hasn't published anything with commonplace yet.`;
    const url = `https://commonplace.bisks.net/pub/${encodeURIComponent(handle)}`;

    const docListHtml = docs.length
      ? docs
          .map((r: any) => {
            const rk = r.uri.split("/").pop();
            const date = r.value.publishedAt ? new Date(r.value.publishedAt).toLocaleDateString() : "";
            return `<a class="docrow" href="/read/${encodeURIComponent(did)}/${encodeURIComponent(rk)}">
              <span class="dtitle">${esc(r.value.title || "untitled")}</span>
              <span class="ddate">${esc(date)}</span>
            </a>`;
          })
          .join("")
      : `<p class="empty">nothing published yet.</p>`;

    const html = fillTemplate(shell, {
      TITLE: esc(title),
      DESCRIPTION: esc(description),
      URL: url,
      DOCLIST_HTML: docListHtml,
    });

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=120" },
    });
  } catch (_) {
    return new Response(shell, {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const readMatch = url.pathname.match(/^\/read\/([^/]+)\/([^/]+)\/?$/);
    if (readMatch) return renderRead(env, request, readMatch[1], readMatch[2]);

    const pubDocMatch = url.pathname.match(/^\/pub\/([^/]+)\/([^/].*)$/);
    if (pubDocMatch) {
      const docPath = "/" + pubDocMatch[2].replace(/\/$/, "");
      return renderPubDoc(env, request, pubDocMatch[1], docPath);
    }

    const pubMatch = url.pathname.match(/^\/pub\/([^/]+)\/?$/);
    if (pubMatch) return renderPub(env, request, pubMatch[1]);

    return env.ASSETS.fetch(request);
  },
};
