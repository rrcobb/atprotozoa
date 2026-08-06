// duohaunt Worker — duohaunt.bisks.net
//
// @norvid-studies.bsky.social tagged buildthis with "make this bot," pointing
// at their own reply in a thread: "irreversible duolingo anki bot that
// follows you around harassing you in public is a legitimately good cursed
// bot idea" — built on croissanthology.com's "stick an anki deck into bsky
// and have that bot harass me constantly."
//
// The deck and the actual spaced-repetition review run entirely client-side
// (public/app.js, localStorage) — no server needs to hold your flashcards.
// What's server-side is the "public" and "irreversible" parts, made honest
// rather than literal:
//
//   - PUBLIC: the HAUNT Durable Object below is a real shared wall (GET
//     /api/wall, no auth) — anyone can see anyone's overdue count and shame
//     tier. Opting in writes a tiny net.bisks.duohaunt.checkin record to
//     *your own* PDS each time your overdue count changes; this Worker never
//     trusts a client's word for what it wrote, it reads the record back off
//     the claimed author's own PDS before applying it — same verifyOwnRecord
//     trick as sites/hyperobject, for the same reason (nobody can forge a
//     record inside someone else's repo, so that's proof enough).
//   - IRREVERSIBLE-ISH: scheduled() (see wrangler.toml's [triggers]) ticks
//     the Haunt DO every 30min and recomputes every haunted user's shame tier
//     from how long they've been overdue — it climbs whether or not you ever
//     open the tab again. What it can't and doesn't do is post to Bluesky as
//     you while you're not looking: this Worker never sees, stores, or
//     refreshes an access token past the single request that needs one, and
//     the "confess publicly" button always fires from your own live signed-in
//     session in the browser (public/app.js's dpopFetch call), never from
//     here. A bot that quietly holds your credentials and posts as you
//     forever isn't something this build ships — see notes/50-oauth-scopes.md.
//
// Brand-new site — served at the root of its own hostname, no
// bisks.net/<name> path route and no prefix-stripping needed.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  HAUNT: DurableObjectNamespace;
}

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
  put(entries: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
}
interface ScheduledEvent {
  cron: string;
}
interface ExecutionContext {
  waitUntil(p: Promise<unknown>): void;
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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

// --- shame tiers ----------------------------------------------------------
// tier climbs the longer a user has been continuously overdue, recomputed
// from a plain elapsed-time bucket so the scheduled() tick can recompute it
// for everyone in one pass without needing per-user timers.

const TIERS = [
  { emoji: "🌱", label: "clear" },
  { emoji: "🕯️", label: "haunted" },
  { emoji: "👻", label: "restless" },
  { emoji: "🌀", label: "unravelling" },
  { emoji: "💀", label: "lost to the pit" },
] as const;
const TIER_HOURS = 6; // one tier bump per this many hours continuously overdue

function computeTier(overdue: number, overdueSince: number | null, now: number): number {
  if (overdue <= 0 || !overdueSince) return 0;
  const hours = Math.max(0, now - overdueSince) / 3_600_000;
  return Math.min(TIERS.length - 1, 1 + Math.floor(hours / TIER_HOURS));
}

interface HauntEntry {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  overdue: number;
  totalCards: number;
  clears: number; // number of times this user has brought overdue back to 0
  tier: number;
  overdueSince: number | null;
  hauntedSince: number;
  lastCheckinAt: number;
  lastConfessedAt?: number;
}

// --- atproto identity + record verification --------------------------------
// Copied from sites/hyperobject's verifyOwnRecord (same file, same reasoning):
// never trust a client's claim about its own stats, read the record back off
// the claimed author's own PDS. Nobody else can forge a record inside your
// repo, so that's proof enough.

const PLC_DIR = "https://plc.directory";
const CHECKIN_COLLECTION = "net.bisks.duohaunt.checkin";
const MAX_RECORD_AGE_MS = 15 * 60 * 1000;

async function resolveDidDoc(did: string): Promise<any | null> {
  try {
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`${PLC_DIR}/${did}`);
      if (!r.ok) return null;
      return await r.json();
    }
    if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").split(":").join("/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      if (!r.ok) return null;
      return await r.json();
    }
  } catch {}
  return null;
}

