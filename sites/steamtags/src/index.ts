// steamtags Worker — mounted at bisks.net/steamtags/ (see
// notes/40-new-site-playbook.md).
//
// The idea: score how much a Steam game's community tags actually match
// what the game's own store page says about itself. Steam's official
// appdetails API doesn't expose user tags — those live on SteamSpy's public
// mirror (steamspy.com/api.php), which scrapes them off the store page and
// keeps vote counts per tag. Both APIs are public, no key, and — unlike
// calling them straight from the browser — neither sends CORS headers, so
// this Worker proxies/computes server-side and the client only ever talks
// to its own /api/*.
//
// Three server routes, all after the "/steamtags" mount prefix is stripped:
//   /api/search?q=...   proxy Steam's store-search suggest endpoint
//   /api/score/<appid>  fetch + score one game, return JSON
//   /g/<appid>          the shareable per-game page: same static shell,
//                        server-stamped og:title/description/image/url so
//                        every shared result gets its own unfurl card
//                        instead of Bluesky caching one generic card for
//                        every appid (same fix as sites/didscope, sites/windmill).
// Everything else falls through to ASSETS.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/steamtags";

// --- scoring -----------------------------------------------------------

const STOPWORDS = new Set([
  "and", "or", "the", "a", "an", "of", "to", "in", "for", "with", "on",
  "your", "you", "its", "it", "at", "as", "by", "is", "are", "this", "that",
]);

interface TagResult {
  name: string;
  votes: number;
  share: number;
  state: "matched" | "partial" | "missing";
  credit: number;
}

