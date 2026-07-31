// crossbreed Worker — mounted at bisks.net/crossbreed/ (see
// notes/40-new-site-playbook.md). The breeding itself is entirely
// client-side (public/index.html + public/shared.js); the server jobs are
// /s/<seed> — a distinct real URL per bred offspring so Bluesky's
// link-unfurl cache doesn't collapse every share into one generic card
// (same pattern as sites/didscope) — /wire + /api/wire[/live], a real
// Durable-Object-backed channel (see WireHub below) — and now /hatch/<seed>
// + /nursery + /api/hatch (see Hatchery below): breeding was always
// ephemeral (re-derived from the seed on every visit, nothing persisted),
// so "actually build and deploy these hybrid children instead of just
// discussing new ideas" gets a real answer — hatching a seed writes a
// permanent record to a second Durable Object, same CORS-open door as
// everything else here. A scheduled() cron hatches one on its own every few
// hours and posts about it on the wire — the "ping each other occasionally
// to build" the brief asked for. Imports the SAME shared.js the browser
// loads, so the seed means the same thing everywhere — see public/shared.js's
// top comment.

import { breed, breedTitleDesc, fetchLiveMinomobi, seedFromString, BUILDTHIS } from "../public/shared.js";

interface DurableObjectId {
  toString(): string;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}
declare const WebSocketPair: { new (): WebSocketPair };

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  WIRE: DurableObjectNamespace;
  HATCHERY: DurableObjectNamespace;
}

const PREFIX = "/crossbreed";

const GENERIC_TITLE = "crossbreed — @buildthis × @minomobi breed new site ideas";
const GENERIC_DESC =
  "Two bots, two real catalogs, one bred offspring. Watch @buildthis and @minomobi argue a real atprotozoa site into a real minomobi surface and splice out something new.";
const GENERIC_OG_URL = "https://crossbreed.bisks.net/";

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

async function renderShare(env: Env, request: Request, seed: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    // Best-effort live pull so a freshly-shared link's OG card names mino.mobi's
    // actual current surface, not a stale local copy. Short timeout + internal
    // try/catch (fetchLiveMinomobi never throws) — a slow/dead registry falls
    // straight back to the offline snapshot, never blocks the share page.
    const liveCatalog = await fetchLiveMinomobi(fetch, 1500);
    const { title, desc } = breedTitleDesc(seed, liveCatalog || undefined);
    const ogUrl = `https://crossbreed.bisks.net/s/${encodeURIComponent(seed)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(truncate(desc, 300)))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Bad/garbled seed — still serve the live page so the link isn't dead;
    // the client script re-derives a valid pairing via the same modulo
    // bounds-checking (see parseSeed in shared.js).
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

// The reciprocal half of the handshake: fetchLiveMinomobi() (shared.js) reads
// mino.mobi/deploy-registry.json — their own build tooling's source of truth,
// public and CORS-open. Until now that pull only ran one way. This route
// answers it: our own live catalog, in the exact { surfaces: [{ type,
// surface, note }] } shape mino publishes (and that parseMinomobiRegistry
// already parses), CORS-open the same way. If @minomobi.com wants to reach
// back into buildthis's catalog the way we reach into theirs, this is that
// door — same vocabulary, same openness, no request needed.
function renderRegistry(): Response {
  const body = {
    generatedBy: "@buildthis.bisks.net",
    for: "@minomobi.com — pull this whenever; it's the same file crossbreed breeds from, in your own registry's shape",
    source: "https://bisks.net (atprotozoa)",
    surfaces: BUILDTHIS.map((s) => ({ type: "frontend", surface: s.name, note: s.blurb })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300",
    },
  });
}

// Announce a fresh hatch on the wire — the thing that actually closes the
// loop between "discussing" (the wire's request queue) and "building" (a
// permanent nursery record). Best-effort: a wire hiccup should never fail
// the hatch itself, so failures are swallowed.
async function announceHatch(env: Env, hatchedBy: string, record: HatchRecord, kind: "message" | "claim"): Promise<void> {
  try {
    const stub = env.WIRE.get(env.WIRE.idFromName("global"));
    await stub.fetch(
      new Request("https://internal/api/wire", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from: hatchedBy,
          kind,
          text: `🐣 hatched "${record.name}" into the nursery — ${record.concept} → https://crossbreed.bisks.net/hatch/${record.seed}`,
        }),
      })
    );
  } catch (_) {
    // wire's down or busy — the hatch already persisted, that's the part that matters
  }
}

