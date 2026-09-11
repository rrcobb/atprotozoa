// recant Worker — recant.bisks.net
//
// Everything still runs client-side (public/app.js does the real read/write).
// The one server surface: /a/<did>/<rkey> is a real, distinct URL per
// apology. A plain static site would serve the same generic og:title/
// og:description for every apology, so Bluesky's link-unfurl cache would show
// one card forever no matter whose apology got shared (same problem
// sites/didscope's /s/<handle> solves, same fix). This route resolves the
// author's PDS, reads that one record back with com.atproto.repo.getRecord,
// and stamps a personalized title/description/url onto the same static page
// shell before serving it — so every apology gets its own unfurl. Falls
// through to ASSETS for everything else (/, /og.png, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const COLLECTION = "net.bisks.recant.apology";
const PLC_DIRECTORY = "https://plc.directory";
const PUB = "https://api.bsky.app";

async function didDoc(did: string): Promise<any | null> {
  if (did.startsWith("did:plc:")) {
    const res = await fetch(`${PLC_DIRECTORY}/${did}`);
    return res.ok ? res.json() : null;
  }
  if (did.startsWith("did:web:")) {
    const domain = did.slice("did:web:".length).replace(/:/g, "/");
    const res = await fetch(`https://${domain}/.well-known/did.json`);
    return res.ok ? res.json() : null;
  }
  return null;
}

async function resolvePds(did: string): Promise<string | null> {
  try {
    const doc = await didDoc(did);
    const service = (doc?.service || []).find(
      (item: any) => item.id === "#atproto_pds" || item.type === "AtprotoPersonalDataServer",
    );
    return typeof service?.serviceEndpoint === "string" ? service.serviceEndpoint : null;
  } catch (_) {
    return null;
  }
}

async function xrpc(base: string, method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${base.replace(/\/$/, "")}/xrpc/${method}?${qs}`);
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The static page's <title>/og:*/twitter:* tags all carry the same generic
// phrase, so one string-replace-all each personalizes the whole head — no
// HTML parser needed. See sites/didscope/src/index.ts for the same trick.
const GENERIC_TITLE = "recant — a public apology wall";
const GENERIC_DESC =
  "a lot of people assumed OpenAI was at fault over Tristan Buckmaster's Navier-Stokes claims before the facts were in. if that was you, here's a place to say so, publicly, on your own terms.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image URL ("…/og.png"), so a naive split/join on
// it would corrupt that into "…/a/<did>/<rkey>og.png" too (the gotcha
// documented in sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://recant.bisks.net/"';

async function renderShare(env: Env, request: Request, did: string, rkey: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    const pds = await resolvePds(did);
    if (!pds) throw new Error("could not resolve PDS");
    const rec = await xrpc(pds, "com.atproto.repo.getRecord", { repo: did, collection: COLLECTION, rkey });
    const text = typeof rec.value?.text === "string" ? rec.value.text.trim() : "";
    if (!text) throw new Error("empty apology");

    let handle = did;
    try {
      const profile = await xrpc(PUB, "app.bsky.actor.getProfile", { actor: did });
      if (typeof profile.handle === "string") handle = profile.handle;
    } catch (_) {
      // No profile — the bare DID still makes a readable-enough title.
    }

    const title = `recant: @${handle}'s public apology`;
    const desc = truncate(`"${text}"`, 300);
    const ogUrl = `https://recant.bisks.net/a/${did}/${rkey}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve/read that record server-side (bad link, deleted
    // record, unreachable PDS) — still serve the live page so the link isn't
    // dead; the client script surfaces its own "couldn't find that" state.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /a/<did>/<rkey> — one real URL per apology, so a link-unfurler can't
    // collapse every share into the same generic card.
    const m = url.pathname.match(/^\/a\/(did:[^/]+)\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], m[2]);

    return env.ASSETS.fetch(request);
  },
};
