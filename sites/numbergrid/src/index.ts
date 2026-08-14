// numbergrid Worker — numbergrid.bisks.net
//
// The board itself is entirely client-side (public/index.html + public/lib/
// board.js do the real reading/writing against the PDS). The one thing that
// needed a server: shared links. A plain static site serves the same
// og:title/og:description for every ?handle=, so Bluesky's link-unfurl cache
// would show one generic card forever no matter whose board got shared (same
// problem didscope solved for handles — see sites/didscope/src/index.ts).
//
// /board/<handle> is a real, distinct URL per person. The Worker resolves
// the handle, reads the same net.bisks.numbergrid.number records the client
// would off their PDS, computes count + mex, and stamps a personalized
// og:title/og:description/og:url onto the same page shell before serving it.
// Falls through to ASSETS for everything else (/, /client-metadata.json,
// /lib/*, /og.png).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const COLLECTION = "net.bisks.numbergrid.number";
const PLC_DIR = "https://plc.directory";
const PUB_API = "https://public.api.bsky.app/xrpc";
const MAX_PAGES = 20;

async function jget(url: string): Promise<any> {
  const r = await fetch(url, { cf: { cacheTtl: 60 } as unknown as Record<string, unknown> });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function resolveDid(handle: string): Promise<string> {
  if (handle.startsWith("did:")) return handle;
  const d = await jget(`${PUB_API}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  if (!d.did) throw new Error("couldn't resolve handle");
  return d.did;
}

async function resolvePds(did: string): Promise<string> {
  let doc: any;
  if (did.startsWith("did:web:")) {
    const host = decodeURIComponent(did.slice("did:web:".length)).replace(/:/g, "/");
    doc = await jget(`https://${host}/.well-known/did.json`);
  } else {
    doc = await jget(`${PLC_DIR}/${encodeURIComponent(did)}`);
  }
  const svc = (doc.service || []).find(
    (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
  );
  if (!svc?.serviceEndpoint) throw new Error("couldn't find PDS");
  return svc.serviceEndpoint;
}

async function fetchValues(did: string, pds: string): Promise<number[]> {
  const base = pds.replace(/\/$/, "");
  const seen = new Set<number>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ repo: did, collection: COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const data = await jget(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
    const records = Array.isArray(data.records) ? data.records : [];
    for (const rec of records) {
      const v = rec?.value?.value;
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) seen.add(v);
    }
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
    if (!cursor || !records.length) break;
  }
  return [...seen].sort((a, b) => a - b);
}

function mex(sortedValues: number[]): number {
  let m = 0;
  for (const v of sortedValues) {
    if (v === m) m++;
    else if (v > m) break;
  }
  return m;
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Matched as a full quoted attribute, not the bare URL — the bare URL is also
// a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (see sites/didscope's history).
const GENERIC_TITLE = "numbergrid — a bingo board for every number you've seen";
const GENERIC_DESC =
  "Sign in with atproto, add every number you spot in the wild, and watch the board grow into the next perfect square.";
const GENERIC_OG_URL_ATTR = 'content="https://numbergrid.bisks.net/"';

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    const did = await resolveDid(handle);
    const pds = await resolvePds(did);
    const values = await fetchValues(did, pds);
    const count = values.length;
    const m = mex(values);
    const mDigits = String(m).length;
    const side = Math.max(1, Math.ceil(Math.sqrt(count)));

    const who = "@" + handle;
    const title = count
      ? `numbergrid: ${who}'s ${side}×${side} board`
      : `numbergrid: ${who}'s board is empty (so far)`;
    const desc = count
      ? `${count.toLocaleString()} number${count === 1 ? "" : "s"} spotted, a ${side}×${side} board. The smallest one ${who} hasn't seen yet is ${m.toLocaleString()} (${mDigits} digit${mDigits === 1 ? "" : "s"}).`
      : `${who} hasn't logged a number yet. The smallest one nobody's seen is always 0 (1 digit) — until it isn't.`;
    const ogUrl = `https://numbergrid.bisks.net/board/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve/read server-side (typo, deleted account, PDS hiccup) —
    // still serve the live page; the client script surfaces its own error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /board/<handle> — the distinct, shareable, per-person URL. Every board
    // gets its own og:title/description/url, so a link unfurler can't
    // collapse them into one cached card.
    const m = url.pathname.match(/^\/board\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