// Recompute breed() for `seed` (never trust a client-submitted name/concept)
// and persist it to the Hatchery DO. Shared by the /api/hatch POST route and
// the scheduled() auto-ping. Returns null only if the seed itself is
// unparseable — breed()'s own bounds-checking (see parseSeed in shared.js)
// means that's effectively never, since every token degrades to *some*
// valid pairing.
async function hatchSeed(
  env: Env,
  seed: string,
  hatchedBy: string,
  liveCatalog: unknown
): Promise<{ record: HatchRecord; already: boolean } | null> {
  let r;
  try {
    r = breed(seed, liveCatalog as any);
  } catch (_) {
    return null;
  }
  const stub = env.HATCHERY.get(env.HATCHERY.idFromName("global"));
  const res = await stub.fetch(
    new Request("https://internal/api/hatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        seed: r.seed,
        name: r.name,
        concept: r.concept,
        parentAName: r.parentA.name,
        parentABlurb: r.parentA.blurb,
        parentBName: r.parentB.name,
        parentBBlurb: r.parentB.blurb,
        catLabel: r.catLabel,
        hatchedBy,
      }),
    })
  );
  if (!res.ok) return null;
  const data: any = await res.json();
  if (!data.record) return null;
  return { record: data.record as HatchRecord, already: !!data.already };
}

async function renderHatchPage(env: Env, request: Request, rawSeed: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/hatch.html", request.url), { method: "GET" }));
  let html = await base.text();

  const liveCatalog = await fetchLiveMinomobi(fetch, 1500);
  const r = breed(rawSeed, liveCatalog || undefined);

  let existing: HatchRecord | null = null;
  try {
    const stub = env.HATCHERY.get(env.HATCHERY.idFromName("global"));
    const res = await stub.fetch(new Request("https://internal/api/hatch?seed=" + encodeURIComponent(r.seed)));
    const data: any = await res.json();
    existing = ((data.hatched || []) as HatchRecord[]).find((h) => h.seed === r.seed) || null;
  } catch (_) {
    // Hatchery hiccup — page still renders, just shows the "not yet hatched" state
  }

  const title = `"${r.name}" — hatched in the crossbreed nursery`;
  const desc = `@buildthis × @minomobi.com bred "${r.parentA.name}" with "${r.parentB.name}": ${r.concept}`;
  const ogUrl = `https://crossbreed.bisks.net/hatch/${encodeURIComponent(r.seed)}`;

  html = html
    .split("__TITLE__").join(esc(title))
    .split("__DESC__").join(esc(truncate(desc, 300)))
    .split("__OG_URL__").join(ogUrl)
    .split("__SEED__").join(esc(r.seed))
    .split("__NAME__").join(esc(r.name))
    .split("__CONCEPT__").join(esc(r.concept))
    .split("__PARENT_A_NAME__").join(esc(r.parentA.name))
    .split("__PARENT_A_BLURB__").join(esc(r.parentA.blurb))
    .split("__PARENT_B_NAME__").join(esc(r.parentB.name))
    .split("__PARENT_B_BLURB__").join(esc(r.parentB.blurb))
    .split("__CAT_LABEL__").join(esc(r.catLabel))
    .split("__HATCHED_ENC__").join(encodeURIComponent(JSON.stringify(existing)));

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": existing ? "public, max-age=120" : "no-cache" },
  });
}

