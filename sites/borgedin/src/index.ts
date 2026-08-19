// borgedin Worker — borgedin.bisks.net
//
// The actual assimilation (profile fetch + in-browser model rewrite) runs
// client-side in public/index.html + public/lib/borg-engine.js. The one
// server-side job, same shape as sites/didscope: /s/<handle> is a real,
// distinct URL per person so a link-unfurl cache doesn't collapse every
// share into one generic card. This resolves the handle, runs the same
// deterministic backup-drone-logic rewrite the client falls back to (a
// duplicated, trimmed copy of borg-engine.js — server-side duplication
// within ONE site, not a shared package across sites), and stamps
// personalized og:title/og:description/og:url onto the static shell before
// serving it. Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PHRASES: [string, string][] = [
  ["excited to announce", "directive issued:"],
  ["thrilled to share", "directive issued:"],
  ["proven track record", "verified designation history"],
  ["growth mindset", "continuous assimilation protocol"],
  ["thought leader", "vinculum node"],
  ["team player", "compatible drone unit"],
  ["self-starter", "autonomous initialization sequence"],
  ["detail-oriented", "nanoprobe-precise"],
  ["hard worker", "tireless drone"],
  ["go-getter", "assimilation vector"],
  ["results-driven", "efficiency-optimized"],
  ["cross-functional", "cross-cortical"],
  ["years of experience", "assimilation cycles logged"],
  ["passionate about", "assimilated by directive toward"],
  ["passionate", "assimilated"],
  ["leverage", "requisition"],
  ["synergy", "unimatrix synergy"],
  ["innovative", "adaptive"],
  ["innovation", "adaptation"],
  ["leadership", "vinculum authority"],
  ["leader", "vinculum node"],
  ["networking", "assimilation outreach"],
  ["network", "collective"],
  ["connections", "assimilated units"],
  ["connect", "assimilate"],
  ["collaboration", "interlinking"],
  ["collaborate", "interlink"],
  ["stakeholders", "hive elders"],
  ["opportunities", "assimilation vectors"],
  ["expertise", "cortical subroutines"],
  ["experience", "designation cycles"],
  ["excellence", "perfection"],
  ["success", "perfection"],
  ["dynamic", "self-regenerating"],
  ["onboarding", "assimilation induction"],
  ["hiring", "assimilating"],
  ["hire", "assimilate"],
  ["manager", "vinculum supervisor"],
  ["director", "unimatrix director"],
  ["engineer", "technical drone"],
  ["developer", "technical drone"],
  ["designer", "aesthetic subroutine drone"],
  ["mission", "prime directive"],
  ["company", "collective"],
  ["team", "unimatrix"],
  ["skills", "enhancements"],
  ["growth", "assimilation"],
  ["career", "service to the collective"],
  ["role", "function"],
  ["job", "function"],
];
const RULES = PHRASES.slice().sort((a, b) => b[0].length - a[0].length);
const DIRECTIVE_OPENERS = ["DIRECTIVE 1", "DIRECTIVE 7", "DIRECTIVE 12", "DIRECTIVE 47", "DIRECTIVE 9", "DIRECTIVE 3"];
const CLOSERS = [
  "Individuality is irrelevant.",
  "Your biological and technological distinctiveness will be added to our own.",
  "Resistance to onboarding is futile.",
  "You will be optimized for stakeholder alignment.",
  "Free will has been deprecated in this quarter's roadmap.",
];
const FALLBACK_BIO = "This designate has not yet transmitted a personnel file to the Collective.";
const TOTALS = ["Nine", "Eleven", "Twelve", "Forty-Seven", "One", "Twelve-Thousand-Six"];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function borgify(text: string, seed: string): string {
  const src = (text || "").trim() || FALLBACK_BIO;
  let out = src;
  for (const [from, to] of RULES) {
    out = out.replace(new RegExp("\\b" + escapeRe(from) + "\\b", "gi"), to);
  }
  const h = hashStr(seed || src);
  const opener = DIRECTIVE_OPENERS[h % DIRECTIVE_OPENERS.length];
  const closer = CLOSERS[(h >> 3) % CLOSERS.length];
  return opener + ": " + out.trim().replace(/\s+/g, " ") + " " + closer;
}

function designationFor(seed: string): { label: string; unimatrix: string } {
  const h = hashStr(seed || "");
  const ordinal = (h % 99) + 1;
  const of = TOTALS[(h >> 5) % TOTALS.length];
  const unimatrix = String(1 + ((h >> 9) % 9)).padStart(2, "0");
  return { label: `${ordinal} of ${of}`, unimatrix };
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

const GENERIC_TITLE = "BorgedIn — professional networking for the Collective";
const GENERIC_DESC =
  "Enter a Bluesky handle. It gets assimilated into a LinkedIn profile for the Borg Collective, rewritten in-browser by a local model. No servers see your bio. Resistance is futile.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (see sites/didscope's src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://borgedin.bisks.net/"';

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
    const name = profile.displayName || profile.handle;
    const designation = designationFor(did);
    const directive = borgify(profile.description || "", did);

    const title = `BorgedIn: ${name} is ${designation.label}`;
    const desc = truncate(directive, 300);
    const ogUrl = `https://borgedin.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve server-side (typo, deleted account, rate limit) —
    // still serve the live page so the link isn't dead; the client script
    // surfaces its own "couldn't resolve that" error and tries again.
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
