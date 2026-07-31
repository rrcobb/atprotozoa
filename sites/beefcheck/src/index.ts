// beefcheck Worker — beefcheck.bisks.net
//
// The read itself runs client-side (public/lib/analysis.js does the real
// work: reply exchange, sentiment, sudden-stop detection). Two things needed
// a server:
//
//   /api/likes?repo=<did>&target=<did> — "did A like B's posts" isn't a
//   queryable AppView endpoint (app.bsky.feed.getLikes goes post -> likers,
//   not actor -> liked-authors). The only way to answer it is to read the
//   liker's own repo: com.atproto.repo.listRecords on the app.bsky.feed.like
//   collection, against their PDS (found via their DID doc), filtered for
//   subjects whose URI's DID matches the target. That's a server-side hop —
//   PDS CORS policy is inconsistent across hosts, and the DID-doc resolution
//   (plc.directory or did:web well-known) is extra round trips the client
//   shouldn't have to make per pair.
//
//   /s/<a>+<b> — a personalized OG share URL per handle pair. A plain static
//   site serves the same index.html no matter who's in the query string, so
//   a link-unfurl cache (Bluesky's included) shows one generic card for
//   every share, forever. Same shape as sites/didscope's and
//   sites/epistemics's /s/<handle>: resolve server-side, run a small
//   hand-duplicated version of the client heuristic (just enough for a
//   one-line verdict, not the full evidence list), stamp personalized
//   og:title/og:description/og:url into the static shell. Duplicated, not
//   imported — copy-don't-abstract applies within one site too.

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

// ---- /api/likes: does <repo> have any app.bsky.feed.like record whose
// subject is a post by <target>? --------------------------------------------

interface DidDoc {
  service?: { id?: string; type?: string; serviceEndpoint?: string }[];
}

async function resolveDidDoc(did: string): Promise<DidDoc> {
  if (did.startsWith("did:plc:")) {
    const res = await fetch("https://plc.directory/" + did, { cf: { cacheTtl: 300 } as unknown as Record<string, unknown> });
    if (!res.ok) throw new Error("plc lookup failed: " + res.status);
    return res.json();
  }
  if (did.startsWith("did:web:")) {
    const domain = did.slice("did:web:".length).split(":").join("/");
    const res = await fetch(`https://${decodeURIComponent(domain)}/.well-known/did.json`, {
      cf: { cacheTtl: 300 } as unknown as Record<string, unknown>,
    });
    if (!res.ok) throw new Error("did:web lookup failed: " + res.status);
    return res.json();
  }
  throw new Error("unsupported did method");
}

