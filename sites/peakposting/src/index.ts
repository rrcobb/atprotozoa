// peakposting Worker — peakposting.bisks.net
//
// The scan itself (pull an entire account's posts, find the ones with the
// most likes/reposts/replies) runs client-side in public/index.html, paging
// through app.bsky.feed.getAuthorFeed against the public AppView — no auth,
// no server round-trip needed for that part.
//
// The one thing that needs real shared state: the leaderboard. Every DID
// that's ever scanned itself gets its best-ever likes/reposts/replies counts
// recorded in a Durable Object, and /api/leaderboard reads that back sorted.
// A client could just POST whatever numbers it wants, so /api/submit doesn't
// trust the client's counts at all — it takes only post URIs, re-fetches
// them itself via app.bsky.feed.getPosts, and only banks a new best if that
// post's *server-verified* author matches the claimed DID and its count
// actually beats what's stored.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  BOARD: DurableObjectNamespace;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/leaderboard" || url.pathname === "/api/submit") {
      const id = env.BOARD.idFromName("global");
      const stub = env.BOARD.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

interface BestPost {
  count: number;
  uri: string;
  text: string;
  createdAt: string;
}

interface UserRecord {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  bestLikes?: BestPost;
  bestReposts?: BestPost;
  bestReplies?: BestPost;
  updatedAt: number;
}

type Metric = "likes" | "reposts" | "replies";
const METRICS: Metric[] = ["likes", "reposts", "replies"];
const FIELD: Record<Metric, keyof Pick<UserRecord, "bestLikes" | "bestReposts" | "bestReplies">> = {
  likes: "bestLikes",
  reposts: "bestReposts",
  replies: "bestReplies",
};
const COUNT_KEY: Record<Metric, string> = {
  likes: "likeCount",
  reposts: "repostCount",
  replies: "replyCount",
};

const LEADERBOARD_SIZE = 50;
const API = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: URLSearchParams): Promise<any> {
  const qs = params.toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 30 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

function isSafe(record: UserRecord | undefined, metric: Metric, count: number): boolean {
  if (!record) return true;
  const existing = record[FIELD[metric]];
  return !existing || count > existing.count;
}

// Holds one UserRecord per DID that's ever submitted a scan, under a
// "user:<did>" key. The leaderboard is that user set, sorted by each metric
// on read — nobody's expecting sub-millisecond reads out of a leaderboard
// whose entire dataset is "how many people have used this site."
export class Board {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      const users = await this.state.storage.list<UserRecord>({ prefix: "user:" });
      const all = [...users.values()];
      const board: Record<string, unknown[]> = {};
      for (const metric of METRICS) {
        const field = FIELD[metric];
        board[metric] = all
          .filter((r) => r[field])
          .sort((a, b) => (b[field]!.count) - (a[field]!.count))
          .slice(0, LEADERBOARD_SIZE)
          .map((r) => ({
            did: r.did,
            handle: r.handle,
            displayName: r.displayName,
            avatar: r.avatar,
            count: r[field]!.count,
            uri: r[field]!.uri,
            text: r[field]!.text,
          }));
      }
      board.scanners = all.length;
      return json(board);
    }

    if (url.pathname === "/api/submit" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }

      const did = typeof body?.did === "string" && body.did.startsWith("did:") ? body.did : null;
      const handle = typeof body?.handle === "string" && body.handle ? body.handle : did;
      if (!did) return json({ error: "missing did" }, 400);

      const top = body?.top && typeof body.top === "object" ? body.top : {};
      const uris: Record<Metric, string | null> = {
        likes: typeof top.likes === "string" && top.likes.startsWith("at://") ? top.likes : null,
        reposts: typeof top.reposts === "string" && top.reposts.startsWith("at://") ? top.reposts : null,
        replies: typeof top.replies === "string" && top.replies.startsWith("at://") ? top.replies : null,
      };
      const uniqueUris = [...new Set(Object.values(uris).filter((u): u is string => !!u))];
      if (!uniqueUris.length) return json({ error: "nothing to submit" }, 400);

      const key = `user:${did}`;
      const existing = await this.state.storage.get<UserRecord>(key);

      // Re-fetch the claimed posts ourselves — never trust client-supplied
      // counts. Cap at 25 uris per AppView call; we only ever send <=3.
      const params = new URLSearchParams();
      for (const u of uniqueUris) params.append("uris", u);
      let fetched: any[] = [];
      try {
        const r = await xrpc("app.bsky.feed.getPosts", params);
        fetched = Array.isArray(r.posts) ? r.posts : [];
      } catch {
        return json({ error: "couldn't verify posts against the appview" }, 502);
      }
      const byUri = new Map(fetched.map((p: any) => [p.uri, p]));

      const record: UserRecord = existing ?? { did, handle, updatedAt: 0 };
      record.handle = handle;
      if (typeof body?.displayName === "string") record.displayName = body.displayName.slice(0, 200);
      if (typeof body?.avatar === "string" && body.avatar.startsWith("https://")) record.avatar = body.avatar;

      let changed = false;
      for (const metric of METRICS) {
        const uri = uris[metric];
        if (!uri) continue;
        const post = byUri.get(uri);
        if (!post || post.author?.did !== did) continue; // can't claim someone else's post
        const count = Number(post[COUNT_KEY[metric]] ?? 0);
        if (!Number.isFinite(count) || count <= 0) continue;
        if (!isSafe(record, metric, count)) continue;

        const text = typeof post.record?.text === "string" ? post.record.text.slice(0, 300) : "";
        record[FIELD[metric]] = {
          count,
          uri,
          text,
          createdAt: typeof post.record?.createdAt === "string" ? post.record.createdAt : "",
        };
        changed = true;
      }

      if (changed) {
        record.updatedAt = Date.now();
        await this.state.storage.put({ [key]: record });
      }

      return json({
        did,
        bestLikes: record.bestLikes ?? null,
        bestReposts: record.bestReposts ?? null,
        bestReplies: record.bestReplies ?? null,
        changed,
      });
    }

    return json({ error: "not found" }, 404);
  }
}
