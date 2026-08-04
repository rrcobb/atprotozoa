// velvetrope Worker — velvetrope.bisks.net
//
// schizanon.bsky.social: "build a site that lets me authenticate with my
// Bluesky account, and then lists all my moderation lists publicly so that
// other authenticated Bluesky users can request to have themselves removed
// or added from said lists. It should provide a way to bulk add/remove all
// the requests."
//
// The whole app runs client-side (public/index.html): sign in with atproto
// OAuth (public/lib/oauth.js, copied from sites/clusterpedia/padmoot), browse
// any account's public moderation lists (public/lib/atproto.js, reading the
// AppView), and request to join/leave one. This Worker's only job is the
// same one clusterpedia's has: hold the request/decision queue and verify
// every write the same way — never trust a client's claim, read the record
// back off the *claimed author's own PDS* and confirm it's real. That's
// proof enough, since nobody else can forge a record inside your repo.
//
//   - A "request to add/remove me" is a net.bisks.velvetrope.request record,
//     written to the *requester's* own PDS.
//   - A list owner's bulk approve/deny is one net.bisks.velvetrope.decision
//     record, written to the *owner's* own PDS, naming every request it
//     covers. The owner-ness check is free: only the DID that owns
//     `at://<did>/app.bsky.graph.list/<rkey>` could ever get a decision
//     record accepted for that list, because the record has to come back off
//     *that same did's* repo.
//   - Approving also means the owner's browser performs the real
//     com.atproto.repo.applyWrites against their own PDS (creating/deleting
//     app.bsky.graph.listitem records) — this Worker never touches that, it
//     only tracks which requests are pending/approved/denied so the queue UI
//     has something to show.
//
// Also server-renders per-list OG tags for GET /list/<did>/<rkey>, so a
// shared list link unfurls with the list's real name instead of one generic
// card for every list (same fix as sites/clusterpedia's /wiki/<slug> and
// sites/windmill's /r/<code>).

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
  delete(key: string): Promise<boolean>;
  list<T = unknown>(options?: {
    prefix?: string;
    reverse?: boolean;
    limit?: number;
  }): Promise<Map<string, T>>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ROPE: DurableObjectNamespace;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

const GENERIC_TITLE = "velvetrope — request your way on or off a list";
const GENERIC_DESC =
  "Sign in with Bluesky, browse anyone's public moderation lists, and request to be added or removed. List owners get a queue with one-click bulk approve or deny.";
const GENERIC_OG_URL = "https://velvetrope.bisks.net/";

const LIST_RE = /^\/list\/(did:[^/]+)\/([^/]+)\/?$/;

// Links this site generates itself encode the did with encodeURIComponent,
// which percent-encodes ":" as "%3A" — and the URL Standard's parser (used by
// both browsers and this Worker's `new URL()`) does NOT decode already-
// percent-encoded characters back out of `pathname`/`url.pathname`. So a
// literal `did:` match against the raw pathname never fires; decode first.
function decodePath(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function renderListShell(env: Env, request: Request, ownerDid: string, rkey: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();
  try {
    const listUri = `at://${ownerDid}/app.bsky.graph.list/${rkey}`;
    const r = await fetch(
      `https://api.bsky.app/xrpc/app.bsky.graph.getList?list=${encodeURIComponent(listUri)}&limit=1`,
      { cf: { cacheTtl: 60 } as unknown as Record<string, unknown> },
    );
    if (!r.ok) throw new Error("list fetch failed");
    const d = (await r.json()) as any;
    const list = d.list;
    if (!list) throw new Error("no list");
    const title = `${list.name} — velvetrope`;
    const count = typeof list.listItemCount === "number" ? list.listItemCount : null;
    const by = list.creator?.handle ? `@${list.creator.handle}` : "someone";
    const desc = truncate(
      `${list.description ? list.description + " — " : ""}a moderation list by ${by}${count !== null ? ` (${count} member${count === 1 ? "" : "s"})` : ""}. Request to be added or removed on velvetrope.`,
      300,
    );
    const ogUrl = `https://velvetrope.bisks.net/list/${encodeURIComponent(ownerDid)}/${encodeURIComponent(rkey)}`;
    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(`content="${GENERIC_OG_URL}"`).join(`content="${ogUrl}"`);
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=120" },
    });
  } catch {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const stub = env.ROPE.get(env.ROPE.idFromName("singleton"));
      const inner = new URL(request.url);
      inner.pathname = url.pathname.slice(4) || "/";
      return stub.fetch(new Request(inner, request));
    }

    const m = LIST_RE.exec(decodePath(url.pathname));
    if (m && request.method === "GET") {
      return renderListShell(env, request, m[1], m[2]);
    }

    // SPA fallback for /u/<actor> — a plain "no dot in the path means it's a
    // route, not a file" heuristic (used elsewhere in this repo) breaks here
    // specifically: handles routinely end in a real TLD-shaped suffix
    // (bisks.net, anyone.bsky.social), which a trailing \.[a-z]+$ regex reads
    // as a file extension and 404s. Match the one dynamic prefix explicitly
    // instead and let public/index.html's router read location.pathname.
    if (request.method === "GET" && /^\/u\/[^/]+\/?$/.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }

    return env.ASSETS.fetch(request);
  },
};

