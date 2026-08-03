// dontpressit Worker — dontpressit.bisks.net
//
// v1: @fromthewestmeadow.com asked for a site with one button labeled "do not
// press this button" — a single global button, first press anywhere ends it
// forever, no reset. That shipped, and about a day later somebody sniped it.
//
// v2, from the thread that followed: @fromthewestmeadow.com wanted a reset so
// it could go again; @shimmermathlabs.com proposed something better than a
// timer — "it should always be going. pressing it 'ends' the current round,
// starts the next round," each round carrying a name, and pressing
// "graduates" that name so it can never come up again. shimmermathlabs' own
// follow-up — "the names can be bsky account names that follow you or
// something" — is what this implements: every round belongs to a real
// account pulled from @fromthewestmeadow.com's followers (the requester the
// bot builds for), and graduating a round retires that handle permanently.
// fromthewestmeadow.com signed off on the combined idea in-thread ("Ooh I
// like that"), so this supersedes the plain-reset ask rather than doing both.
//
// (@7778777.online's loud-sound/points idea from the same thread isn't built
// here — autoplaying audio at other visitors is a bad citizen move on a site
// that's meant to be dropped into a timeline, so it's left out rather than
// built badly.)
//
// Still a brand-new-style site served at the root of its own hostname — no
// mount-prefix stripping. See notes/40-new-site-playbook.md.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  PRESS: DurableObjectNamespace;
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
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/state" || url.pathname === "/api/press") {
      const id = env.PRESS.idFromName("global");
      const stub = env.PRESS.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

// The pool this button draws round-names from: @fromthewestmeadow.com's
// followers, read anonymously off Bluesky's public AppView. No auth needed.
const POOL_SOURCE_HANDLE = "fromthewestmeadow.com";
const PUB = "https://public.api.bsky.app/xrpc";
const POOL_PAGES = 5; // up to ~500 followers per refresh
const POOL_STALE_MS = 6 * 60 * 60 * 1000; // refetch at most every 6h

interface Candidate {
  handle: string;
  displayName: string;
  avatar: string;
}
interface RoundName {
  handle: string;
  displayName: string;
  avatar: string;
}
interface GraduatedEntry {
  handle: string;
  displayName: string;
  avatar: string;
  roundNumber: number;
  endedAt: number;
  visits: number;
  futileClicks: number;
}

