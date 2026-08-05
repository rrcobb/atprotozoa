// hyperobject Worker — hyperobject.bisks.net
//
// @isolyth.dev is hardcoded as THE hyperobject — the one fixed point at the
// top. Everyone else who gets typed into the form can be "cast into the pit,"
// a real shared Durable Object list that every visitor sees (not a private
// per-browser fiction): casting is a public, permanent act. The Worker
// re-resolves the target DID's own profile itself (app.bsky.actor.getProfile)
// before storing anything, so nobody can cast a fake name/avatar in under
// someone else's identity, and isolyth.dev's own DID (resolved once, cached
// in storage) can never be cast into their own pit.
//
// Only isolyth.dev can cast directly (POST /api/cast — gated below on the
// verified author DID). Everyone else can only *suggest* a soul: they write a
// net.bisks.hyperobject.suggestion record to their own PDS and it lands in a
// shared review queue (POST /api/suggest, GET /api/queue). isolyth.dev works
// the queue Papers-Please style — one dossier at a time, stamp APPROVE or
// DENY — and that decision is itself a record written to isolyth's own PDS
// (net.bisks.hyperobject.review) naming which suggestion and which stamp, so
// the Worker can verify *that* too instead of trusting a bearer token. This
// is the same trick three times over: casting, suggesting, and reviewing are
// all "write a record to your own PDS, then tell us the uri" — this Worker
// never trusts a client-supplied identity for any of them, it reads the
// record back off the claimed author's own PDS (verifyOwnRecord) and takes
// that as proof enough, since nobody else can forge a record inside your repo.
//
// /s/<handle> personalizes the OG/share unfurl per cast target, same fix as
// didscope: a static page serves one cached generic embed forever, so a real
// per-handle URL with server-stamped og:title/description is needed for every
// share to look distinct. Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  PIT: DurableObjectNamespace;
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
  list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
}

const HYPEROBJECT_HANDLE = "isolyth.dev";
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

interface CastAttribution {
  did: string;
  handle: string;
}

interface PitEntry {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  note?: string;
  count: number;
  firstCastAt: number;
  lastCastAt: number;
  lastCastBy?: CastAttribution;
  castBy?: CastAttribution[]; // distinct casters, most-recent-first, capped
  suggestedBy?: CastAttribution; // who first suggested this soul, if it came through the queue
}

interface SuggestionEntry {
  uri: string; // the suggestion record's own at:// uri — doubles as its queue id
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  note?: string;
  suggestedBy: CastAttribution;
  createdAt: number;
  status: "pending"; // approved/denied suggestions are deleted, not kept around in this state
}

// --- atproto identity + record verification -----------------------------
// Same pattern as sites/velvetrope's verifyOwnRecord: never trust a client's
// claim about who cast whom, read the record back off the claimed author's
// own PDS. Nobody else can forge a record inside your repo, so that's proof
// enough.

const PLC_DIR = "https://plc.directory";
const CAST_COLLECTION = "net.bisks.hyperobject.cast";
const SUGGEST_COLLECTION = "net.bisks.hyperobject.suggestion";
const REVIEW_COLLECTION = "net.bisks.hyperobject.review";
const MAX_RECORD_AGE_MS = 15 * 60 * 1000;
const MAX_CASTERS_TRACKED = 8;

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

