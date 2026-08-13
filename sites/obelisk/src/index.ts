// Served at the root of obelisk.bisks.net. Mostly a static page (the
// original build), but @shimmermathlabs.com asked for a real parole clause:
// if @norvid-studies.bsky.social ever publicly posts the words "i learned my
// lesson", the obelisk unlocks. That has to be checked against his own
// words on his own PDS, not a self-report from the page — same trust model
// as sites/duohaunt/sites/hyperobject's verifyOwnRecord, just simpler: read
// his public feed off the AppView instead of trusting a client claim.
//
// A scheduled() cron polls every 15min regardless of traffic (see
// wrangler.toml's [triggers]) and GET /api/status also opportunistically
// kicks a check if the last one is stale, so the parole clause doesn't
// depend on the cron having fired yet right after deploy. Unlock state
// lives in a single-instance Durable Object — once granted, it's permanent
// (no re-locking, no admin override).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  OBELISK: DurableObjectNamespace;
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
const SUBJECT = "norvid-studies.bsky.social";
const TRIGGER = "i learned my lesson";
const RECHECK_MS = 4 * 60 * 1000; // don't let /api/status trigger a live check more than once per ~4min

interface ObeliskStateShape {
  unlocked: boolean;
  unlockedAt: number | null;
  matchedText: string | null;
  matchedUri: string | null;
  matchedLink: string | null;
  matchedAt: string | null;
  lastCheckedAt: number | null;
}

const DEFAULT_STATE: ObeliskStateShape = {
  unlocked: false,
  unlockedAt: null,
  matchedText: null,
  matchedUri: null,
  matchedLink: null,
  matchedAt: null,
  lastCheckedAt: null,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

function postLink(uri: string): string {
  // at://<did>/app.bsky.feed.post/<rkey> -> https://bsky.app/profile/<did>/post/<rkey>
  const parts = uri.replace("at://", "").split("/");
  const did = parts[0];
  const rkey = parts[2];
  return `https://bsky.app/profile/${did}/post/${rkey}`;
}

export class ObeliskState {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/get") {
      const s = (await this.state.storage.get<ObeliskStateShape>("state")) || DEFAULT_STATE;
      return json(s);
    }

    if (url.pathname === "/mark-checked" && request.method === "POST") {
      const existing = (await this.state.storage.get<ObeliskStateShape>("state")) || DEFAULT_STATE;
      const next = { ...existing, lastCheckedAt: Date.now() };
      await this.state.storage.put({ state: next });
      return json(next);
    }

    if (url.pathname === "/unlock" && request.method === "POST") {
      const existing = (await this.state.storage.get<ObeliskStateShape>("state")) || DEFAULT_STATE;
      if (existing.unlocked) return json(existing);
      const body = (await request.json()) as {
        matchedText: string;
        matchedUri: string;
        matchedAt: string;
      };
      const next: ObeliskStateShape = {
        ...existing,
        unlocked: true,
        unlockedAt: Date.now(),
        matchedText: body.matchedText,
        matchedUri: body.matchedUri,
        matchedLink: postLink(body.matchedUri),
        matchedAt: body.matchedAt,
      };
      await this.state.storage.put({ state: next });
      return json(next);
    }

    return new Response("not found", { status: 404 });
  }
}

function stub(env: Env): DurableObjectStub {
  return env.OBELISK.get(env.OBELISK.idFromName("global"));
}

async function getState(env: Env): Promise<ObeliskStateShape> {
  const res = await stub(env).fetch(new Request("https://do/get"));
  return res.json();
}

async function checkNorvid(env: Env): Promise<void> {
  const current = await getState(env);
  if (current.unlocked) return;

  // Bump lastCheckedAt first so concurrent triggers (cron tick landing at
  // the same moment as a page-load fallback check) don't both hit the AppView.
  await stub(env).fetch(
    new Request("https://do/mark-checked", { method: "POST" })
  );

  try {
    const feed = await xrpc("app.bsky.feed.getAuthorFeed", {
      actor: SUBJECT,
      limit: "100",
      filter: "posts_with_replies",
    });
    const items: any[] = feed.feed || [];
    for (const item of items) {
      const post = item.post;
      if (!post || post.author?.handle !== SUBJECT) continue;
      const text: string = post.record?.text || "";
      if (text.toLowerCase().includes(TRIGGER)) {
        await stub(env).fetch(
          new Request("https://do/unlock", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              matchedText: post.record.text,
              matchedUri: post.uri,
              matchedAt: post.record.createdAt || null,
            }),
          })
        );
        return;
      }
    }
  } catch {
    // AppView hiccup — next tick (cron or lazy) tries again.
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/status") {
      const s = await getState(env);
      if (!s.unlocked && (!s.lastCheckedAt || Date.now() - s.lastCheckedAt > RECHECK_MS)) {
        ctx.waitUntil(checkNorvid(env));
      }
      return json(s);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(checkNorvid(env));
  },
};
