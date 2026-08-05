// runnerup Worker — runnerup.bisks.net
//
// @mfzx.net is hardcoded into 2nd place, permanently. 1st place is
// permanently vacant — it's already spoken for, over at hyperobject.bisks.net
// (where @isolyth.dev sits enthroned). Everyone else can climb onto the
// podium and get boosted by visitors, a real shared Durable Object list
// (not a private per-browser fiction), competing for 3rd place and below.
// A client submits only a DID; the Worker re-resolves that DID's own profile
// itself (app.bsky.actor.getProfile) before storing anything, so nobody can
// climb onto the podium under someone else's identity, same fix as
// hyperobject/src/index.ts. mfzx.net's own DID (resolved once, cached in
// storage) can never join the climbers list — they don't need to, they're
// already locked into silver forever.
//
// /s/<handle> personalizes the OG/share unfurl per climber, same fix as
// didscope and hyperobject: a static page serves one cached generic embed
// forever, so a real per-handle URL with server-stamped og:title/description
// is needed for every share to look distinct. Falls through to ASSETS for
// everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  PODIUM: DurableObjectNamespace;
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

const SILVER_HANDLE = "mfzx.net";
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

interface ClimberEntry {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  boast?: string;
  votes: number;
  joinedAt: number;
  lastBoostAt: number;
}

export class Podium {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/podium" && request.method === "GET") {
      const entries = await this.state.storage.list<ClimberEntry>({ prefix: "entry:" });
      const all = [...entries.values()].sort((a, b) => b.votes - a.votes || a.joinedAt - b.joinedAt);
      return json({ entries: all, total: all.length });
    }

    if (url.pathname === "/api/join" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }

      const did = typeof body?.did === "string" && body.did.startsWith("did:") ? body.did : null;
      if (!did) return json({ error: "missing did" }, 400);

      const silverDid = await this.getSilverDid();
      if (did === silverDid) {
        return json({ error: "mfzx.net doesn't need to climb. they're already locked into 2nd, forever." }, 400);
      }

      let profile: any;
      try {
        profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
      } catch {
        return json({ error: "couldn't verify that did against the appview" }, 502);
      }

      const boast = typeof body?.boast === "string" ? body.boast.trim().slice(0, 140) : "";
      const key = `entry:${did}`;
      const existing = await this.state.storage.get<ClimberEntry>(key);
      const now = Date.now();

      const entry: ClimberEntry = {
        did,
        handle: profile.handle,
        displayName: typeof profile.displayName === "string" ? profile.displayName.slice(0, 200) : undefined,
        avatar: typeof profile.avatar === "string" ? profile.avatar : undefined,
        boast: boast || existing?.boast,
        votes: existing?.votes ?? 0,
        joinedAt: existing?.joinedAt ?? now,
        lastBoostAt: existing?.lastBoostAt ?? now,
      };
      await this.state.storage.put({ [key]: entry });

      return json({ entry });
    }

    if (url.pathname === "/api/boost" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }

      const did = typeof body?.did === "string" ? body.did : null;
      const voterId = typeof body?.voterId === "string" ? body.voterId.slice(0, 100) : null;
      if (!did || !voterId) return json({ error: "missing did or voterId" }, 400);

      const key = `entry:${did}`;
      const entry = await this.state.storage.get<ClimberEntry>(key);
      if (!entry) return json({ error: "no such climber" }, 404);

      const votersKey = `voters:${did}`;
      const voters = (await this.state.storage.get<string[]>(votersKey)) ?? [];
      if (voters.includes(voterId)) {
        return json({ entry, boosted: false });
      }
      voters.push(voterId);
      // cap so the list can't grow unbounded from a determined pest
      const trimmedVoters = voters.slice(-5000);

      entry.votes += 1;
      entry.lastBoostAt = Date.now();
      await this.state.storage.put({ [key]: entry, [votersKey]: trimmedVoters });

      return json({ entry, boosted: true });
    }

    return json({ error: "not found" }, 404);
  }

  private async getSilverDid(): Promise<string | null> {
    const cached = await this.state.storage.get<string>("meta:silverDid");
    if (cached) return cached;
    try {
      const r = await xrpc("com.atproto.identity.resolveHandle", { handle: SILVER_HANDLE });
      if (r.did) await this.state.storage.put({ "meta:silverDid": r.did });
      return r.did ?? null;
    } catch {
      return null;
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

const GENERIC_TITLE = "runnerup — @mfzx.net is permanently 2nd place.";
const GENERIC_DESC =
  "1st is already taken (ask hyperobject.bisks.net). mfzx.net has 2nd locked down forever. everyone else climbs for 3rd and below.";
const GENERIC_OG_URL = "https://runnerup.bisks.net/";

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

    const title = `runnerup: ${who} is climbing the podium`;
    const desc = truncate(
      `${who} is fighting for 3rd place and below on runnerup.bisks.net. 1st is spoken for, 2nd belongs to @mfzx.net forever — but bronze is up for grabs.`,
      300
    );
    const ogUrl = `https://runnerup.bisks.net/s/${encodeURIComponent(handle)}`;

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

    if (url.pathname === "/api/podium" || url.pathname === "/api/join" || url.pathname === "/api/boost") {
      const id = env.PODIUM.idFromName("global");
      const stub = env.PODIUM.get(id);
      return stub.fetch(request);
    }

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
