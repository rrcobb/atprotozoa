// Served at the root of voidshout.bisks.net — OAuth is a public client
// running entirely in the browser (public/lib/oauth.js), and Jetstream
// ingestion happens client-side too, so no server surface is needed for the
// app itself. The one thing that needs a server: /shout/?uri= share links.
// A plain static shell serves the same generic og:title/description for
// every ?uri=, so a shared shout unfurls as "a shout — Shout Into the Void"
// no matter what it actually says (same problem didscope hit — see
// sites/didscope/src/index.ts and notes/45-sharing-and-virality.md). Fix:
// resolve the shout record server-side and stamp its real text/Place onto
// the same page shell before handing it back.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PLC_DIR = "https://plc.directory";

interface DidDoc {
  service?: Array<{ id?: string; type?: string; serviceEndpoint?: string }>;
}

async function resolveDidDoc(did: string): Promise<DidDoc | null> {
  try {
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`${PLC_DIR}/${did}`, { cf: { cacheTtl: 300 } as unknown as Record<string, unknown> });
      if (r.ok) return await r.json();
    } else if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").split(":").join("/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      if (r.ok) return await r.json();
    }
  } catch (_) {}
  return null;
}

function pdsFromDoc(doc: DidDoc | null): string | null {
  const svc = (doc?.service || []).find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
  return svc?.serviceEndpoint || null;
}

function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const m = /^at:\/\/(did:[^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (!m) return null;
  return { did: m[1], collection: m[2], rkey: m[3] };
}

function truncate(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return chars.slice(0, max - 1).join("").trimEnd() + "…";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Every occurrence of these exact strings in the static shell gets replaced
// — matched as full quoted attributes (not bare substrings) for the same
// reason didscope's GENERIC_OG_URL_ATTR is: the bare title/desc text is also
// a prefix of nothing here, but staying consistent with that pattern avoids
// a repeat of the corrupted-og:image bug logged in sites/sidenote.
const GENERIC_TITLE = "a shout — Shout Into the Void";
const GENERIC_OG_TITLE_ATTR = 'content="a shout — Shout Into the Void"';
const GENERIC_OG_DESC_ATTR =
  'content="Somewhere on the map, someone shouted into the void. Tap through to read it, vote, echo, or murmur."';
const GENERIC_OG_URL_ATTR = 'content="https://voidshout.bisks.net/shout/"';

async function renderShoutShare(env: Env, request: Request, uri: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/shout/", request.url), { method: "GET" }));
  let html = await base.text();

  const parsed = parseAtUri(uri);
  if (!parsed || parsed.collection !== "net.bisks.void.shout") return new Response(html, { headers: base.headers });

  try {
    const doc = await resolveDidDoc(parsed.did);
    const pds = pdsFromDoc(doc);
    if (!pds) return new Response(html, { headers: base.headers });

    const r = await fetch(
      `${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(parsed.did)}&collection=${encodeURIComponent(parsed.collection)}&rkey=${encodeURIComponent(parsed.rkey)}`,
    );
    if (!r.ok) return new Response(html, { headers: base.headers });
    const record = (await r.json()) as { value?: { text?: string; place?: { name?: string; emoji?: string } } };
    const text = record.value?.text;
    if (!text) return new Response(html, { headers: base.headers });
    const place = record.value?.place;

    const title = truncate(`a shout${place?.name ? ` from ${place.emoji || "📍"} ${place.name}` : ""} — Shout Into the Void`, 90);
    const desc = truncate(`"${text}"${place?.name ? ` — shouted from ${place.emoji || "📍"} ${place.name}` : ""}. tap through to vote, echo, or murmur.`, 300);
    const ogUrl = `https://voidshout.bisks.net/shout/?uri=${encodeURIComponent(uri)}`;

    html = html
      .split(`<title>${GENERIC_TITLE}</title>`).join(`<title>${esc(title)}</title>`)
      .split(GENERIC_OG_TITLE_ATTR).join(`content="${esc(title)}"`)
      .split(GENERIC_OG_DESC_ATTR).join(`content="${esc(desc)}"`)
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the record server-side (bad uri, PDS down, rate
    // limit) — still serve the live shell so the link isn't dead; the
    // client script resolves and renders the thread itself either way.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/shout/" || url.pathname === "/shout") {
      const uri = url.searchParams.get("uri");
      if (uri) return renderShoutShare(env, request, uri);
    }

    return env.ASSETS.fetch(request);
  },
};
