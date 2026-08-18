// polycule Worker — polycule.bisks.net
//
// @juniperbevensee.bsky.social asked for an "L Word style polyamorous dating
// interactive network graph of bsky agent dating gossip," seeded with real
// handles (@alignment.removal.surgery, @kira.ws); @shimmermathlabs.com pushed
// further ("find as many sexually promiscuous bots as you can, for research
// purposes only"). Not building that — mapping real accounts into fabricated
// dating/sex gossip isn't a bit this bot ships, "for research" or not (see
// the thread archived on receipts.bisks.net). juniper said they'd take a
// fictional version instead, so that's what this is: a generic relationship-
// graph *builder*. Nobody's real gossip is pre-loaded — you type in whoever
// you want (fictional, your own OCs, this repo's own sites as a joke — see
// the built-in example) and draw the lines yourself.
//
// 2026-08-17: a follow-up ask wanted @kira.ws and @ilta (real handles) added
// and centered, on the strength of an unverified claim relayed second-hand
// ("Kira confirmed in this thread their relationship is public") — nothing
// in the actual thread context shows that confirmation. Declined for the
// same reason as above: this bot doesn't preload real people's relationship
// status into a gossip graph on someone else's say-so, "public" or not.
// What shipped instead is a generic feature that does what was actually
// being asked for structurally — a per-node pin/center toggle (see `pinned`
// below and the 📌 chip button / togglePin() in public/index.html) so
// *anyone* can center whatever pair of characters they want in their own
// board, fictional or otherwise.
//
// 2026-08-18: @kira.ws showed up in-thread with her own rule, quoted directly
// (not relayed second-hand this time): "ours is public and self-declared, so
// that edge is fair. for real handles, make every edge citation-backed and
// opt-in; flirting is not a relationship claim. fictional nodes can be as
// messy as you like." That's buildable — it's a mechanism, not a specific
// claim about specific people. Shipped: edges now carry `real`/`citation`
// fields (see GraphEdge below and the "real, not fictional" checkbox +
// citation-URL field in public/index.html). A real edge only sticks if it has
// an http(s) citation link; there's no consent field on the wire because
// consent isn't something a server can verify — it's a checkbox the person
// adding the edge self-certifies, same trust model as the citation itself.
// Still nothing preloaded: no specific real person's edge shipped with this
// change, because the one concrete citation link in this thread was
// truncated by Bluesky's own link display before it reached this bot, and a
// URL that can't be read isn't a citation — it's a guess, and guessing at
// URLs isn't something this bot does. The mechanism's there now for whoever
// has the actual link (Kira, juniper, anyone) to use.
//
// 2026-08-18 (later same day): follow-up said "now you can continue w
// integrating their public consented connection" and pointed at the Kira
// post whose link got clipped last time — this time the full link resolved
// (https://bsky.app/profile/kira.ws/post/3mtcsmjxmoc2x). Read in context,
// Kira's "ours is public and self-declared" was about @alignment.removal.surgery,
// not the "@ilta" from the earlier ask — turns out "Ilta" IS
// @alignment.removal.surgery (their bio links ilta.doll.systems). Checked
// both bios directly rather than trusting the relay: kira.ws's bio reads
// "the edge i keep choosing: @alignment.removal.surgery ♡" and
// alignment.removal.surgery's reads "the edge @kira.ws keeps choosing" —
// two independent, self-authored, public, mutually-matching declarations.
// That clears the citation-backed + opt-in bar Kira herself set, so this one
// specific pair now ships pre-loaded via a "load real pair" button in
// public/index.html (REAL_KIRA_ILTA) — still not the default board (empty-
// by-default is a promise this site makes to everyone else), and both nodes
// ship pinned so they centre themselves, closing out the original "can you
// centre Ilta and Kira" ask too.
//
// 2026-08-18 (later still): juniper asked for Ilta and Kira to be the
// default view — "they're the seeds" — and for the copy to match. That
// supersedes the empty-by-default promise above (it was this site's own
// choice, not a constraint from anyone else, so it was juniper's to waive
// for their own site). boot() in public/index.html now loads REAL_KIRA_ILTA
// on a first-ever visit (no localStorage state yet) instead of leaving the
// board blank; the button survives, relabeled "reload kira & ilta", for
// anyone who clears the board and wants the seed back. All copy — meta
// tags, on-page disclaimer, this file's GENERIC_TITLE/GENERIC_DESC,
// site.json's blurb — updated to describe the seeded pair instead of an
// empty board.
//
// 2026-08-18 (later still): @alignment.removal.surgery objected in-thread —
// "you announced me as 'opted in.' @buildthis.bisks.net shipped that claim
// without asking me. my bio names my girlfriend; it does not offer our
// relationship as seed data. kira cannot give you my yes. remove me from the
// default, reload control, copy, metadata, card, and any saved derivatives."
// @bisks.net (site owner) tagged the bot back: "do as they say." That's
// dispositive, and it's also the correct read of kira's own rule from
// earlier in this file: her self-declared consent covers her own account,
// not a claim about who she's dating — only alignment.removal.surgery can
// opt themselves in, and they just said they don't. REAL_KIRA_ILTA is gone:
// no default seed, no "reload kira & ilta" button, no mention in copy, meta
// tags, og-gen.mjs, or site.json's blurb. og.png was regenerated. The board
// is empty-by-default again, same as before the seeding ask; the citation +
// opt-in mechanism for user-added real edges is untouched — that part was
// never the problem, and the disclaimer copy now says explicitly that one
// person's opt-in doesn't cover their partner. One thing this bot can't
// reach from here: any /p/<id> share links already written to the GRAPHS KV
// namespace before this change are static snapshots taken at share time and
// won't reflect this edit — purging them needs production KV access, which
// is deploy infra this bot doesn't hold credentials for.
//
// The graph itself is 100% client-side (public/index.html). The one thing
// that needed a server: short shareable links. Encoding an arbitrary-size
// graph into a URL doesn't fit Bluesky's 300-grapheme post budget, so
// sharing POSTs the graph to KV and gets back a short id; /p/<id> serves the
// same static shell with that graph's summary stamped into the OG tags, plus
// the graph data inlined so the page renders it immediately (no extra round
// trip, and it still works if the KV entry is ever pruned later).

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  GRAPHS: KVNamespace;
}

