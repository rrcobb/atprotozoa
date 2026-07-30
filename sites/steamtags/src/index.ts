// steamtags Worker — mounted at bisks.net/steamtags/ (see
// notes/40-new-site-playbook.md).
//
// The idea (v3): pick a Steam game, see its community tags — sized and
// annotated by vote count, straight off SteamSpy — then rate for yourself
// how much any given tag actually fits the game, 1-10. No auto-generated
// "does it match the description" score; that's the whole point of this
// revision, the fit judgement is the user's, not a text heuristic's. Ratings
// live client-side only (localStorage), so the server's only job is to hand
// back a game's name/art plus its tags + vote counts.
//
// Steam's official appdetails API doesn't expose user tags — those live on
// SteamSpy's public mirror (steamspy.com/api.php), which scrapes them off
// the store page and keeps vote counts per tag. Both APIs are public, no
// key, and — unlike calling them straight from the browser — neither sends
// CORS headers, so this Worker proxies server-side and the client only ever
// talks to its own /api/*.
//
// Three server routes, all after the "/steamtags" mount prefix is stripped:
//   /api/search?q=...   proxy Steam's store-search suggest endpoint
//   /api/tags/<appid>   fetch one game's name/art + its tags & votes, JSON
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

// --- tags ----------------------------------------------------------------

interface TagInfo {
  name: string;
  votes: number;
  share: number;
}

interface GameInfo {
  appid: number;
  name: string;
  headerImage: string;
  shortDescription: string;
  isFree: boolean;
  tags: TagInfo[];
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

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { cf: { cacheTtl: 300 } as unknown as Record<string, unknown> });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function computeGameInfo(appid: string): Promise<GameInfo> {
  const id = String(parseInt(appid, 10));
  if (!id || id === "NaN") throw new Error("bad appid");

  const [detailsRes, spy] = await Promise.all([
    fetchJson(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english`),
    fetchJson(`https://steamspy.com/api.php?request=appdetails&appid=${id}`).catch(() => null),
  ]);

  const entry = detailsRes[id];
  if (!entry || !entry.success || !entry.data) throw new Error("game not found");
  const data = entry.data;

  const rawTags: Record<string, number> =
    spy && spy.tags && !Array.isArray(spy.tags) ? spy.tags : {};

  const entries = Object.entries(rawTags)
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16);
  if (entries.length === 0) throw new Error("no community tags found for this game");

  const totalVotes = entries.reduce((s, [, v]) => s + v, 0);
  const tags: TagInfo[] = entries.map(([name, votes]) => ({
    name,
    votes,
    share: totalVotes ? votes / totalVotes : 1 / entries.length,
  }));

  return {
    appid: parseInt(id, 10),
    name: data.name,
    headerImage: data.header_image || "",
    shortDescription: htmlToText(data.short_description || ""),
    isFree: !!data.is_free,
    tags,
    totalVotes,
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

const GENERIC_TITLE = "steamtags — rate how well each tag actually fits";
const GENERIC_DESC =
  "Pick any Steam game, see its community tags sized by vote count, and rate for yourself how much each one actually fits — 1 to 10, your call, not an algorithm's.";
const GENERIC_OG_URL = "https://bisks.net/steamtags/";
const GENERIC_OG_IMAGE = "https://bisks.net/steamtags/og.png";

async function renderShare(env: Env, request: Request, appid: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    const g = await computeGameInfo(appid);
    const topTags = g.tags.slice(0, 3).map((t) => t.name);
    const title = `${g.name} on steamtags`;
    const desc = topTags.length
      ? `${g.name}'s top community tags: ${topTags.join(", ")}. Rate how well each one actually fits, 1-10.`
      : `Rate how well ${g.name}'s community tags actually fit, 1-10.`;
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

    const tagsMatch = path.match(/^\/api\/tags\/(\d+)\/?$/);
    if (tagsMatch) {
      try {
        const g = await computeGameInfo(tagsMatch[1]);
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
