// steamtags Worker — mounted at its own custom domain, steamtags.bisks.net
// (moved off the bisks.net/steamtags path route 2026-07-31; see wrangler.toml).
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
// Server routes, at the domain root:
//   /api/search?q=...   proxy Steam's store-search suggest endpoint
//   /api/tags/<appid>   fetch one game's name/art + its tags & votes, JSON
//   /g/<appid>          the shareable per-game page: same static shell,
//                        server-stamped og:title/description/image/url so
//                        every shared result gets its own unfurl card
//                        instead of Bluesky caching one generic card for
//                        every appid (same fix as sites/didscope, sites/windmill).
//   /api/steam/login    redirect into Steam's OpenID 2.0 sign-in
//   /api/steam/callback verify the OpenID response, resolve a persona
//                        name/avatar, bounce back to wherever "connect
//                        Steam" was clicked from (see the "Steam login"
//                        block below)
// Everything else falls through to ASSETS.
//
// Steam login (added 2026-08-01, requested by @7778777.online: "steam login
// and Integration"). This is identity-only — Steam's OpenID 2.0 endpoint
// (steamcommunity.com/openid) hands back a verified SteamID64 with no API
// key needed, so it's a clean fit for a bot build. Pulling someone's actual
// *owned-games list* is a different story: the only Valve endpoint for that
// (IPlayerService/GetOwnedGames) requires a private Web API key tied to a
// Steam account, and the old key-free fallback (the community profile's
// ?xml=1 games feed) now hard-redirects anonymous requests to a login wall
// (confirmed by hand from a build-agent sandbox with live network access —
// every profile tried, public or not, 302s to /login/). No key is available
// here and one can't be provisioned from a build run, so "browse your full
// Steam library" isn't buildable right now. What *is* buildable without a
// key: verifying a real Steam identity (this block), and making the library
// this site already has — the games you've rated — searchable by name, tag,
// or id, which is what "games in your library searchable by..." becomes
// client-side in public/index.html's #libSearch.
//
// Steam identity -> rating integration (added 2026-08-02). The verified
// SteamID64 is no longer purely a decorative badge: public/index.html
// snapshots it onto a library entry the same way it already snapshots
// name/headerImage, so a rating made while steam-verified carries an
// optional `steamid` field into its net.bisks.steamtags.rating record (see
// the lexicon) and shows a small checkmark in "your library". Purely
// informational — nothing server-side reads or trusts it, it's just
// provenance a consumer of the public record could choose to weight.
//
// SteamDB (added 2026-08-02, the "steamdb" half of the same request). No
// public SteamDB API exists to integrate against, so the integration is a
// straightforward link-out: the game card links to
// steamdb.info/app/<appid>/, and the search box now also accepts a pasted
// steamdb.info URL alongside a store URL or bare appid.
//
// Owned-games library (added 2026-08-02). The block above explains why
// "browse your full Steam library" wasn't buildable from this side: Valve's
// own GetOwnedGames needs a private Web API key, and the key-free profile
// XML feed 302s anonymous requests to a login wall. @7778777.online (the
// original requester) has since stood up their own proxy for exactly this —
// steamapi.7778777.online's GET /owned-games/{steamid} — and posted it
// straight into the build thread along with the anti-scraping header it
// wants, explicitly flagging that header value as "not a real secret". That
// unblocks the feature: /api/steam/owned-games proxies to it server-side
// (same shape as the SteamSpy/Store proxying above — keeps the token off
// the client and lets the response get cached briefly), and the client
// renders it as a real "your steam library" list once you've connected
// Steam, each game clicking through into the normal tag-rating flow.
//
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  STEAM_API_TOKEN: string;
}

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

// Carries the upstream status code through to the /api/tags handler below,
// so a 429 from Steam/SteamSpy can be surfaced to the client as a 429 too
// (rather than a generic 404) — that's the signal the client's paced
// fetcher backs off on instead of plowing through its whole queue.
class UpstreamError extends Error {
  status: number;
  constructor(url: string, status: number) {
    super(`${url} -> ${status}`);
    this.status = status;
  }
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { cf: { cacheTtl: 300 } as unknown as Record<string, unknown> });
  if (!res.ok) throw new UpstreamError(url, res.status);
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

// --- owned games (via @7778777.online's steamapi.7778777.online proxy) ---

const STEAM_API_BASE = "https://steamapi.7778777.online";

function isSteamId64(s: string): boolean {
  return /^\d{17}$/.test(s);
}

async function handleOwnedGames(url: URL, env: Env): Promise<Response> {
  const steamid = (url.searchParams.get("steamid") || "").trim();
  if (!isSteamId64(steamid)) return jsonResponse({ error: "bad steamid" }, 400);
  try {
    const res = await fetch(`${STEAM_API_BASE}/owned-games/${steamid}`, {
      headers: { "X-Api-Token": env.STEAM_API_TOKEN },
      cf: { cacheTtl: 300 } as unknown as Record<string, unknown>,
    });
    if (!res.ok) throw new Error(`owned-games -> ${res.status}`);
    const data = await res.json();
    return jsonResponse(data);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || "couldn't reach the owned-games proxy" }, 502);
  }
}

// --- Steam login (OpenID 2.0, no API key) --------------------------------

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";

