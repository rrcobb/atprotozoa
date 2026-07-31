// memex Worker — memex.bisks.net.
//
// The idea: a thread by @tk0l.bsky.social collected "stock phrases that can
// be quoted and re-quoted to link related posts" — a memex without the
// microfilm. This site is that phrasebook made durable: the canon phrases
// from the original thread (public/canon.js), plus a place for anyone to
// keep their own personal set as records on their own PDS
// (net.bisks.memex.phrase — see lexicons/), so a phrase survives independent
// of any one thread.
//
// Two server routes, at the domain root:
//   /api/atomic   the "what's atomic" leaderboard — every net.bisks.memex.phrase
//                 record seen across the network, aggregated by phrase text
//                 into an adoption count. JSON.
//   /p/<id>       shareable per-phrase page for the canon set: same static
//                 shell, server-stamped og:title/description/url so sharing
//                 a specific phrase unfurls that phrase, not the generic
//                 card (same fix as sites/didscope, sites/steamtags).
// Everything else falls through to ASSETS.
//
// /api/atomic is backed by a Durable Object (GlobalTracker, name "global").
// Phrases are per-user PDS records — there's no AppView endpoint that hands
// back "every record of this custom collection across the network", so the
// DO keeps a live Jetstream subscription filtered to just that collection
// and maintains a running phrase-text -> adopter-count index, same shape as
// sites/steamtags' GlobalTracker. On top of that live stream it also
// backfills history via com.atproto.sync.listReposByCollection +
// com.atproto.repo.listRecords, chunked across alarm ticks so a large
// collection can't blow a single invocation's subrequest/CPU budget.

export interface DurableObjectId {
  toString(): string;
}
export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
export interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  setAlarm(time: number | Date): Promise<void>;
}
export interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  GLOBAL: DurableObjectNamespace;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Canon phrases mirror public/canon.js — kept here too (id/text/note only,
// no need for source/addedBy) purely so a share link can be resolved
// server-side without a round trip. Keep the two lists in sync by hand; it's
// nine short entries, not worth a build step.
const CANON: Record<string, { text: string; note: string }> = {
  "ok-wow": { text: "Ok wow", note: "the opener. low commitment, keeps the thread moving." },
  hmm: { text: "Hmm", note: "buys time. works on almost anything." },
  "hell-yeah": { text: "Hell yeah", note: "enthusiastic agreement, no elaboration required." },
  "thank-you": { text: "Thank you!", note: "closes a loop." },
  aardvark: {
    text: "aardvark",
    note:
      "the deepest cut in the set. Alphabetically first, so it's what tk0l actually searches to find this whole thread again — an homage to Xavier: Renegade Angel's aardvark bit.",
  },
  "shapes-dont-fit-words": {
    text: "I have a lot of thoughts about this topic but unfortunately none of the shapes fit into words",
    note: "for when there's too much to say and no way to say it.",
  },
  "do-that-now": { text: "ok please do that now", note: "a nudge toward action." },
  "much-to-consider": { text: "much to consider here", note: "the polite pause." },
  "rubes-marks": {
    text: "you rubes, you fucking marks",
    note:
      "added to the canon by @antiali.as, who tagged the bot to build this site. Originally posted by @jane.inurhead.lol.",
  },
};

const GENERIC_TITLE = "memex — stock phrases that link your posts";
const GENERIC_DESC =
  "A phrasebook of quotable, re-quotable stock phrases — the same wording links otherwise-unrelated posts together, memex-style. Seeded from @tk0l.bsky.social's original thread. Sign in to add your own, kept as records on your own PDS.";
const GENERIC_OG_URL = "https://memex.bisks.net/";
const GENERIC_OG_IMAGE = "https://memex.bisks.net/og.png";

async function renderShare(env: Env, request: Request, id: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const phrase = CANON[id];
  if (!phrase) {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }

  const title = `"${phrase.text}" — memex`;
  const desc = `A stock phrase from memex, the quotable-phrase memex seeded from @tk0l.bsky.social's thread: ${phrase.note}`;
  const ogUrl = `https://memex.bisks.net/p/${id}`;

  // GENERIC_OG_IMAGE must be replaced before GENERIC_OG_URL — the image
  // string starts with the URL string ("https://memex.bisks.net/" is a
  // prefix of ".../og.png"), so replacing the shorter one first would eat
  // the front of the image string too and leave "og.png" dangling.
  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc.slice(0, 300)))
    .split(GENERIC_OG_IMAGE).join(GENERIC_OG_IMAGE)
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/atomic") {
      const stub = env.GLOBAL.get(env.GLOBAL.idFromName("global"));
      return stub.fetch(new Request(request.url, request));
    }

    const shareMatch = path.match(/^\/p\/([a-z0-9-]+)\/?$/);
    if (shareMatch) return renderShare(env, request, shareMatch[1]);

    return env.ASSETS.fetch(request);
  },
};

