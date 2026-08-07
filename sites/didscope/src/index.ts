// didscope Worker — didscope.bisks.net
//
// The whole reading still runs client-side (public/index.html does the real
// work). The one thing that needed a server: shared links. A plain static
// site serves the *same* index.html — same og:title/og:description/og:image —
// no matter whose handle is in the query string, so Bluesky's link-unfurl
// cache shows one generic card for every share, forever (reported by
// @antiali.as / @ver.ooo: the embed can't vary, and the query-string share
// URLs don't read as distinct links to whatever's caching them).
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side, computes the same sun/moon/rising reading the
// client does, and stamps personalized og:title/og:description/og:url onto
// the same page shell before handing it back — so every share gets its own
// cache entry and its own preview text. Falls through to ASSETS for
// everything else (/, /og.png, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the tables in public/index.html — same reasoning as
// sites/logs/src/index.ts: this is server-side duplication of client data
// within ONE site, not a shared package across sites. Only what the OG text
// needs (names + the sun reading) made the trip; the client owns the full
// natal-chart blurbs.
const SIGNS: Record<string, [string, string]> = {
  a: ["The Lurker", "Thirty tabs open, eleven of them this app, logged out."],
  b: ["The Backtester", "Up 4% on paper, down $600 in reality. Let it rip anyway."],
  c: ["The Committer", "You push straight to main and you sleep fine. Actually fine."],
  d: ["The Daemon", "You run in the background of everyone's life, invited or not."],
  e: ["The Edge Case", "Nobody accounted for you and now the whole system is down."],
  f: ["The Forkbomb", "One small idea, nine open terminals, none of them okay."],
  g: ["The Ghostwriter", "Your documentation is always such AI slop. You know. You continue."],
  h: ["The Harness", "Somewhere an agent is running unsupervised. It's you. It's fine."],
  i: ["The Idempotent", "Can be run again and again with no new consequences. Enlightenment, or exhaustion."],
  j: ["The Jailbreaker", "You've tried to get a customer-service chatbot to write Python. You'll try again."],
  k: ["The Kimi Disciple", "Still waiting on the reset. Always waiting on the reset."],
  l: ["The Loom", "Every persistent agent you build must use this word somewhere. Those are the rules."],
  m: ["The Mutual", "Followed back out of guilt eleven months ago. Turned out great, actually."],
  n: ["The Nerd-Sniped", "Went in to talk about computers. It's 4am. You're arguing about type systems."],
  o: ["The OAuth Sufferer", "You have gone through hell, more than once, for a login button nobody asked for."],
  p: ["The Prompt Engineer", "You've said “actually...” to a model more times today than to a person."],
  q: ["The Quiet Quitter", "Turned off like-notifications months ago. Felt good. Would recommend."],
  r: ["The Rate-Limited", "Waiting on a reset that is always about to come out."],
  s: ["The Sleeve", "Money carved into little independent risk-managed pieces. Still losing it all, with structure."],
  t: ["Top Chicken", "Extremely famous, once, within a group of forty people. You remember."],
  u: ["Unhinged Slop", "A personal website nobody asked for, updated more than the actual job."],
  v: ["The Vibe Coder", "You do not read the code. Have never read the code. Deadlines wait for no one."],
  w: ["The Worker", "Deploys on push. Has never once regretted it. (Has regretted it.)"],
  x: ["The Exploit", "Found the one input nobody validated. God help you, you used it."],
  y: ["The Yak Shaver", "Meant to fix one small thing. That was four repos ago."],
  z: ["Toxic Zig", "Got into something specifically because you heard it was toxic. No further questions."],
  "2": ["Second-Order", "Already three moves ahead of a plan that doesn't have a first move yet."],
  "3": ["The 3AM Committer", "Your best code and your worst decisions share a timestamp."],
  "4": ["The 404", "Not remotely accessible via the internet. And yet, somehow, here."],
  "5": ["Five-Turn Agent", "Had a budget. Do not have a budget anymore."],
  "6": ["Sixth Sense Debugger", "Knew it was a race condition before you even opened the logs."],
  "7": ["Lucky Deploy", "Worked first try. Has never fully trusted it since."],
};
const ORDER = Object.keys(SIGNS);