function handleFromDoc(doc: any, fallback: string): string {
  const aka = (doc?.alsoKnownAs || []).find((a: string) => a.startsWith("at://"));
  return aka ? aka.slice("at://".length) : fallback;
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

// Verify that `uri` really is a record of `expectedCollection` the claimed
// author wrote to their own PDS. This is the only identity check this Worker
// ever does — no session, no cookie, no bearer token touches it — and it's
// reused for all three write paths (cast, suggest, review): each one is
// "write a record to your own PDS, then hand us the uri."
async function verifyOwnRecord(
  uri: string,
  expectedCollection: string
): Promise<{ did: string; handle: string; value: any } | { error: string; status: number }> {
  const parsed = parseAtUri(uri);
  if (!parsed) return { error: "not a valid at:// record uri", status: 400 };
  if (parsed.collection !== expectedCollection) return { error: "wrong record type", status: 400 };
  const doc = await resolveDidDoc(parsed.did);
  if (!doc) return { error: "couldn't resolve that DID's identity", status: 400 };
  const pds = pdsFromDoc(doc);
  if (!pds) return { error: "couldn't resolve that DID's PDS", status: 400 };
  const rec = await getPdsRecord(pds, parsed.did, parsed.collection, parsed.rkey);
  if (!rec || !rec.value) return { error: "record not found on your own PDS", status: 404 };
  return { did: parsed.did, handle: handleFromDoc(doc, parsed.did), value: rec.value };
}

// The one grievance that started this: @mfzx.net knocked isolyth.dev down to
// 4th place on peakposting by indexing @crimew.gay for a bigger score. Seeded
// once, on the pit's first-ever read, so the shrine doesn't start empty.
const SEED_HANDLE = "mfzx.net";
const SEED_NOTE = "knocked isolyth.dev to 4th on peakposting. cast in absentia.";

export class Pit {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/pit" && request.method === "GET") {
      await this.seedIfEmpty();
      const entries = await this.state.storage.list<PitEntry>({ prefix: "entry:" });
      const all = [...entries.values()].sort((a, b) => b.lastCastAt - a.lastCastAt);
      return json({ entries: all, total: all.length });
    }

    if (url.pathname === "/api/cast" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }

      const uri = typeof body?.uri === "string" ? body.uri : null;
      if (!uri) return json({ error: "sign in and cast — missing record uri" }, 400);
      if (await this.state.storage.get(`seen:${uri}`)) {
        return json({ error: "that cast was already applied" }, 409);
      }

      const verified = await verifyOwnRecord(uri, CAST_COLLECTION);
      if ("error" in verified) return json(verified, verified.status);
      const { did: casterDid, handle: casterHandle, value: rec } = verified;

      const hyperobjectDid = await this.getHyperobjectDid();
      if (casterDid !== hyperobjectDid) {
        return json(
          { error: "only isolyth.dev can cast directly — suggest that soul for review instead" },
          403
        );
      }

      const did = typeof rec?.target === "string" && rec.target.startsWith("did:") ? rec.target : null;
      if (!did) return json({ error: "cast record has no valid target did" }, 400);

      const validAt = freshAt(rec.createdAt);
      if (Date.now() - validAt > MAX_RECORD_AGE_MS) {
        return json({ error: "that cast record is too old to apply — write a fresh one" }, 400);
      }

      if (did === hyperobjectDid) {
        return json({ error: "isolyth.dev is the hyperobject. they cannot be cast beneath themselves." }, 400);
      }

      const note = typeof rec?.note === "string" ? rec.note.trim().slice(0, 140) : "";
      const caster: CastAttribution = { did: casterDid, handle: casterHandle };
      let entry: PitEntry;
      try {
        entry = await this.applyCast(did, caster, note);
      } catch (err: any) {
        return json({ error: err?.message || "couldn't verify that did against the appview" }, 502);
      }
      await this.state.storage.put({ [`seen:${uri}`]: true });

      return json({ entry });
    }

    if (url.pathname === "/api/suggest" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }

      const uri = typeof body?.uri === "string" ? body.uri : null;
      if (!uri) return json({ error: "sign in and suggest — missing record uri" }, 400);
      if (await this.state.storage.get(`seen:${uri}`)) {
        return json({ error: "that suggestion was already applied" }, 409);
      }

      const verified = await verifyOwnRecord(uri, SUGGEST_COLLECTION);
      if ("error" in verified) return json(verified, verified.status);
      const { did: suggesterDid, handle: suggesterHandle, value: rec } = verified;

      const did = typeof rec?.target === "string" && rec.target.startsWith("did:") ? rec.target : null;
      if (!did) return json({ error: "suggestion record has no valid target did" }, 400);

      const validAt = freshAt(rec.createdAt);
      if (Date.now() - validAt > MAX_RECORD_AGE_MS) {
        return json({ error: "that suggestion record is too old to apply — write a fresh one" }, 400);
      }

      const hyperobjectDid = await this.getHyperobjectDid();
      if (did === hyperobjectDid) {
        return json({ error: "isolyth.dev is the hyperobject. they cannot be suggested for their own pit." }, 400);
      }

      let profile: any;
      try {
        profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
      } catch {
        return json({ error: "couldn't verify that did against the appview" }, 502);
      }

      const note = typeof rec?.note === "string" ? rec.note.trim().slice(0, 140) : "";
      const suggestion: SuggestionEntry = {
        uri,
        did,
        handle: profile.handle,
        displayName: typeof profile.displayName === "string" ? profile.displayName.slice(0, 200) : undefined,
        avatar: typeof profile.avatar === "string" ? profile.avatar : undefined,
        note: note || undefined,
        suggestedBy: { did: suggesterDid, handle: suggesterHandle },
        createdAt: Date.now(),
        status: "pending",
      };
      await this.state.storage.put({ [`sugg:${uri}`]: suggestion, [`seen:${uri}`]: true });

      return json({ suggestion });
    }

    if (url.pathname === "/api/queue" && request.method === "GET") {
      const entries = await this.state.storage.list<SuggestionEntry>({ prefix: "sugg:" });
      const pending = [...entries.values()]
        .filter((e) => e.status === "pending")
        .sort((a, b) => a.createdAt - b.createdAt);
      return json({ queue: pending, total: pending.length });
    }

    if (url.pathname === "/api/review" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }

      const uri = typeof body?.uri === "string" ? body.uri : null;
      if (!uri) return json({ error: "sign in and stamp — missing record uri" }, 400);
      if (await this.state.storage.get(`seen:${uri}`)) {
        return json({ error: "that review was already applied" }, 409);
      }

      const verified = await verifyOwnRecord(uri, REVIEW_COLLECTION);
      if ("error" in verified) return json(verified, verified.status);
      const { did: reviewerDid, value: rec } = verified;

      const hyperobjectDid = await this.getHyperobjectDid();
      if (reviewerDid !== hyperobjectDid) {
        return json({ error: "only isolyth.dev can review suggestions" }, 403);
      }

      const decision = rec?.decision === "approve" || rec?.decision === "deny" ? rec.decision : null;
      const suggestionUri = typeof rec?.suggestionUri === "string" ? rec.suggestionUri : null;
      if (!decision || !suggestionUri) {
        return json({ error: "review record needs a suggestionUri and a decision" }, 400);
      }

      const validAt = freshAt(rec.createdAt);
      if (Date.now() - validAt > MAX_RECORD_AGE_MS) {
        return json({ error: "that review record is too old to apply — stamp a fresh one" }, 400);
      }

      const suggKey = `sugg:${suggestionUri}`;
      const suggestion = await this.state.storage.get<SuggestionEntry>(suggKey);
      if (!suggestion || suggestion.status !== "pending") {
        return json({ error: "that suggestion isn't pending anymore" }, 409);
      }

      if (decision === "deny") {
        await this.state.storage.put({ [`seen:${uri}`]: true });
        await this.state.storage.delete(suggKey);
        return json({ decision, suggestion });
      }

      let entry: PitEntry;
      try {
        entry = await this.applyCast(
          suggestion.did,
          { did: reviewerDid, handle: HYPEROBJECT_HANDLE },
          suggestion.note,
          suggestion.suggestedBy
        );
      } catch (err: any) {
        return json({ error: err?.message || "couldn't verify that did against the appview" }, 502);
      }
      await this.state.storage.put({ [`seen:${uri}`]: true });
      await this.state.storage.delete(suggKey);

      return json({ decision, entry });
    }

    return json({ error: "not found" }, 404);
  }

  // Shared by the direct-cast path and an approved review: re-resolves the
  // target's profile off the appview (never trust a stale suggestion's
  // cached avatar/name) and folds it into the pit's shared, permanent state.
  private async applyCast(
    did: string,
    caster: CastAttribution,
    note: string | undefined,
    suggestedBy?: CastAttribution
  ): Promise<PitEntry> {
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });

    const key = `entry:${did}`;
    const existing = await this.state.storage.get<PitEntry>(key);
    const now = Date.now();

    const priorCasters = existing?.castBy || [];
    const castBy = [caster, ...priorCasters.filter((c) => c.did !== caster.did)].slice(0, MAX_CASTERS_TRACKED);

    const entry: PitEntry = {
      did,
      handle: profile.handle,
      displayName: typeof profile.displayName === "string" ? profile.displayName.slice(0, 200) : undefined,
      avatar: typeof profile.avatar === "string" ? profile.avatar : undefined,
      note: note || existing?.note,
      count: (existing?.count ?? 0) + 1,
      firstCastAt: existing?.firstCastAt ?? now,
      lastCastAt: now,
      lastCastBy: caster,
      castBy,
      suggestedBy: existing?.suggestedBy ?? suggestedBy,
    };
    await this.state.storage.put({ [key]: entry });
    return entry;
  }

  private async getHyperobjectDid(): Promise<string | null> {
    const cached = await this.state.storage.get<string>("meta:hyperobjectDid");
    if (cached) return cached;
    try {
      const r = await xrpc("com.atproto.identity.resolveHandle", { handle: HYPEROBJECT_HANDLE });
      if (r.did) await this.state.storage.put({ "meta:hyperobjectDid": r.did });
      return r.did ?? null;
    } catch {
      return null;
    }
  }

  private async seedIfEmpty(): Promise<void> {
    const seeded = await this.state.storage.get<boolean>("meta:seeded");
    if (seeded) return;
    await this.state.storage.put({ "meta:seeded": true });
    try {
      const r = await xrpc("com.atproto.identity.resolveHandle", { handle: SEED_HANDLE });
      const profile = await xrpc("app.bsky.actor.getProfile", { actor: r.did });
      const now = Date.now();
      const entry: PitEntry = {
        did: r.did,
        handle: profile.handle,
        displayName: typeof profile.displayName === "string" ? profile.displayName.slice(0, 200) : undefined,
        avatar: typeof profile.avatar === "string" ? profile.avatar : undefined,
        note: SEED_NOTE,
        count: 1,
        firstCastAt: now,
        lastCastAt: now,
      };
      await this.state.storage.put({ [`entry:${r.did}`]: entry });
    } catch {
      // seed is a nice-to-have, not load-bearing — an appview hiccup just
      // means the pit opens empty instead of pre-seeded.
    }
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

const GENERIC_TITLE = "hyperobject — isolyth.dev is on top. you are not.";
const GENERIC_DESC =
  "all the light touches is theirs. everyone else gets cast into the pit. type a handle, watch them fall.";
const GENERIC_OG_URL = "https://hyperobject.bisks.net/";

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

    const title = `hyperobject: ${who} has been cast into the pit`;
    const desc = truncate(
      `${who} now lies beneath @isolyth.dev, the hyperobject at the end of time. all the light still touches only them.`,
      300
    );
    const ogUrl = `https://hyperobject.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
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
      url.pathname === "/api/pit" ||
      url.pathname === "/api/cast" ||
      url.pathname === "/api/suggest" ||
      url.pathname === "/api/queue" ||
      url.pathname === "/api/review"
    ) {
      const id = env.PIT.idFromName("global");
      const stub = env.PIT.get(id);
      return stub.fetch(request);
    }

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
