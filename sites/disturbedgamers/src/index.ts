// disturbedgamers Worker — disturbedgamers.bisks.net
//
// @fromthewestmeadow.com's ask, across two posts in one thread:
//   1. "Build a site that analyzes public Steam libraries and ranks the most
//      disturbed horror gamers. Score each player by summing log2(1 + hours
//      played) across every horror game, rewarding both breadth and serious
//      playtime without letting one game dominate."
//   2. "Also rank pairs by their shared horror games, using the lower
//      player's logged playtime in each game to find the most disturbingly
//      compatible gamers."
//
// Both land in one site: paste a handful of public Steam profiles, get a
// leaderboard (score = sum of log2(1+hours) over horror games) and a pairs
// table (compatibility = sum of log2(1+min(hoursA,hoursB)) over horror games
// both players share).
//
// Data source, and why it's a *recent*-games leaderboard rather than a full
// one: buildthis can't touch secrets (see builder/INSTRUCTIONS.md), and
// Valve's only owned-games-with-playtime endpoint (IPlayerService/
// GetOwnedGames) needs a private Web API key. sites/steamtags's writeup
// documents the key-free alternative in detail: the public profile feed
// (steamcommunity.com/<id|profiles>/<x>/?xml=1) still serves a
// <mostPlayedGames> block with per-game hoursOnRecord (lifetime) for
// whichever games are currently that account's most-played — capped at
// roughly its ten most-played, and only present at all once an account has
// logged hours somewhere. It's not "every game a player owns", but it's the
// closest thing to real logged playtime obtainable with no key and no login,
// same tradeoff sites/steamstats already made. The UI says so up front.
//
// "Horror game" isn't a Steam store genre (the store's Genres facet has no
// Horror entry) so classification runs off SteamSpy's community tags —
// same public, key-free API sites/steamtags already uses for its tag
// clouds. A game counts as horror if "Horror", "Survival Horror", or
// "Psychological Horror" appears among its ten highest-voted tags.
//
// Two server routes:
//   POST /api/analyze   { profiles: string[] }  ->  the full leaderboard +
//                        pairs JSON (see AnalyzeResult below)
//   /s/<encoded-list>    the shareable results page: same static shell,
//                        server-stamped og:title/description/image/url so a
//                        shared result gets its own unfurl card instead of
//                        Bluesky caching one generic card for every run
//                        (same fix as sites/didscope, sites/steamstats).
// Everything else falls through to ASSETS.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MAX_PROFILES = 10;
const MAX_HORROR_LOOKUPS = 80; // safety valve on distinct appids checked against SteamSpy per request
const HORROR_TAGS = new Set(["horror", "survival horror", "psychological horror"]);
const TAG_LOOKUP_DEPTH = 10; // only the N highest-voted tags count toward classification

// --- tiny XML text extraction ---------------------------------------------
// Same minimal regex scraper as sites/steamstats — Steam's profile feed is
// simple, stable, single-level-mostly XML, no dependency needed.

function unwrapCdata(v: string): string {
  const m = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return (m ? m[1] : v).trim();
}

function tagContent(src: string, name: string): string | null {
  const m = src.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? unwrapCdata(m[1]) : null;
}

