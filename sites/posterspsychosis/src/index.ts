// poster's psychosis clinic Worker — posterspsychosis.bisks.net
//
// The whole diagnosis still runs client-side (public/index.html does the
// real work: resolve a handle, pull real postsCount/followersCount/
// followsCount from the public AppView, turn them into a stage + symptom
// checklist + printable Rx pad). The one thing that needed a server: shared
// links. A plain static site serves the *same* index.html — same
// og:title/og:description/og:image — no matter whose handle is in the URL,
// so a link-unfurl cache would show one generic card for every share,
// forever. Same fix as sites/didscope: /s/<handle> is a real, distinct URL
// per person. The Worker resolves the handle server-side, computes the same
// stage the client would, and stamps personalized og:title/og:description/
// og:url onto the same page shell before handing it back. Falls through to
// ASSETS for everything else (/, /og.png, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the tables in public/index.html — same reasoning
// as sites/didscope/src/index.ts: server-side duplication within ONE site,
// not a shared package across sites. Only what the OG text needs (stage
// names) made the trip; the client owns the full symptom/doctor pools.
const STAGES: Array<{ max: number; name: string }> = [
  { max: 20, name: "Stage 0 — Prodromal Lurking" },
  { max: 40, name: "Stage I — Incipient Doomscroll" },
  { max: 60, name: "Stage II — Compulsive Threading" },
  { max: 80, name: "Stage III — Main Character Syndrome" },
  { max: 101, name: "Stage IV — Terminal Posting (Post-Independent State)" },
];

function stageFor(score: number): { max: number; name: string } {
  for (const s of STAGES) if (score < s.max) return s;
  return STAGES[STAGES.length - 1];
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
const GENERIC_TITLE = "poster's psychosis clinic — get diagnosed, get a prescription";
const GENERIC_DESC =
  "Enter a Bluesky handle for a clinical diagnosis of Poster's Psychosis, built from your real posting stats, and a printable prescription for the only known cure.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those into "…/s/<handle>og.png" too (same
// gotcha documented in sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://posterspsychosis.bisks.net/"';

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

    const posts = profile.postsCount || 0;
    const score = Math.max(0, Math.min(100, Math.round(Math.log2(posts + 1) * 9)));
    const stage = stageFor(score);

    const who = "@" + (profile.handle || handle);
    const title = `poster's psychosis clinic: ${who} — ${stage.name}`;
    const desc = truncate(
      `Diagnosis on file: ${stage.name}, severity ${score}/100. Rx: post more. See the full chart and print the prescription.`,
      300
    );
    const ogUrl = `https://posterspsychosis.bisks.net/s/${encodeURIComponent(handle)}`;

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
    // script will surface its own "couldn't pull that chart" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handle> — the distinct, shareable, per-person URL. Every diagnosis
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
