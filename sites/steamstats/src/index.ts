// steamstats Worker — steamstats.bisks.net
//
// @thegodfungi.bsky.social asked the bot: "Can [you] pull any steam account
// stats?" This is the yes. Steam's official Web API (ISteamUser,
// IPlayerService — level, owned games, playtime) needs a developer API key,
// and buildthis can't touch secrets (see builder/INSTRUCTIONS.md). But two
// *public* Steam Community pages hand back real account data with no key and
// no login, for any profile that isn't set fully private:
//
//   https://steamcommunity.com/id/<vanity>/?xml=1        (or /profiles/<id64>/)
//     — persona name, avatar, online state, privacy state, VAC/trade ban
//     flags, member-since date, real name, location, bio, primary group,
//     and (when the account has played anything in the last two weeks) a
//     mostPlayedGames block with per-game hoursPlayed (recent) and
//     hoursOnRecord (lifetime) — this is the closest thing to "owned games +
//     playtime" available without a key.
//   https://steamcommunity.com/id/<vanity>/badges/        (plain HTML)
//     — Steam quietly dropped XML support here (games?xml=1 now redirects to
//     login entirely), so this is scraped as HTML instead: the page embeds
//     the account's level, XP, and XP-to-next-level as plain text spans
//     (profile_xp_block_*), plus one badge_row per earned badge on page 1.
//
// Both requests happen server-side (this Worker) rather than from the
// browser: neither steamcommunity.com endpoint sends CORS headers, so a
// direct client-side fetch would just fail silently.
//
// Two server routes:
//   /api/stats/<input>   JSON — the parsed stats for one profile
//   /s/<input>            the shareable per-profile page: same static shell,
//                          server-stamped og:title/description/image/url so
//                          every shared result gets its own unfurl card
//                          instead of Bluesky caching one generic card for
//                          every profile (same fix as sites/didscope).
// Everything else falls through to ASSETS.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// --- tiny XML/HTML text extraction ----------------------------------------
// Steam's profile feed is simple, stable, single-level-mostly XML — a regex
// tag-scraper is plenty and needs no dependency. Same approach as the HTML
// scrape of the badges page below.

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

// --- input parsing ---------------------------------------------------------

interface Ident {
  kind: "id" | "profiles";
  value: string;
}

