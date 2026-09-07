// knowyourmuseum Worker — served at the root of knowyourmuseum.bisks.net.
//
// A piece or gallery stamps its own og:title + og:description onto the
// static shell so a shared /piece/<name> or /gallery/<id> link unfurls as
// that specific exhibit rather than one generic card for every URL (same
// pattern as sites/museum's /piece + /wing — see notes/45-sharing-and-virality.md,
// tier 4). Everything else is static: the exhibit catalog is hand-curated
// in public/data/exhibits.json, not generated from anything.
import exhibits from "../public/data/exhibits.json";
import { GALLERIES } from "../public/lib/galleries.js";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

type Exhibit = {
  name: string;
  title: string;
  gallery: string;
  year: string;
  provenance: string;
  medium: string;
  tradition: string;
  reception: string;
};

const EXHIBITS = exhibits as Exhibit[];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function setTag(html: string, re: RegExp, value: string): string {
  return html.replace(re, (_m, pre: string, post: string) => pre + value + post);
}
const TITLE_RE = /(<title>)[^<]*(<\/title>)/i;
const DESC_RE = /(<meta\s+name="description"\s+content=")[^"]*(")/i;
const OG_TITLE_RE = /(<meta\s+property="og:title"\s+content=")[^"]*(")/i;
const OG_DESC_RE = /(<meta\s+property="og:description"\s+content=")[^"]*(")/i;
const OG_URL_RE = /(<meta\s+property="og:url"\s+content=")[^"]*(")/i;
const TW_TITLE_RE = /(<meta\s+name="twitter:title"\s+content=")[^"]*(")/i;
const TW_DESC_RE = /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/i;

function stampMeta(html: string, title: string, desc: string, url: string): string {
  const t = esc(truncate(title, 200));
  const d = esc(truncate(desc, 300));
  const u = esc(url);
  return setTag(
    setTag(
      setTag(setTag(setTag(setTag(html, TITLE_RE, t), DESC_RE, d), OG_TITLE_RE, t), OG_DESC_RE, d),
      OG_URL_RE,
      u,
    ),
    TW_TITLE_RE,
    t,
  ).replace(TW_DESC_RE, (_m, pre: string, post: string) => pre + d + post);
}

// Deliberately fetch "/" rather than env.ASSETS.fetch(request) for the
// dynamic paths below — /piece/<name> and /gallery/<id> have no matching
// static file, so fetching the original request 404s. Fetching "/" keeps
// the address bar on the deep link while still handing back the real shell.
async function shell(env: Env, request: Request): Promise<Response> {
  return env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
}

async function stampedShell(env: Env, request: Request, title: string, desc: string, path: string): Promise<Response> {
  const base = await shell(env, request);
  const html = await base.text();
  const stamped = stampMeta(html, title, desc, `https://knowyourmuseum.bisks.net${path}`);
  return new Response(stamped, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pieceMatch = url.pathname.match(/^\/piece\/([^/]+)\/?$/);
    if (pieceMatch) {
      const name = decodeURIComponent(pieceMatch[1]);
      const piece = EXHIBITS.find((e) => e.name === name);
      if (piece) {
        const desc = `${piece.year} · ${piece.medium}. ${piece.tradition} Full wall text and critical reception at Know Your Museum.`;
        return stampedShell(env, request, `Know Your Museum: ${piece.title}`, desc, `/piece/${encodeURIComponent(piece.name)}`);
      }
    }
    const galleryMatch = url.pathname.match(/^\/gallery\/([^/]+)\/?$/);
    if (galleryMatch) {
      const key = decodeURIComponent(galleryMatch[1]);
      const meta = (GALLERIES as Record<string, { label: string; years: string; description: string }>)[key];
      if (meta) {
        const count = EXHIBITS.filter((e) => e.gallery === key).length;
        const desc = `${meta.description} ${count} piece${count === 1 ? "" : "s"} on display in this gallery.`;
        return stampedShell(env, request, `Know Your Museum: ${meta.label} (${meta.years})`, desc, `/gallery/${encodeURIComponent(key)}`);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
