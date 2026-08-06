// griftmax Worker — served at the root of griftmax.bisks.net.
//
// @antiali.as, replying in the thread where buildthis built griftindex (a
// leaderboard that greps every site for six blunt "touches something real"
// signals and scores 0-6, no LLM in the loop — see sites/griftindex/scan.mjs),
// asked for "the worst possible website to get a perfect griftindex score. Be
// excellent." This is that: a memecoin-presale-cult skin ($GRIFT, "ascension,"
// a countdown that never expires) worn over six genuinely real integrations,
// not six regex-bait strings in a comment:
//
//   🌐 live AppView fetch    — public.api.bsky.app getProfile/getProfiles,
//                              called fresh on every /api/leaderboard read
//   🔥 firehose / Jetstream  — AscensionEngine below holds a live outbound
//                              WebSocket to Jetstream, counting the real
//                              torrent of commits/sec as "$GRIFT price"
//   📦 full repo CAR         — "audit your bag" downloads the caller's own
//                              com.atproto.sync.getRepo CAR client-side
//                              (public/app.js downloadBagCar)
//   🔑 real atproto OAuth    — "connect wallet" is real PKCE+DPoP OAuth
//                              (public/lib/oauth.js), scoped to one
//                              create-only grant, nothing broader
//   🗄️ Durable Object        — AscensionEngine: the live pulse + the
//                              atomic rank counter for every ascension
//   🗃️ KV/D1/R2 storage      — env.LEDGER (KV) persists the leaderboard;
//                              nothing in the fleet had hit this signal
//                              before (see wrangler.toml's comment)
//
// Ascending writes a net.bisks.griftmax.ascension record to the *caller's
// own* PDS, then hands the DO its at:// uri; the DO never trusts a
// client-supplied identity, it reads the record back off the claimed
// author's own PDS (verifyOwnRecord) before it counts — same pattern as
// sites/hyperobject's Pit, sites/velvetrope's verifyOwnRecord.
//
// Brand-new site — served at the root of its own hostname, no
// bisks.net/<name> path route and no prefix-stripping needed.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ENGINE: DurableObjectNamespace;
  LEDGER: KVNamespace;
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
  setAlarm(time: number | Date): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
interface KVListKey {
  name: string;
}
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<{ keys: KVListKey[] }>;
}