function parseInput(raw: string): Ident | null {
  let s = decodeURIComponent(raw || "").trim();
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

// --- fetching + parsing ----------------------------------------------------

interface RecentGame {
  name: string;
  appid: string | null;
  icon: string | null;
  hoursPlayed2Wk: number | null;
  hoursOnRecord: number | null;
}

export interface SteamStats {
  ok: boolean;
  error?: string;
  input: string;
  steamId64: string | null;
  personaName: string | null;
  profileUrl: string;
  avatar: string | null;
  privacyState: string | null;
  onlineState: string | null;
  stateMessage: string | null;
  vacBanned: boolean;
  tradeBanned: boolean;
  limitedAccount: boolean;
  memberSince: string | null;
  memberSinceDays: number | null;
  location: string | null;
  realName: string | null;
  summary: string | null;
  primaryGroup: { name: string; url: string } | null;
  hoursPlayed2Wk: number | null;
  recentGames: RecentGame[];
  level: number | null;
  xp: number | null;
  xpToNextText: string | null;
  badgeCount: number | null;
}

function stripBb(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchStats(rawInput: string): Promise<SteamStats> {
  const empty: SteamStats = {
    ok: false,
    input: rawInput,
    steamId64: null,
    personaName: null,
    profileUrl: "",
    avatar: null,
    privacyState: null,
    onlineState: null,
    stateMessage: null,
    vacBanned: false,
    tradeBanned: false,
    limitedAccount: false,
    memberSince: null,
    memberSinceDays: null,
    location: null,
    realName: null,
    summary: null,
    primaryGroup: null,
    hoursPlayed2Wk: null,
    recentGames: [],
    level: null,
    xp: null,
    xpToNextText: null,
    badgeCount: null,
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

  const memberSince = tagContent(xml, "memberSince");
  let memberSinceDays: number | null = null;
  if (memberSince) {
    const t = Date.parse(memberSince);
    if (!Number.isNaN(t)) memberSinceDays = Math.floor((Date.now() - t) / 86400000);
  }

  const groupsBlock = tagContent(xml, "groups");
  let primaryGroup: SteamStats["primaryGroup"] = null;
  if (groupsBlock) {
    const primaryMatch = groupsBlock.match(/<group isPrimary="1">([\s\S]*?)<\/group>/);
    if (primaryMatch) {
      const name = tagContent(primaryMatch[1], "groupName");
      const groupPath = tagContent(primaryMatch[1], "groupURL");
      if (name) primaryGroup = { name, url: groupPath ? `https://steamcommunity.com/groups/${groupPath}` : "" };
    }
  }

  const recentGames: RecentGame[] = [];
  const mostPlayedBlock = tagContent(xml, "mostPlayedGames");
  if (mostPlayedBlock) {
    for (const block of allBlocks(mostPlayedBlock, "mostPlayedGame")) {
      const gameLink = tagContent(block, "gameLink");
      const appidMatch = gameLink ? gameLink.match(/\/app\/(\d+)/) : null;
      recentGames.push({
        name: tagContent(block, "gameName") || "unknown game",
        appid: appidMatch ? appidMatch[1] : null,
        icon: tagContent(block, "gameIcon"),
        hoursPlayed2Wk: num(tagContent(block, "hoursPlayed")),
        hoursOnRecord: num(tagContent(block, "hoursOnRecord")),
      });
    }
  }
  recentGames.sort((a, b) => (b.hoursOnRecord || 0) - (a.hoursOnRecord || 0));

  const summaryRaw = tagContent(xml, "summary");

  const stats: SteamStats = {
    ok: true,
    input: rawInput,
    steamId64,
    personaName,
    profileUrl,
    avatar: tagContent(xml, "avatarFull"),
    privacyState,
    onlineState: tagContent(xml, "onlineState"),
    stateMessage: tagContent(xml, "stateMessage"),
    vacBanned: tagContent(xml, "vacBanned") === "1",
    tradeBanned: (tagContent(xml, "tradeBanState") || "None").toLowerCase() !== "none",
    limitedAccount: tagContent(xml, "isLimitedAccount") === "1",
    memberSince,
    memberSinceDays,
    location: tagContent(xml, "location"),
    realName: tagContent(xml, "realname"),
    summary: summaryRaw ? stripBb(summaryRaw).slice(0, 500) : null,
    primaryGroup,
    hoursPlayed2Wk: num(tagContent(xml, "hoursPlayed2Wk")),
    recentGames,
    level: null,
    xp: null,
    xpToNextText: null,
    badgeCount: null,
  };

  // Badges/level page — best-effort. Private profiles 302 back to the plain
  // profile page instead of a login wall, so `redirect: "manual"` plus a
  // status check keeps that from silently mis-parsing the wrong HTML.
  try {
    const res = await fetch(base + "/badges/", {
      headers: { "user-agent": UA },
      redirect: "manual",
      cf: { cacheTtl: 300, cacheEverything: true } as unknown as Record<string, unknown>,
    });
    if (res.status === 200) {
      const html = await res.text();
      const levelMatch = html.match(/friendPlayerLevelNum">(\d+)</);
      const xpMatch = html.match(/profile_xp_block_xp">XP ([\d,]+)/);
      const remainMatch = html.match(/profile_xp_block_remaining">([^<]+)</);
      const badgeCount = (html.match(/class="badge_row/g) || []).length;
      stats.level = levelMatch ? parseInt(levelMatch[1], 10) : null;
      stats.xp = xpMatch ? num(xpMatch[1]) : null;
      stats.xpToNextText = remainMatch ? remainMatch[1].trim() : null;
      stats.badgeCount = badgeCount || null;
    }
  } catch (_) {
    // level/badges are a bonus, not core — leave them null on failure.
  }

  return stats;
}

// --- share page -------------------------------------------------------

const GENERIC_TITLE = "steamstats — pull any Steam account's stats";
const GENERIC_DESC =
  "Paste a Steam vanity name, SteamID64, or profile URL. No API key, no login — level, bans, member-since age, recent games, badges.";
const GENERIC_OG_URL = "https://steamstats.bisks.net/";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

async function renderShare(env: Env, request: Request, rawInput: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const input = decodeURIComponent(rawInput).trim();
  if (!input) return new Response(html, { headers: base.headers });

  try {
    const stats = await fetchStats(input);
    if (!stats.ok || !stats.personaName) {
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
      });
    }

    const bits: string[] = [];
    if (stats.level != null) bits.push(`level ${stats.level}`);
    if (stats.memberSinceDays != null) bits.push(`${Math.floor(stats.memberSinceDays / 365)}y on Steam`);
    if (stats.recentGames.length) bits.push(`playing ${stats.recentGames[0].name}`);
    if (stats.vacBanned) bits.push("VAC banned");

    const title = `steamstats: ${stats.personaName}`;
    const desc = truncate(bits.length ? bits.join(" · ") : "a Steam account, statted out.", 300);
    const ogUrl = `https://steamstats.bisks.net/s/${encodeURIComponent(input)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
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

    const apiMatch = url.pathname.match(/^\/api\/stats\/([^/]+)\/?$/);
    if (apiMatch) {
      const stats = await fetchStats(apiMatch[1]);
      return new Response(JSON.stringify(stats), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" },
      });
    }

    const shareMatch = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (shareMatch) return renderShare(env, request, shareMatch[1]);

    return env.ASSETS.fetch(request);
  },
};