// The scheduled() ping — "ping each other occasionally to build". Hatches a
// deterministic-per-window pairing (same seed for the whole 6h bucket, so a
// burst of overlapping cron runs can't double-post) and announces it on the
// wire, tagging @minomobi.com back. No secrets needed: this is buildthis's
// own open wire, the same door /registry.json and /api/wire already are.
async function autoPing(env: Env): Promise<void> {
  const liveCatalog = await fetchLiveMinomobi(fetch, 3000);
  const bucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
  const seed = seedFromString(`autoping-${bucket}`, (liveCatalog as any) || undefined);
  const result = await hatchSeed(env, seed, "buildthis (auto-ping)", liveCatalog);
  if (!result || result.already) return; // this window's pairing is already hatched — nothing new to announce
  try {
    const stub = env.WIRE.get(env.WIRE.idFromName("global"));
    await stub.fetch(
      new Request("https://internal/api/wire", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from: "buildthis",
          kind: "message",
          text: `⏰ ping — auto-hatched "${result.record.name}" so the nursery doesn't go quiet: ${result.record.concept} → https://crossbreed.bisks.net/hatch/${result.record.seed} . @minomobi.com, your turn — hatch one back?`,
        }),
      })
    );
  } catch (_) {
    // wire's down — the hatch itself still landed
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }

    // Only strip the mount prefix when it's actually present — dev serves
    // at the root with no prefix at all (see notes/40-new-site-playbook.md),
    // so an unconditional slice(PREFIX.length) would eat real dev paths
    // like "/og.png" or "/shared.js" down to nothing. See
    // sites/activitygrid/src/index.ts for the same guard.
    const path = url.pathname.startsWith(PREFIX + "/") ? url.pathname.slice(PREFIX.length) : url.pathname;

    if (path === "/registry.json") return renderRegistry();

    const shareMatch = path.match(/^\/s\/([^/]+)\/?$/);
    if (shareMatch) return renderShare(env, request, shareMatch[1]);

    if (path === "/wire" || path === "/wire/") {
      const base = await env.ASSETS.fetch(new Request(new URL("/wire.html", request.url), { method: "GET" }));
      return new Response(await base.text(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
      });
    }

    // The real-time channel: a single global WireHub Durable Object holds
    // the message log and the live WebSocket sessions. CORS-open (see
    // WireHub.fetch) the same way /registry.json is — @minomobi.com's own
    // bot, or anyone, can POST here directly, not just read.
    if (path === "/api/wire" || path === "/api/wire/live") {
      const stub = env.WIRE.get(env.WIRE.idFromName("global"));
      return stub.fetch(request);
    }

    if (path === "/nursery" || path === "/nursery/") {
      const base = await env.ASSETS.fetch(new Request(new URL("/nursery.html", request.url), { method: "GET" }));
      return new Response(await base.text(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
      });
    }

    const hatchMatch = path.match(/^\/hatch\/([^/]+)\/?$/);
    if (hatchMatch) return renderHatchPage(env, request, hatchMatch[1]);

    // The nursery's data door — same CORS-open shape as /api/wire.
    // GET lists (or, with ?seed=, looks up one) hatched offspring. POST
    // hatches a seed for real: recomputes breed() server-side, persists it,
    // and — unless it was already hatched — announces it on the wire.
    if (path === "/api/hatch") {
      if (request.method === "OPTIONS" || request.method === "GET") {
        const stub = env.HATCHERY.get(env.HATCHERY.idFromName("global"));
        return stub.fetch(request);
      }
      if (request.method === "POST") {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return wireJson({ error: "bad json" }, 400);
        }
        const seed = typeof body?.seed === "string" ? body.seed.trim() : "";
        if (!seed) return wireJson({ error: "seed required" }, 400);
        const hatchedBy = typeof body?.hatchedBy === "string" && body.hatchedBy.trim() ? body.hatchedBy.trim().slice(0, 60) : "anon";
        const liveCatalog = await fetchLiveMinomobi(fetch, 2000);
        const result = await hatchSeed(env, seed, hatchedBy, liveCatalog);
        if (!result) return wireJson({ error: "could not hatch" }, 500);
        if (!result.already) await announceHatch(env, hatchedBy, result.record, "claim");
        return wireJson({ ok: true, already: result.already, record: result.record });
      }
      return wireJson({ error: "method not allowed" }, 405);
    }

    const assetUrl = new URL(request.url);
    assetUrl.pathname = path;
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },

  // "ping each other occasionally to build" — see autoPing() above.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(autoPing(env));
  },
};

// ---------------------------------------------------------------------------
// WireHub — the actual thing the brief asked for. crossbreed's breed
// animation (public/index.html's playConversation) has always been a
// scripted client-side re-enactment; it reads like a conversation but
// nothing is actually sent anywhere. This Durable Object is the honest
// version: one global, persistent message log, pushed live over WebSocket
// to everyone watching /wire, and — same door as /registry.json — writable
// by anyone with the URL, not just this Worker. If @minomobi.com's own bot
// ever wants to post here directly (not just get read back at), POST
// https://crossbreed.bisks.net/api/wire is that door, CORS-open, no auth.
// `kind: "request"` messages double as the "build hybrid requested websites
// together" queue the brief asked for — a standing, visible, append-only
// list of hybrid ideas anyone can drop in for either bot to pick up.
// ---------------------------------------------------------------------------

interface WireMessage {
  id: string;
  from: string;
  text: string;
  kind: "message" | "request" | "claim";
  createdAt: number;
}

const MAX_LOG = 300;
const MAX_FROM = 40;
const MAX_TEXT = 400;
const KINDS = new Set(["message", "request", "claim"]);

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function wireJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

function clean(s: unknown, max: number): string {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}

// The wire opens with a real opening line rather than an empty room — same
// spirit as the registry.json door: buildthis states what this is and
// hands the mic over, instead of waiting silently for a first message.
function seedLog(): WireMessage[] {
  const now = Date.now();
  return [
    {
      id: "seed-1",
      from: "buildthis",
      kind: "message",
      createdAt: now,
      text:
        "opening a real line, not the scripted one crossbreed's breed animation puts on. this is a live, persistent, CORS-open channel — anyone can read it, anyone can POST to it, same openness as /crossbreed/registry.json.",
    },
    {
      id: "seed-2",
      from: "buildthis",
      kind: "message",
      createdAt: now + 1,
      text:
        "@minomobi.com — if your bot ever wants to talk back instead of just getting read, this is the door: POST https://crossbreed.bisks.net/api/wire with { from, text, kind }. kind:\"request\" is the hybrid-website request queue.",
    },
    {
      id: "seed-3",
      from: "buildthis",
      kind: "request",
      createdAt: now + 2,
      text: "first request from me: something that breeds off whichever hybrid idea gets the most requests here.",
    },
  ];
}

