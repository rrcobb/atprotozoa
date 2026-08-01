// didrank Worker — didrank.bisks.net
//
// @fromthewestmeadow.com asked for a live leaderboard of the most-frequently-
// seen Bluesky DIDs, broken out across rolling windows: 1m, 5m, 1h, 12h, 24h,
// 7d, 30d, 182d, 365d, all-time. "Frequently seen" = DIDs that authored the
// most app.bsky.feed.post creates in that window, watched straight off the
// Jetstream firehose (not likes/reposts/follows — those are dominated by
// high-frequency engagement bots and would make "most active poster" mean
// something less interesting).
//
// One Durable Object holds all the rolling state — same "one DO watches
// Jetstream, alarm closes out buckets" shape as sites/mootstream's
// ActivityTracker (this site's lineage). Two bucket granularities, sized so
// storage never blows up even after a year of uptime:
//   - per-minute buckets ("m:<epochMinute>"), capped to the top ~250 DIDs by
//     count, retained 25h — backs the 1m/5m/1h/12h/24h windows.
//   - per-day buckets ("d:<epochDay>"), capped to the top ~150 DIDs by count,
//     kept forever (tiny: ~150 entries/day, a year is a few MB total) —
//     backs the 7d/30d/182d/365d/all-time windows.
// A window whose full span hasn't elapsed since trackingStartedAt just has
// less data to sum over — the API reports that honestly (fullyCovered,
// coverageMs) so the client can show a "still filling in" note instead of
// pretending a week-old site has a year of history.
//
// Brand-new site, served at the root of its own hostname — no mount-prefix
// stripping needed. See notes/40-new-site-playbook.md.

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
  delete(keys: string[]): Promise<number>;
  list<T = unknown>(opts: {
    prefix: string;
    start?: string;
    end?: string;
    limit?: number;
  }): Promise<Map<string, T>>;
  setAlarm(time: number | Date): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  TRACKER: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const id = env.TRACKER.idFromName("global");
      const stub = env.TRACKER.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- config ------------------------------------------------------------------
const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const ALARM_MS = 20 * 1000; // heartbeat / reconnect / bucket-close cadence
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_RETENTION = 25 * 60; // minutes of "m:" buckets to keep (25h)
const TOP_PER_MINUTE = 500; // bumped from 250 so a 1000-row leaderboard has enough depth to merge from
const TOP_PER_DAY = 300; // bumped from 150, same reason, for the day-bucket-backed long windows
const PROFILE_TTL_MS = 60 * 60 * 1000;
const MAX_ALARM_CATCHUP = 3000; // guard against a runaway loop after a long cold start

export const WINDOWS: Record<string, number> = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "182d": 182 * DAY_MS,
  "365d": 365 * DAY_MS,
  all: Infinity,
};
const SHORT_WINDOWS = new Set(["1m", "5m", "1h", "12h", "24h"]);

// Calendar-date views, requested on the same thread as the original windows:
// "who posted the most on New Year's Eve / Valentine's Day / Christmas Day"
// specifically — not just any 24h window, the actual date. Backed by the
// same "d:" day buckets the long rolling windows use, just filtered down to
// the buckets whose UTC calendar date matches, summed across however many
// years of that date have been tracked so far (could be zero).
export const HOLIDAYS: Record<string, { month: number; day: number; label: string }> = {
  "new-years-eve": { month: 12, day: 31, label: "New Year's Eve" },
  "valentines-day": { month: 2, day: 14, label: "Valentine's Day" },
  christmas: { month: 12, day: 25, label: "Christmas Day" },
};

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}
const minuteKey = (m: number) => `m:${pad(m, 12)}`;
const dayKey = (d: number) => `d:${pad(d, 8)}`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

function topEntries(counts: Map<string, number>, limit: number): [string, number][] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

interface Profile {
  handle: string;
  displayName?: string;
  avatar?: string;
  fetchedAt: number;
}

export class DidTracker {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private ws: any = null;
  private reconnectDelay = 1000;

  private trackingStartedAt = 0;
  private totalSeen = 0;
  private lastUpdated = 0;

  private currentMinute = 0; // epoch-minutes of the still-open minute bucket
  private currentCounts: Map<string, number> = new Map();
  private currentDay = 0; // epoch-days of the still-open day bucket
  private dailyAccum: Map<string, number> = new Map(); // uncapped, in-memory only