function pdsFromDoc(doc: any): string | null {
  const svc = (doc?.service || []).find(
    (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer"
  );
  return svc?.serviceEndpoint || null;
}

async function getPdsRecord(pdsUrl: string, did: string, collection: string, rkey: string): Promise<any | null> {
  try {
    const u = `${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`;
    const r = await fetch(u);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const m = /^at:\/\/(did:[^/]+)\/([^/]+)\/([^/]+)$/.exec(String(uri || ""));
  if (!m) return null;
  return { did: m[1], collection: m[2], rkey: m[3] };
}

function freshAt(createdAtIso: string): number {
  const ms = Date.parse(createdAtIso || "");
  return Number.isFinite(ms) ? ms : Date.now();
}

async function verifyOwnRecord(
  uri: string,
  expectedCollection: string
): Promise<{ did: string; value: any } | { error: string; status: number }> {
  const parsed = parseAtUri(uri);
  if (!parsed) return { error: "not a valid at:// record uri", status: 400 };
  if (parsed.collection !== expectedCollection) return { error: "wrong record type", status: 400 };
  const doc = await resolveDidDoc(parsed.did);
  if (!doc) return { error: "couldn't resolve that DID's identity", status: 400 };
  const pds = pdsFromDoc(doc);
  if (!pds) return { error: "couldn't resolve that DID's PDS", status: 400 };
  const rec = await getPdsRecord(pds, parsed.did, parsed.collection, parsed.rkey);
  if (!rec || !rec.value) return { error: "record not found on your own PDS", status: 404 };
  return { did: parsed.did, value: rec.value };
}

export class Haunt {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/wall" && request.method === "GET") {
      const entries = await this.state.storage.list<HauntEntry>({ prefix: "entry:" });
      const all = [...entries.values()].sort((a, b) => b.tier - a.tier || b.overdue - a.overdue);
      return json({ entries: all, total: all.length });
    }

    if (url.pathname === "/api/entry" && request.method === "GET") {
      const did = url.searchParams.get("did") || "";
      const entry = did ? await this.state.storage.get<HauntEntry>(`entry:${did}`) : null;
      return json({ entry: entry || null });
    }

    if (url.pathname === "/api/checkin" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }
      const uri = typeof body?.uri === "string" ? body.uri : null;
      if (!uri) return json({ error: "sign in first — missing record uri" }, 400);
      if (await this.state.storage.get(`seen:${uri}`)) {
        const did = parseAtUri(uri)?.did;
        const entry = did ? await this.state.storage.get<HauntEntry>(`entry:${did}`) : null;
        return json({ entry: entry || null }); // idempotent replay
      }

      const verified = await verifyOwnRecord(uri, CHECKIN_COLLECTION);
      if ("error" in verified) return json(verified, verified.status);
      const { did, value: rec } = verified;

      const validAt = freshAt(rec.createdAt);
      if (Date.now() - validAt > MAX_RECORD_AGE_MS) {
        return json({ error: "that check-in record is too old to apply — write a fresh one" }, 400);
      }

      const overdue = Number.isFinite(rec.overdue) ? Math.max(0, Math.floor(rec.overdue)) : 0;
      const totalCards = Number.isFinite(rec.totalCards) ? Math.max(0, Math.floor(rec.totalCards)) : 0;

      let profile: any;
      try {
        profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
      } catch {
        return json({ error: "couldn't verify that did against the appview" }, 502);
      }

      const key = `entry:${did}`;
      const existing = await this.state.storage.get<HauntEntry>(key);
      const now = Date.now();
      const wasOverdue = (existing?.overdue ?? 0) > 0;
      const overdueSince = overdue > 0 ? existing?.overdueSince ?? now : null;
      const clears = existing?.clears ?? 0;

      const entry: HauntEntry = {
        did,
        handle: profile.handle,
        displayName: typeof profile.displayName === "string" ? profile.displayName.slice(0, 200) : undefined,
        avatar: typeof profile.avatar === "string" ? profile.avatar : undefined,
        overdue,
        totalCards,
        clears: overdue === 0 && wasOverdue ? clears + 1 : clears,
        tier: computeTier(overdue, overdueSince, now),
        overdueSince,
        hauntedSince: existing?.hauntedSince ?? now,
        lastCheckinAt: now,
        lastConfessedAt: existing?.lastConfessedAt,
      };
      await this.state.storage.put({ [key]: entry, [`seen:${uri}`]: true });
      return json({ entry });
    }

    if (url.pathname === "/api/confessed" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }
      const did = typeof body?.did === "string" ? body.did : null;
      if (!did) return json({ error: "missing did" }, 400);
      const key = `entry:${did}`;
      const existing = await this.state.storage.get<HauntEntry>(key);
      if (!existing) return json({ error: "not haunted yet — check in first" }, 404);
      existing.lastConfessedAt = Date.now();
      await this.state.storage.put({ [key]: existing });
      return json({ entry: existing });
    }

    if (url.pathname === "/internal/tick" && request.method === "POST") {
      const entries = await this.state.storage.list<HauntEntry>({ prefix: "entry:" });
      const now = Date.now();
      const puts: Record<string, unknown> = {};
      let escalated = 0;
      for (const [key, entry] of entries) {
        const tier = computeTier(entry.overdue, entry.overdueSince, now);
        if (tier !== entry.tier) {
          puts[key] = { ...entry, tier };
          escalated++;
        }
      }
      if (Object.keys(puts).length) await this.state.storage.put(puts);
      return json({ checked: entries.size, escalated });
    }

    return json({ error: "not found" }, 404);
  }
}

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