// --- atproto identity + record verification ---------------------------------

const PLC_DIR = "https://plc.directory";

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
function parseListUri(uri: string): { ownerDid: string; rkey: string } | null {
  const m = /^at:\/\/(did:[^/]+)\/app\.bsky\.graph\.list\/([^/]+)$/.exec(String(uri || ""));
  if (!m) return null;
  return { ownerDid: m[1], rkey: m[2] };
}

// Verify that `uri` really is a record the claimed author wrote to their own
// PDS, and that it matches the expected collection. This is the only
// identity check this Worker ever does — no session, no cookie, no bearer
// token touches it. Returns the record's `value` plus a resolved handle.
async function verifyOwnRecord(
  uri: string,
  expectCollection: string,
): Promise<{ did: string; handle: string; value: any } | { error: string; status: number }> {
  const parsed = parseAtUri(uri);
  if (!parsed) return { error: "not a valid at:// record uri", status: 400 };
  if (parsed.collection !== expectCollection) return { error: "wrong record type", status: 400 };
  const doc = await resolveDidDoc(parsed.did);
  if (!doc) return { error: "couldn't resolve that DID's identity", status: 400 };
  const pds = pdsFromDoc(doc);
  if (!pds) return { error: "couldn't resolve that DID's PDS", status: 400 };
  const rec = await getPdsRecord(pds, parsed.did, parsed.collection, parsed.rkey);
  if (!rec || !rec.value) return { error: "record not found on the author's PDS", status: 404 };
  return { did: parsed.did, handle: handleFromDoc(doc, parsed.did), value: rec.value };
}

// Confirms `uri` no longer resolves on its claimed author's own PDS — used
// to accept a cancellation (the requester deleted their own request record).
async function verifyRecordGone(uri: string): Promise<boolean> {
  const parsed = parseAtUri(uri);
  if (!parsed) return false;
  const doc = await resolveDidDoc(parsed.did);
  const pds = doc ? pdsFromDoc(doc) : null;
  if (!pds) return false;
  const rec = await getPdsRecord(pds, parsed.did, parsed.collection, parsed.rkey);
  return !rec;
}

// --- Rope Durable Object -----------------------------------------------------
//
// One singleton instance holds the whole request/decision queue, site-wide —
// tiny scale, same shape as sites/guestbet's single "global" Market DO.
// Storage keys:
//   req:<requestUri>   a RequestRow, keyed by the requester's own record uri
//   seen:<record-uri>  replay guard — each PDS record applies once

const REQUEST_COLLECTION = "net.bisks.velvetrope.request";
const DECISION_COLLECTION = "net.bisks.velvetrope.decision";
const MAX_RECORD_AGE_MS = 15 * 60 * 1000;
const MAX_BATCH = 200;

type Action = "add" | "remove";
type Status = "pending" | "approved" | "denied" | "cancelled" | "superseded";

interface RequestRow {
  uri: string;
  listUri: string;
  ownerDid: string;
  requesterDid: string;
  requesterHandle: string;
  action: Action;
  status: Status;
  createdAt: string;
  resolvedAt?: string;
  decisionUri?: string;
  reason?: string;
}

const MAX_REASON_LEN = 500;

function freshAt(createdAtIso: string): number {
  const ms = Date.parse(createdAtIso || "");
  return Number.isFinite(ms) ? ms : Date.now();
}

