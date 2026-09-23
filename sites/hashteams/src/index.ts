// hashteams Worker — hashteams.bisks.net
//
// Everything real happens client-side (public/app.js): resolving a handle,
// computing the SHA-256 of its DID, and replaying the roster off the
// network. Two things need a server, both the same fix: a plain static site
// serves the same og:title/og:description regardless of what's in the URL,
// so every share collapses into one generic link-unfurl card. Same recipe as
// sites/didscope/src/index.ts's renderShare in both cases: stamp the
// specific title/description into the static shell's OG tags server-side
// before handing it back.
//
// - /team/<n> is a shareable permalink to one team's roster. The number is
//   entirely self-contained (1-65536), so no network call is needed to
//   render it — the roster itself still loads client-side same as any other
//   visit.
// - /user/<handle-or-did> is a shareable permalink to one account's computed
//   team (requested by @mfzx.net: /team/<n> existed but there was no
//   equivalent route for an individual account). Unlike /team/<n> this needs
//   a handle resolution and a hash, so it's wrapped in a try/catch: a typo'd
//   or deleted handle still serves the live page rather than a dead link,
//   and the client script surfaces its own "couldn't compute that" error the
//   same way a bad handle typed into the lookup box would.
//
// /mutuals is a third client-rendered view (a signed-in user's mutuals and
// their teams) with no per-visit OG stamping to do — it just needs the same
// index.html shell served at a path with no matching file on disk, since
// this site doesn't set not_found_handling = "single-page-application" in
// wrangler.toml. Serving it explicitly here, same as /team/<n> and
// /user/<...>, keeps that global fallback (and its wider blast radius on
// unrelated 404s) off the table for one route.
//
// Falls through to ASSETS for everything else (/, /og.png, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const GENERIC_TITLE = "hashteams — which of 65536 teams is your DID on?";
const GENERIC_DESC =
  "UTF-8 encode your DID, SHA-256 it, take the first two bytes as a big-endian integer, then add one — that's your team, one of 65536. Enter a handle to compute it and see who else opted into the same team.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those into "…/team/29812og.png" too (the
// exact bug didscope's comment on this same line warns about).
const GENERIC_OG_URL_ATTR = 'content="https://hashteams.bisks.net/"';

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- the methodology, server-side copy of public/lib/team.js -----------------
// (kept as a local copy per sites/logs/src/index.ts's precedent — server-side
// duplication of client logic within ONE site, not a shared package across
// sites; the two must stay in lockstep, which is why both are pinned by
// tests/team.test.mjs against the same worked example.)

async function digestForDid(did: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(did)));
}
function teamFromDigest(digest: Uint8Array): number {
  return ((digest[0] << 8) | digest[1]) + 1;
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim().replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

async function resolveDisplayHandle(did: string): Promise<string | null> {
  try {
    let doc: any = null;
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`https://plc.directory/${did}`);
      if (r.ok) doc = await r.json();
    } else if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").replace(/:/g, "/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      if (r.ok) doc = await r.json();
    }
    const aka = (doc?.alsoKnownAs || []).find((a: string) => a.startsWith("at://"));
    return aka ? aka.slice("at://".length) : null;
  } catch (_) {
    return null;
  }
}

async function resolveToDidAndHandle(input: string): Promise<{ did: string; handle: string } | null> {
  if (input.startsWith("did:")) {
    return { did: input, handle: (await resolveDisplayHandle(input)) || input };
  }
  const r = await fetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(input)}`,
  );
  if (!r.ok) return null;
  const data: any = await r.json();
  return typeof data.did === "string" ? { did: data.did, handle: input } : null;
}

async function renderTeamPage(env: Env, request: Request, team: number): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const title = `team #${team} · hashteams`;
  const desc = `Team #${team} of 65536, sorted from the first two bytes of SHA-256(DID). See who else opted into it, or compute your own at hashteams.bisks.net.`;
  const ogUrl = `https://hashteams.bisks.net/team/${team}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

async function renderUserPage(env: Env, request: Request, rawInput: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const input = cleanHandle(rawInput);
  if (!input) return new Response(html, { headers: base.headers });

  try {
    const resolved = await resolveToDidAndHandle(input);
    if (!resolved) throw new Error("couldn't resolve that handle");
    const team = teamFromDigest(await digestForDid(resolved.did));

    const title = `@${resolved.handle} is on team #${team} · hashteams`;
    const desc = `@${resolved.handle}'s DID hashes to team #${team} of 65536 — UTF-8(did) → SHA-256 → first two bytes, big-endian, +1. Compute your own at hashteams.bisks.net.`;
    const ogUrl = `https://hashteams.bisks.net/user/${encodeURIComponent(input)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the handle server-side (typo, deleted account, rate
    // limit) — still serve the live page so the link isn't dead; the client
    // script surfaces its own "couldn't compute that" error, same as a bad
    // handle typed into the lookup box.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/team\/(\d{1,5})\/?$/);
    if (m) {
      const team = Number(m[1]);
      if (Number.isInteger(team) && team >= 1 && team <= 65536) {
        return renderTeamPage(env, request, team);
      }
    }

    const um = url.pathname.match(/^\/user\/([^/]+)\/?$/);
    if (um) return renderUserPage(env, request, um[1]);

    if (/^\/mutuals\/?$/.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
    }

    return env.ASSETS.fetch(request);
  },
};
