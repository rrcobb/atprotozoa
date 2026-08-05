// hyperobject Worker — hyperobject.bisks.net
//
// @isolyth.dev is hardcoded as THE hyperobject — the one fixed point at the
// top. Everyone else who gets typed into the form can be "cast into the pit,"
// a real shared Durable Object list that every visitor sees (not a private
// per-browser fiction): casting is a public, permanent act. A client submits
// only a DID; the Worker re-resolves that DID's own profile itself
// (app.bsky.actor.getProfile) before storing anything, so nobody can cast a
// fake name/avatar in under someone else's identity, and isolyth.dev's own
// DID (resolved once, cached in storage) can never be cast into their own pit.
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

interface PitEntry {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  note?: string;
  count: number;
  firstCastAt: number;
  lastCastAt: number;
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

      const did = typeof body?.did === "string" && body.did.startsWith("did:") ? body.did : null;
      if (!did) return json({ error: "missing did" }, 400);

      const hyperobjectDid = await this.getHyperobjectDid();
      if (did === hyperobjectDid) {
        return json({ error: "isolyth.dev is the hyperobject. they cannot be cast beneath themselves." }, 400);
      }

      let profile: any;
      try {
        profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
      } catch {
        return json({ error: "couldn't verify that did against the appview" }, 502);
      }

      const note = typeof body?.note === "string" ? body.note.trim().slice(0, 140) : "";
      const key = `entry:${did}`;
      const existing = await this.state.storage.get<PitEntry>(key);
      const now = Date.now();

      const entry: PitEntry = {
        did,
        handle: profile.handle,
        displayName: typeof profile.displayName === "string" ? profile.displayName.slice(0, 200) : undefined,
        avatar: typeof profile.avatar === "string" ? profile.avatar : undefined,
        note: note || existing?.note,
        count: (existing?.count ?? 0) + 1,
        firstCastAt: existing?.firstCastAt ?? now,
        lastCastAt: now,
      };
      await this.state.storage.put({ [key]: entry });

      return json({ entry });
    }

    return json({ error: "not found" }, 404);
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

    if (url.pathname === "/api/pit" || url.pathname === "/api/cast") {
      const id = env.PIT.idFromName("global");
      const stub = env.PIT.get(id);
      return stub.fetch(request);
    }

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