// name-only tables: the OG description just namedrops moon/rising, it doesn't
// need the full blurb the on-page natal chart shows.
const MOON_SIGNS: Record<string, string> = {
  a: "Moon in Screenshotted DMs", b: "Moon in Backlog", c: "Moon in Cold Open",
  d: "Moon in Draft", e: "Moon in Empty State", f: "Moon in Feature Flag",
  g: "Moon in Ghost Read", h: "Moon in Hard Refresh", i: "Moon in Incognito",
  j: "Moon in Private Journal Repo", k: "Moon in Keyboard Shortcut", l: "Moon in Localhost",
  m: "Moon in Muted Thread", n: "Moon in Null", o: "Moon in Open Tab, Unread",
  p: "Moon in Pending Review", q: "Moon in Quiet Mode", r: "Moon in Retry Loop",
  s: "Moon in Stack Trace", t: "Moon in Typing Indicator", u: "Moon in Uptime",
  v: "Moon in Version Control", w: "Moon in Waitlist", x: "Moon in Uncaught Exception",
  y: "Moon in Yesterday's Cache", z: "Moon in Zombie Process",
  "2": "Moon in Second Account", "3": "Moon in 3am Notes App",
  "4": "Moon in 404, Feelings Not Found", "5": "Moon in Five-Second Delay",
  "6": "Moon in Silent Failure", "7": "Moon in Lucky Rollback",
};
const RISING_SIGNS: Record<string, string> = {
  a: "Rising in Avatar Crop", b: "Rising in Bio Link", c: "Rising in Clout-Adjacent",
  d: "Rising in Dark Mode Only", e: "Rising in Extremely Online", f: "Rising in Follow-Back",
  g: "Rising in Good Faith Reply Guy", h: "Rising in Handle Puns", i: "Rising in Invite-Only Energy",
  j: "Rising in Job Title in Bio", k: "Rising in Known in Certain Circles", l: "Rising in Lurker Who Got Caught",
  m: "Rising in Main Character Post", n: "Rising in No Bio, No Pfp", o: "Rising in Old Account Energy",
  p: "Rising in Pinned Post Diplomat", q: "Rising in Quote-Post Reflex", r: "Rising in Reply-Guy Redeemed",
  s: "Rising in Suspiciously Normal", t: "Rising in Threadstarter", u: "Rising in Unverified but Trusted",
  v: "Rising in Vague Subpost", w: "Rising in Welcoming Committee", x: "Rising in Exists Only in Screenshots",
  y: "Rising in Yells Into the Void, Gets Replies", z: "Rising in Zero Posts, Full Following",
  "2": "Rising in Second-Wave Adopter", "3": "Rising in Three-Post Streak",
  "4": "Rising in 4-Digit Follower Count", "5": "Rising in Five-Word Bio",
  "6": "Rising in Sixth Reply in Every Thread", "7": "Rising in Lucky Handle",
};

function keyFor(ch: string, table: Record<string, unknown>): string {
  const key = (ch || "").toLowerCase();
  if (table[key]) return key;
  const hash = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
  return ORDER[hash % ORDER.length] || "a";
}

// everything after "did:<method>:" — same split the client uses to read
// moon/rising off different positions than the sun's trailing char.
function didUniquePart(did: string): string {
  const parts = did.split(":");
  return parts.length > 2 ? parts.slice(2).join(":") : did;
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
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

async function findOmen(did: string): Promise<string | null> {
  try {
    const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "30", filter: "posts_no_replies" });
    const posts = (feed.feed || [])
      .map((f: any) => f.post?.record?.text)
      .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 3);
    if (!posts.length) return null;
    return posts[Math.floor(Math.random() * posts.length)];
  } catch (_) {
    return null;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The static page's title/description phrase and og:url are identical across
// every <title>/og:*/twitter:* tag, so one string-replace-all each is enough
// to personalize the whole head — no HTML parser needed.
const GENERIC_TITLE = "didscope — your DID is your horoscope";
const GENERIC_DESC =
  "Your last DID character was always going to determine your personality. Enter a handle and find out.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it corrupted those into "…/s/<handle>og.png" too (caught
// while copying this pattern into nothoney and skeetin; see sites/sidenote).
const GENERIC_OG_URL_ATTR = 'content="https://didscope.bisks.net/"';

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

    const lastChar = did.slice(-1);
    const key = keyFor(lastChar, SIGNS);
    const [name, reading] = SIGNS[key];

    const uniquePart = didUniquePart(did);
    const risingChar = uniquePart.charAt(0) || lastChar;
    const moonChar = uniquePart.charAt(Math.floor(uniquePart.length / 2)) || lastChar;
    const moonName = MOON_SIGNS[keyFor(moonChar, MOON_SIGNS)];
    const risingName = RISING_SIGNS[keyFor(risingChar, RISING_SIGNS)];

    const omen = await findOmen(did);
    const omenBit = omen ? ` Today's omen: “${truncate(omen, 90)}”` : "";

    const who = "@" + (profile.handle || handle);
    const title = `didscope: ${who} is ${name}`;
    const desc = truncate(`${reading} ☾ ${moonName} · ↑ ${risingName}.${omenBit}`, 300);
    const ogUrl = `https://didscope.bisks.net/s/${encodeURIComponent(handle)}`;

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
    // script will surface its own "couldn't resolve that" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handle> — the distinct, shareable, per-person URL. Every combination
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