function pdsFromDoc(doc: DidDoc): string | null {
  const svc = (doc.service || []).find(
    (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer"
  );
  return (svc && svc.serviceEndpoint) || null;
}

interface LikeMatch {
  createdAt: string;
  subjectUri: string;
}

// Newest-first, up to 3 pages (~300 likes) — enough to catch a real pattern
// of engagement without an unbounded crawl of someone's whole like history.
async function findLikesOf(repoDid: string, targetDid: string): Promise<{ matches: LikeMatch[]; scanned: number }> {
  const doc = await resolveDidDoc(repoDid);
  const pds = pdsFromDoc(doc);
  if (!pds) throw new Error("no PDS in DID doc");

  const matches: LikeMatch[] = [];
  let scanned = 0;
  let cursor: string | undefined;
  const prefix = `at://${targetDid}/`;

  for (let page = 0; page < 3; page++) {
    const params: Record<string, string> = {
      repo: repoDid,
      collection: "app.bsky.feed.like",
      limit: "100",
      reverse: "true",
    };
    if (cursor) params.cursor = cursor;
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?${qs}`, {
      cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
    });
    if (!res.ok) break;
    const data: any = await res.json();
    const records: any[] = data.records || [];
    scanned += records.length;
    for (const r of records) {
      const subjectUri: string | undefined = r.value && r.value.subject && r.value.subject.uri;
      const createdAt: string | undefined = r.value && r.value.createdAt;
      if (subjectUri && createdAt && subjectUri.startsWith(prefix)) {
        matches.push({ createdAt, subjectUri });
      }
    }
    cursor = data.cursor;
    if (!cursor || !records.length) break;
  }

  return { matches, scanned };
}

async function handleLikesApi(url: URL): Promise<Response> {
  const repo = url.searchParams.get("repo") || "";
  const target = url.searchParams.get("target") || "";
  const cors = { "access-control-allow-origin": "*" };
  if (!repo.startsWith("did:") || !target.startsWith("did:")) {
    return new Response(JSON.stringify({ error: "repo and target must be DIDs" }), {
      status: 400,
      headers: { "content-type": "application/json", ...cors },
    });
  }
  try {
    const { matches, scanned } = await findLikesOf(repo, target);
    return new Response(JSON.stringify({ matches, scanned }), {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=120", ...cors },
    });
  } catch (err: any) {
    // A PDS that's down, doesn't speak listRecords, or blocks us isn't fatal
    // to the overall read — the client treats an empty/error result as "no
    // like data available" and leans on replies + follow status instead.
    return new Response(JSON.stringify({ matches: [], scanned: 0, error: String(err && err.message) }), {
      headers: { "content-type": "application/json", "cache-control": "no-cache", ...cors },
    });
  }
}

// ---- /s/<a>+<b>: personalized share preview -------------------------------
// Same POSITIVE/NEGATIVE lexicon as public/lib/analysis.js's sentiment pass,
// and the same reply-detection shape (scan getAuthorFeed for replies whose
// hydrated parent author is the other DID) — trimmed to what a one-line OG
// blurb needs: a rough score, not the full evidence list.

const POSITIVE = ["love", "loved", "great", "amazing", "good", "thanks", "appreciate", "haha", "lol", "lmao", "agree", "based", "fair", "valid", "yeah", "exactly", "beautiful", "awesome", "glad", "happy", "🤝", "❤️", "😂", "🙏"];
const NEGATIVE = ["hate", "hated", "worst", "terrible", "awful", "bad", "stupid", "wrong", "disagree", "cringe", "garbage", "trash", "pathetic", "ridiculous", "shut up", "block", "unfollow", "gross", "ugh", "screw", "🙄", "💀", "🤡"];

function tally(text: string): number {
  const lower = text.toLowerCase();
  let s = 0;
  for (const w of POSITIVE) if (lower.includes(w)) s += 1;
  for (const w of NEGATIVE) if (lower.includes(w)) s -= 1;
  return s;
}

async function scanReplies(did: string, otherDid: string): Promise<{ count: number; sentiment: number; lastAt: string | null }> {
  let count = 0;
  let sentiment = 0;
  let lastAt: string | null = null;
  try {
    const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "50", filter: "posts_with_replies" });
    for (const item of feed.feed || []) {
      const parentAuthor = item.reply && item.reply.parent && item.reply.parent.author && item.reply.parent.author.did;
      if (parentAuthor !== otherDid) continue;
      const text = item.post && item.post.record && item.post.record.text;
      const createdAt = item.post && item.post.record && item.post.record.createdAt;
      count += 1;
      if (text) sentiment += tally(text);
      if (createdAt && (!lastAt || createdAt > lastAt)) lastAt = createdAt;
    }
  } catch (_) {
    // best-effort for a share preview
  }
  return { count, sentiment, lastAt };
}

function verdictFor(score: number): string {
  if (score >= 71) return "yeah, that's beef.";
  if (score >= 41) return "there's something going on here.";
  if (score >= 16) return "a little frosty.";
  return "looking fine, no beef detected.";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "beefcheck — are they beefing?";
const GENERIC_DESC =
  "Enter two Bluesky handles. beefcheck reads their reply and like exchange, mutual-follow status, and reply tone, and flags engagement that was steady and then suddenly stopped.";
const GENERIC_OG_URL = "https://beefcheck.bisks.net/";

async function renderShare(env: Env, request: Request, rawA: string, rawB: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handleA = decodeURIComponent(rawA || "").trim().replace(/^@/, "");
  const handleB = decodeURIComponent(rawB || "").trim().replace(/^@/, "");
  if (!handleA || !handleB) return new Response(html, { headers: base.headers });

  try {
    const resolve = async (h: string) => (h.startsWith("did:") ? h : (await xrpc("com.atproto.identity.resolveHandle", { handle: h })).did);
    const [didA, didB] = await Promise.all([resolve(handleA), resolve(handleB)]);
    const [profileA, profileB] = await Promise.all([
      xrpc("app.bsky.actor.getProfile", { actor: didA }),
      xrpc("app.bsky.actor.getProfile", { actor: didB }),
    ]);

    const [relAtoB, relBtoA, repliesAtoB, repliesBtoA] = await Promise.all([
      xrpc("app.bsky.graph.getRelationships", { actor: didA, others: didB }).catch(() => null),
      xrpc("app.bsky.graph.getRelationships", { actor: didB, others: didA }).catch(() => null),
      scanReplies(didA, didB),
      scanReplies(didB, didA),
    ]);

    const followingAB = !!(relAtoB && relAtoB.relationships && relAtoB.relationships[0] && relAtoB.relationships[0].following);
    const followingBA = !!(relBtoA && relBtoA.relationships && relBtoA.relationships[0] && relBtoA.relationships[0].following);

    const totalReplies = repliesAtoB.count + repliesBtoA.count;
    const sentimentTotal = repliesAtoB.sentiment + repliesBtoA.sentiment;
    let score = 0;
    if (totalReplies > 0) {
      if (!followingAB || !followingBA) score += 30;
      if (sentimentTotal < -2) score += 30;
      else if (sentimentTotal < 0) score += 12;
      const lastAt = [repliesAtoB.lastAt, repliesBtoA.lastAt].filter(Boolean).sort().pop() || null;
      if (lastAt) {
        const days = (Date.now() - Date.parse(lastAt)) / 86400000;
        if (days > 60) score += 20;
      }
      if (repliesAtoB.count === 0 || repliesBtoA.count === 0) score += 10;
    }
    score = Math.max(0, Math.min(100, score));

    const whoA = "@" + (profileA.handle || handleA);
    const whoB = "@" + (profileB.handle || handleB);
    const title = totalReplies === 0
      ? `beefcheck: ${whoA} & ${whoB} — no history found`
      : `beefcheck: ${whoA} & ${whoB} scored ${score}/100`;
    const desc = truncate(
      totalReplies === 0
        ? "No reply exchange found between these two — can't call it beef with zero contact. Full read checks likes too."
        : `${verdictFor(score)} ${totalReplies} replies exchanged, ${followingAB && followingBA ? "still mutuals" : "not mutuals anymore"}. Full read checks likes too.`,
      300
    );
    const ogUrl = `https://beefcheck.bisks.net/s/${encodeURIComponent(handleA)}+${encodeURIComponent(handleB)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve server-side (typo, deleted account, rate limit) —
    // still serve the live page; the client script surfaces its own error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/likes") return handleLikesApi(url);

    // /s/<a>+<b> — the distinct, shareable, per-pair URL.
    const m = url.pathname.match(/^\/s\/([^/+]+)\+([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], m[2]);

    return env.ASSETS.fetch(request);
  },
};