export class Rope {
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState) {
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === "/requests" && method === "POST") return this.handleSubmit(request);
      if (path === "/cancel" && method === "POST") return this.handleCancel(request);
      if (path === "/resolve" && method === "POST") return this.handleResolve(request);
      if (path === "/queue" && method === "GET") {
        const list = url.searchParams.get("list") || "";
        return json({ requests: await this.queueFor(list) });
      }
      if (path === "/counts" && method === "GET") {
        const owner = url.searchParams.get("owner") || "";
        return json({ counts: await this.countsFor(owner) });
      }
    } catch (e: any) {
      return json({ error: e?.message || "internal error" }, 500);
    }
    return json({ error: "not found" }, 404);
  }

  private async allRequests(): Promise<RequestRow[]> {
    const map = await this.storage.list<RequestRow>({ prefix: "req:" });
    return [...map.values()];
  }

  private async queueFor(listUri: string): Promise<RequestRow[]> {
    const all = await this.allRequests();
    return all
      .filter((r) => r.listUri === listUri)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  private async countsFor(ownerDid: string): Promise<Record<string, number>> {
    const all = await this.allRequests();
    const out: Record<string, number> = {};
    for (const r of all) {
      if (r.ownerDid !== ownerDid || r.status !== "pending") continue;
      out[r.listUri] = (out[r.listUri] || 0) + 1;
    }
    return out;
  }

  private async handleSubmit(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);
    if (await this.storage.get(`seen:${body.uri}`)) return json({ error: "already applied" }, 409);

    const verified = await verifyOwnRecord(body.uri, REQUEST_COLLECTION);
    if ("error" in verified) return json(verified, verified.status);
    const { did: requesterDid, handle, value: v } = verified;

    const action: Action | null = v.action === "remove" ? "remove" : v.action === "add" ? "add" : null;
    if (!action) return json({ error: "record action must be 'add' or 'remove'" }, 400);
    const listUri = String(v.list || "");
    const parsed = parseListUri(listUri);
    if (!parsed) return json({ error: "record's list isn't a valid moderation-list uri" }, 400);
    if (parsed.ownerDid === requesterDid) return json({ error: "you already own that list" }, 400);

    const validAt = freshAt(v.createdAt);
    if (Date.now() - validAt > MAX_RECORD_AGE_MS)
      return json({ error: "that record is too old to apply — write a fresh one" }, 400);

    const reason = typeof v.reason === "string" && v.reason.trim() ? v.reason.trim().slice(0, MAX_REASON_LEN) : undefined;

    // Supersede any still-pending request from the same requester for the
    // same list (they changed their mind, or double-submitted).
    const all = await this.allRequests();
    for (const r of all) {
      if (r.status === "pending" && r.requesterDid === requesterDid && r.listUri === listUri && r.uri !== body.uri) {
        r.status = "superseded";
        r.resolvedAt = new Date().toISOString();
        await this.storage.put(`req:${r.uri}`, r);
      }
    }

    const row: RequestRow = {
      uri: body.uri,
      listUri,
      ownerDid: parsed.ownerDid,
      requesterDid,
      requesterHandle: handle,
      action,
      status: "pending",
      createdAt: new Date(validAt).toISOString(),
      ...(reason ? { reason } : {}),
    };
    await this.storage.put(`req:${body.uri}`, row);
    await this.storage.put(`seen:${body.uri}`, true);
    return json({ ok: true, request: row });
  }

  private async handleCancel(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);
    const row = await this.storage.get<RequestRow>(`req:${body.uri}`);
    if (!row) return json({ error: "no such request" }, 404);
    if (row.status === "cancelled") return json({ ok: true, request: row });
    if (row.status !== "pending") return json({ error: `request is already ${row.status}` }, 409);
    const gone = await verifyRecordGone(body.uri);
    if (!gone) return json({ error: "that record still exists on your PDS — delete it first" }, 409);
    row.status = "cancelled";
    row.resolvedAt = new Date().toISOString();
    await this.storage.put(`req:${body.uri}`, row);
    return json({ ok: true, request: row });
  }

  private async handleResolve(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { uri?: string } | null;
    if (!body?.uri) return json({ error: "missing uri" }, 400);
    if (await this.storage.get(`seen:${body.uri}`)) return json({ error: "already applied" }, 409);

    const verified = await verifyOwnRecord(body.uri, DECISION_COLLECTION);
    if ("error" in verified) return json(verified, verified.status);
    const { did: ownerDid, value: v } = verified;

    const decision: Status | null = v.decision === "deny" ? "denied" : v.decision === "approve" ? "approved" : null;
    if (!decision) return json({ error: "record decision must be 'approve' or 'deny'" }, 400);
    const listUri = String(v.list || "");
    const parsed = parseListUri(listUri);
    if (!parsed || parsed.ownerDid !== ownerDid)
      return json({ error: "you don't own that list" }, 403);
    const requestUris: string[] = Array.isArray(v.requests) ? v.requests.slice(0, MAX_BATCH) : [];
    if (!requestUris.length) return json({ error: "record names no requests" }, 400);

    const validAt = freshAt(v.createdAt);
    if (Date.now() - validAt > MAX_RECORD_AGE_MS)
      return json({ error: "that record is too old to apply — write a fresh one" }, 400);

    const applied: string[] = [];
    const skipped: string[] = [];
    const resolvedAt = new Date().toISOString();
    for (const reqUri of requestUris) {
      const row = await this.storage.get<RequestRow>(`req:${reqUri}`);
      if (!row || row.listUri !== listUri || row.status !== "pending") {
        skipped.push(reqUri);
        continue;
      }
      row.status = decision;
      row.resolvedAt = resolvedAt;
      row.decisionUri = body.uri;
      await this.storage.put(`req:${reqUri}`, row);
      applied.push(reqUri);
    }
    await this.storage.put(`seen:${body.uri}`, true);
    return json({ ok: true, decision, applied, skipped });
  }
}
