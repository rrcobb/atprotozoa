// elopt Worker — served at the root of elopt.bisks.net.
//
// Everything (opt-in, battles, elo, the leaderboard) runs client-side against
// the atproto network: public/lib/oauth.js signs writes straight to the
// signed-in user's own PDS, and public/lib/global-index.js replays every
// net.bisks.elopt.optin / net.bisks.elopt.vote record network-wide
// (com.atproto.sync.listReposByCollection + a live Jetstream tail) to build
// the roster and the leaderboard. The one thing that needs a server: a
// specific vote's shareable link. A plain static site serves the same
// generic og:title/description/url for every share, so Bluesky's unfurl
// cache would show one card forever no matter who won which battle.
//
// Fix: /v/<voterDid>/<rkey> is a real, distinct URL per vote (rkey comes
// from public/lib/vote-key.js's voteRkey — see public/app.js's vote()). The
// Worker reads that one vote record straight off the voter's own PDS and
// stamps a personalized title/description/og:url onto the same page shell,
// same recipe as sites/didscope/src/index.ts. No KV, no Durable Object, no
// Workers AI — everything here is a couple of direct XRPC reads per request.
//
// The consent gate has to hold here too, not just in the client's elo replay
// (public/lib/global-index.js's computeEloBoard): before naming anyone in a
// personalized card, this checks BOTH subjects still carry a live
// net.bisks.elopt.optin record. An account that's opted out is exactly as
// unnameable in a stale shared link as it is in the live leaderboard —
// dropping out of the roster has to retroactively silence old links too, not
// just future replays.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PLC_DIRECTORY = "https://plc.directory";
const API = "https://public.api.bsky.app/xrpc/";

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
      (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    return typeof service?.serviceEndpoint === "string" ? service.serviceEndpoint : null;
  } catch (_) {
    return null;
  }
}

async function getRecord(did: string, collection: string, rkey: string): Promise<any | null> {
  const pds = await resolvePds(did);
  if (!pds) return null;
  const base = pds.replace(/\/$/, "");
  const params = new URLSearchParams({ repo: did, collection, rkey });
  const res = await fetch(`${base}/xrpc/com.atproto.repo.getRecord?${params}`);
  if (!res.ok) return null;
  return res.json();
}

async function isOptedIn(did: string): Promise<boolean> {
  const rec = await getRecord(did, "net.bisks.elopt.optin", "self");
  return !!rec?.value && rec.value.consent === true;
}

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

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

// The static page's title/description phrase is identical across
// <title>/og:*/twitter:*, so one string-replace-all each personalizes the
// whole head — no HTML parser needed.
const GENERIC_TITLE = "elopt — elo, but only for people who consent";
const GENERIC_DESC =
  "a public elo board for bsky posters, but nobody's on it unless they opted themselves in. paste a real thread, vote on who won, only between two consenting accounts.";
// Matched as the full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image URL ("…/og.png"), so a naive split/join on
// it would corrupt that into "…/v/<did>/<rkey>og.png" too (the exact bug
// caught building this same pattern for sites/didscope; see that file's
// GENERIC_OG_URL_ATTR comment).
const GENERIC_OG_URL_ATTR = 'content="https://elopt.bisks.net/"';

async function renderVoteShare(env: Env, request: Request, voterDid: string, rkey: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  const html = await base.text();

  try {
    const rec = await getRecord(voterDid, "net.bisks.elopt.vote", rkey);
    const v = rec?.value;
    if (!v || typeof v.subjectA !== "string" || typeof v.subjectB !== "string") {
      return new Response(html, { headers: base.headers });
    }
    const winnerDid = v.winner === v.subjectA || v.winner === v.subjectB ? v.winner : null;
    if (!winnerDid) return new Response(html, { headers: base.headers });
    const loserDid = winnerDid === v.subjectA ? v.subjectB : v.subjectA;

    const [winnerOk, loserOk] = await Promise.all([isOptedIn(winnerDid), isOptedIn(loserDid)]);
    if (!winnerOk || !loserOk) {
      // Someone in this vote isn't (or isn't currently) opted in — serve the
      // generic card rather than name them.
      return new Response(html, { headers: base.headers });
    }

    const [winnerProfile, loserProfile] = await Promise.all([
      xrpc("app.bsky.actor.getProfile", { actor: winnerDid }),
      xrpc("app.bsky.actor.getProfile", { actor: loserDid }),
    ]);
    const winnerHandle = winnerProfile.handle || winnerDid;
    const loserHandle = loserProfile.handle || loserDid;

    const title = `elopt: @${winnerHandle} beat @${loserHandle}`;
    const desc = truncate(
      `called during a real vote on elopt, between two people who opted themselves in. @${winnerHandle} vs @${loserHandle}.`,
      300,
    );
    const ogUrl = `https://elopt.bisks.net/v/${encodeURIComponent(voterDid)}/${encodeURIComponent(rkey)}`;

    const personalized = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(personalized, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't read the vote record server-side (deleted, bad rkey, PDS
    // unreachable) — still serve the live page so the link isn't dead.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /v/<voterDid>/<rkey> — the distinct, shareable URL for one battle
    // result. Every vote gets its own page (and its own personalized
    // og:title/description/url), so a link-unfurl cache can't collapse them
    // into one generic card.
    const m = url.pathname.match(/^\/v\/([^/]+)\/([^/]+)\/?$/);
    if (m) return renderVoteShare(env, request, decodeURIComponent(m[1]), decodeURIComponent(m[2]));

    return env.ASSETS.fetch(request);
  },
};