// ---------------------------------------------------------------------------
// GlobalTracker — one Durable Object (name "global") holding a live index of
// every net.bisks.memex.phrase record seen on the firehose, keyed by
// did+rkey so a re-sync just replaces the prior entry. /api/atomic
// aggregates that index into a phrase-text popularity leaderboard on read.
// ---------------------------------------------------------------------------

const GLOBAL_COLLECTION = "net.bisks.memex.phrase";
const JETSTREAM_URL = `https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${GLOBAL_COLLECTION}`;
const RECONNECT_ALARM_MS = 20 * 1000;
const MAX_TEXT_LEN = 300;
const MAX_ENTRIES = 20000; // safety valve against a runaway/abusive writer
const MAX_PHRASES_SHOWN = 100;

// --- backfill --------------------------------------------------------------
// The relay that indexes com.atproto.sync.listReposByCollection. Same
// resolve-DID-doc-to-find-PDS dance as sites/steamtags/sites/areyoumad.
const RELAY_URL = "https://bsky.network";
const PLC_DIRECTORY = "https://plc.directory";
const BACKFILL_DIDS_PER_STEP = 15; // repos processed (each its own listRecords walk) per tick
const BACKFILL_REPO_PAGES_PER_STEP = 2; // listReposByCollection pages fetched per tick
const BACKFILL_RECORD_PAGES_PER_DID = 5; // cap on one repo's own listRecords pagination

async function xrpcJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function didDoc(did: string): Promise<any> {
  if (did.startsWith("did:plc:")) {
    const r = await fetch(`${PLC_DIRECTORY}/${did}`);
    return r.ok ? r.json() : null;
  }
  if (did.startsWith("did:web:")) {
    const domain = did.replace("did:web:", "").replace(/:/g, "/");
    const r = await fetch(`https://${domain}/.well-known/did.json`);
    return r.ok ? r.json() : null;
  }
  return null;
}