interface ScoreResult {
  score: number;
  tags: TagResult[];
  totalVotes: number;
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function scoreGame(corpus: string, rawTags: Record<string, number>): ScoreResult | null {
  const entries = Object.entries(rawTags)
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  if (entries.length === 0) return null;

  const totalVotes = entries.reduce((s, [, v]) => s + v, 0);
  const useEvenWeight = totalVotes === 0;

  let weightSum = 0;
  let creditSum = 0;

  const tags: TagResult[] = entries.map(([name, votes]) => {
    const weight = useEvenWeight ? 1 : votes;
    const norm = normalizeTag(name);
    const words = norm.split(" ").filter((w) => w.length >= 3 && !STOPWORDS.has(w));
    const sig = words.length ? words : norm ? [norm] : [];

    let state: TagResult["state"];
    let credit: number;
    if (norm && corpus.includes(norm)) {
      state = "matched";
      credit = 1;
    } else {
      const matchedCount = sig.filter((w) => corpus.includes(w)).length;
      const ratio = sig.length ? matchedCount / sig.length : 0;
      if (sig.length > 0 && ratio >= 0.999) {
        state = "matched";
        credit = 1;
      } else if (ratio > 0) {
        state = "partial";
        credit = 0.5;
      } else {
        state = "missing";
        credit = 0;
      }
    }

    weightSum += weight;
    creditSum += weight * credit;

    return {
      name,
      votes,
      share: totalVotes ? votes / totalVotes : 1 / entries.length,
      state,
      credit,
    };
  });

  const score = weightSum ? Math.round((100 * creditSum) / weightSum) : 0;
  return { score, tags, totalVotes };
}

function verdictFor(score: number): { title: string; blurb: string } {
  if (score >= 90) return { title: "Certified Accurate", blurb: "the tags aren't lying to you." };
  if (score >= 75) return { title: "Mostly Honest", blurb: "a couple of vibes tags snuck in." };
  if (score >= 55) return { title: "Some Assembly Required", blurb: "half truth, half community hopium." };
  if (score >= 35) return { title: "Vibes-Based Tagging", blurb: "more mood board than description." };
  if (score >= 15) return { title: "Community Fan Fiction", blurb: "the tags are writing a different game." };
  return { title: "Tag Salad", blurb: "none of this is in the store page. iconic." };
}

interface GameScore {
  appid: number;
  name: string;
  headerImage: string;
  shortDescription: string;
  isFree: boolean;
  score: number;
  verdict: { title: string; blurb: string };
  tags: TagResult[];
  totalVotes: number;
  matchedCount: number;
  tagCount: number;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { cf: { cacheTtl: 300 } as unknown as Record<string, unknown> });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function computeGameScore(appid: string): Promise<GameScore> {
  const id = String(parseInt(appid, 10));
  if (!id || id === "NaN") throw new Error("bad appid");

  const [detailsRes, spy] = await Promise.all([
    fetchJson(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english`),
    fetchJson(`https://steamspy.com/api.php?request=appdetails&appid=${id}`).catch(() => null),
  ]);

  const entry = detailsRes[id];
  if (!entry || !entry.success || !entry.data) throw new Error("game not found");
  const data = entry.data;

  const corpus = htmlToText(
    [
      data.name,
      data.short_description,
      data.about_the_game,
      data.detailed_description,
      (data.genres || []).map((g: any) => g.description).join(" "),
      (data.categories || []).map((c: any) => c.description).join(" "),
    ]
      .filter(Boolean)
      .join(" \n ")
  ).toLowerCase();

  const rawTags: Record<string, number> =
    spy && spy.tags && !Array.isArray(spy.tags) ? spy.tags : {};

  const scored = scoreGame(corpus, rawTags);
  if (!scored) throw new Error("no community tags found for this game");

  const matchedCount = scored.tags.filter((t) => t.state === "matched").length;

  return {
    appid: parseInt(id, 10),
    name: data.name,
    headerImage: data.header_image || "",
    shortDescription: data.short_description || "",
    isFree: !!data.is_free,
    score: scored.score,
    verdict: verdictFor(scored.score),
    tags: scored.tags,
    totalVotes: scored.totalVotes,
    matchedCount,
    tagCount: scored.tags.length,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
}

async function handleSearch(url: URL): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return jsonResponse({ results: [] });
  try {
    const data = await fetchJson(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=us&l=english`
    );
    const results = (data.items || [])
      .filter((it: any) => it.type === "app")
      .slice(0, 8)
      .map((it: any) => ({ appid: it.id, name: it.name, image: it.tiny_image }));
    return jsonResponse({ results });
  } catch (_) {
    return jsonResponse({ results: [] });
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "steamtags — does the game live up to its own tags?";
const GENERIC_DESC =
  "Pick any Steam game and see how many of its top community tags actually show up in its own store description. Some games are exactly what it says on the tin. Most are not.";
const GENERIC_OG_URL = "https://bisks.net/steamtags/";
const GENERIC_OG_IMAGE = "https://bisks.net/steamtags/og.png";

async function renderShare(env: Env, request: Request, appid: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    const g = await computeGameScore(appid);
    const title = `${g.name} scores ${g.score}% on steamtags`;
    const desc = `${g.verdict.title} — ${g.matchedCount}/${g.tagCount} of its top Steam tags actually show up in ${g.name}'s own store description. ${g.verdict.blurb}`;
    const ogUrl = `https://bisks.net/steamtags/g/${g.appid}`;
    const ogImage = g.headerImage || GENERIC_OG_IMAGE;

    // GENERIC_OG_IMAGE must be replaced before GENERIC_OG_URL — the image
    // string starts with the URL string ("https://bisks.net/steamtags/" is a
    // prefix of ".../og.png"), so replacing the shorter one first would eat
    // the front of the image string too and leave "og.png" dangling.
    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc.slice(0, 300)))
      .split(GENERIC_OG_IMAGE).join(ogImage)
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the appid server-side (bad id, delisted game, Steam
    // hiccup) — still serve the live page so the link isn't dead; the
    // client script surfaces its own "couldn't find that game" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }

    const path = url.pathname.startsWith(PREFIX + "/") ? url.pathname.slice(PREFIX.length) : url.pathname;

    if (path === "/api/search") return handleSearch(url);

    const scoreMatch = path.match(/^\/api\/score\/(\d+)\/?$/);
    if (scoreMatch) {
      try {
        const g = await computeGameScore(scoreMatch[1]);
        return jsonResponse(g);
      } catch (err: any) {
        return jsonResponse({ error: err?.message || "lookup failed" }, 404);
      }
    }

    const shareMatch = path.match(/^\/g\/(\d+)\/?$/);
    if (shareMatch) return renderShare(env, request, shareMatch[1]);

    const assetUrl = new URL(request.url);
    assetUrl.pathname = path;
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};
