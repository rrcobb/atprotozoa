// hashteams Worker — hashteams.bisks.net
//
// Everything real happens client-side (public/app.js): resolving a handle,
// computing the SHA-256 of its DID, and replaying the roster off the
// network. The one thing that needs a server: /team/<n> is a shareable
// permalink to one team's roster, and a plain static site serves the same
// og:title/og:description no matter which team is in the URL — so every
// share collapses into one generic link-unfurl card. Fix, same recipe as
// sites/didscope/src/index.ts's renderShare: stamp the team number into the
// static shell's OG tags server-side before handing it back. The number is
// entirely self-contained (1-65536), so no network call is needed to render
// it — the roster itself still loads client-side same as any other visit.
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

    return env.ASSETS.fetch(request);
  },
};