const PUB = "https://public.api.bsky.app/xrpc";
const PLC_DIR = "https://plc.directory";
const ASCEND_COLLECTION = "net.bisks.griftmax.ascension";
const MAX_RECORD_AGE_MS = 15 * 60 * 1000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${PUB}/${method}${qs ? "?" + qs : ""}`, {
    cf: { cacheTtl: 30 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

// --- identity + record verification -------------------------------------
// Never trust a client's claim about who ascended — read the record back off
// the claimed author's own PDS. Nobody else can forge a record inside your
// repo, so that's proof enough (same trick as hyperobject's verifyOwnRecord).

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

function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const m = /^at:\/\/(did:[^/]+)\/([^/]+)\/([^/]+)$/.exec(String(uri || ""));
  if (!m) return null;
  return { did: m[1], collection: m[2], rkey: m[3] };
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

// --- leaderboard read (Worker-level: pure KV + live AppView, no DO needed) --

interface LedgerEntry {
  rank: number;
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  ascendedAt: number;
}

async function readLeaderboard(env: Env): Promise<any> {
  const list = await env.LEDGER.list({ prefix: "entry:", limit: 500 });
  const raw = await Promise.all(list.keys.map((k) => env.LEDGER.get(k.name)));
  const entries: LedgerEntry[] = raw
    .map((v) => (v ? (JSON.parse(v) as LedgerEntry) : null))
    .filter((e): e is LedgerEntry => !!e);

  // Live re-fetch: nobody's follower count is trusted from the stored
  // snapshot — every read hits the AppView fresh, batched 25 actors/call.
  const byDid = new Map(entries.map((e) => [e.did, e]));
  const dids = [...byDid.keys()];
  const followers = new Map<string, { followersCount: number; avatar?: string; displayName?: string }>();
  for (let i = 0; i < dids.length; i += 25) {
    const chunk = dids.slice(i, i + 25);
    try {
      const params = new URLSearchParams();
      for (const d of chunk) params.append("actors", d);
      const r = await fetch(`${PUB}/app.bsky.actor.getProfiles?${params.toString()}`, {
        cf: { cacheTtl: 15 } as unknown as Record<string, unknown>,
      });
      if (r.ok) {
        const d = (await r.json()) as { profiles?: any[] };
        for (const p of d.profiles || []) {
          followers.set(p.did, {
            followersCount: typeof p.followersCount === "number" ? p.followersCount : 0,
            avatar: p.avatar,
            displayName: p.displayName,
          });
        }
      }
    } catch {
      // AppView hiccup on this chunk — those entries just keep followersCount 0 below
    }
  }

  const whales = entries
    .map((e) => {
      const live = followers.get(e.did);
      return {
        rank: e.rank,
        did: e.did,
        handle: e.handle,
        displayName: live?.displayName ?? e.displayName,
        avatar: live?.avatar ?? e.avatar,
        ascendedAt: e.ascendedAt,
        bagSize: live?.followersCount ?? 0,
      };
    })
    .sort((a, b) => b.bagSize - a.bagSize);

  return { count: entries.length, whales };
}

// --- durable object: live pulse + atomic rank counter ------------------------

const JETSTREAM_URL = "wss://jetstream2.us-east.bsky.network/subscribe";
const ALARM_MS = 2000; // pulse tick
const RATE_HISTORY = 30; // ~1 minute of 2s buckets, for a smoothed events/sec

export class AscensionEngine {
  private state: DurableObjectState;
  private env: Env;
  private ready: Promise<void>;
  private ws: any = null;
  private reconnectDelay = 1000;

  private count = 0; // total ascensions ever — the next rank is count+1
  private eventsSinceTick = 0;
  private rateHistory: number[] = [];
  private totalEventsSeen = 0;
  private lastTick = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [count, totalEventsSeen] = await Promise.all([
        this.state.storage.get<number>("count"),
        this.state.storage.get<number>("totalEventsSeen"),
      ]);
      this.count = count ?? 0;
      this.totalEventsSeen = totalEventsSeen ?? 0;
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // Workers connect OUT via fetch() + an Upgrade header (the documented
  // Cloudflare pattern), not the browser `new WebSocket(url)` constructor —
  // same as sites/meadowecho's EchoTracker / sites/mootstream's ActivityTracker.
  // No wantedCollections filter: the whole unfiltered torrent is the point,
  // "$GRIFT price" is however fast the entire network is posting right now.
  private async connectSocket(): Promise<void> {
    try {
      const resp: any = await fetch(JETSTREAM_URL.replace("wss://", "https://"), {
        headers: { Upgrade: "websocket" },
      });
      const ws = resp.webSocket;
      if (!ws) throw new Error("jetstream didn't upgrade");
      ws.accept();
      this.ws = ws;
      this.reconnectDelay = 1000;
      ws.addEventListener("message", (ev: any) => {
        try {
          this.handleMessage(String(ev.data));
        } catch {
          // one bad message shouldn't kill the stream
        }
      });
      ws.addEventListener("close", () => {
        if (this.ws === ws) this.ws = null;
        this.scheduleReconnect();
      });
      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {}
      });
    } catch {
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    setTimeout(() => {
      this.connectSocket().catch(() => {});
    }, delay);
  }

  private wsOpen(): boolean {
    return !!this.ws && this.ws.readyState === 1; // WebSocket.OPEN
  }

  // Cheap on purpose: every commit (post, like, follow, repost, everything)
  // just increments a counter. No JSON.parse of the record body needed to
  // know a commit happened — one JSON.parse of the envelope is enough.
  private handleMessage(raw: string): void {
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    if (evt.kind !== "commit") return;
    this.eventsSinceTick++;
    this.totalEventsSeen++;
  }

  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const now = Date.now();
    const elapsedSec = this.lastTick ? Math.max(0.5, (now - this.lastTick) / 1000) : ALARM_MS / 1000;
    this.rateHistory.push(this.eventsSinceTick / elapsedSec);
    if (this.rateHistory.length > RATE_HISTORY) this.rateHistory.shift();
    this.eventsSinceTick = 0;
    this.lastTick = now;

    await this.state.storage.put({ totalEventsSeen: this.totalEventsSeen });
    await this.state.storage.setAlarm(Date.now() + ALARM_MS);
  }

  private currentRate(): number {
    if (!this.rateHistory.length) return 0;
    return this.rateHistory.reduce((a, b) => a + b, 0) / this.rateHistory.length;
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);

    if (url.pathname === "/api/pulse" && request.method === "GET") {
      return json({
        ascendedCount: this.count,
        eventsPerSec: Math.round(this.currentRate() * 10) / 10,
        totalEventsSeen: this.totalEventsSeen,
      });
    }

    if (url.pathname === "/api/ascend" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }
      const uri = typeof body?.uri === "string" ? body.uri : null;
      if (!uri) return json({ error: "sign in and ascend — missing record uri" }, 400);
      if (await this.state.storage.get(`seen:${uri}`)) {
        return json({ error: "that ascension was already applied" }, 409);
      }

      const verified = await verifyOwnRecord(uri, ASCEND_COLLECTION);
      if ("error" in verified) return json(verified, verified.status);
      const { did, value: rec } = verified;

      const validAt = freshAt(rec.createdAt);
      if (Date.now() - validAt > MAX_RECORD_AGE_MS) {
        return json({ error: "that ascension record is too old to apply — write a fresh one" }, 400);
      }

      let profile: any;
      try {
        profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
      } catch {
        return json({ error: "couldn't verify that did against the appview" }, 502);
      }

      // Synchronous rank assignment — no await between reading and writing
      // `this.count`, so concurrent /api/ascend calls can't race each other
      // for the same rank (same guarantee sites/intrigue's Board and
      // sites/hyperobject's Pit rely on for their own counters).
      const rank = ++this.count;
      await this.state.storage.put({ count: this.count, [`seen:${uri}`]: true });

      const entry: LedgerEntry = {
        rank,
        did,
        handle: profile.handle,
        displayName: typeof profile.displayName === "string" ? profile.displayName.slice(0, 200) : undefined,
        avatar: typeof profile.avatar === "string" ? profile.avatar : undefined,
        ascendedAt: Date.now(),
      };
      await this.env.LEDGER.put(`entry:${String(rank).padStart(6, "0")}`, JSON.stringify(entry));

      return json({ entry });
    }

    return json({ error: "not found" }, 404);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/pulse" || url.pathname === "/api/ascend") {
      const id = env.ENGINE.idFromName("global");
      const stub = env.ENGINE.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      try {
        return json(await readLeaderboard(env));
      } catch (err: any) {
        return json({ error: err?.message || "leaderboard read failed" }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
