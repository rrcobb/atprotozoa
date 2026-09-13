// tacocounter Worker — static assets, plus one dynamic route: /b/<did>/<rkey>,
// a board's shareable link. There's no file at that path (a board's id is a
// PDS-assigned TID under its creator's own DID, never written to disk at
// build time), so without a rewrite every shared board link would 404. This
// also stamps real og:title/description onto the page for link-unfurl
// caches (Bluesky's included) — see notes/45-sharing-and-virality.md tier 4
// and sites/shelfguessr/src/index.ts (renderShare) for the pattern this
// copies. The client-side board.html reads the same did/rkey back out of
// location.pathname to render the live page; this is purely for the crawler
// case, so failures here just fall back to the generic static shell.

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const PLC_DIR = "https://plc.directory";
const BOARD_COLLECTION = "net.bisks.tacocounter.board";
const MEMBERSHIP_COLLECTION = "net.bisks.tacocounter.membership";
const CONSTELLATION = "https://constellation.microcosm.blue";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

async function resolvePdsForDid(did: string): Promise<string | null> {
  try {
    let doc: any = null;
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`${PLC_DIR}/${did}`);
      if (r.ok) doc = await r.json();
    } else if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").split(":").join("/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      if (r.ok) doc = await r.json();
    }
    const svc = (doc?.service || []).find(
      (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    return typeof svc?.serviceEndpoint === "string" ? svc.serviceEndpoint : null;
  } catch {
    return null;
  }
}

async function fetchBoardName(did: string, rkey: string): Promise<string | null> {
  const pds = await resolvePdsForDid(did);
  if (!pds) return null;
  const params = new URLSearchParams({ repo: did, collection: BOARD_COLLECTION, rkey });
  const r = await fetch(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
  if (!r.ok) return null;
  const data: any = await r.json().catch(() => null);
  const name = data?.value?.name;
  return typeof name === "string" ? name : null;
}

async function fetchMemberCount(boardUri: string): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      target: boardUri,
      collection: MEMBERSHIP_COLLECTION,
      path: ".board",
      limit: "1000",
    });
    const r = await fetch(`${CONSTELLATION}/links?${params}`);
    if (!r.ok) return null;
    const body: any = await r.json();
    const records = body.linking_records || body.records || [];
    // A crawler-facing teaser only needs "at least N" — don't page through
    // the whole board just to stamp a number on an OG card.
    return Array.isArray(records) ? records.length : null;
  } catch {
    return null;
  }
}

const GENERIC_TITLE = "tacocounter — count your tacos, race your friends";
const GENERIC_DESC =
  "Sign in with Bluesky, log every taco you eat, and start or join a private leaderboard. Every record lives in your own PDS.";
const GENERIC_OG_URL_ATTR = 'content="https://tacocounter.bisks.net/"';

async function renderBoard(env: Env, request: Request, did: string, rkey: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/board.html", request.url), { method: "GET" }));
  let html = await base.text();

  const validDid = /^did:(plc:[a-z2-7]+|web:[a-zA-Z0-9.\-:%]+)$/.test(did);
  const validRkey = /^[a-zA-Z0-9._~-]+$/.test(rkey);
  if (!validDid || !validRkey) {
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const boardUri = `at://${did}/${BOARD_COLLECTION}/${rkey}`;
  const [name, memberCount] = await Promise.all([fetchBoardName(did, rkey), fetchMemberCount(boardUri)]);
  if (!name) {
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const members = memberCount === null ? "some" : `${memberCount}${memberCount === 1000 ? "+" : ""}`;
  const title = truncate(`${name} — a tacocounter leaderboard`, 300);
  const desc = truncate(
    `Join "${name}" on tacocounter: ${members} ${memberCount === 1 ? "person is" : "people are"} racing to eat the most tacos. Sign in with Bluesky to log yours.`,
    300,
  );
  const ogUrl = `https://tacocounter.bisks.net/b/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=120" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/b\/([^/]+)\/([^/]+)\/?$/);
    if (m) return renderBoard(env, request, decodeURIComponent(m[1]), decodeURIComponent(m[2]));

    return env.ASSETS.fetch(request);
  },
};