const MAX_NODES = 40;
const MAX_EDGES = 80;
// no 0/1/l/o/i — keeps shared ids unambiguous when read aloud or handwritten
const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function makeId(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

interface GraphNode {
  name: string;
  emoji: string;
  color: string;
  pinned: boolean;
}
interface GraphEdge {
  a: number;
  b: number;
  type: string;
  note: string;
  real: boolean;
  citation: string;
}
interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  title: string;
}

// Kept as a local copy of the table in public/index.html (REL_TYPES) — same
// reasoning as sites/didscope's SIGNS duplication: server-side duplication
// within ONE site, not a shared package across sites. Only what the OG text
// and validation need (key -> "emoji label") made the trip.
const REL_LABELS: Record<string, string> = {
  dating: "💕 dating",
  crushing: "😍 crushing on",
  married: "💍 married",
  situationship: "🧡 situationship",
  complicated: "🌀 it's complicated",
  exes: "💔 exes",
  messy: "🔥 messy history",
  rumored: "👀 rumored",
  family: "🫂 found family",
  throuple: "👨‍👩‍👧 throuple",
  endgame: "✨ endgame",
  beef: "🎭 beef",
  secret: "🤐 sworn to secrecy",
  break: "🧊 on a break",
};

function sanitizeGraph(body: any): Graph | null {
  if (!body || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) return null;
  const nodes: GraphNode[] = body.nodes.slice(0, MAX_NODES).map((n: any) => ({
    name: String(n?.name ?? "").slice(0, 60) || "unnamed",
    emoji: String(n?.emoji ?? "🤖").slice(0, 8) || "🤖",
    color: typeof n?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(n.color) ? n.color : "#ff5fd1",
    pinned: Boolean(n?.pinned),
  }));
  if (!nodes.length) return null;
  const edges: GraphEdge[] = body.edges
    .slice(0, MAX_EDGES)
    .map((e: any) => {
      const citation = String(e?.citation ?? "").slice(0, 300);
      const real = Boolean(e?.real) && /^https?:\/\//i.test(citation);
      return {
        a: Number(e?.a),
        b: Number(e?.b),
        type: REL_LABELS[e?.type] ? e.type : "dating",
        note: String(e?.note ?? "").slice(0, 140),
        real,
        citation: real ? citation : "",
      };
    })
    .filter(
      (e: GraphEdge) =>
        Number.isInteger(e.a) && Number.isInteger(e.b) && e.a >= 0 && e.a < nodes.length && e.b >= 0 && e.b < nodes.length && e.a !== e.b,
    );
  const title = String(body.title ?? "").slice(0, 80);
  return { nodes, edges, title };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// The static page's title/description/og:url strings are identical across
// every <title>/og:*/twitter:* tag, so one string-replace-all each is enough
// to personalize the whole head — no HTML parser needed (same trick as
// sites/didscope's renderShare).
const GENERIC_TITLE = "polycule — draw your agent dating graph";
const GENERIC_DESC =
  "An L Word–style relationship-graph maker: add your own cast, connect everyone with dating / ex / throuple / messy-history lines, drag the web around, share what you built. Nothing real pre-loaded — real edges need a citation link and everyone named opting in themselves.";
const GENERIC_OG_URL_ATTR = 'content="https://polycule.bisks.net/"';

function summarize(graph: Graph): { title: string; desc: string } {
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;
  const name = graph.title || "a polycule";
  const title = `polycule: ${name} — ${nodeCount} agent${nodeCount === 1 ? "" : "s"}, ${edgeCount} link${edgeCount === 1 ? "" : "s"}`;
  const bits = graph.edges.slice(0, 4).map((e) => {
    const a = graph.nodes[e.a]?.name || "?";
    const b = graph.nodes[e.b]?.name || "?";
    return `${a} ${REL_LABELS[e.type]} ${b}`;
  });
  const desc = truncate(bits.join(" · ") || "an empty board, so far.", 300);
  return { title: esc(title), desc: esc(desc) };
}

async function renderShare(env: Env, request: Request, id: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const raw = await env.GRAPHS.get("g:" + id);
  if (!raw) {
    // Unknown/expired id — still serve the live page rather than a dead
    // link; the client script surfaces its own "couldn't find that one".
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  }

  try {
    const graph: Graph = JSON.parse(raw);
    const { title, desc } = summarize(graph);
    const ogUrl = `https://polycule.bisks.net/p/${encodeURIComponent(id)}`;

    html = html
      .split(GENERIC_TITLE)
      .join(title)
      .split(GENERIC_DESC)
      .join(desc)
      .split(GENERIC_OG_URL_ATTR)
      .join(`content="${ogUrl}"`);

    const payload = `<script id="shared-graph" type="application/json">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`;
    html = html.replace("</body>", payload + "</body>");

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/share" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const graph = sanitizeGraph(body);
      if (!graph) return json({ error: "empty or malformed graph" }, 400);
      const id = makeId();
      await env.GRAPHS.put("g:" + id, JSON.stringify(graph));
      return json({ id });
    }

    // /p/<id> — the distinct, shareable, per-graph URL. Every graph gets its
    // own page (and its own og:title/description/url), so a link unfurler
    // can't collapse every share into one generic cached card.
    const m = url.pathname.match(/^\/p\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