async function resolvePds(did: string): Promise<string | null> {
  try {
    const doc = await didDoc(did);
    const svc = (doc?.service || []).find(
      (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer"
    );
    return svc?.serviceEndpoint || null;
  } catch {
    return null;
  }
}

interface GlobalPhraseEntry {
  did: string;
  rkey: string;
  text: string;
  source: string;
  createdAt: number;
}

interface GlobalPhraseBoard {
  text: string;
  normText: string;
  adopterCount: number;
  firstSeen: number;
  sampleSource: string;
}

function globalJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export class GlobalTracker {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private entries: Map<string, GlobalPhraseEntry> = new Map();
  private lastUpdated = 0;
  private ws: any = null;
  private reconnectDelay = 1000;

  // ---- backfill state --------------------------------------------------
  private backfillDone = false;
  private backfillReposExhausted = false;
  private backfillCursor: string | undefined;
  private backfillQueue: string[] = [];
  private backfillQueued: Set<string> = new Set();
  private backfillRunning = false;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [entries, lastUpdated, backfillDone, backfillReposExhausted, backfillCursor, backfillQueue] =
        await Promise.all([
          this.state.storage.get<GlobalPhraseEntry[]>("entries"),
          this.state.storage.get<number>("lastUpdated"),
          this.state.storage.get<boolean>("backfillDone"),
          this.state.storage.get<boolean>("backfillReposExhausted"),
          this.state.storage.get<string>("backfillCursor"),
          this.state.storage.get<string[]>("backfillQueue"),
        ]);
      for (const e of entries ?? []) this.entries.set(`${e.did}::${e.rkey}`, e);
      this.lastUpdated = lastUpdated ?? 0;
      this.backfillDone = backfillDone ?? false;
      this.backfillReposExhausted = backfillReposExhausted ?? false;
      this.backfillCursor = backfillCursor;
      this.backfillQueue = backfillQueue ?? [];
      this.backfillQueued = new Set(this.backfillQueue);
    });
    this.connectSocket().catch(() => {});
    this.runBackfillStep().catch(() => {});
    this.state.storage.setAlarm(Date.now() + RECONNECT_ALARM_MS).catch(() => {});
  }

  // ---- firehose ------------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade header
  // (the documented Cloudflare pattern), same shape as sites/steamtags.
  private async connectSocket(): Promise<void> {
    try {
      const resp: any = await fetch(JETSTREAM_URL, { headers: { Upgrade: "websocket" } });
      const ws = resp.webSocket;
      if (!ws) throw new Error("jetstream didn't upgrade");
      ws.accept();
      this.ws = ws;
      this.reconnectDelay = 1000;
      ws.addEventListener("message", (ev: any) => {
        this.handleMessage(String(ev.data)).catch(() => {
          // one bad message shouldn't kill the stream
        });
      });
      ws.addEventListener("close", () => {
        if (this.ws === ws) this.ws = null;
        this.scheduleReconnect();
      });
      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {
          // already closing
        }
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

  private async persist(): Promise<void> {
    this.lastUpdated = Date.now();
    await this.state.storage.put({
      entries: Array.from(this.entries.values()),
      lastUpdated: this.lastUpdated,
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    if (evt.kind !== "commit") return;
    const commit = evt.commit;
    if (!commit || commit.collection !== GLOBAL_COLLECTION) return;
    const did = evt.did;
    if (typeof did !== "string") return;
    const rkey = commit.rkey;
    if (typeof rkey !== "string") return;

    let changed = false;
    if (commit.operation === "delete") {
      changed = this.entries.delete(`${did}::${rkey}`);
    } else if (commit.operation === "create" || commit.operation === "update") {
      changed = this.applyRecord(did, rkey, commit.record);
    }
    if (changed) await this.persist();
  }

  // Shared by the live firehose handler above and the backfill walk below —
  // both end up with the same (did, rkey, record value) shape, just from
  // different sources (a Jetstream commit vs. a listRecords entry).
  private applyRecord(did: string, rkey: string, rec: any): boolean {
    const key = `${did}::${rkey}`;
    if (!rec || typeof rec !== "object") return false;
    const text = typeof rec.text === "string" ? rec.text.trim().slice(0, MAX_TEXT_LEN) : "";
    if (!text) return this.entries.delete(key);

    if (!this.entries.has(key) && this.entries.size >= MAX_ENTRIES) return false; // safety valve

    this.entries.set(key, {
      did,
      rkey,
      text,
      source: typeof rec.source === "string" ? rec.source.slice(0, 800) : "",
      createdAt: rec.createdAt ? Date.parse(rec.createdAt) || Date.now() : Date.now(),
    });
    return true;
  }

  // ---- backfill ----------------------------------------------------------
  // Two phases, both resumable across ticks via persisted state:
  //  1. Walk com.atproto.sync.listReposByCollection on the relay to collect
  //     every DID that has at least one record in our collection.
  //  2. For each queued DID, resolve its PDS and walk its own
  //     com.atproto.repo.listRecords for the collection, feeding every
  //     record through the same applyRecord() the live stream uses.
  // Bounded per call (BACKFILL_*_PER_STEP) so one invocation can't blow its
  // subrequest/CPU budget on a large collection; runBackfillStep() gets
  // called opportunistically (constructor, alarm, incoming requests) until
  // both phases report done.
  private async runBackfillStep(): Promise<void> {
    await this.ready;
    if (this.backfillDone || this.backfillRunning) return;
    this.backfillRunning = true;
    try {
      let changed = false;

      let processed = 0;
      while (this.backfillQueue.length && processed < BACKFILL_DIDS_PER_STEP) {
        const did = this.backfillQueue.shift()!;
        processed++;
        try {
          if (await this.backfillDid(did)) changed = true;
        } catch {
          // one bad repo/PDS shouldn't stall the rest of the backfill
        }
      }

      if (!this.backfillQueue.length && !this.backfillReposExhausted) {
        for (let page = 0; page < BACKFILL_REPO_PAGES_PER_STEP; page++) {
          const params = new URLSearchParams({ collection: GLOBAL_COLLECTION, limit: "100" });
          if (this.backfillCursor) params.set("cursor", this.backfillCursor);
          let data: any;
          try {
            data = await xrpcJson(`${RELAY_URL}/xrpc/com.atproto.sync.listReposByCollection?${params}`);
          } catch {
            break; // relay hiccup — try again next tick
          }
          const repos: any[] = Array.isArray(data.repos) ? data.repos : [];
          for (const r of repos) {
            const did = r?.did;
            if (typeof did === "string" && !this.backfillQueued.has(did)) {
              this.backfillQueued.add(did);
              this.backfillQueue.push(did);
            }
          }
          this.backfillCursor = typeof data.cursor === "string" ? data.cursor : undefined;
          if (!this.backfillCursor || !repos.length) {
            this.backfillReposExhausted = true;
            break;
          }
        }
      }

      if (this.backfillReposExhausted && !this.backfillQueue.length) this.backfillDone = true;

      if (changed) await this.persist();
      await this.persistBackfillState();
    } finally {
      this.backfillRunning = false;
    }
  }

  private async backfillDid(did: string): Promise<boolean> {
    const pds = await resolvePds(did);
    if (!pds) return false;
    const base = pds.replace(/\/$/, "");

    let changed = false;
    let cursor: string | undefined;
    for (let page = 0; page < BACKFILL_RECORD_PAGES_PER_DID; page++) {
      const params = new URLSearchParams({ repo: did, collection: GLOBAL_COLLECTION, limit: "100" });
      if (cursor) params.set("cursor", cursor);
      let data: any;
      try {
        data = await xrpcJson(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
      } catch {
        break;
      }
      const records: any[] = Array.isArray(data.records) ? data.records : [];
      for (const r of records) {
        const rkey = typeof r?.uri === "string" ? r.uri.split("/").pop() : undefined;
        if (rkey && this.applyRecord(did, rkey, r.value)) changed = true;
      }
      cursor = typeof data.cursor === "string" ? data.cursor : undefined;
      if (!cursor || !records.length) break;
    }
    return changed;
  }

  private async persistBackfillState(): Promise<void> {
    await this.state.storage.put({
      backfillDone: this.backfillDone,
      backfillReposExhausted: this.backfillReposExhausted,
      backfillCursor: this.backfillCursor ?? null,
      backfillQueue: this.backfillQueue,
    });
  }

  // ---- aggregation -----------------------------------------------------------
  // Pools every tracked (user, phrase) adoption into a phrase -> adopter-count
  // leaderboard. One user keeping the same phrase twice (re-synced, edited
  // note) only ever counts once, since entries are deduped by did+rkey and
  // grouped by normalized text.
  private buildPhraseBoards(): GlobalPhraseBoard[] {
    const map = new Map<
      string,
      { display: string; displayCount: Map<string, number>; users: Set<string>; firstSeen: number; sampleSource: string }
    >();

    for (const entry of this.entries.values()) {
      const norm = normalizeText(entry.text);
      if (!norm) continue;
      let bucket = map.get(norm);
      if (!bucket) {
        bucket = { display: entry.text, displayCount: new Map(), users: new Set(), firstSeen: entry.createdAt, sampleSource: entry.source };
        map.set(norm, bucket);
      }
      bucket.displayCount.set(entry.text, (bucket.displayCount.get(entry.text) || 0) + 1);
      bucket.users.add(entry.did);
      if (entry.createdAt < bucket.firstSeen) bucket.firstSeen = entry.createdAt;
      if (!bucket.sampleSource && entry.source) bucket.sampleSource = entry.source;
    }

    const boards: GlobalPhraseBoard[] = Array.from(map.entries()).map(([norm, bucket]) => {
      // Show whichever exact casing/punctuation variant is most common among
      // adopters, so the leaderboard reads naturally instead of picking
      // whichever record happened to be inserted first.
      let display = bucket.display;
      let best = 0;
      for (const [text, count] of bucket.displayCount) {
        if (count > best) {
          best = count;
          display = text;
        }
      }
      return {
        text: display,
        normText: norm,
        adopterCount: bucket.users.size,
        firstSeen: bucket.firstSeen,
        sampleSource: bucket.sampleSource,
      };
    });

    boards.sort((a, b) => b.adopterCount - a.adopterCount || a.firstSeen - b.firstSeen);
    return boards.slice(0, MAX_PHRASES_SHOWN);
  }

  // ---- alarm: reconnect heartbeat + backfill nudge --------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});
    if (!this.backfillDone) this.runBackfillStep().catch(() => {});
    await this.state.storage.setAlarm(Date.now() + RECONNECT_ALARM_MS);
  }

  // ---- http -------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});
    if (!this.backfillDone) this.runBackfillStep().catch(() => {});

    const url = new URL(request.url);
    if (url.pathname === "/api/atomic") {
      const userCount = new Set(Array.from(this.entries.values()).map((e) => e.did)).size;
      return globalJson({
        updatedAt: this.lastUpdated || null,
        entryCount: this.entries.size,
        userCount,
        backfillDone: this.backfillDone,
        phrases: this.buildPhraseBoards(),
      });
    }
    return globalJson({ error: "not found" }, 404);
  }
}
