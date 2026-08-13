// LikeScoreEngine — the whole persistence + scan layer, as a single
// SQLite-backed Durable Object (see wrangler.toml comment for why: no D1
// precedent/credentials in this repo, a SQLite DO is the established
// pattern — sites/didrank, sites/griftmax). One global instance
// ("global") holds the entire likescore graph; this is a small, personal-
// scale leaderboard, not a sharded service.
//
// Tables:
//   accounts(did PK, handle, display_name, avatar, status, first_seen,
//            last_scanned, last_scan_status, last_scan_note, posts_scanned,
//            score, rank)
//     status: 'provisional' (discovered as a liker, never itself scanned) |
//             'scanned' (its own posts/likers have been walked) |
//             'deactivated' (AppView reports the account deactivated)
//   edges(from_did, to_did, like_count, first_like_at, last_like_at,
//         distinct_days, updated_at)  PRIMARY KEY (from_did, to_did)
//     A row means "from_did repeatedly liked to_did's posts". Only ever
//     written by a scan OF to_did (we only learn someone's outgoing likes
//     by looking at who liked the account we're scanning) — so re-scanning
//     an account replaces exactly the edges pointing at it, not the whole
//     graph. Re-scans reflect the current post window, not lifetime totals;
//     see formulas.ts's streak comment.
//   rate_limits(ip, ts) — anonymous per-IP scan rate limiting.
//   meta(key PK, value) — small singleton counters (graph_expansions, etc).
//
// Only public, aggregate data is stored — DIDs, handles, like counts/dates,
// computed scores. No post text, no CAR/repo bytes, no auth tokens.

import {
  CONSTANTS,
  computeEdgeWeights,
  computePrestige,
  distinctDaysUTC,
  isValidDid,
  isValidHandle,
  isValidSubject,
  toPrestigeIndex,
  type RawEdge,
} from "./formulas.ts";
import {
  AppViewError,
  boundedMap,
  getLikers,
  getProfile,
  getRecentPosts,
  resolveHandle,
} from "./bsky.ts";

