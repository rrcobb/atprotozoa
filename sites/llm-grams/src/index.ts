// llm-grams Worker — llm-grams.bisks.net
//
// The chart itself is entirely client-side (public/index.html + data.js).
// The one server job: /s/<id1,id2,...> is the canonical shareable URL for a
// chart selection, so a link-unfurl cache (Bluesky's included) gets a
// distinct og:title/og:description per combination of terms instead of one
// generic card for every share — same fix as sites/didscope's /s/<handle>,
// minus the network call, since term labels are static.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the curated ids in public/data.js — same reasoning
// as didscope's SIGNS duplication: server-side duplication within ONE site,
// not a shared package across sites. Only what the OG text needs made the
// trip. (The searchable long tail of ~400 real measured words lives only in
// data.js — a custom pick just falls back to the generic card here.)
const LABELS: Record<string, string> = {
  delve: "delve",
  delves: "delves",
  showcasing: "showcasing",
  underscores: "underscores",
  meticulously: "meticulously",
  leveraging: "leveraging",
  garnered: "garnered",
  pivotal: "pivotal",
  crucial: "crucial",
  notably: "notably",
  navigating: "navigating",
  multifaceted: "multifaceted",
  tapestry: "tapestry",
  boasts: "boasts",
  landscape: "the landscape of",
  comprehensive: "comprehensive",
  realm: "realm",
  intricate: "intricate",
  moreover: "moreover",
  paradigm: "paradigm",
  robust: "robust",
  trenchcoat: "wearing a trenchcoat",
};

const GENERIC_TITLE = "llm-grams — real word-frequency charts for the phrases LLMs won't stop using";
const GENERIC_DESC =
  "delve, tapestry, boasts, underscores — charted from real published research measuring how often these words appear in 14M+ PubMed abstracts, 2010-2024. Add 'wearing a trenchcoat,' the one line that's still fake.";
const GENERIC_OG_URL = "https://llm-grams.bisks.net/";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

async function renderShare(env: Env, request: Request, rawIds: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const ids = decodeURIComponent(rawIds)
    .split(",")
    .map((s) => s.trim())
    .filter((id) => LABELS[id])
    .slice(0, 4);

  if (ids.length === 0) {
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  }

  const names = ids.map((id) => LABELS[id]);
  const title = `llm-grams: ${names.join(" vs ")}`;
  const hasTrenchcoat = ids.includes("trenchcoat");
  const desc = truncate(
    hasTrenchcoat
      ? `${names.join(", ")} — real PubMed word-frequency data, 2010-2024. 'wearing a trenchcoat' is in the mix, so everything else is about to get flattened.`
      : `${names.join(", ")} — how often each word actually appears in PubMed abstracts, 2010-2024. Real data, not vibes.`,
    300,
  );
  const ogUrl = `https://llm-grams.bisks.net/s/${ids.map(encodeURIComponent).join(",")}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