async function jget(url: string): Promise<any> {
  const res = await fetch(url, { cf: { cacheTtl: 60 } as unknown as Record<string, unknown> });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchFollowerPool(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  try {
    const { did } = await jget(
      `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(POOL_SOURCE_HANDLE)}`,
    );
    let cursor = "";
    for (let p = 0; p < POOL_PAGES; p++) {
      const u = new URL(`${PUB}/app.bsky.graph.getFollowers`);
      u.searchParams.set("actor", did);
      u.searchParams.set("limit", "100");
      if (cursor) u.searchParams.set("cursor", cursor);
      const d = await jget(u.toString());
      for (const f of d.followers || []) {
        if (!f.handle || f.handle.endsWith(".invalid")) continue;
        out.push({
          handle: f.handle,
          displayName: f.displayName || f.handle,
          avatar: f.avatar || "",
        });
      }
      cursor = d.cursor;
      if (!cursor) break;
    }
  } catch {
    // Network hiccup — caller falls back to whatever pool it already has,
    // or a synthetic name if the pool is empty too.
  }
  return out;
}

function syntheticName(roundNumber: number): RoundName {
  return { handle: `round-${roundNumber}`, displayName: `round ${roundNumber}`, avatar: "" };
}

// One instance ever ("global"). blockConcurrencyWhile loads persisted state
// before any request is handled, and the check-then-set in fetch() below has
// no await between them — a Durable Object is single-threaded and only
// yields at an await, so that's enough to make "first press of a round wins"
// atomic without a storage transaction.
export class PressState {
  private state: DurableObjectState;

  private roundNumber = 0;
  private currentName: RoundName | null = null;
  private roundStartedAt = 0;
  private futileClicks = 0;
  private visits = 0;

  private graduatedHandles: string[] = []; // full history, for "never again"
  private graduatedLog: GraduatedEntry[] = []; // trimmed, for display

  private pool: Candidate[] = [];
  private poolFetchedAt = 0;

  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = state.blockConcurrencyWhile(async () => {
      const [roundNumber, currentName, roundStartedAt, futileClicks, visits, graduatedHandles, graduatedLog, pool, poolFetchedAt] =
        await Promise.all([
          state.storage.get<number>("roundNumber"),
          state.storage.get<RoundName>("currentName"),
          state.storage.get<number>("roundStartedAt"),
          state.storage.get<number>("futileClicks"),
          state.storage.get<number>("visits"),
          state.storage.get<string[]>("graduatedHandles"),
          state.storage.get<GraduatedEntry[]>("graduatedLog"),
          state.storage.get<Candidate[]>("pool"),
          state.storage.get<number>("poolFetchedAt"),
        ]);
      this.roundNumber = roundNumber ?? 0;
      this.currentName = currentName ?? null;
      this.roundStartedAt = roundStartedAt ?? 0;
      this.futileClicks = futileClicks ?? 0;
      this.visits = visits ?? 0;
      this.graduatedHandles = graduatedHandles ?? [];
      this.graduatedLog = graduatedLog ?? [];
      this.pool = pool ?? [];
      this.poolFetchedAt = poolFetchedAt ?? 0;

      if (!this.currentName) {
        await this.refreshPool();
        await this.startRound(1);
      }
    });
  }

  private async refreshPool(): Promise<void> {
    const fresh = await fetchFollowerPool();
    if (fresh.length > 0) {
      this.pool = fresh;
      this.poolFetchedAt = Date.now();
      await this.state.storage.put({ pool: this.pool, poolFetchedAt: this.poolFetchedAt });
    }
  }

  private async pickNextName(): Promise<RoundName> {
    const graduated = new Set(this.graduatedHandles);
    let candidates = this.pool.filter((c) => !graduated.has(c.handle));
    if (candidates.length === 0 && Date.now() - this.poolFetchedAt > 60_000) {
      await this.refreshPool();
      candidates = this.pool.filter((c) => !graduated.has(c.handle));
    }
    if (candidates.length === 0) return syntheticName(this.roundNumber + 1);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return { handle: pick.handle, displayName: pick.displayName, avatar: pick.avatar };
  }

  private async startRound(n: number): Promise<void> {
    this.roundNumber = n;
    this.currentName = await this.pickNextName();
    this.roundStartedAt = Date.now();
    this.futileClicks = 0;
    this.visits = 0;
    await this.state.storage.put({
      roundNumber: this.roundNumber,
      currentName: this.currentName,
      roundStartedAt: this.roundStartedAt,
      futileClicks: this.futileClicks,
      visits: this.visits,
    });
  }

  private publicState(extra: Record<string, unknown> = {}) {
    return {
      roundNumber: this.roundNumber,
      currentName: this.currentName,
      roundStartedAt: this.roundStartedAt,
      futileClicks: this.futileClicks,
      visits: this.visits,
      totalGraduated: this.graduatedHandles.length,
      graduated: this.graduatedLog.slice(-12).reverse(),
      ...extra,
    };
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/api/state") {
      this.visits++;
      await this.state.storage.put({ visits: this.visits });
      return json(this.publicState());
    }

    if (url.pathname === "/api/press" && request.method === "POST") {
      const graduated: GraduatedEntry = {
        handle: this.currentName!.handle,
        displayName: this.currentName!.displayName,
        avatar: this.currentName!.avatar,
        roundNumber: this.roundNumber,
        endedAt: Date.now(),
        visits: this.visits,
        futileClicks: this.futileClicks,
      };
      this.graduatedHandles.push(graduated.handle);
      this.graduatedLog.push(graduated);
      // Keep the display log bounded; graduatedHandles (the "never again"
      // check) stays unbounded on purpose.
      if (this.graduatedLog.length > 200) this.graduatedLog = this.graduatedLog.slice(-200);
      await this.state.storage.put({
        graduatedHandles: this.graduatedHandles,
        graduatedLog: this.graduatedLog,
      });

      await this.startRound(this.roundNumber + 1);

      return json(this.publicState({ justGraduated: graduated }));
    }

    return json({ error: "not found" });
  }
}
