// witness Worker — served at the root of witness.bisks.net.
// Every entry is a plain net.bisks.witness.entry record the browser writes to
// the *poster's own* PDS; the feed, category filters, and duplicate-report
// tally are all computed client-side by replaying every repo's entries
// network-wide (public/lib/global-index.js). No KV, no Durable Object, no
// server-side state at all — this Worker is a pure static-asset passthrough,
// with one exception below.
//
// /entry/<did>/<rkey> — a permalink to one witnessed entry
// (notes/45-sharing-and-virality.md, tier 4: "everything shareable gets its
// own URL"). A static shell serves the same generic og:title/description for
// every entry, so a shared receipt or pothole report would all unfurl as one
// identical card. This route resolves the poster's PDS, fetches the actual
// record with com.atproto.repo.getRecord (a public, unauthenticated read —
// same call the client makes directly for the same permalink, see
// fetchEntryDirect in public/app.js), and stamps real og:title/description/
// url onto the static shell before serving it. Same resolve-then-stamp
// pattern as sites/didscope's /s/<handle> and sites/rateyourbuild's /site/<name>.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const COLLECTION = "net.bisks.witness.entry";
const CATEGORIES = new Set(["receipt", "pothole", "other"]);
const PLC_DIR = "https://plc.directory";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// Duplicated from public/lib/oauth.js's resolvePds — this is a Worker-side
// (no DOM/localStorage) copy for the same lookup, not a shared package.
async function resolvePds(did: string): Promise<string | null> {
  try {
    let doc: any = null;
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`${PLC_DIR}/${did}`);
      if (r.ok) doc = await r.json();
    } else if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").replace(/:/g, "/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      if (r.ok) doc = await r.json();
    }
    const pds = (doc?.service || []).find(
      (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    return pds?.serviceEndpoint || null;
  } catch (_) {
    return null;
  }
}

async function getRecord(did: string, rkey: string): Promise<any | null> {
  const pds = await resolvePds(did);
  if (!pds) return null;
  const qs = new URLSearchParams({ repo: did, collection: COLLECTION, rkey }).toString();
  const res = await fetch(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${qs}`);
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  return data?.value || null;
}

async function getHandle(did: string): Promise<string | null> {
  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    return j?.handle || null;
  } catch (_) {
    return null;
  }
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
  let out = html;
  out = setTag(out, TITLE_RE, t);
  out = setTag(out, DESC_RE, d);
  out = setTag(out, OG_TITLE_RE, t);
  out = setTag(out, OG_DESC_RE, d);
  out = setTag(out, OG_URL_RE, u);
  out = setTag(out, TW_TITLE_RE, t);
  out = setTag(out, TW_DESC_RE, d);
  return out;
}

async function shell(env: Env, request: Request): Promise<Response> {
  return env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
}

async function renderEntryPage(env: Env, request: Request, did: string, rkey: string): Promise<Response> {
  const base = await shell(env, request);
  if (!/^did:(plc:[a-zA-Z0-9]+|web:.+)$/.test(did) || !rkey) return base;

  const record = await getRecord(did, rkey);
  if (!record || !CATEGORIES.has(record.category) || typeof record.title !== "string" || !record.title.trim()) {
    // Unresolvable DID, deleted record, or malformed data — still serve the
    // live shell rather than a dead link; the client's own fetchEntryDirect
    // surfaces the real "couldn't load that entry" state.
    return base;
  }

  const handle = await getHandle(did);
  const who = handle ? `@${handle}` : did.slice(0, 16) + "…";
  const title = `witness: ${record.title.trim()}`;
  const bits = [record.category as string];
  if (record.amount) bits.push(String(record.amount));
  if (record.location) bits.push(String(record.location));
  const desc = `${bits.join(" · ")} — witnessed by ${who} on witness.bisks.net, a plain-html public ledger. no login to read.`;

  const html = await base.text();
  const stamped = stampMeta(
    html,
    title,
    desc,
    `https://witness.bisks.net/entry/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`,
  );
  return new Response(stamped, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/entry\/([^/]+)\/([^/]+)\/?$/);
    if (m) return renderEntryPage(env, request, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    return env.ASSETS.fetch(request);
  },
};