// ---- minimal Workers/DO type shims (no @cloudflare/workers-types dep in this repo) --
interface SqlStorageCursor<T> {
  toArray(): T[];
}
interface SqlStorage {
  exec<T = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): SqlStorageCursor<T>;
}
interface DurableObjectStorage {
  sql: SqlStorage;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
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
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ENGINE: DurableObjectNamespace;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

interface AccountRow {
  did: string;
  handle: string;
  display_name: string | null;
  avatar: string | null;
  status: string;
  first_seen: number;
  last_scanned: number | null;
  last_scan_status: string | null;
  last_scan_note: string | null;
  posts_scanned: number | null;
  score: number;
  rank: number | null;
}
interface EdgeRow {
  from_did: string;
  to_did: string;
  like_count: number;
  first_like_at: number;
  last_like_at: number;
  distinct_days: number;
  updated_at: number;
}

export class LikeScoreEngine {
  private state: DurableObjectState;
  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const sql = this.state.storage.sql;
      sql.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          did TEXT PRIMARY KEY,
          handle TEXT NOT NULL,
          display_name TEXT,
          avatar TEXT,
          status TEXT NOT NULL DEFAULT 'provisional',
          first_seen INTEGER NOT NULL,
          last_scanned INTEGER,
          last_scan_status TEXT,
          last_scan_note TEXT,
          posts_scanned INTEGER,
          score REAL NOT NULL DEFAULT 0,
          rank INTEGER
        )
      `);
      sql.exec(`
        CREATE TABLE IF NOT EXISTS edges (
          from_did TEXT NOT NULL,
          to_did TEXT NOT NULL,
          like_count INTEGER NOT NULL,
          first_like_at INTEGER NOT NULL,
          last_like_at INTEGER NOT NULL,
          distinct_days INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (from_did, to_did)
        )
      `);
      sql.exec(`CREATE INDEX IF NOT EXISTS edges_to ON edges(to_did)`);
      sql.exec(`CREATE INDEX IF NOT EXISTS edges_from ON edges(from_did)`);
      sql.exec(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          ip TEXT NOT NULL,
          ts INTEGER NOT NULL
        )
      `);
      sql.exec(`CREATE INDEX IF NOT EXISTS rl_ip_ts ON rate_limits(ip, ts)`);
      sql.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/scan" && request.method === "POST") {
        return this.handleScan(request);
      }
      if (url.pathname === "/api/leaderboard") {
        return this.handleLeaderboard(url);
      }
      if (url.pathname === "/api/account") {
        return this.handleAccount(url);
      }
      if (url.pathname === "/api/graph") {
        return this.handleGraph(url);
      }
      if (url.pathname === "/api/stats") {
        return this.handleStats();
      }
      return json({ error: "not found" }, 404);
    } catch (err) {
      return json(
        { error: err instanceof Error ? err.message : "internal error" },
        500
      );
    }
  }

  // ---- SQL helpers -----------------------------------------------------------
  private allAccounts(): AccountRow[] {
    return this.state.storage.sql
      .exec<AccountRow>(`SELECT * FROM accounts`)
      .toArray();
  }
  private allEdges(): EdgeRow[] {
    return this.state.storage.sql
      .exec<EdgeRow>(`SELECT * FROM edges`)
      .toArray();
  }
  private getAccount(did: string): AccountRow | undefined {
    return this.state.storage.sql
      .exec<AccountRow>(`SELECT * FROM accounts WHERE did = ?`, did)
      .toArray()[0];
  }

  // ---- read endpoints ----------------------------------------------------------
  private handleLeaderboard(url: URL): Response {
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 1),
      500
    );
    const rows = this.state.storage.sql
      .exec<AccountRow>(
        `SELECT * FROM accounts WHERE status != 'provisional' ORDER BY score DESC LIMIT ?`,
        limit
      )
      .toArray();
    return json({
      accounts: rows.map(this.toPublicAccount),
      totalScanned: this.countByStatus("scanned") + this.countByStatus("deactivated"),
    });
  }

  private handleAccount(url: URL): Response {
    const subject = url.searchParams.get("subject") || "";
    if (!isValidSubject(subject)) {
      return json({ error: "invalid handle or DID" }, 400);
    }
    const did = isValidDid(subject) ? subject : this.didForHandle(subject);
    if (!did) return json({ error: "not found" }, 404);
    const account = this.getAccount(did);
    if (!account) return json({ error: "not found" }, 404);

    const incoming = this.state.storage.sql
      .exec<EdgeRow & { handle: string; display_name: string | null; avatar: string | null; status: string; score: number }>(
        `SELECT e.*, a.handle, a.display_name, a.avatar, a.status, a.score
         FROM edges e JOIN accounts a ON a.did = e.from_did
         WHERE e.to_did = ? ORDER BY e.like_count DESC LIMIT 200`,
        did
      )
      .toArray();
    const outgoing = this.state.storage.sql
      .exec<EdgeRow & { handle: string; display_name: string | null; avatar: string | null; status: string; score: number }>(
        `SELECT e.*, a.handle, a.display_name, a.avatar, a.status, a.score
         FROM edges e JOIN accounts a ON a.did = e.to_did
         WHERE e.from_did = ? ORDER BY e.like_count DESC LIMIT 200`,
        did
      )
      .toArray();
    const reciprocalSet = new Set(
      incoming
        .filter((i) => outgoing.some((o) => o.from_did === i.from_did))
        .map((i) => i.from_did)
    );

    return json({
      account: this.toPublicAccount(account),
      likedBy: incoming.map((e) => ({
        did: e.from_did,
        handle: e.handle,
        displayName: e.display_name,
        avatar: e.avatar,
        status: e.status,
        score: toPrestigeIndex(e.score),
        likeCount: e.like_count,
        distinctDays: e.distinct_days,
        reciprocal: reciprocalSet.has(e.from_did),
      })),
      likes: outgoing.map((e) => ({
        did: e.to_did,
        handle: e.handle,
        displayName: e.display_name,
        avatar: e.avatar,
        status: e.status,
        score: toPrestigeIndex(e.score),
        likeCount: e.like_count,
        distinctDays: e.distinct_days,
        reciprocal: reciprocalSet.has(e.to_did),
      })),
    });
  }

  private handleGraph(url: URL): Response {
    const focus = url.searchParams.get("focus");
    let accounts = this.allAccounts();
    let edges = this.allEdges();
    if (focus && isValidDid(focus)) {
      const neighborDids = new Set<string>([focus]);
      for (const e of edges) {
        if (e.from_did === focus) neighborDids.add(e.to_did);
        if (e.to_did === focus) neighborDids.add(e.from_did);
      }
      accounts = accounts.filter((a) => neighborDids.has(a.did));
      edges = edges.filter(
        (e) => neighborDids.has(e.from_did) && neighborDids.has(e.to_did)
      );
    } else {
      // Whole-network view: cap to the top-scored slice so the client
      // doesn't have to force-layout an unbounded graph.
      const cap = Math.min(
        Math.max(parseInt(url.searchParams.get("limit") || "300", 10) || 300, 1),
        800
      );
      const top = new Set(
        [...accounts].sort((a, b) => b.score - a.score).slice(0, cap).map((a) => a.did)
      );
      accounts = accounts.filter((a) => top.has(a.did));
      edges = edges.filter((e) => top.has(e.from_did) && top.has(e.to_did));
    }
    const reciprocalPairs = new Set(
      edges
        .filter((e) => edges.some((o) => o.from_did === e.to_did && o.to_did === e.from_did))
        .map((e) => [e.from_did, e.to_did].sort().join("|"))
    );
    return json({
      nodes: accounts.map(this.toPublicAccount),
      edges: edges.map((e) => ({
        from: e.from_did,
        to: e.to_did,
        weight: e.like_count,
        distinctDays: e.distinct_days,
        reciprocal: reciprocalPairs.has([e.from_did, e.to_did].sort().join("|")),
      })),
    });
  }

  private handleStats(): Response {
    const scanned = this.countByStatus("scanned");
    const provisional = this.countByStatus("provisional");
    const deactivated = this.countByStatus("deactivated");
    const edgeCount = (
      this.state.storage.sql.exec<{ c: number }>(`SELECT COUNT(*) as c FROM edges`).toArray()[0]?.c
    ) || 0;
    const lastScan = this.state.storage.sql
      .exec<{ v: string }>(`SELECT value as v FROM meta WHERE key = 'last_scan_at'`)
      .toArray()[0]?.v;
    return json({
      accountsScanned: scanned,
      accountsProvisional: provisional,
      accountsDeactivated: deactivated,
      edges: edgeCount,
      lastScanAt: lastScan ? Number(lastScan) : null,
      constants: CONSTANTS,
    });
  }

  private countByStatus(status: string): number {
    return (
      this.state.storage.sql
        .exec<{ c: number }>(`SELECT COUNT(*) as c FROM accounts WHERE status = ?`, status)
        .toArray()[0]?.c || 0
    );
  }
  private didForHandle(handle: string): string | undefined {
    return this.state.storage.sql
      .exec<{ did: string }>(`SELECT did FROM accounts WHERE handle = ?`, handle)
      .toArray()[0]?.did;
  }
  private toPublicAccount = (a: AccountRow) => ({
    did: a.did,
    handle: a.handle,
    displayName: a.display_name || undefined,
    avatar: a.avatar || undefined,
    status: a.status,
    score: toPrestigeIndex(a.score),
    rank: a.rank ?? undefined,
    lastScanned: a.last_scanned ?? undefined,
    lastScanStatus: a.last_scan_status ?? undefined,
    postsScanned: a.posts_scanned ?? undefined,
  });

  // ---- scan (streamed) -----------------------------------------------------
  private handleScan(request: Request): Response {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const send = (event: string, data: unknown) =>
      writer.write(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      );

    this.runScan(request, send)
      .catch(async (err) => {
        await send("error", {
          message: err instanceof Error ? err.message : "scan failed",
        }).catch(() => {});
      })
      .finally(() => {
        writer.close().catch(() => {});
      });

    return new Response(readable, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      },
    });
  }

  private async runScan(
    request: Request,
    send: (event: string, data: unknown) => Promise<unknown>
  ): Promise<void> {
    const started = Date.now();
    let body: { subject?: string; force?: boolean };
    try {
      body = await request.json();
    } catch {
      await send("error", { message: "invalid JSON body" });
      return;
    }
    const subject = (body.subject || "").trim();
    if (!subject || !isValidSubject(subject)) {
      await send("error", {
        message: "give a valid handle (e.g. alice.bsky.social) or DID",
      });
      return;
    }

    // Anonymous per-IP rate limit.
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const hourAgo = started - 60 * 60 * 1000;
    const recentScans = this.state.storage.sql
      .exec<{ c: number }>(
        `SELECT COUNT(*) as c FROM rate_limits WHERE ip = ? AND ts > ?`,
        ip,
        hourAgo
      )
      .toArray()[0]?.c || 0;
    if (recentScans >= CONSTANTS.IP_SCANS_PER_HOUR) {
      await send("error", {
        message: `rate limited: max ${CONSTANTS.IP_SCANS_PER_HOUR} scans/hour per visitor. try again later.`,
      });
      return;
    }

    await send("stage", { stage: "resolving_handle", subject });
    let did: string;
    try {
      did = isValidDid(subject) ? subject : await resolveHandle(subject);
    } catch (err) {
      await send("error", {
        message: `couldn't resolve "${subject}": ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      });
      return;
    }
    if (!isValidDid(did)) {
      await send("error", { message: "resolved handle did not yield a valid DID" });
      return;
    }

    // Hourly rescan cooldown, per subject.
    const existing = this.getAccount(did);
    if (
      existing?.last_scanned &&
      !body.force &&
      started - existing.last_scanned < CONSTANTS.RESCAN_COOLDOWN_MS
    ) {
      await send("cached", {
        did,
        handle: existing.handle,
        score: toPrestigeIndex(existing.score),
        rank: existing.rank,
        lastScanned: existing.last_scanned,
        retryAfterMs:
          CONSTANTS.RESCAN_COOLDOWN_MS - (started - existing.last_scanned),
      });
      await this.emitLeaderboard(send);
      return;
    }

    this.state.storage.sql.exec(`INSERT INTO rate_limits (ip, ts) VALUES (?, ?)`, ip, started);

    await send("stage", { stage: "handle_resolved", did });

    let profile;
    try {
      profile = await getProfile(did, isValidDid(subject) ? undefined : subject);
    } catch (err) {
      await send("error", {
        message: `couldn't load profile: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      });
      return;
    }
    await send("stage", {
      stage: "profile_loaded",
      handle: profile.handle,
      displayName: profile.displayName,
      deactivated: profile.deactivated,
    });

    if (profile.deactivated) {
      this.upsertSubjectAccount(did, profile.handle, undefined, undefined, "deactivated", started, 0, "deactivated");
      await send("stage", { stage: "prestige_recomputed", ...this.recomputePrestige() });
      await this.emitLeaderboard(send);
      await send("done", {
        did,
        status: "deactivated",
        elapsedMs: Date.now() - started,
      });
      return;
    }

    let posts;
    try {
      posts = await getRecentPosts(did, (page, count) => {
        send("stage", { stage: "posts_loaded", page, count }).catch(() => {});
      });
    } catch (err) {
      await send("error", {
        message: `couldn't load posts: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      });
      return;
    }
    await send("stage", {
      stage: "posts_loaded",
      count: posts.posts.length,
      truncated: posts.truncated,
      final: true,
    });

    // liker did -> aggregated observation
    const agg = new Map<
      string,
      { handle: string; displayName?: string; avatar?: string; timestamps: number[] }
    >();
    let skippedPosts = 0;
    let likesRead = 0;

    await boundedMap(
      posts.posts,
      CONSTANTS.FETCH_CONCURRENCY,
      async (post) => {
        try {
          return await getLikers(post.uri, post.cid);
        } catch (err) {
          skippedPosts++;
          // Deleted post / unreachable record / blocked — skip, don't abort
          // the scan. This is the "handle deleted posts / unavailable PDS /
          // partial scans" path: one bad post can't sink the whole scan.
          if (err instanceof AppViewError) return { likers: [], truncated: false };
          return { likers: [], truncated: false };
        }
      },
      (result, _post, _i, done, total) => {
        likesRead += result.likers.length;
        for (const l of result.likers) {
          // Self-likes aren't a social signal ("who repeatedly likes whom"
          // implies someone else) and a self-loop edge is a pathological
          // case for PageRank — it lets a node feed its own score back to
          // itself every iteration, inflating it arbitrarily. Exclude at
          // the source rather than filtering post-hoc.
          if (l.did === did) continue;
          const t = Date.parse(l.createdAt);
          const entry = agg.get(l.did) || {
            handle: l.handle,
            displayName: l.displayName,
            avatar: l.avatar,
            timestamps: [],
          };
          entry.handle = l.handle;
          entry.displayName = l.displayName;
          entry.avatar = l.avatar;
          if (Number.isFinite(t)) entry.timestamps.push(t);
          agg.set(l.did, entry);
        }
        if (done % 5 === 0 || done === total) {
          send("stage", { stage: "likes_read", postsProcessed: done, postsTotal: total, likesRead }).catch(() => {});
        }
      }
    );

    await send("stage", {
      stage: "likers_discovered",
      count: agg.size,
      skippedPosts,
    });

    // Persist: replace this subject's incoming edges with the fresh set,
    // upsert provisional accounts for any never-seen liker. All synchronous
    // SQL calls, no awaits between them, so this block is atomic against
    // any concurrently-running scan.
    const now = Date.now();
    const sql = this.state.storage.sql;
    sql.exec(`DELETE FROM edges WHERE to_did = ?`, did);
    for (const [likerDid, obs] of agg) {
      if (!isValidDid(likerDid)) continue;
      const distinctDays = distinctDaysUTC(obs.timestamps);
      const first = obs.timestamps.length ? Math.min(...obs.timestamps) : now;
      const last = obs.timestamps.length ? Math.max(...obs.timestamps) : now;
      sql.exec(
        `INSERT INTO edges (from_did, to_did, like_count, first_like_at, last_like_at, distinct_days, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(from_did, to_did) DO UPDATE SET
           like_count = excluded.like_count,
           first_like_at = excluded.first_like_at,
           last_like_at = excluded.last_like_at,
           distinct_days = excluded.distinct_days,
           updated_at = excluded.updated_at`,
        likerDid,
        did,
        obs.timestamps.length,
        first,
        last,
        distinctDays,
        now
      );
      sql.exec(
        `INSERT INTO accounts (did, handle, display_name, avatar, status, first_seen)
         VALUES (?, ?, ?, ?, 'provisional', ?)
         ON CONFLICT(did) DO UPDATE SET
           handle = excluded.handle,
           display_name = excluded.display_name,
           avatar = excluded.avatar
         WHERE accounts.status = 'provisional'`,
        likerDid,
        obs.handle,
        obs.displayName || null,
        obs.avatar || null,
        now
      );
    }

    const scanStatus =
      skippedPosts > 0 || posts.truncated ? "partial" : "ok";
    const note = [
      posts.truncated ? `post list truncated at ${posts.posts.length}` : "",
      skippedPosts ? `${skippedPosts} post(s) unreadable (deleted/unavailable)` : "",
    ]
      .filter(Boolean)
      .join("; ");
    this.upsertSubjectAccount(
      did,
      profile.handle,
      profile.displayName,
      profile.avatar,
      "scanned",
      now,
      posts.posts.length,
      scanStatus,
      note
    );

    await send("stage", { stage: "relationships_built", edges: agg.size });

    const prestige = this.recomputePrestige();
    sql.exec(
      `INSERT INTO meta (key, value) VALUES ('last_scan_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      String(now)
    );
    await send("stage", { stage: "prestige_recomputed", ...prestige });

    await this.emitLeaderboard(send);

    await send("done", {
      did,
      handle: profile.handle,
      status: scanStatus,
      postsScanned: posts.posts.length,
      likersDiscovered: agg.size,
      likesRead,
      skippedPosts,
      truncated: posts.truncated,
      elapsedMs: Date.now() - started,
    });
  }

  private upsertSubjectAccount(
    did: string,
    handle: string,
    displayName: string | undefined,
    avatar: string | undefined,
    status: string,
    now: number,
    postsScanned: number,
    scanStatus: string,
    note = ""
  ): void {
    const sql = this.state.storage.sql;
    const existing = this.getAccount(did);
    sql.exec(
      `INSERT INTO accounts (did, handle, display_name, avatar, status, first_seen, last_scanned, last_scan_status, last_scan_note, posts_scanned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(did) DO UPDATE SET
         handle = excluded.handle,
         display_name = excluded.display_name,
         avatar = excluded.avatar,
         status = excluded.status,
         last_scanned = excluded.last_scanned,
         last_scan_status = excluded.last_scan_status,
         last_scan_note = excluded.last_scan_note,
         posts_scanned = excluded.posts_scanned`,
      did,
      handle,
      displayName || null,
      avatar || null,
      status,
      existing?.first_seen ?? now,
      now,
      scanStatus,
      note,
      postsScanned
    );
  }

  // Atomic (no awaits inside): recompute every account's prestige score
  // from whatever's currently in the accounts/edges tables, then write
  // scores + dense ranks back in one synchronous pass. Graph expansion
  // (a new scan adding nodes/edges) is exactly why this re-runs over the
  // WHOLE graph every time, not just the just-scanned subject — see
  // formulas.ts's computePrestige doc comment for the math.
  private recomputePrestige(): { iterations: number; converged: boolean; nodes: number } {
    const accounts = this.allAccounts();
    const rawEdges: RawEdge[] = this.allEdges().map((e) => ({
      from: e.from_did,
      to: e.to_did,
      likeCount: e.like_count,
      distinctDays: e.distinct_days,
    }));
    const weighted = computeEdgeWeights(rawEdges);
    const nodeIds = accounts.map((a) => a.did);
    const { scores, iterations, converged } = computePrestige(nodeIds, weighted);

    const ranked = [...nodeIds].sort(
      (a, b) => (scores.get(b) || 0) - (scores.get(a) || 0)
    );
    const rankOf = new Map(ranked.map((did, i) => [did, i + 1]));

    const sql = this.state.storage.sql;
    for (const did of nodeIds) {
      sql.exec(
        `UPDATE accounts SET score = ?, rank = ? WHERE did = ?`,
        scores.get(did) || 0,
        rankOf.get(did) || null,
        did
      );
    }
    return { iterations, converged, nodes: nodeIds.length };
  }

  private async emitLeaderboard(
    send: (event: string, data: unknown) => Promise<unknown>
  ): Promise<void> {
    const rows = this.state.storage.sql
      .exec<AccountRow>(
        `SELECT * FROM accounts WHERE status != 'provisional' ORDER BY score DESC LIMIT 25`
      )
      .toArray();
    await send("leaderboard", { accounts: rows.map(this.toPublicAccount) });
  }
}
