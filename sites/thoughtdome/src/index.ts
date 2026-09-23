// thunderdome of thought — served at the root of thoughtdome.bisks.net.
// Everything (the arena, ELO scoring, the leaderboard) runs client-side in
// public/app.js against public/data/concepts.json. The one server job:
// /duel/<concept>/<a>/<b> is a real, distinct URL for a specific matchup
// someone shared ("come settle this"), so its link-unfurl card names the two
// actual framings fighting instead of the generic page's blurb — same
// problem/fix as sites/fortunejar's /f/<id> route. concepts.json is imported
// directly (esbuild bundles JSON imports, see sites/knowyourmuseum/src/index.ts)
// so there's exactly one copy of the content, not a server-side duplicate.

import data from "../public/data/concepts.json";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const GENERIC_TITLE = "thunderdome of thought";
const GENERIC_OG_DESC =
  "Two rival definitions of a contested idea enter the ring. You pick the winner, round after round, and an ELO board keeps score.";
const GENERIC_TWITTER_DESC =
  "Two rival definitions of a contested idea enter the ring. You pick the winner, round after round.";
const GENERIC_OG_URL = "https://thoughtdome.bisks.net/";

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

async function renderDuel(
  env: Env,
  request: Request,
  conceptId: string,
  aId: string,
  bId: string
): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  const html = await base.text();

  const concept = data.concepts.find((c) => c.id === conceptId);
  const a = concept?.senses.find((s) => s.id === aId);
  const b = concept?.senses.find((s) => s.id === bId);
  if (!concept || !a || !b) {
    return new Response(html, { headers: base.headers });
  }

  const title = `${a.framing} vs ${b.framing}: who's right about ${concept.label}?`;
  const ogDesc = truncate(
    `"${a.definition}" (${a.framing}) vs. "${b.definition}" (${b.framing}). Vote in the Thunderdome of Thought.`,
    300
  );
  const twitterDesc = truncate(`${a.framing} vs ${b.framing} on ${concept.label}. Cast the deciding vote.`, 200);
  const url = `https://thoughtdome.bisks.net/duel/${encodeURIComponent(conceptId)}/${encodeURIComponent(
    aId
  )}/${encodeURIComponent(bId)}`;

  const stamped = html
    .split(GENERIC_TITLE)
    .join(esc(title))
    .split(GENERIC_TWITTER_DESC)
    .join(esc(twitterDesc))
    .split(GENERIC_OG_DESC)
    .join(esc(ogDesc))
    .split(GENERIC_OG_URL)
    .join(url);

  return new Response(stamped, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/duel\/([^/]+)\/([^/]+)\/([^/]+)\/?$/);
    if (m) {
      return renderDuel(
        env,
        request,
        decodeURIComponent(m[1]),
        decodeURIComponent(m[2]),
        decodeURIComponent(m[3])
      );
    }
    return env.ASSETS.fetch(request);
  },
};