const GENERIC_TITLE = "duohaunt — the irreversible anki bot that follows you around";
const GENERIC_DESC =
  "build a flashcard deck, review it, or don't — your overdue count and shame tier sit on a public wall that keeps climbing whether you show up or not.";
const GENERIC_OG_URL = "https://duohaunt.bisks.net/";

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = decodeURIComponent(rawHandle).trim().replace(/^@/, "");
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
    const who = "@" + (profile.handle || handle);

    const id = env.HAUNT.idFromName("global");
    const stub = env.HAUNT.get(id);
    const entryRes = await stub.fetch(new Request(`https://internal/api/entry?did=${encodeURIComponent(did)}`));
    const entryData = (await entryRes.json().catch(() => ({ entry: null }))) as { entry: HauntEntry | null };
    const entry = entryData.entry;
    const tier = entry ? TIERS[entry.tier] : TIERS[0];

    const title = entry
      ? `duohaunt: ${who} is ${tier.emoji} ${tier.label} (${entry.overdue} overdue)`
      : `duohaunt: ${who} hasn't been haunted yet`;
    const desc = truncate(
      entry
        ? `${who}'s deck has ${entry.overdue} card${entry.overdue === 1 ? "" : "s"} overdue. the public wall says: ${tier.label}. it climbs on its own — see for yourself.`
        : `${who} hasn't opted into the public wall yet. build a deck, fall behind, and find out what duohaunt calls you.`,
      300
    );
    const ogUrl = `https://duohaunt.bisks.net/haunt/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=120" },
    });
  } catch (_) {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (
      url.pathname === "/api/wall" ||
      url.pathname === "/api/entry" ||
      url.pathname === "/api/checkin" ||
      url.pathname === "/api/confessed"
    ) {
      const id = env.HAUNT.idFromName("global");
      const stub = env.HAUNT.get(id);
      return stub.fetch(request);
    }

    const m = url.pathname.match(/^\/haunt\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const id = env.HAUNT.idFromName("global");
    const stub = env.HAUNT.get(id);
    ctx.waitUntil(stub.fetch(new Request("https://internal/internal/tick", { method: "POST" })));
  },
};
