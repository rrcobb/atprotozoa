// hyperobject Worker — served at the root of hyperobject.bisks.net.
//
// The pit used to be a Durable Object ("Pit" — see wrangler.toml's v1/v2
// migration tags), deleted once the Cloudflare cost wall ruled DOs out. That
// left this file a bare static-asset passthrough and public/index.html
// running the whole cast/suggest/review flow against browser localStorage —
// a private fiction, not "everyone who visits sees the same growing pit"
// like the site's own wrangler.toml comment and lexicons (both flagged
// "UNCONFIRMED... no code in this site actually calls createRecord") always
// said it should be. This rebuilds the same real-shared-state idea as a KV
// index instead of a DO — same recipe as sites/clusterpedia's WikiStore and
// sites/postwith's MatchStore.
//
// Every write is still a plain atproto record the browser signs and writes
// to the *author's own* PDS (net.bisks.hyperobject.cast/.suggestion/.review —
// see public/lib/oauth.js's scope). This Worker never holds anyone's
// credentials; a client only ever hands it an at:// uri, and verifyOwnRecord
// reads that record back off the claimed author's own PDS to confirm they
// really wrote it — proof enough, since nobody else can forge a record
// inside your repo. Only isolyth.dev's own DID is accepted as the author of
// a cast or a review; anyone signed in can author a suggestion about anyone
// (except isolyth.dev herself).
//
// KV keys:
//   pit:<did>            one soul currently in the pit
//   queue:<padded ts>:<n> one pending suggestion, oldest first
//   seen:<at-uri>         replay guard — each PDS record applies once

