// didneighbors Worker — bisks.net/didneighbors
//
// Mounted at bisks.net/didneighbors/ — strips the mount prefix before handing
// requests to the static-asset router (see notes/40-new-site-playbook.md),
// same as every other path-mounted site.
//
// One extra server-side job, same shape as sites/didscope: /s/<handle> is a
// real per-person URL so a shared link gets its own og:title/description
// instead of Bluesky's unfurl cache showing one generic card for everyone.
// The catch here is the result isn't deterministic — did:plc identifiers are
// 24-char base32 hashes with no sequential order, so there's no API that
// returns "the DID right before/after this one." There's no complete sorted
// index of every DID on the network for a stateless Worker to consult either.
// So both the client (public/index.html) and this route do the same thing:
// pull a live random sample of real DIDs off the PLC directory's public
// export firehose (plc.directory/export, CORS *), sort the sample plus the
// target DID, and report the closest predecessor/successor found in that
// sample. Re-running the search gets a different (often closer) answer —
// that's inherent to sampling a hash space, not a bug to hide from the OG
// text, so the share copy says "found in a live sample," not "the" neighbor.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/didneighbors";
const MOUNT = "https://bisks.net" + PREFIX;
const API = "https://public.api.bsky.app/xrpc/";
const GENESIS = Date.parse("2022-11-17T00:00:00.000Z");

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

function didUniquePart(did: string): string {
  const parts = did.split(":");
  return parts.length > 2 ? parts.slice(2).join(":") : did;
}

function randomTimestamps(n: number): string[] {
  const now = Date.now();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = GENESIS + Math.random() * (now - GENESIS);
    out.push(new Date(t).toISOString());
  }
  return out;
}

async function sampleWindow(after: string): Promise<string[]> {
  try {
    const res = await fetch(`https://plc.directory/export?count=1000&after=${after}`, {
      cf: { cacheTtl: 0 } as unknown as Record<string, unknown>,
    });
    if (!res.ok) return [];
    const text = await res.text();
    const dids: string[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.operation?.type === "tombstone") continue;
        if (rec.did) dids.push(rec.did);
      } catch (_) {
        // malformed line — skip
      }
    }
    return dids;
  } catch (_) {
    return [];
  }
}

async function sampleDids(windows: number): Promise<Set<string>> {
  const timestamps = randomTimestamps(windows);
  const batches = await Promise.all(timestamps.map(sampleWindow));
  return new Set(batches.flat());
}

function nearest(sample: Set<string>, target: string): { predecessor: string | null; successor: string | null } {
  const arr = [...sample].filter((d) => d !== target).sort();
  if (!arr.length) return { predecessor: null, successor: null };
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const predecessor = arr[lo > 0 ? lo - 1 : arr.length - 1];
  const successor = arr[lo < arr.length ? lo : 0];
  return { predecessor, successor };
}

function commonPrefixLen(a: string, b: string): number {
  const ua = didUniquePart(a), ub = didUniquePart(b);
  let n = 0;
  while (n < ua.length && n < ub.length && ua[n] === ub[n]) n++;
  return n;
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
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "didneighbors — find your closest DIDs on Bluesky";
const GENERIC_DESC =
  "Enter a handle and meet whoever's did:plc sits closest to yours, alphabetically. Meaningless. Delightful.";
const GENERIC_OG_URL = MOUNT + "/";

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  // ASSETS is rooted at the site's own directory ("/"), not the "/didneighbors"
  // mount prefix — the main handler strips the prefix before ever calling
  // ASSETS.fetch, so this base fetch has to target the stripped path too.
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

    const sample = await sampleDids(6);
    const { predecessor, successor } = nearest(sample, did);

    const who = "@" + (profile.handle || handle);
    let desc: string;
    if (predecessor && successor) {
      const predProfile = await xrpc("app.bsky.actor.getProfile", { actor: predecessor }).catch(() => null);
      const succProfile = await xrpc("app.bsky.actor.getProfile", { actor: successor }).catch(() => null);
      const predWho = predProfile ? "@" + predProfile.handle : predecessor;
      const succWho = succProfile ? "@" + succProfile.handle : successor;
      const bestShared = Math.max(commonPrefixLen(did, predecessor), commonPrefixLen(did, successor));
      desc = truncate(
        `${who}'s closest DID neighbors (found live): ${predWho} and ${succWho}. Closest shares ${bestShared} character${bestShared === 1 ? "" : "s"} of the hash. Total strangers, alphabetically adjacent.`,
        300,
      );
    } else {
      desc = truncate(`${who}'s DID is out there somewhere. Go find its neighbors.`, 300);
    }

    const title = `didneighbors: ${who}'s closest DID neighbors`;
    const ogUrl = MOUNT + `/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
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

    // Only strip the mount prefix for requests that actually carry it — a
    // request that arrives through a stale, still-resolving old hostname
    // wouldn't have the prefix, and unconditionally slicing would chop the
    // front off short paths instead (see notes/20-deploy.md, "Migrated-to-
    // path sites").
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }

    if (url.pathname.startsWith(PREFIX + "/")) {
      const stripped = url.pathname.slice(PREFIX.length) || "/";

      // /s/<handle> — a distinct, shareable, per-person URL. Every share
      // gets a fresh live sample, so its og:title/description differ from
      // both the generic card and from whatever the visitor's own browser
      // computes when they load the page.
      const m = stripped.match(/^\/s\/([^/]+)\/?$/);
      if (m) return renderShare(env, request, m[1]);

      url.pathname = stripped;
      return env.ASSETS.fetch(new Request(url, request));
    }

    return env.ASSETS.fetch(request);
  },
};
