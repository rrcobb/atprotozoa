// gongguo Worker — gongguo.bisks.net
//
// The reading itself runs client-side (public/index.html does the real
// tally). The one thing that needs a server: shared links. A plain static
// site serves the *same* index.html — same og:title/og:description/og:image
// — no matter whose handle is in the query string, so a link-unfurl cache
// (Bluesky's included) shows one generic card forever no matter who shares
// it (same problem sites/didscope hit first; see its src/index.ts).
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side and computes the *observed* half of the score (the
// half derivable from public profile + feed data — the confession checklist
// is client-only state, so a shared link can't carry it), then stamps
// personalized og:title/og:description/og:url onto the same page shell
// before handing it back. Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const API = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

// Kept as a server-side copy of the same word lists and point values in
// public/index.html's computeObserved — same reasoning as sites/didscope's
// src/index.ts: duplication within ONE site, not a shared package across
// sites. Only what the OG text needs made the trip.
const KIND = ["thank you", "thanks", "grateful", "appreciate", "proud of", "congrats", "congratulations", "sorry", "love you", "so kind", "you got this", "take care", "be well"];
const HOSTILE = ["shut up", "idiot", "stupid", "i hate", "screw you", "get lost", "loser", "pathetic", "kill yourself"];
const SOLICIT = ["buy now", "limited time", "dm me for", "click here", "link in bio", "use code", "% off", "discount code"];
const HELPFUL = ["here's how", "psa:", "reminder:", "free resource", "here's a thread", "tl;dr", "pro tip"];

function countHits(text: string, list: string[]): number {
  let n = 0;
  for (const phrase of list) {
    let idx = 0;
    while ((idx = text.indexOf(phrase, idx)) !== -1) {
      n++;
      idx += phrase.length;
    }
  }
  return n;
}

interface Line {
  delta: number;
  label: string;
  tag: string;
}

function computeObserved(profile: any, posts: { text: string; isReply: boolean }[]): { score: number; lines: Line[] } {
  let score = 0;
  const lines: Line[] = [];
  const add = (delta: number, label: string, tag: string) => {
    score += delta;
    lines.push({ delta, label, tag });
  };

  const postsCount = profile.postsCount || 0;
  if (postsCount > 5000) add(-5, `excessive idle speech — ${postsCount} posts and counting`, "雜不善");
  else if (postsCount > 0 && postsCount < 20) add(5, `restraint in speech — a mere ${postsCount} posts`, "口業清淨");

  const followers = profile.followersCount || 0;
  const follows = profile.followsCount || 0;
  if (follows > followers * 2 && follows > 20) add(8, "follows generously, expects little back", "布施法緣");
  if (followers > follows * 5 && followers > 500) add(-8, "courts fame beyond one's following", "貪名");

  if (profile.description && String(profile.description).trim().length > 0) add(3, "presents oneself plainly, bio and all", "坦誠自陳");
  else add(-2, "gives no account of oneself", "身份隱晦");

  if (profile.avatar) add(2, "shows one's true likeness", "示人以真容");
  else add(-2, "hides behind the default egg", "匿名遁世");

  const total = posts.length;
  const replies = posts.filter((p) => p.isReply).length;
  if (total >= 8 && replies / total > 0.6) add(5, "eager and generous in conversation", "熱心應答");

  const allText = posts.map((p) => p.text || "").join(" \n ").toLowerCase();
  const kindHits = countHits(allText, KIND);
  const hostileHits = countHits(allText, HOSTILE);
  const solicitHits = countHits(allText, SOLICIT);
  const helpfulHits = countHits(allText, HELPFUL);

  if (kindHits > 0) add(Math.min(kindHits * 2, 20), `${kindHits} word${kindHits === 1 ? "" : "s"} of open gratitude or kindness`, "仁慈之語");
  if (hostileHits > 0) add(-Math.min(hostileHits * 4, 20), `${hostileHits} turn${hostileHits === 1 ? "" : "s"} of harsh speech`, "口業惡言");
  if (solicitHits > 0) add(-Math.min(solicitHits * 3, 15), `${solicitHits} pitch${solicitHits === 1 ? "" : "es"} for money or attention`, "貪利廣告");
  if (helpfulHits > 0) add(Math.min(helpfulHits * 1, 10), `${helpfulHits} share${helpfulHits === 1 ? "" : "s"} offered for others' benefit`, "利他分享");

  return { score, lines };
}

function tierFor(net: number): [string, string] {
  if (net >= 150) return ["錄仙籍", "Name Entered in the Immortals' Register"];
  if (net >= 80) return ["積善之家", "House of Accumulated Goodness"];
  if (net >= 30) return ["略有盈餘", "Merit Ahead of Demerit, Modestly"];
  if (net >= -29) return ["功過相抵", "Perfectly Balanced, As All Ledgers Should Be"];
  if (net >= -79) return ["宿業未消", "Old Karma, Still Unresolved"];
  if (net >= -149) return ["餓鬼道候補", "Hungry Ghost Realm, Waitlisted"];
  return ["地獄簿有名", "Already Written Into Hell's Register"];
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The static page's title/description/og:url are each identical across
// every <title>/og:*/twitter:* tag, so one string-replace-all each is enough
// to personalize the whole head — no HTML parser needed.
const GENERIC_TITLE = "gongguo — a ledger of merit and demerit for your bluesky account";
const GENERIC_DESC =
  "Scored like a 17th-century Chinese Buddhist self-examination ledger. Enter a handle for an automatic reading off your public activity, then confess the rest yourself.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image URL ("…/og.png"), so a naive split/join on
// it would corrupt that too (caught the hard way on didscope; see its
// src/index.ts and sites/sidenote).
const GENERIC_OG_URL_ATTR = 'content="https://gongguo.bisks.net/"';

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    let did: string;
    if (handle.startsWith("did:")) {
      did = handle;
    } else {
      const r = await xrpc("com.atproto.identity.resolveHandle", { handle });
      did = r.did;
    }
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });

    let posts: { text: string; isReply: boolean }[] = [];
    try {
      const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "50" });
      posts = (feed.feed || []).map((f: any) => ({
        text: typeof f.post?.record?.text === "string" ? f.post.record.text : "",
        isReply: !!f.reply,
      }));
    } catch (_) {
      // feed unavailable — observed score just runs on profile fields alone
    }

    const { score } = computeObserved(profile, posts);
    const [tierName, tierDesc] = tierFor(score);

    const who = "@" + (profile.handle || handle);
    const title = `gongguo: ${who}'s observed ledger stands at ${score >= 0 ? "+" : ""}${score}`;
    const desc = truncate(
      `${tierName} — ${tierDesc}. That's the automatic reading off public activity alone; the full score also weighs a confession checklist only ${who} can fill in.`,
      300
    );
    const ogUrl = `https://gongguo.bisks.net/s/${encodeURIComponent(handle)}`;

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
    // script surfaces its own "couldn't resolve that" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