function allBlocks(src: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// --- input parsing ----------------------------------------------------------

interface Ident {
  kind: "id" | "profiles";
  value: string;
}

function parseInput(raw: string): Ident | null {
  let s = (raw || "").trim();
  if (!s) return null;

  const urlMatch = s.match(/steamcommunity\.com\/(id|profiles)\/([^/?#\s]+)/i);
  if (urlMatch) {
    return { kind: urlMatch[1].toLowerCase() as "id" | "profiles", value: urlMatch[2] };
  }

  s = s.replace(/^@/, "");
  if (/^\d{15,20}$/.test(s)) return { kind: "profiles", value: s };
  return { kind: "id", value: s };
}

function profileBase(ident: Ident): string {
  return `https://steamcommunity.com/${ident.kind}/${encodeURIComponent(ident.value)}`;
}

// --- profile + recent games -------------------------------------------------

interface PlayerGame {
  appid: string;
  name: string;
  icon: string | null;
  hoursOnRecord: number;
}

interface PlayerProfile {
  ok: boolean;
  error?: string;
  input: string;
  steamId64: string | null;
  personaName: string | null;
  profileUrl: string;
  avatar: string | null;
  privacyState: string | null;
  games: PlayerGame[];
}

async function fetchProfile(rawInput: string): Promise<PlayerProfile> {
  const empty: PlayerProfile = {
    ok: false,
    input: rawInput,
    steamId64: null,
    personaName: null,
    profileUrl: "",
    avatar: null,
    privacyState: null,
    games: [],
  };

  const ident = parseInput(rawInput);
  if (!ident) return { ...empty, error: "type a Steam vanity name, SteamID64, or profile URL" };

  const base = profileBase(ident);

  let xml: string;
  try {
    const res = await fetch(base + "/?xml=1", {
      headers: { "user-agent": UA },
      cf: { cacheTtl: 120, cacheEverything: true } as unknown as Record<string, unknown>,
    });
    if (!res.ok) return { ...empty, profileUrl: base, error: `steam returned ${res.status}` };
    xml = await res.text();
  } catch (_) {
    return { ...empty, profileUrl: base, error: "couldn't reach steam" };
  }

  if (tagContent(xml, "error")) {
    return { ...empty, profileUrl: base, error: "no profile found for that name/ID" };
  }

  const steamId64 = tagContent(xml, "steamID64");
  const personaName = tagContent(xml, "steamID");
  const privacyState = tagContent(xml, "privacyState");
  const customUrl = tagContent(xml, "customURL");
  const profileUrl = customUrl
    ? `https://steamcommunity.com/id/${customUrl}`
    : `https://steamcommunity.com/profiles/${steamId64 || ident.value}`;

  const games: PlayerGame[] = [];
  const mostPlayedBlock = tagContent(xml, "mostPlayedGames");
  if (mostPlayedBlock) {
    for (const block of allBlocks(mostPlayedBlock, "mostPlayedGame")) {
      const gameLink = tagContent(block, "gameLink");
      const appidMatch = gameLink ? gameLink.match(/\/app\/(\d+)/) : null;
      const appid = appidMatch ? appidMatch[1] : null;
      const hoursOnRecord = num(tagContent(block, "hoursOnRecord"));
      if (!appid || hoursOnRecord == null) continue;
      games.push({
        appid,
        name: tagContent(block, "gameName") || "unknown game",
        icon: tagContent(block, "gameIcon"),
        hoursOnRecord,
      });
    }
  }

  if (!steamId64) {
    return { ...empty, profileUrl: base, error: "couldn't resolve that profile" };
  }

  return {
    ok: true,
    input: rawInput,
    steamId64,
    personaName,
    profileUrl,
    avatar: tagContent(xml, "avatarFull"),
    privacyState,
    games,
    error:
      privacyState && privacyState !== "public"
        ? `profile is ${privacyState} — recent games may be hidden`
        : games.length
          ? undefined
          : "no recent playtime visible on this profile",
  };
}

// --- horror classification (SteamSpy community tags) ------------------------

interface HorrorInfo {
  appid: string;
  isHorror: boolean;
}

async function fetchIsHorror(appid: string): Promise<HorrorInfo> {
  try {
    const res = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`, {
      cf: { cacheTtl: 3600, cacheEverything: true } as unknown as Record<string, unknown>,
    });
    if (!res.ok) return { appid, isHorror: false };
    const data: any = await res.json();
    const rawTags: Record<string, number> = data && data.tags && !Array.isArray(data.tags) ? data.tags : {};
    const top = Object.entries(rawTags)
      .filter(([, v]) => typeof v === "number")
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, TAG_LOOKUP_DEPTH)
      .map(([name]) => name.toLowerCase());
    return { appid, isHorror: top.some((t) => HORROR_TAGS.has(t)) };
  } catch (_) {
    return { appid, isHorror: false };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// --- scoring ------------------------------------------------------------

function score(hours: number): number {
  return Math.log2(1 + hours);
}

interface ScoredGame extends PlayerGame {
  points: number;
}

interface AnalyzedPlayer {
  ok: boolean;
  error?: string;
  input: string;
  steamId64: string | null;
  personaName: string | null;
  profileUrl: string;
  avatar: string | null;
  horrorGames: ScoredGame[];
  score: number;
}

interface SharedGame {
  appid: string;
  name: string;
  icon: string | null;
  hoursA: number;
  hoursB: number;
  minHours: number;
  points: number;
}

interface AnalyzedPair {
  a: number; // index into players
  b: number;
  compat: number;
  shared: SharedGame[];
}

interface AnalyzeResult {
  players: AnalyzedPlayer[];
  pairs: AnalyzedPair[];
  truncated: boolean;
}

async function analyze(rawProfiles: string[]): Promise<AnalyzeResult> {
  const seen = new Set<string>();
  const profiles: string[] = [];
  for (const p of rawProfiles) {
    const trimmed = (p || "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    profiles.push(trimmed);
    if (profiles.length >= MAX_PROFILES) break;
  }
  const truncated = rawProfiles.filter((p) => (p || "").trim()).length > profiles.length;

  const fetched = await mapLimit(profiles, 6, fetchProfile);

  const appidSet = new Set<string>();
  for (const p of fetched) for (const g of p.games) appidSet.add(g.appid);
  let appids = Array.from(appidSet);
  const appidsTruncated = appids.length > MAX_HORROR_LOOKUPS;
  appids = appids.slice(0, MAX_HORROR_LOOKUPS);

  const horrorResults = await mapLimit(appids, 8, fetchIsHorror);
  const horrorMap = new Map<string, boolean>();
  for (const h of horrorResults) horrorMap.set(h.appid, h.isHorror);

  const players: AnalyzedPlayer[] = fetched.map((p) => {
    if (!p.ok) {
      return {
        ok: false,
        error: p.error,
        input: p.input,
        steamId64: p.steamId64,
        personaName: p.personaName,
        profileUrl: p.profileUrl,
        avatar: p.avatar,
        horrorGames: [],
        score: 0,
      };
    }
    const horrorGames: ScoredGame[] = p.games
      .filter((g) => horrorMap.get(g.appid))
      .map((g) => ({ ...g, points: score(g.hoursOnRecord) }))
      .sort((a, b) => b.points - a.points);
    return {
      ok: true,
      error: p.error,
      input: p.input,
      steamId64: p.steamId64,
      personaName: p.personaName,
      profileUrl: p.profileUrl,
      avatar: p.avatar,
      horrorGames,
      score: horrorGames.reduce((s, g) => s + g.points, 0),
    };
  });
  players.sort((a, b) => b.score - a.score);

  const pairs: AnalyzedPair[] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const A = players[i];
      const B = players[j];
      if (!A.ok || !B.ok) continue;
      const bByAppid = new Map(B.horrorGames.map((g) => [g.appid, g]));
      const shared: SharedGame[] = [];
      for (const gA of A.horrorGames) {
        const gB = bByAppid.get(gA.appid);
        if (!gB) continue;
        const minHours = Math.min(gA.hoursOnRecord, gB.hoursOnRecord);
        shared.push({
          appid: gA.appid,
          name: gA.name,
          icon: gA.icon,
          hoursA: gA.hoursOnRecord,
          hoursB: gB.hoursOnRecord,
          minHours,
          points: score(minHours),
        });
      }
      if (!shared.length) continue;
      shared.sort((a, b) => b.points - a.points);
      pairs.push({ a: i, b: j, compat: shared.reduce((s, g) => s + g.points, 0), shared });
    }
  }
  pairs.sort((a, b) => b.compat - a.compat);

  return { players, pairs, truncated: truncated || appidsTruncated };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
}

// --- share page --------------------------------------------------------

const GENERIC_TITLE = "disturbedgamers — rank the most disturbed horror gamers";
const GENERIC_DESC =
  "Paste public Steam profiles. Each player is scored by summing log2(1+hours) across every horror game they've logged, then ranked pairwise by their shared horror games using the lower player's playtime.";
const GENERIC_OG_URL = "https://disturbedgamers.bisks.net/";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function fmtScore(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function encodeProfiles(profiles: string[]): string {
  return profiles.map(encodeURIComponent).join(",");
}

function decodeProfiles(encoded: string): string[] {
  return decodeURIComponent(encoded)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function renderShare(env: Env, request: Request, encoded: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const profiles = decodeProfiles(encoded);
  if (!profiles.length) return new Response(html, { headers: base.headers });

  try {
    const result = await analyze(profiles);
    const top = result.players.find((p) => p.ok && p.score > 0);
    const topPair = result.pairs[0];

    let title = "disturbedgamers results";
    let desc = "Ranking the most disturbed horror gamers by logged playtime.";

    if (top) {
      title = `${top.personaName || "unknown"}: ${fmtScore(top.score)} disturbance points`;
      const bits: string[] = [
        `${fmtScore(top.score)} pts across ${top.horrorGames.length} horror game${top.horrorGames.length === 1 ? "" : "s"}`,
      ];
      if (topPair) {
        const A = result.players[topPair.a];
        const B = result.players[topPair.b];
        bits.push(`most disturbingly compatible: ${A.personaName || "?"} + ${B.personaName || "?"} (${fmtScore(topPair.compat)})`);
      }
      desc = bits.join(" · ");
    } else if (topPair) {
      const A = result.players[topPair.a];
      const B = result.players[topPair.b];
      title = `${A.personaName || "?"} + ${B.personaName || "?"}: disturbingly compatible`;
      desc = `${fmtScore(topPair.compat)} compatibility points across ${topPair.shared.length} shared horror game${topPair.shared.length === 1 ? "" : "s"}.`;
    }

    const ogUrl = `https://disturbedgamers.bisks.net/s/${encodeProfiles(profiles)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(truncateText(desc, 300)))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/analyze" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch (_) {
        return jsonResponse({ error: "bad request body" }, 400);
      }
      const profiles = Array.isArray(body?.profiles)
        ? body.profiles.filter((p: unknown) => typeof p === "string")
        : [];
      if (!profiles.length) return jsonResponse({ error: "give at least one Steam profile" }, 400);
      const result = await analyze(profiles);
      return jsonResponse(result);
    }

    const shareMatch = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (shareMatch) return renderShare(env, request, shareMatch[1]);

    return env.ASSETS.fetch(request);
  },
};