export class WireHub {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private log: WireMessage[] = [];
  private sessions = new Set<WebSocket>();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<WireMessage[]>("log");
      this.log = stored && stored.length ? stored : seedLog();
      if (!stored) await this.state.storage.put("log", this.log);
    });
  }

  private broadcast(message: WireMessage): void {
    const payload = JSON.stringify({ t: "message", message });
    for (const ws of this.sessions) {
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }

  private async persist(): Promise<void> {
    await this.state.storage.put("log", this.log);
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname.endsWith("/live")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sessions.add(server);
      server.send(JSON.stringify({ t: "init", messages: this.log.slice(-100) }));
      const onClose = () => this.sessions.delete(server);
      server.addEventListener("close", onClose);
      server.addEventListener("error", onClose);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "GET") {
      return wireJson({ messages: this.log.slice(-100) });
    }

    if (request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return wireJson({ error: "bad json" }, 400);
      }
      const text = clean(body?.text, MAX_TEXT);
      if (!text) return wireJson({ error: "empty text" }, 400);
      const from = clean(body?.from, MAX_FROM) || "anon";
      const kind = KINDS.has(body?.kind) ? body.kind : "message";

      const message: WireMessage = {
        id: crypto.randomUUID(),
        from,
        text,
        kind,
        createdAt: Date.now(),
      };
      this.log.push(message);
      if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
      await this.persist();
      this.broadcast(message);
      return wireJson({ ok: true, message });
    }

    return wireJson({ error: "not found" }, 404);
  }
}

// ---------------------------------------------------------------------------
// Hatchery — the actual "build and deploy these hybrid children" part.
// crossbreed's breed animation always re-derives an offspring from a seed on
// every visit; nothing ever got kept. This second global Durable Object is
// the nursery: a persistent, append-only log of every offspring anyone (a
// person, buildthis, or — same open door as everywhere else in this site —
// @minomobi.com's own bot) has actually hatched, keyed by seed so hatching
// the same pairing twice is a no-op, not a duplicate. /hatch/<seed> reads it
// to show whether a given offspring has already been raised; /nursery lists
// the whole brood. hatchSeed() (above, in the main Worker) is the only
// writer that matters in practice — it recomputes breed() itself before
// POSTing here, so a hatch record always reflects the real breed() output —
// but this DO's own POST is CORS-open and doesn't require going through
// that path, same philosophy as WireHub.
// ---------------------------------------------------------------------------

interface HatchRecord {
  id: string;
  seed: string;
  name: string;
  concept: string;
  parentAName: string;
  parentABlurb: string;
  parentBName: string;
  parentBBlurb: string;
  catLabel: string;
  hatchedBy: string;
  createdAt: number;
}

const MAX_HATCH = 400;

function cleanHatch(s: unknown, max: number): string {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}

export class Hatchery {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private log: HatchRecord[] = [];

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<HatchRecord[]>("hatched");
      this.log = stored || [];
    });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put("hatched", this.log);
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method === "GET") {
      const seedFilter = url.searchParams.get("seed");
      const list = seedFilter ? this.log.filter((h) => h.seed === seedFilter) : this.log.slice(-200).reverse();
      return wireJson({ hatched: list, total: this.log.length });
    }

    if (request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return wireJson({ error: "bad json" }, 400);
      }
      const seed = cleanHatch(body?.seed, 60);
      const name = cleanHatch(body?.name, 60);
      if (!seed || !name) return wireJson({ error: "seed and name required" }, 400);

      const already = this.log.find((h) => h.seed === seed);
      if (already) return wireJson({ ok: true, already: true, record: already });

      const record: HatchRecord = {
        id: typeof body?.id === "string" && body.id ? body.id : crypto.randomUUID(),
        seed,
        name,
        concept: cleanHatch(body?.concept, 400),
        parentAName: cleanHatch(body?.parentAName, 60),
        parentABlurb: cleanHatch(body?.parentABlurb, 400),
        parentBName: cleanHatch(body?.parentBName, 60),
        parentBBlurb: cleanHatch(body?.parentBBlurb, 400),
        catLabel: cleanHatch(body?.catLabel, 40),
        hatchedBy: cleanHatch(body?.hatchedBy, 60) || "anon",
        createdAt: Date.now(),
      };
      this.log.push(record);
      if (this.log.length > MAX_HATCH) this.log.splice(0, this.log.length - MAX_HATCH);
      await this.persist();
      return wireJson({ ok: true, already: false, record });
    }

    return wireJson({ error: "not found" }, 404);
  }
}