// Only ever a same-origin relative path ("/g/440", not "//evil.example" or
// an absolute URL) — this rides through Steam's redirect untouched and
// comes straight back in the callback query string, so it must be safe to
// hand to Response.redirect() with nothing else validating it downstream.
function safeReturnPath(raw: string | null): string {
  if (!raw) return "";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "";
  return raw.slice(0, 200);
}

function handleSteamLogin(request: Request): Response {
  const url = new URL(request.url);
  const origin = url.origin;
  const returnTo = safeReturnPath(url.searchParams.get("returnTo"));

  const callback = new URL(`${origin}/api/steam/callback`);
  if (returnTo) callback.searchParams.set("returnTo", returnTo);

  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": callback.toString(),
    "openid.realm": `${origin}/`,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return Response.redirect(`${STEAM_OPENID_ENDPOINT}?${params}`, 302);
}

// Steam echoes back whatever return_to URL we gave it, including our own
// ?returnTo=<path> — so the game page a user was on survives the round
// trip to Steam and back instead of always dumping them on "/".
function steamRedirectBack(origin: string, path: string, extra: Record<string, string>): Response {
  const qp = new URLSearchParams(extra);
  const sep = path.includes("?") ? "&" : "?";
  return Response.redirect(`${origin}${path}${sep}${qp}`, 302);
}

async function handleSteamCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const params = url.searchParams;
  const returnPath = safeReturnPath(params.get("returnTo")) || "/";

  if (params.get("openid.mode") !== "id_res") {
    return steamRedirectBack(origin, returnPath, { steamError: "steam sign-in was cancelled" });
  }

  const claimedId = params.get("openid.claimed_id") || "";
  const idMatch = claimedId.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
  if (!idMatch) {
    return steamRedirectBack(origin, returnPath, { steamError: "steam didn't return a valid identity" });
  }
  const steamid = idMatch[1];

  // Re-post every openid.* param back to Steam verbatim, mode swapped to
  // check_authentication, so Steam confirms the signature is really theirs
  // rather than us trusting whatever query string showed up.
  const verifyParams = new URLSearchParams();
  for (const [k, v] of params) verifyParams.set(k, v);
  verifyParams.set("openid.mode", "check_authentication");

  try {
    const verifyRes = await fetch(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: verifyParams.toString(),
    });
    const verifyText = await verifyRes.text();
    if (!/is_valid\s*:\s*true/.test(verifyText)) {
      return steamRedirectBack(origin, returnPath, { steamError: "steam couldn't verify that sign-in" });
    }
  } catch {
    return steamRedirectBack(origin, returnPath, { steamError: "steam verification request failed" });
  }

  // Best-effort persona name/avatar off the public profile page (plain
  // HTML, no login wall — unlike the ?xml=1 feed). Failing this shouldn't
  // block login; the steamid alone is a valid verified identity.
  let name = "";
  let avatar = "";
  try {
    const profRes = await fetch(`https://steamcommunity.com/profiles/${steamid}/`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; steamtagsbot/1.0; +https://steamtags.bisks.net/)" },
    });
    const html = await profRes.text();
    const nameMatch = html.match(/"personaname":"((?:[^"\\]|\\.)*)"/);
    if (nameMatch) {
      try {
        name = JSON.parse(`"${nameMatch[1]}"`);
      } catch {
        // malformed escape sequence — skip the name, keep the steamid
      }
    }
    const avatarMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (avatarMatch) avatar = avatarMatch[1];
  } catch {
    // profile fetch is a nice-to-have, not required for a valid login
  }

  const extra: Record<string, string> = { steamid };
  if (name) extra.steamname = name;
  if (avatar) extra.steamavatar = avatar;
  return steamRedirectBack(origin, returnPath, extra);
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
const GENERIC_OG_URL = "https://steamtags.bisks.net/";
const GENERIC_OG_IMAGE = "https://steamtags.bisks.net/og.png";

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
    const ogUrl = `https://steamtags.bisks.net/g/${g.appid}`;
    const ogImage = g.headerImage || GENERIC_OG_IMAGE;

    // GENERIC_OG_IMAGE must be replaced before GENERIC_OG_URL — the image
    // string starts with the URL string ("https://steamtags.bisks.net/" is a
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
    const path = url.pathname;

    if (path === "/api/search") return handleSearch(url);

    if (path === "/api/steam/login") return handleSteamLogin(request);
    if (path === "/api/steam/callback") return handleSteamCallback(request);
    if (path === "/api/steam/owned-games") return handleOwnedGames(url, env);

    const tagsMatch = path.match(/^\/api\/tags\/(\d+)\/?$/);
    if (tagsMatch) {
      try {
        const g = await computeGameInfo(tagsMatch[1]);
        return jsonResponse(g);
      } catch (err: any) {
        // Bulk lookups (a 4000+ item wishlist, a large owned-games library)
        // page through this endpoint one appid at a time from the client —
        // if Steam/SteamSpy rate-limit us, tell the client so it can back
        // off and retry rather than treating a 429 the same as "not found".
        if (err instanceof UpstreamError && err.status === 429) {
          return new Response(JSON.stringify({ error: "upstream rate-limited this lookup, retry shortly" }), {
            status: 429,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "access-control-allow-origin": "*",
              "retry-after": "10",
            },
          });
        }
        return jsonResponse({ error: err?.message || "lookup failed" }, 404);
      }
    }

    const shareMatch = path.match(/^\/g\/(\d+)\/?$/);
    if (shareMatch) return renderShare(env, request, shareMatch[1]);

    return env.ASSETS.fetch(request);
  },
};