interface KVNamespace {
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  PIT_STATE: KVNamespace;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return new PitStore(env.PIT_STATE).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// --- atproto identity + record verification --------------------------------

const PLC_DIR = "https://plc.directory";
const APPVIEW = "https://public.api.bsky.app/xrpc";

// isolyth.dev, resolved once via com.atproto.identity.resolveHandle — the one
// and only DID allowed to cast directly or stamp a review, same as the
// ANCHOR_DID pattern in sites/clusterpedia's src/index.ts.
const HYPEROBJECT_DID = "did:plc:allu5vs3gnm2wm7jzf4rad3r";

const CAST_COLLECTION = "net.bisks.hyperobject.cast";
const SUGGEST_COLLECTION = "net.bisks.hyperobject.suggestion";
const REVIEW_COLLECTION = "net.bisks.hyperobject.review";

const MAX_NOTE = 300;
const MAX_QUEUE = 500;
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
    (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
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

// The only identity check this Worker does: confirm `uri` really is a record
// the claimed author wrote to their own PDS, matching the expected
// collection. No session, no cookie, no bearer token ever touches it.
async function verifyOwnRecord(
  uri: string,
  expectCollection: string,
): Promise<{ did: string; handle: string; value: any; uri: string } | { error: string; status: number }> {
  const parsed = parseAtUri(uri);
  if (!parsed) return { error: "not a valid at:// record uri", status: 400 };
  if (parsed.collection !== expectCollection) return { error: "wrong record type", status: 400 };
  const doc = await resolveDidDoc(parsed.did);
  if (!doc) return { error: "couldn't resolve that DID's identity", status: 400 };
  const pds = pdsFromDoc(doc);
  if (!pds) return { error: "couldn't resolve that DID's PDS", status: 400 };
  const rec = await getPdsRecord(pds, parsed.did, parsed.collection, parsed.rkey);
  if (!rec || !rec.value) return { error: "record not found on the author's PDS", status: 404 };
  const createdAtMs = Date.parse(rec.value?.createdAt || "");
  const validAt = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
  if (Date.now() - validAt > MAX_RECORD_AGE_MS)
    return { error: "that record is too old to apply — write a fresh one", status: 400 };
  return { did: parsed.did, handle: handleFromDoc(doc, parsed.did), value: rec.value, uri };
}

async function resolveProfile(did: string): Promise<{ handle: string; displayName: string; avatar: string }> {
  try {
    const r = await fetch(`${APPVIEW}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    if (!r.ok) throw new Error("no profile");
    const d: any = await r.json();
    return { handle: d.handle || did, displayName: d.displayName || d.handle || did, avatar: d.avatar || "" };
  } catch {
    return { handle: did, displayName: did, avatar: "" };
  }
}

function isDid(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("did:") && s.length < 128;
}
function cleanNote(s: unknown): string {
  return typeof s === "string" ? s.trim().slice(0, MAX_NOTE) : "";
}
function padTs(ms: number): string {
  return String(Math.floor(ms)).padStart(14, "0");
}

interface PitEntry {
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  note: string;
  count: number;
  firstCastAt: number;
  lastCastAt: number;
  lastCastBy: { did: string; handle: string };
  suggestedBy: { did: string; handle: string } | null;
}

interface QueueEntry {
  uri: string;
  subjectDid: string;
  handle: string;
  displayName: string;
  avatar: string;
  note: string;
  suggestedBy: { did: string; handle: string };
  createdAt: number;
}

export class PitStore {
  private storage: KVNamespace;

  constructor(storage: KVNamespace) {
    this.storage = storage;
  }

  private async listValues<T>(prefix: string): Promise<{ name: string; value: T }[]> {
    const names: string[] = [];
    let cursor = "";
    do {
      const page = await this.storage.list({ prefix, cursor: cursor || undefined, limit: 1000 });
      names.push(...page.keys.map((k) => k.name));
      cursor = page.list_complete ? "" : page.cursor || "";
    } while (cursor);
    const out: { name: string; value: T }[] = [];
    for (const name of names) {
      const v = await this.storage.get<T>(name, "json");
      if (v !== null) out.push({ name, value: v });
    }
    return out;
  }

  private async alreadySeen(uri: string): Promise<boolean> {
    return !!(await this.storage.get(`seen:${uri}`, "json"));
  }
  private async markSeen(uri: string): Promise<void> {
    await this.storage.put(`seen:${uri}`, "true");
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice("/api".length) || "/";

    try {
      if (path === "/pit" && request.method === "GET") return json(await this.getPit());
      if (path === "/queue" && request.method === "GET") return json(await this.getQueue());
      if (path === "/cast" && request.method === "POST") return this.handleCast(request);
      if (path === "/suggest" && request.method === "POST") return this.handleSuggest(request);
      if (path === "/review" && request.method === "POST") return this.handleReview(request);
    } catch (e: any) {
      return json({ error: e?.message || "internal error" }, 500);
    }
    return json({ error: "not found" }, 404);
  }

  private async getPit(): Promise<{ entries: PitEntry[] }> {
    const rows = await this.listValues<PitEntry>("pit:");
    const entries = rows.map((r) => r.value).sort((a, b) => b.lastCastAt - a.lastCastAt);
    return { entries };
  }

  private async getQueue(): Promise<{ queue: QueueEntry[] }> {
    const rows = await this.listValues<QueueEntry>("queue:");
    rows.sort((a, b) => a.name.localeCompare(b.name)); // oldest first — key is timestamp-prefixed
    return { queue: rows.map((r) => r.value).slice(0, MAX_QUEUE) };
  }

  private async handleCast(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);
    if (await this.alreadySeen(body.uri)) return json({ error: "already applied" }, 409);

    const verified = await verifyOwnRecord(body.uri, CAST_COLLECTION);
    if ("error" in verified) return json(verified, verified.status);
    if (verified.did !== HYPEROBJECT_DID)
      return json({ error: "only isolyth.dev can cast directly" }, 403);

    const subject = verified.value?.subject;
    if (!isDid(subject)) return json({ error: "record is missing a valid subject did" }, 400);
    if (subject === HYPEROBJECT_DID)
      return json({ error: "isolyth.dev cannot be cast beneath herself" }, 400);

    const entry = await this.addToPit(
      subject,
      cleanNote(verified.value?.note),
      { did: verified.did, handle: verified.handle },
      null,
    );
    await this.markSeen(body.uri);
    return json({ ok: true, entry });
  }

  private async handleSuggest(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);
    if (await this.alreadySeen(body.uri)) return json({ error: "already applied" }, 409);

    const verified = await verifyOwnRecord(body.uri, SUGGEST_COLLECTION);
    if ("error" in verified) return json(verified, verified.status);

    const subject = verified.value?.subject;
    if (!isDid(subject)) return json({ error: "record is missing a valid subject did" }, 400);
    if (subject === HYPEROBJECT_DID)
      return json({ error: "isolyth.dev cannot be suggested for the pit" }, 400);
    if (verified.did === HYPEROBJECT_DID)
      return json({ error: "isolyth.dev casts directly, not through the queue" }, 400);

    if (await this.storage.get(`pit:${subject}`, "json")) {
      await this.markSeen(body.uri);
      return json({ error: "already in the pit" }, 409);
    }

    const rows = await this.listValues<QueueEntry>("queue:");
    if (rows.length >= MAX_QUEUE) return json({ error: "the checkpoint's queue is full — try later" }, 503);

    const profile = await resolveProfile(subject);
    const createdAt = Date.now();
    const key = `queue:${padTs(createdAt)}:${verified.did}`;
    const entry: QueueEntry = {
      uri: body.uri,
      subjectDid: subject,
      handle: profile.handle,
      displayName: profile.displayName,
      avatar: profile.avatar,
      note: cleanNote(verified.value?.note),
      suggestedBy: { did: verified.did, handle: verified.handle },
      createdAt,
    };
    await this.storage.put(key, JSON.stringify(entry));
    await this.markSeen(body.uri);
    return json({ ok: true, entry });
  }

  private async handleReview(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);
    if (await this.alreadySeen(body.uri)) return json({ error: "already applied" }, 409);

    const verified = await verifyOwnRecord(body.uri, REVIEW_COLLECTION);
    if ("error" in verified) return json(verified, verified.status);
    if (verified.did !== HYPEROBJECT_DID)
      return json({ error: "only isolyth.dev can stamp a review" }, 403);

    const decision = verified.value?.decision;
    if (decision !== "approve" && decision !== "deny") return json({ error: "bad decision" }, 400);
    const suggestionUri = verified.value?.suggestionUri;
    if (typeof suggestionUri !== "string") return json({ error: "missing suggestionUri" }, 400);

    const rows = await this.listValues<QueueEntry>("queue:");
    const match = rows.find((r) => r.value.uri === suggestionUri);
    if (!match) return json({ error: "that suggestion is no longer queued" }, 404);

    await this.storage.delete(match.name);
    await this.markSeen(body.uri);

    if (decision === "deny") return json({ ok: true, decision, subjectDid: match.value.subjectDid });

    const entry = await this.addToPit(
      match.value.subjectDid,
      match.value.note,
      { did: HYPEROBJECT_DID, handle: "isolyth.dev" },
      match.value.suggestedBy,
    );
    return json({ ok: true, decision, entry });
  }

  private async addToPit(
    did: string,
    note: string,
    castBy: { did: string; handle: string },
    suggestedBy: { did: string; handle: string } | null,
  ): Promise<PitEntry> {
    const key = `pit:${did}`;
    const existing = await this.storage.get<PitEntry>(key, "json");
    const profile = existing
      ? { handle: existing.handle, displayName: existing.displayName, avatar: existing.avatar }
      : await resolveProfile(did);
    const now = Date.now();
    const entry: PitEntry = {
      did,
      handle: profile.handle,
      displayName: profile.displayName,
      avatar: profile.avatar,
      note: note || existing?.note || "",
      count: (existing?.count || 0) + 1,
      firstCastAt: existing?.firstCastAt || now,
      lastCastAt: now,
      lastCastBy: castBy,
      suggestedBy: suggestedBy || existing?.suggestedBy || null,
    };
    await this.storage.put(key, JSON.stringify(entry));
    return entry;
  }
}
