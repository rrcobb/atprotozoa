// typecheck Worker — typecheck.bisks.net
//
// Everything real happens client-side (public/index.html + public/lib/analyze.js):
// download the whole repo, score four axes, render a type. The one thing that
// needs a server: shared links. A static page always serves the same
// og:title/description for every URL, so Bluesky's link-unfurl cache shows
// one generic card no matter whose type got shared (see notes/45-sharing-and-
// virality.md, and sites/didscope/src/index.ts which this is copied from).
//
// The difference from didscope: didscope's reading is a pure function of the
// DID string, cheap to recompute server-side on every unfurl hit. Ours isn't
// — it depends on someone's whole post history, which would mean re-downloading
// and re-parsing a full repo CAR on every link preview, a real cost for a
// frontend-first site. So the client bakes its own already-computed scores
// into the share URL's query string (?t=TYPE&e=..&n=..&f=..&j=..&c=count) when
// it builds the "share your type" link, and this Worker only ever *formats*
// text from numbers that are already in the request. No re-fetch, no re-analysis.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a name-only copy of public/lib/analyze.js's TYPES table — same
// reasoning as sites/didscope/src/index.ts: server-side duplication of
// client data within ONE site, not a shared package across sites. The OG
// description only needs the nickname, not the full blurb.
const TYPE_NAMES: Record<string, string> = {
  INTJ: "The Longform Schemer",
  INTP: "The Reply-Draft Philosopher",
  ENTJ: "The Thread CEO",
  ENTP: "The Well-Actually",
  INFJ: "The Vagueposter Oracle",
  INFP: "The Softlaunch Poet",
  ENFJ: "The Reply-Guy Chaplain",
  ENFP: "The Serial Hyper-Upper",
  ISTJ: "The Changelog Keeper",
  ISFJ: "The Quiet Mod",
  ESTJ: "The Reply-Section Foreman",
  ESFJ: "The Group Chat Glue",
  ISTP: "The Silent Committer",
  ISFP: "The Aesthetic Lurker",
  ESTP: "The Reply Sniper",
  ESFP: "The Main Character",
};

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clampPct(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const GENERIC_TITLE = "typecheck — a personality read on your whole repo";
const GENERIC_DESC =
  "Enter a Bluesky handle. We download every post they've ever made in one shot and run a four-axis personality read off word choice and posting rhythm. Not real science.";
// Matched as a full quoted attribute, not the bare URL — a naive split/join
// on the bare origin would also corrupt the og:image URL ("…/og.png"), same
// gotcha called out in sites/didscope/src/index.ts and sites/sidenote.
const GENERIC_OG_URL_ATTR = 'content="https://typecheck.bisks.net/"';

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const url = new URL(request.url);
  const handle = cleanHandle(rawHandle);
  const type = (url.searchParams.get("t") || "").toUpperCase();
  const e = clampPct(url.searchParams.get("e"));
  const n = clampPct(url.searchParams.get("n"));
  const f = clampPct(url.searchParams.get("f"));
  const j = clampPct(url.searchParams.get("j"));
  const countRaw = url.searchParams.get("c");
  const count = countRaw ? Number(countRaw) : null;

  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));

  if (!handle || !/^[EI][NS][FT][JP]$/.test(type) || e === null || n === null || f === null || j === null) {
    // No (or malformed) precomputed scores — probably a bare handle link, or
    // an old/hand-edited URL. Serve the generic shell; the client will run
    // its own fresh analysis for that handle on load.
    return base;
  }

  let html = await base.text();
  const name = TYPE_NAMES[type] || type;
  const who = "@" + handle;
  const countStr = count && Number.isFinite(count) ? count.toLocaleString("en-US") : null;
  const title = `typecheck: ${who} is ${type} — ${name}`;
  const desc = `${name}.${countStr ? ` Read off ${countStr} posts, whole repo, no pagination.` : ""} ${axisBitsReadable(e, n, f, j)}`;
  const ogUrl = `https://typecheck.bisks.net${url.pathname}${url.search}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${esc(ogUrl)}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

function axisBitsReadable(e: number, n: number, f: number, j: number): string {
  const bit = (pct: number, hi: string, lo: string) => (pct >= 50 ? `${hi} ${pct}%` : `${lo} ${100 - pct}%`);
  return [bit(e, "E", "I"), bit(n, "N", "S"), bit(f, "F", "T"), bit(j, "J", "P")].join(" · ");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handle>?t=TYPE&e=..&n=..&f=..&j=..&c=count — the distinct,
    // shareable, per-result URL. Every combination gets its own preview.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
