// vulnscope Worker — vulnscope.bisks.net
//
// The scan itself runs client-side (public/app.js + public/lib/analyze.js).
// The one thing that needs a server: shared links. A plain static site
// serves the same index.html — same og:title/og:description/og:url — no
// matter whose handle is in the query string, so a link-unfurl cache shows
// one generic card forever no matter who shares it (same problem sites/logs
// and sites/didscope hit; see their src/index.ts).
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle, fetches the same public data the client would, re-derives the
// same vulnerability verdict, and stamps personalized og:title/description/
// url onto the same page shell before serving it. Falls through to ASSETS
// for everything else.
//
// The scoring logic (VULNS weights, normalize, pickVuln, cveFor) is a
// trimmed copy of public/lib/analyze.js — kept in sync by hand, same as
// didscope's SIGNS table duplication. This is one site's own two copies of
// its own logic, not a shared package across sites.

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

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const HYPERBOLE = /\b(literally|actually|always|never|everyone|nobody|no one|insane|unhinged|obsessed|worst|best|dying|deadass|genuinely|100%|so real)\b/gi;
const GRUDGE = /\b(still can'?t believe|never forget|remember when|years later|to this day|still mad|still not over|calling it now|told you so)\b/gi;
const SELF = /\b(i|i'm|im|i've|ive|me|my|mine|myself)\b/gi;

type Vuln = { id: string; cwe: string; name: string; emoji: string; tagline: string; weights: Record<string, number> };

// Weights only — same as public/lib/analyze.js's VULNS, without the
// describe() flavor text the on-page card renders (not needed for OG text).
const VULNS: Vuln[] = [
  { id: "sqli", cwe: "CWE-89", name: "SQL Injection", emoji: "\u{1F489}", tagline: "unsanitized opinions, inserted directly into every thread", weights: { quotes: 0.4, replies: 0.35, hyperbole: 0.25 } },
  { id: "overflow", cwe: "CWE-120", name: "Buffer Overflow", emoji: "\u{1F4A5}", tagline: "way past the character limit you were allocated", weights: { verbosity: 0.5, caps: 0.2, burst: 0.3 } },
  { id: "race", cwe: "CWE-362", name: "Race Condition", emoji: "\u{1F3C1}", tagline: "posts before the lock is acquired", weights: { replies: 0.4, lateNight: 0.3, burst: 0.3 } },
  { id: "npe", cwe: "CWE-476", name: "Null Pointer Dereference", emoji: "\u{1F47B}", tagline: "dereferenced a presence that was never actually there", weights: { lurk: 0.65, reciprocityGap: 0.35 } },
  { id: "loop", cwe: "CWE-835", name: "Infinite Loop", emoji: "\u{1F501}", tagline: "the exit condition was never actually reachable", weights: { repetition: 0.6, grudge: 0.4 } },
  { id: "uaf", cwe: "CWE-416", name: "Use-After-Free", emoji: "\u{1F480}", tagline: "still holding a reference to something that got deallocated", weights: { grudge: 0.55, repetition: 0.2, lateNight: 0.25 } },
  { id: "offbyone", cwe: "CWE-193", name: "Off-by-One Error", emoji: "\u{1F522}", tagline: "almost exactly right, every single time", weights: { verbosity: 0.2, hyperbole: 0.2, caps: 0.15, selfRef: 0.15, repetition: 0.15, replies: 0.15 } },
  { id: "hardcoded", cwe: "CWE-798", name: "Hardcoded Credentials", emoji: "\u{1F511}", tagline: "the same secret, committed in plaintext, every time", weights: { repetition: 0.45, botFollow: 0.3, lurk: 0.25 } },
  { id: "csrf", cwe: "CWE-352", name: "Cross-Site Request Forgery", emoji: "\u{1FA84}", tagline: "executes any request a mutual embeds, no confirmation asked", weights: { reciprocityHigh: 0.5, quotes: 0.3, replies: 0.2 } },
  { id: "zeroday", cwe: "n/a — unpatched, no advisory filed", name: "Zero-Day", emoji: "\u{1F480}\u{1F4BB}", tagline: "nobody saw it coming, including you", weights: { lateNight: 0.5, burst: 0.35, lurk: 0.15 } },
  { id: "traversal", cwe: "CWE-22", name: "Path Traversal", emoji: "\u{1F9ED}", tagline: "../../../ out of whatever directory you were scoped to", weights: { customDomain: 0.6, followImbalance: 0.4 } },
  { id: "overflow-int", cwe: "CWE-190", name: "Integer Overflow", emoji: "\u{1F4C8}", tagline: "wraps around from MAX_INT straight back to catastrophic", weights: { hyperbole: 0.6, caps: 0.4 } },
  { id: "memleak", cwe: "CWE-401", name: "Memory Leak", emoji: "\u{1F6B0}", tagline: "allocates and allocates, frees almost nothing", weights: { followImbalance: 0.5, grudge: 0.3, repetition: 0.2 } },
  { id: "privesc", cwe: "CWE-269", name: "Privilege Escalation", emoji: "\u{1F451}", tagline: "granted itself admin on a thread it was a guest in", weights: { selfRef: 0.6, caps: 0.2, hyperbole: 0.2 } },
  { id: "deser", cwe: "CWE-502", name: "Insecure Deserialization", emoji: "\u{1F4E6}", tagline: "unpacks untrusted objects and just... runs them", weights: { botFollow: 0.65, reciprocityHigh: 0.3 } },
  { id: "xss", cwe: "CWE-79", name: "Cross-Site Scripting", emoji: "\u{1F9EA}", tagline: "injects live, unescaped chaos into pages you don't own", weights: { replies: 0.5, quotes: 0.3, caps: 0.2 } },
];

const BOT_HANDLE = /^[a-z]+[0-9]{2,}\.bsky\.social$/i;

async function graphAll(endpoint: string, key: string, did: string, pages = 3): Promise<any[]> {
  const out: any[] = [];
  let cursor = "";
  for (let p = 0; p < pages; p++) {
    let d: any;
    try {
      d = await xrpc(endpoint, cursor ? { actor: did, limit: "100", cursor } : { actor: did, limit: "100" });
    } catch {
      break;
    }
    out.push(...(d[key] || []));
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

async function scoreVuln(did: string, profile: any): Promise<{ vuln: Vuln; score: number; cvss: number; label: string; postCount: number }> {
  const [feed, follows, followers] = await Promise.all([
    xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "100", filter: "posts_with_replies" }),
    graphAll("app.bsky.graph.getFollows", "follows", did, 2),
    graphAll("app.bsky.graph.getFollowers", "followers", did, 2),
  ]);

  const own = (feed.feed || []).filter((it: any) => !it.reason);
  const reposts = (feed.feed || []).filter((it: any) => it.reason?.$type === "app.bsky.feed.defs#reasonRepost");
  const posts = own.map((it: any) => it.post).filter(Boolean);
  const postCount = posts.length;

  let totalChars = 0, upper = 0, letters = 0, hyperboleHits = 0, grudgeHits = 0, selfRefHits = 0, wordsTotal = 0, lateNightCount = 0;
  const wordCounts = new Map<string, number>();
  for (const p of posts) {
    const t: string = p.record?.text || "";
    totalChars += t.length;
    for (const w of t.split(/\s+/)) {
      const alpha = w.replace(/[^a-zA-Z]/g, "");
      if (alpha.length < 3) continue;
      letters += alpha.length;
      upper += (alpha.match(/[A-Z]/g) || []).length;
    }
    hyperboleHits += (t.match(HYPERBOLE) || []).length;
    grudgeHits += (t.match(GRUDGE) || []).length;
    selfRefHits += (t.match(SELF) || []).length;
    const words = t.toLowerCase().match(/[a-z']{3,}/g) || [];
    wordsTotal += words.length;
    for (const w of words) wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    const h = p.record?.createdAt ? new Date(p.record.createdAt).getUTCHours() : null;
    if (h !== null && h >= 0 && h < 5) lateNightCount++;
  }
  const repetition = wordsTotal ? 1 - wordCounts.size / wordsTotal : 0;
  const avgLen = postCount ? totalChars / postCount : 0;
  const capsRatio = letters ? upper / letters : 0;

  const replyCount = posts.filter((p: any) => p.record?.reply).length;
  const quoteCount = posts.filter((p: any) => {
    const t = p.record?.embed?.$type || "";
    return t === "app.bsky.embed.record" || t === "app.bsky.embed.recordWithMedia";
  }).length;

  const followsCount = profile.followsCount ?? follows.length;
  const followersCount = profile.followersCount ?? followers.length;
  const followerDids = new Set(followers.map((f: any) => f.did));
  const reciprocal = follows.filter((f: any) => followerDids.has(f.did)).length;
  const reciprocityRatio = follows.length ? reciprocal / follows.length : 0;
  const botFollows = follows.filter((f: any) => BOT_HANDLE.test(f.handle || "") || !f.displayName).length;
  const botFollowRatio = follows.length ? botFollows / follows.length : 0;
  const customDomainFollows = follows.filter((f: any) => f.handle && !f.handle.endsWith(".bsky.social")).length;
  const customDomainRatio = follows.length ? customDomainFollows / follows.length : 0;

  const n: Record<string, number> = {
    verbosity: clamp01(avgLen / 240),
    caps: clamp01(capsRatio / 0.12),
    hyperbole: clamp01((postCount ? hyperboleHits / postCount : 0) / 0.5),
    grudge: clamp01((postCount ? grudgeHits / postCount : 0) / 0.08),
    repetition: clamp01((repetition - 0.3) / 0.4),
    replies: clamp01((postCount ? replyCount / postCount : 0) / 0.7),
    quotes: clamp01((postCount ? quoteCount / postCount : 0) / 0.35),
    reposts: clamp01(((feed.feed || []).length ? reposts.length / feed.feed.length : 0) / 0.5),
    selfRef: clamp01((wordsTotal ? (selfRefHits / wordsTotal) * 100 : 0) / 6),
    lateNight: clamp01((postCount ? lateNightCount / postCount : 0) / 0.35),
    followImbalance: clamp01(followsCount / (followersCount + 1) / 3),
    reciprocityHigh: clamp01(reciprocityRatio / 0.6),
    reciprocityGap: clamp01(1 - reciprocityRatio),
    botFollow: clamp01(botFollowRatio / 0.4),
    customDomain: clamp01(customDomainRatio / 0.5),
    burst: 0, // follow-record velocity needs a PDS repo read; skipped server-side to keep /s/ fast
    lurk: clamp01(1 - postCount / 25),
  };

  let best: { vuln: Vuln; score: number } | null = null;
  for (const v of VULNS) {
    let sum = 0, wsum = 0;
    for (const k in v.weights) {
      sum += v.weights[k] * (n[k] ?? 0);
      wsum += Math.abs(v.weights[k]);
    }
    let score = wsum ? sum / wsum : 0;
    score += ((fnv1a(did + "|" + v.id) % 997) / 997) * 0.04;
    if (!best || score > best.score) best = { vuln: v, score };
  }

  const cvss = Math.min(9.8, Math.round((clamp01(best!.score) * 78 + 15)) / 10);
  const label = cvss >= 9 ? "Critical" : cvss >= 7 ? "High" : cvss >= 4 ? "Medium" : "Low";
  return { ...best!, cvss, label, postCount };
}

function cveIdFor(did: string, vulnId: string): string {
  const h = fnv1a(did + "::" + vulnId);
  const year = 2019 + (h % 8);
  const num = 1000 + (h % 89000);
  return `CVE-${year}-${num}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

const GENERIC_TITLE = "vulnscope — what vulnerability are you?";
const GENERIC_DESC =
  "Enter a Bluesky handle. vulnscope reads their posts and outgoing follows off their real atproto repo and files a CVE for the software vulnerability that matches their personality.";
// Matched as a full quoted attribute — the bare "https://vulnscope.bisks.net/"
// is also a prefix of the og:image URL ("…/og.png"), so a naive split/join on
// just the bare URL would corrupt that tag too. Same gotcha as didscope's
// GENERIC_OG_URL_ATTR (see sites/didscope/src/index.ts, sites/sidenote).
const GENERIC_OG_URL_ATTR = 'content="https://vulnscope.bisks.net/"';

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
    const { vuln, cvss, label, postCount } = await scoreVuln(did, profile);
    const cveId = cveIdFor(did, vuln.id);

    const who = "@" + (profile.handle || handle);
    const title = `vulnscope: ${who} has been assigned ${cveId}`;
    const confidence = postCount < 5 ? " (low-confidence — small sample)" : "";
    const desc = truncate(
      `${vuln.emoji} ${vuln.name} (${vuln.cwe}) — ${label} severity, CVSS ${cvss.toFixed(1)}${confidence}. "${vuln.tagline}"`,
      300,
    );
    const ogUrl = `https://vulnscope.bisks.net/s/${encodeURIComponent(handle)}`;

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
    // script surfaces its own "scan failed" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handle> — the distinct, shareable, per-person URL. Every handle
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse every share into one cached generic card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
