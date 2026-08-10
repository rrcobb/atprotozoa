// favoritism Worker — favoritism.bisks.net
//
// The real read runs client-side (public/lib/car.js downloads each account's
// whole repo as one CAR, so app.bsky.feed.like records for their *entire*
// history are available — no recent-window cap). Two things needed a server,
// same shape as sites/beefcheck (this site's lineage):
//
//   /api/likes?repo=<did>&target=<did> — fallback for an account whose full
//   repo CAR download fails client-side. "did A like B's posts" isn't a
//   queryable AppView endpoint (app.bsky.feed.getLikes goes post -> likers,
//   not actor -> liked-authors). The only way to answer it server-side is to
//   read the liker's own repo: com.atproto.repo.listRecords on the
//   app.bsky.feed.like collection, against their PDS (found via their DID
//   doc), filtered for subjects whose URI's DID matches the target. Capped at
//   a few pages, newest-first — a fallback only kicks in when the full CAR
//   download already failed, so this doesn't need to be exhaustive too.
//
//   /s/<a>+<b> — a personalized OG share URL per handle pair. A plain static
//   site serves the same index.html no matter who's in the query string, so
//   a link-unfurl cache (Bluesky's included) shows one generic card for
//   every share, forever. Resolve server-side, run a capped version of the
//   same like-count read (good enough for a one-line teaser, not the full
//   feed), stamp personalized og:title/og:description/og:url into the
//   static shell.

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

// ---- /api/likes: how many app.bsky.feed.like records does <repo> have
// whose subject is a post by <target>? ---------------------------------

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

// Newest-first, up to 8 pages (~800 likes) — the fallback path only runs
// when a full repo CAR download already failed, so this leans a bit deeper
// than a pure teaser read to still land a reasonable total.
async function findLikesOf(repoDid: string, targetDid: string): Promise<{ matches: LikeMatch[]; scanned: number }> {
  const doc = await resolveDidDoc(repoDid);
  const pds = pdsFromDoc(doc);
  if (!pds) throw new Error("no PDS in DID doc");

  const matches: LikeMatch[] = [];
  let scanned = 0;
  let cursor: string | undefined;
  const prefix = `at://${targetDid}/`;

  for (let page = 0; page < 8; page++) {
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
    // like data available for that side" rather than failing the whole run.
    return new Response(JSON.stringify({ matches: [], scanned: 0, error: String(err && err.message) }), {
      headers: { "content-type": "application/json", "cache-control": "no-cache", ...cors },
    });
  }
}

// ---- /s/<a>+<b>: personalized share preview -------------------------------
// A capped like-count read (same findLikesOf as the fallback above, 8 pages
// each direction) — plenty for a one-line teaser blurb; the live page does
// the exhaustive full-history read.

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "favoritism — who likes who more?";
const GENERIC_DESC =
  "Enter two Bluesky handles. favoritism reads each account's whole like history and shows who likes the other's posts more — every liked post, with its reply context, laid out side by side.";
const GENERIC_OG_URL = "https://favoritism.bisks.net/";

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

    const [likesAtoB, likesBtoA] = await Promise.all([
      findLikesOf(didA, didB).catch(() => ({ matches: [], scanned: 0 })),
      findLikesOf(didB, didA).catch(() => ({ matches: [], scanned: 0 })),
    ]);

    const nAtoB = likesAtoB.matches.length;
    const nBtoA = likesBtoA.matches.length;
    const whoA = "@" + (profileA.handle || handleA);
    const whoB = "@" + (profileB.handle || handleB);

    let title: string;
    let desc: string;
    if (nAtoB === 0 && nBtoA === 0) {
      title = `favoritism: ${whoA} & ${whoB} — no likes found either way`;
      desc = "Neither side has liked the other's posts, at least not recently. Full read checks their entire like history.";
    } else {
      const sign = nAtoB === nBtoA ? "=" : nAtoB > nBtoA ? ">" : "<";
      title = `favoritism: ${whoA} ${sign} ${whoB} — ${nAtoB} vs ${nBtoA} likes`;
      const leader = nAtoB === nBtoA ? "it's dead even" : nAtoB > nBtoA ? `${whoA} likes ${whoB} more` : `${whoB} likes ${whoA} more`;
      desc = `${leader} — ${nAtoB} likes from ${whoA}, ${nBtoA} from ${whoB}. Full read shows every liked post side by side, with thread context.`;
    }
    desc = truncate(desc, 300);
    const ogUrl = `https://favoritism.bisks.net/s/${encodeURIComponent(handleA)}+${encodeURIComponent(handleB)}`;

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