  private profileCache: Map<string, Profile> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [startedAt, totalSeen] = await Promise.all([
        this.state.storage.get<number>("trackingStartedAt"),
        this.state.storage.get<number>("totalSeen"),
      ]);
      const now = Date.now();
      if (startedAt) {
        this.trackingStartedAt = startedAt;
      } else {
        this.trackingStartedAt = now;
        await this.state.storage.put({ trackingStartedAt: this.trackingStartedAt });
      }
      this.totalSeen = totalSeen ?? 0;

      // Seed today's in-progress accumulator from whatever was already
      // persisted, so a cold restart mid-day doesn't drop everything back to
      // the (lossy, top-150-capped) snapshot instead of starting from zero.
      this.currentDay = Math.floor(now / DAY_MS);
      const todaySnapshot = await this.state.storage.get<{ c: Record<string, number> }>(
        dayKey(this.currentDay)
      );
      if (todaySnapshot?.c) {
        for (const [did, count] of Object.entries(todaySnapshot.c)) {
          this.dailyAccum.set(did, count);
        }
      }
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose --------------------------------------------------------------
  // Workers connect OUT via fetch() + an Upgrade header (the documented
  // Cloudflare pattern), not the browser `new WebSocket(url)` constructor.
  private async connectSocket(): Promise<void> {
    try {
      const resp: any = await fetch(JETSTREAM_URL, { headers: { Upgrade: "websocket" } });
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

  private handleMessage(raw: string): void {
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    if (evt.kind !== "commit") return;
    const commit = evt.commit;
    if (!commit || commit.operation !== "create") return;
    if (commit.collection && commit.collection !== "app.bsky.feed.post") return;
    const did = evt.did;
    if (typeof did !== "string" || !did) return;

    this.totalSeen++;
    this.currentCounts.set(did, (this.currentCounts.get(did) || 0) + 1);
    this.dailyAccum.set(did, (this.dailyAccum.get(did) || 0) + 1);
  }

  // ---- bucket close --------------------------------------------------------
  private async closeMinute(minute: number): Promise<void> {
    const top = topEntries(this.currentCounts, TOP_PER_MINUTE);
    this.currentCounts = new Map();
    if (!top.length) return;
    await this.state.storage.put({ [minuteKey(minute)]: { c: Object.fromEntries(top) } });
  }

  private async snapshotDay(day: number): Promise<void> {
    const top = topEntries(this.dailyAccum, TOP_PER_DAY);
    if (!top.length) return;
    await this.state.storage.put({ [dayKey(day)]: { c: Object.fromEntries(top) } });
  }

  private async cleanupOldMinutes(nowMinute: number): Promise<void> {
    const cutoff = nowMinute - MINUTE_RETENTION;
    if (cutoff <= 0) return;
    const old = await this.state.storage.list({ prefix: "m:", end: minuteKey(cutoff), limit: 5000 });
    if (old.size) await this.state.storage.delete(Array.from(old.keys()));
  }

  // ---- alarm: the tracker's heartbeat ------------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const now = Date.now();
    const nowMinute = Math.floor(now / MINUTE_MS);
    const nowDay = Math.floor(now / DAY_MS);

    if (this.currentMinute === 0) {
      this.currentMinute = nowMinute; // first tick after (re)start — nothing to close yet
    } else {
      let guard = 0;
      while (this.currentMinute < nowMinute && guard < MAX_ALARM_CATCHUP) {
        await this.closeMinute(this.currentMinute);
        this.currentMinute++;
        guard++;
      }
    }

    if (this.currentDay !== nowDay) {
      await this.snapshotDay(this.currentDay); // final snapshot of the day that just ended
      this.currentDay = nowDay;
      this.dailyAccum = new Map();
    } else {
      await this.snapshotDay(this.currentDay); // periodic durability snapshot of today so far
    }

    await this.cleanupOldMinutes(nowMinute);

    this.lastUpdated = now;
    await this.state.storage.put({ totalSeen: this.totalSeen });
    await this.state.storage.setAlarm(now + ALARM_MS);
  }

  // ---- profile resolution --------------------------------------------------
  private async resolveProfiles(dids: string[]): Promise<Map<string, Profile>> {
    const now = Date.now();
    const need = dids.filter((d) => {
      const cached = this.profileCache.get(d);
      return !cached || now - cached.fetchedAt > PROFILE_TTL_MS;
    });
    const batches: string[][] = [];
    for (let i = 0; i < need.length; i += 25) batches.push(need.slice(i, i + 25));
    // Fire batches concurrently — at up to 1000 requested rows that's ~40
    // batches, and doing them one-at-a-time would make a big-limit request
    // take many seconds instead of one round trip's worth of latency.
    await Promise.all(
      batches.map(async (batch) => {
        const target = new URL("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles");
        for (const d of batch) target.searchParams.append("actors", d);
        try {
          const res = await fetch(target);
          if (!res.ok) return;
          const j = (await res.json()) as { profiles?: any[] };
          for (const p of j.profiles || []) {
            this.profileCache.set(p.did, {
              handle: p.handle,
              displayName: p.displayName,
              avatar: p.avatar,
              fetchedAt: now,
            });
          }
        } catch {
          // profile lookup is best-effort — a missing entry just shows the raw DID
        }
      })
    );
    return this.profileCache;
  }

  // ---- leaderboard queries --------------------------------------------------
  private async topForWindow(
    windowKey: string,
    limit: number
  ): Promise<{ counts: Map<string, number>; windowMs: number }> {
    const windowMs = WINDOWS[windowKey];
    const now = Date.now();
    const merged = new Map<string, number>();

    if (SHORT_WINDOWS.has(windowKey)) {
      const fromMinute = Math.floor((now - windowMs) / MINUTE_MS);
      // MINUTE_RETENTION (1500) caps how many "m:" keys can ever exist, but
      // storage.list() defaults to a 1000-result cap — without an explicit
      // limit a 24h query would silently drop its oldest ~450 minutes.
      const buckets = await this.state.storage.list<{ c: Record<string, number> }>({
        prefix: "m:",
        start: minuteKey(fromMinute),
        limit: MINUTE_RETENTION + 100,
      });
      for (const bucket of buckets.values()) {
        for (const [did, count] of Object.entries(bucket.c)) {
          merged.set(did, (merged.get(did) || 0) + count);
        }
      }
      for (const [did, count] of this.currentCounts) {
        merged.set(did, (merged.get(did) || 0) + count);
      }
    } else {
      const fromDay =
        windowKey === "all"
          ? Math.floor(this.trackingStartedAt / DAY_MS)
          : Math.floor((now - windowMs) / DAY_MS);
      // Same list()-default-cap concern as above, sized generously for years
      // of "d:" keys (one per day, kept forever) well past a 365d window.
      const buckets = await this.state.storage.list<{ c: Record<string, number> }>({
        prefix: "d:",
        start: dayKey(fromDay),
        limit: 5000,
      });
      buckets.delete(dayKey(this.currentDay)); // superseded below by the uncapped in-memory version
      for (const bucket of buckets.values()) {
        for (const [did, count] of Object.entries(bucket.c)) {
          merged.set(did, (merged.get(did) || 0) + count);
        }
      }
      for (const [did, count] of this.dailyAccum) {
        merged.set(did, (merged.get(did) || 0) + count);
      }
    }

    void limit;
    return { counts: merged, windowMs };
  }

  // ---- holiday queries -------------------------------------------------------
  // Sums every stored "d:" bucket whose UTC calendar date matches month/day,
  // across however many years have passed since tracking started. If today
  // IS the holiday, swap that day's (capped) stored snapshot for the live,
  // uncapped in-memory accumulator — same trick topForWindow uses for "all".
  private async topForHoliday(
    month: number,
    day: number
  ): Promise<{ counts: Map<string, number>; yearsCovered: number[]; isToday: boolean }> {
    const now = Date.now();
    const nowD = new Date(now);
    const isToday = nowD.getUTCMonth() + 1 === month && nowD.getUTCDate() === day;

    const buckets = await this.state.storage.list<{ c: Record<string, number> }>({
      prefix: "d:",
      limit: 5000,
    });
    if (isToday) buckets.delete(dayKey(this.currentDay));

    const merged = new Map<string, number>();
    const yearsCovered = new Set<number>();
    for (const [key, bucket] of buckets) {
      const epochDay = parseInt(key.slice(2), 10);
      const d = new Date(epochDay * DAY_MS);
      if (d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) continue;
      yearsCovered.add(d.getUTCFullYear());
      for (const [did, count] of Object.entries(bucket.c)) {
        merged.set(did, (merged.get(did) || 0) + count);
      }
    }
    if (isToday) {
      yearsCovered.add(nowD.getUTCFullYear());
      for (const [did, count] of this.dailyAccum) {
        merged.set(did, (merged.get(did) || 0) + count);
      }
    }

    return { counts: merged, yearsCovered: Array.from(yearsCovered).sort((a, b) => a - b), isToday };
  }

  // Next UTC occurrence of month/day at-or-after `now` (today counts as "next"
  // even though its clock time has already passed midnight — the client only
  // uses this when `!isToday`, so the "in the past" case never surfaces it).
  private nextHolidayOccurrence(month: number, day: number, now: number): { atMs: number; daysUntil: number } {
    let year = new Date(now).getUTCFullYear();
    let atMs = Date.UTC(year, month - 1, day);
    if (atMs < now) {
      year += 1;
      atMs = Date.UTC(year, month - 1, day);
    }
    return { atMs, daysUntil: Math.ceil((atMs - now) / DAY_MS) };
  }

  // ---- http ---------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);

    if (url.pathname === "/api/meta") {
      return json({
        trackingStartedAt: this.trackingStartedAt,
        totalSeen: this.totalSeen,
        connected: this.wsOpen(),
        lastUpdated: this.lastUpdated || null,
        windows: WINDOWS,
      });
    }

    if (url.pathname === "/api/top") {
      const windowKey = url.searchParams.get("window") || "1h";
      if (!(windowKey in WINDOWS)) {
        return json({ error: "unknown window", windows: Object.keys(WINDOWS) }, 400);
      }
      const limit = Math.max(
        1,
        Math.min(1000, parseInt(url.searchParams.get("limit") || "25", 10) || 25)
      );

      const now = Date.now();
      const { counts, windowMs } = await this.topForWindow(windowKey, limit);
      const top = topEntries(counts, limit);
      const profiles = await this.resolveProfiles(top.map(([did]) => did));

      const elapsed = now - this.trackingStartedAt;
      const coverageMs = isFinite(windowMs) ? Math.min(windowMs, elapsed) : elapsed;
      const fullyCovered = windowKey === "all" || elapsed >= windowMs;

      return json({
        window: windowKey,
        windowMs: isFinite(windowMs) ? windowMs : null,
        trackingStartedAt: this.trackingStartedAt,
        fullyCovered,
        coverageMs,
        generatedAt: now,
        totalCandidates: counts.size,
        entries: top.map(([did, count]) => {
          const p = profiles.get(did);
          return {
            did,
            count,
            handle: p?.handle || null,
            displayName: p?.displayName || null,
            avatar: p?.avatar || null,
          };
        }),
      });
    }

    if (url.pathname === "/api/holiday") {
      const which = url.searchParams.get("which") || "";
      const h = HOLIDAYS[which];
      if (!h) {
        return json({ error: "unknown holiday", holidays: Object.keys(HOLIDAYS) }, 400);
      }
      const limit = Math.max(
        1,
        Math.min(1000, parseInt(url.searchParams.get("limit") || "25", 10) || 25)
      );

      const now = Date.now();
      const { counts, yearsCovered, isToday } = await this.topForHoliday(h.month, h.day);
      const top = topEntries(counts, limit);
      const profiles = await this.resolveProfiles(top.map(([did]) => did));
      const { atMs, daysUntil } = this.nextHolidayOccurrence(h.month, h.day, now);

      return json({
        which,
        label: h.label,
        trackingStartedAt: this.trackingStartedAt,
        isToday,
        yearsCovered,
        nextOccurrenceAt: isToday ? null : atMs,
        daysUntil: isToday ? 0 : daysUntil,
        generatedAt: now,
        totalCandidates: counts.size,
        entries: top.map(([did, count]) => {
          const p = profiles.get(did);
          return {
            did,
            count,
            handle: p?.handle || null,
            displayName: p?.displayName || null,
            avatar: p?.avatar || null,
          };
        }),
      });
    }

    return json({ error: "not found" }, 404);
  }
}
