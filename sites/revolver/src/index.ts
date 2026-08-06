// revolver Worker — served at the root of revolver.bisks.net.
//
// @fromthewestmeadow.com, in a thread about atproto novelty bots: "website
// that lets you live play Russian roulette with another bluesky handle
// where if you agree to the round you if you lose your account posts what
// the other person inputted and vice versa... or is this too dark atproto
// stuff." First build deliberately softened that: nothing posted on its
// own, the loser got a compose-intent link and had to click "post it"
// themselves. @fromthewestmeadow.com asked (2026-08-06) for an explanation
// page before login plus a real, no-click auto-post, so this version does
// exactly what was originally described: each player OAuths in (scope:
// create-only on app.bsky.feed.post — see public/lib/oauth.js and
// client-metadata.json) after an explicit consent gate that spells out
// what losing does, and the loser's account posts the winner's dare
// automatically the instant the round resolves (public/lib/post.js). Two
// players each load a dare, both dares are revealed to both of them, each
// explicitly agrees (or backs out) to that specific pairing, and then they
// take turns pulling the trigger live over a WebSocket relayed by the
// Round Durable Object below (one instance per round,
// idFromName(roundId)).
//
// Fairness: the DO picks the bullet's chamber and commits to
// sha256(chamber + ":" + salt) the instant both players agree — before
// either of them has pulled once — and only reveals chamber+salt after
// the round resolves. Neither player (nor this server, after the fact) can
// claim the chamber was picked to favor one side, because the commit hash
// published mid-round is checkable against the reveal.
//
// @fromthewestmeadow.com again (2026-08-06): reported the copy-link box
// disappearing with nothing loading in its place, asked for the "opponent
// just joined" side to stay gated behind login until they load a dare, and
// asked the room to update live (loaded cylinder -> result) without a
// manual refresh. The room->DO wiring here was already correct (verified
// with a local wrangler dev run driving the DO directly over HTTP+WS —
// state broadcasts on every action), so the fixes are client-side
// robustness, in public/index.html and public/lib/oauth.js: actions
// (agree/decline/pull) now render from their own POST response instead of
// only waiting on the WebSocket echo, a 4s state-poll fills in if that
// socket dies (common in in-app browsers/flaky networks), the join flow
// reopens the socket with its now-real role/token, getSession() no longer
// throws when IndexedDB is unavailable (was capable of wedging the whole
// boot() on private/embedded browsers), and the copy-link button falls
// back to text-selection when the Clipboard API is blocked instead of
// silently doing nothing.
//
// @fromthewestmeadow.com again (2026-08-06), "still not loading for either
// of us": the real bug was simpler and predates all of the above — every
// /r/<id> page (the URL both players actually open) is renderShare() below
// serving the *same* index.html bytes at a nested path, but that HTML
// loaded its own scripts with relative paths ("lib/x.js", "./lib/x.js").
// Relative to a document at /r/<id>, those resolve to /r/lib/x.js, which
// 404s — so the module script threw on import and boot() never ran at all.
// Nobody landing on a shared link (i.e. the opponent, or the creator on
// reload) got a working page; index.html now loads /lib/... with a leading
// slash so it resolves the same regardless of the serving path.
//
// @fromthewestmeadow.com again (2026-08-06): asked that visiting a round
// link only show the final result dare, not both players' dares, unless
// you're logged in as one of the two accounts in the round — plus a
// leaderboard of survived rounds by chamber count. Round.publicState() now
// takes a viewerDid and only reveals both dares to the two participants;
// everyone else sees nothing pre-resolution and, once resolved, only the
// dare that actually got posted (the winner's — the loser's own dare never
// goes anywhere, so it stays hidden). The viewer's DID rides along on the
// state GET, the poll fallback, and the WS connection (see index.html). The
// new Leaderboard DO (one singleton instance, idFromName("global")) gets a
// fire-and-forget /record call from Round the instant a round resolves, and
// /api/leaderboard + public/leaderboard.html read it back out.
//
// @fromthewestmeadow.com again (2026-08-06): asked for a logout button plus
// no relogin prompt on a screen you're already logged in on, and for a
// specific pre-leaderboard round (theirs, linked in the reply) to count.
// The per-phase login affordances (create form, join form) were already
// session-gated correctly, but there was no visible session status once a
// round moved past those phases — index.html now has a persistent #authbar
// at the top of the page, independent of whichever phase is rendered below
// it, always showing "logged in as X · log out" when a session exists. The
// leaderboard gap is BACKFILL_ROUND_IDS below: /api/leaderboard lazily
// credits any round in that list straight from the Round DO's own resolved
// state, guarded by Leaderboard.backfilled so it only ever applies once.
//
// Routes:
//   GET  /r/<id>              -> personalized-OG unfurl shell (same SPA,
//                                 index.html reads the id from the path)
//   /api/round/<id>/create    -> POST, forwarded to the Round DO
//   /api/round/<id>/join      -> POST
//   /api/round/<id>/agree     -> POST
//   /api/round/<id>/decline   -> POST
//   /api/round/<id>/pull      -> POST
//   /api/round/<id>/ws        -> WebSocket upgrade (state push only)
//   /api/round/<id>           -> GET, bare state fetch (?viewerDid=<did>)
//   /api/leaderboard          -> GET, forwarded to the Leaderboard DO
//   everything else           -> ASSETS

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
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}
declare const WebSocketPair: { new (): WebSocketPair };

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ROUND: DurableObjectNamespace;
  LEADERBOARD: DurableObjectNamespace;
}

const SHARE_RE = /^\/r\/([A-Za-z0-9_-]{4,40})\/?$/;
const API_RE = /^\/api\/round\/([A-Za-z0-9_-]{4,40})(\/[a-z]+)?$/;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "revolver — live russian roulette, played in dares, on atproto";
const GENERIC_DESC =
  "Load a dare, challenge another Bluesky handle, agree to the round, and pull the trigger live. Lose, and this posts their dare to your account automatically — no click, no undo. You log in with Bluesky before you can play, and you're warned exactly what that means first.";
const GENERIC_OG_URL = "https://revolver.bisks.net/";

async function renderShare(env: Env, request: Request, id: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    const stub = env.ROUND.get(env.ROUND.idFromName(id));
    const stateRes = await stub.fetch(new Request(new URL("/state", request.url)));
    if (!stateRes.ok) throw new Error("no state");
    const state = (await stateRes.json()) as any;
    if (!state.creator) throw new Error("empty round");

    const cName = state.creator.handle;
    const jName = state.joiner ? state.joiner.handle : state.targetHandle || "someone";

    let desc: string;
    if (state.declined) {
      desc = `@${cName} challenged @${jName} to a round of revolver — called off before anyone pulled the trigger.`;
    } else if (state.resolved) {
      const loserHandle = state.loser === "creator" ? cName : jName;
      desc = `@${loserHandle} lost this round of revolver — ${state.chambers} chambers, one bullet. See how it went down.`;
    } else if (state.phase === "loaded") {
      desc = `Live right now: @${cName} vs @${jName}, ${state.chambers} chambers, one bullet, both agreed. Watch the trigger get pulled.`;
    } else {
      desc = `@${cName} has challenged @${jName} to a round of revolver — ${state.chambers} chambers, one bullet, dares loaded.`;
    }
    const title = `@${cName} vs @${jName} — revolver`;
    const ogUrl = `https://revolver.bisks.net/r/${encodeURIComponent(id)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=30" },
    });
  } catch {
    // Round not created yet / unreachable — still serve the live shell so
    // the link isn't dead; the client renders its own "start a round" state.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

// Rounds that resolved before the Leaderboard DO existed, so Round.pull()
// never had anywhere to record the win — @fromthewestmeadow.com asked
// (2026-08-06) for their round to count retroactively. Backfilled lazily on
// every /api/leaderboard hit; Leaderboard./backfill tracks which round ids
// it's already applied so this is a no-op after the first successful run.
const BACKFILL_ROUND_IDS = ["0b21fb442fa736312b"];

async function backfillLeaderboard(env: Env, request: Request): Promise<void> {
  const lbStub = env.LEADERBOARD.get(env.LEADERBOARD.idFromName("global"));
  for (const id of BACKFILL_ROUND_IDS) {
    try {
      const roundStub = env.ROUND.get(env.ROUND.idFromName(id));
      const stateRes = await roundStub.fetch(new Request(new URL("/state", request.url)));
      if (!stateRes.ok) continue;
      const state = (await stateRes.json()) as any;
      if (!state.resolved || !state.loser) continue;
      const winnerRole = state.loser === "creator" ? "joiner" : "creator";
      const winner = state[winnerRole];
      if (!winner) continue;
      await lbStub.fetch(
        new Request("https://leaderboard/backfill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            roundId: id,
            did: winner.did,
            handle: winner.handle,
            displayName: winner.displayName,
            avatar: winner.avatar,
            chambers: state.chambers,
          }),
        }),
      );
    } catch {}
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const shareMatch = url.pathname.match(SHARE_RE);
    if (shareMatch && request.method === "GET") {
      return renderShare(env, request, shareMatch[1]);
    }

    const apiMatch = url.pathname.match(API_RE);
    if (apiMatch) {
      const [, id, suffix] = apiMatch;
      const stub = env.ROUND.get(env.ROUND.idFromName(id));
      const inner = new URL(request.url);
      inner.pathname = suffix || "/state";
      return stub.fetch(new Request(inner, request));
    }

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      await backfillLeaderboard(env, request);
      const stub = env.LEADERBOARD.get(env.LEADERBOARD.idFromName("global"));
      return stub.fetch(new Request(new URL("/state", request.url)));
    }

    return env.ASSETS.fetch(request);
  },
};

// --- Round Durable Object ------------------------------------------------
//
// One instance per round (idFromName(roundId), a client-minted
// crypto.randomUUID()). Holds both players' identity (self-asserted — this
// site never asks anyone to log in, since it never writes to anyone's
// account itself) and their dare text, the agree/decline state, and once
// both have agreed, the committed bullet chamber and the pull history.

interface Player {
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  dare: string;
  agreed: boolean;
  token: string;
}

type Role = "creator" | "joiner";

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

async function safeJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function cleanStr(s: unknown, max: number): string {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomChamber(chambers: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return 1 + (buf[0] % chambers);
}

const MAX_DARE = 220;

export class Round {
  private state: DurableObjectState;
  private env: Env;
  private chambers = 6;
  private targetHandle = "";
  private creator: Player | null = null;
  private joiner: Player | null = null;
  private locked = false;
  private bulletPos = 0;
  private salt = "";
  private commitHash = "";
  private currentTurn: Role = "creator";
  private turnIndex = 0;
  private pulls: { by: Role; chamber: number; hit: boolean }[] = [];
  private resolved = false;
  private loser: Role | null = null;
  private declined = false;
  private declinedBy: Role | null = null;
  private createdAt = 0;
  private sessions = new Map<WebSocket, { role: string; did: string }>();
  private ready: Promise<void>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get<string>("data");
      if (saved) Object.assign(this, JSON.parse(saved));
    });
  }

  private persist() {
    const data = {
      chambers: this.chambers,
      targetHandle: this.targetHandle,
      creator: this.creator,
      joiner: this.joiner,
      locked: this.locked,
      bulletPos: this.bulletPos,
      salt: this.salt,
      commitHash: this.commitHash,
      currentTurn: this.currentTurn,
      turnIndex: this.turnIndex,
      pulls: this.pulls,
      resolved: this.resolved,
      loser: this.loser,
      declined: this.declined,
      declinedBy: this.declinedBy,
      createdAt: this.createdAt,
    };
    this.state.storage.put("data", JSON.stringify(data)).catch(() => {});
  }

  private phase(): string {
    if (this.declined) return "declined";
    if (!this.creator) return "empty";
    if (!this.joiner) return "waiting-for-opponent";
    if (this.resolved) return "resolved";
    if (this.locked) return "loaded";
    return "review";
  }

  private playerFor(role: unknown): Player | null {
    if (role === "creator") return this.creator;
    if (role === "joiner") return this.joiner;
    return null;
  }

  private publicPlayer(p: Player | null, showDare: boolean) {
    if (!p) return null;
    return {
      did: p.did,
      handle: p.handle,
      displayName: p.displayName,
      avatar: p.avatar,
      agreed: p.agreed,
      dare: showDare ? p.dare : null,
    };
  }

  // Dares are only shown to the two people playing, plus — once the round's
  // over — the one dare that actually became a real post (the winner's; the
  // loser's own dare never goes anywhere, so a spectator has no business
  // reading it). viewerDid is the OAuth session DID of whoever's asking, not
  // this browser's slot/token — someone can be "logged in as one of the
  // accounts involved" from an entirely different device than the one that
  // created or joined the round.
  private publicState(viewerDid?: string) {
    const bothJoined = !!(this.creator && this.joiner);
    const isParticipant =
      !!viewerDid &&
      ((this.creator && viewerDid === this.creator.did) || (this.joiner && viewerDid === this.joiner.did));
    const winnerRole: Role | null = this.resolved ? (this.loser === "creator" ? "joiner" : "creator") : null;
    const showCreatorDare = bothJoined && (isParticipant || winnerRole === "creator");
    const showJoinerDare = bothJoined && (isParticipant || winnerRole === "joiner");
    return {
      chambers: this.chambers,
      targetHandle: this.targetHandle,
      createdAt: this.createdAt,
      creator: this.publicPlayer(this.creator, showCreatorDare),
      joiner: this.publicPlayer(this.joiner, showJoinerDare),
      phase: this.phase(),
      locked: this.locked,
      commitHash: this.locked ? this.commitHash : null,
      currentTurn: this.currentTurn,
      turnIndex: this.turnIndex,
      pulls: this.pulls,
      resolved: this.resolved,
      loser: this.loser,
      declined: this.declined,
      declinedBy: this.declinedBy,
      revealed: this.resolved ? { bulletPos: this.bulletPos, salt: this.salt } : null,
    };
  }

  private broadcast() {
    for (const [ws, sess] of this.sessions) {
      try {
        ws.send(JSON.stringify({ t: "state", state: this.publicState(sess.did) }));
      } catch {
        this.sessions.delete(ws);
      }
    }
  }

  // Best-effort: a Leaderboard write failing should never break the round
  // result for the two people who just played it.
  private async recordSurvivor(winner: Player) {
    try {
      const stub = this.env.LEADERBOARD.get(this.env.LEADERBOARD.idFromName("global"));
      await stub.fetch(
        new Request("https://leaderboard/record", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            did: winner.did,
            handle: winner.handle,
            displayName: winner.displayName,
            avatar: winner.avatar,
            chambers: this.chambers,
          }),
        }),
      );
    } catch {}
  }

  private async lockIn() {
    const bulletPos = randomChamber(this.chambers);
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = [...saltBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const commitHash = await sha256Hex(`${bulletPos}:${salt}`);
    this.bulletPos = bulletPos;
    this.salt = salt;
    this.commitHash = commitHash;
    this.locked = true;
    this.currentTurn = "creator";
    this.turnIndex = 0;
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/state" && request.method === "GET") {
      return json(this.publicState(url.searchParams.get("viewerDid") || undefined));
    }

    if (path === "/create" && request.method === "POST") {
      if (this.creator) return json({ error: "this round already exists" }, 409);
      const body = await safeJson(request);
      const dare = cleanStr(body?.dare, MAX_DARE);
      const handle = cleanStr(body?.handle, 80);
      if (!dare) return json({ error: "load a dare first" }, 400);
      if (!handle) return json({ error: "handle required" }, 400);
      this.chambers = clampInt(body?.chambers, 2, 8, 6);
      this.targetHandle = cleanStr(body?.targetHandle, 80);
      this.createdAt = Date.now();
      const token = crypto.randomUUID();
      this.creator = {
        did: cleanStr(body?.did, 200),
        handle,
        displayName: cleanStr(body?.displayName, 100) || handle,
        avatar: cleanStr(body?.avatar, 500),
        dare,
        agreed: false,
        token,
      };
      this.persist();
      this.broadcast();
      return json({ ok: true, token, role: "creator", state: this.publicState(this.creator.did) });
    }

    if (path === "/join" && request.method === "POST") {
      if (!this.creator) return json({ error: "no round here yet" }, 404);
      if (this.joiner) return json({ error: "this round already has two players" }, 409);
      if (this.declined) return json({ error: "this round was called off" }, 409);
      const body = await safeJson(request);
      const dare = cleanStr(body?.dare, MAX_DARE);
      const handle = cleanStr(body?.handle, 80);
      if (!dare) return json({ error: "load a dare first" }, 400);
      if (!handle) return json({ error: "handle required" }, 400);
      const did = cleanStr(body?.did, 200);
      if (did && this.creator.did && did === this.creator.did) {
        return json({ error: "can't play both sides of your own round" }, 400);
      }
      const token = crypto.randomUUID();
      this.joiner = {
        did,
        handle,
        displayName: cleanStr(body?.displayName, 100) || handle,
        avatar: cleanStr(body?.avatar, 500),
        dare,
        agreed: false,
        token,
      };
      this.persist();
      this.broadcast();
      return json({ ok: true, token, role: "joiner", state: this.publicState(this.joiner.did) });
    }

    if (path === "/agree" && request.method === "POST") {
      const body = await safeJson(request);
      const role = body?.role;
      const player = this.playerFor(role);
      if (!player || player.token !== body?.token) return json({ error: "not authorized" }, 403);
      if (!this.joiner) return json({ error: "waiting on the other player to load their dare" }, 409);
      if (this.declined || this.resolved) return json({ error: "this round is over" }, 409);
      player.agreed = true;
      if (this.creator!.agreed && this.joiner!.agreed && !this.locked) {
        await this.lockIn();
      }
      this.persist();
      this.broadcast();
      return json({ ok: true, state: this.publicState(player.did) });
    }

    if (path === "/decline" && request.method === "POST") {
      const body = await safeJson(request);
      const role = body?.role;
      const player = this.playerFor(role);
      if (!player || player.token !== body?.token) return json({ error: "not authorized" }, 403);
      if (this.resolved || this.declined) return json({ error: "this round is already over" }, 409);
      this.declined = true;
      this.declinedBy = role;
      this.persist();
      this.broadcast();
      return json({ ok: true, state: this.publicState(player.did) });
    }

    if (path === "/pull" && request.method === "POST") {
      const body = await safeJson(request);
      const role = body?.role;
      const player = this.playerFor(role);
      if (!player || player.token !== body?.token) return json({ error: "not authorized" }, 403);
      if (!this.locked || this.resolved || this.declined) return json({ error: "this round isn't ready to pull" }, 409);
      if (this.currentTurn !== role) return json({ error: "it isn't your turn" }, 409);
      this.turnIndex++;
      const hit = this.turnIndex === this.bulletPos;
      this.pulls.push({ by: role as Role, chamber: this.turnIndex, hit });
      if (hit) {
        this.resolved = true;
        this.loser = role as Role;
        const winner = this.playerFor(role === "creator" ? "joiner" : "creator");
        if (winner) await this.recordSurvivor(winner);
      } else {
        this.currentTurn = role === "creator" ? "joiner" : "creator";
      }
      this.persist();
      this.broadcast();
      return json({ ok: true, state: this.publicState(player.did) });
    }

    if (path === "/ws" && request.method === "GET") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const role = url.searchParams.get("role") || "spectator";
      const token = url.searchParams.get("token") || "";
      const player = this.playerFor(role);
      const verifiedRole = player && player.token === token ? role : "spectator";
      // A verified participant's viewer identity is their own player DID
      // (trustworthy, since it came with a matching token); a spectator's is
      // whatever DID their OAuth session claims, self-reported via the query
      // string — used only to widen what they can *see*, never what they can
      // do, so a false claim here doesn't grant any write.
      const viewerDid = verifiedRole !== "spectator" ? player!.did : url.searchParams.get("viewerDid") || "";
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sessions.set(server, { role: verifiedRole, did: viewerDid });
      server.send(JSON.stringify({ t: "state", state: this.publicState(viewerDid) }));
      const onClose = () => this.sessions.delete(server);
      server.addEventListener("close", onClose);
      server.addEventListener("error", onClose);
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: "not found" }, 404);
  }
}

// --- Leaderboard Durable Object -------------------------------------------
//
// One singleton instance for the whole site (idFromName("global")), tallying
// survived rounds per handle per chamber count ("type"). Round./pull posts a
// win here the instant a round resolves; keyed by DID so a handle change
// doesn't split someone's tally, but the handle/displayName/avatar shown are
// just whatever came with the most recent win (no live profile refresh —
// good enough for a leaderboard).

interface LeaderboardEntry {
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  counts: Record<string, number>;
}

export class Leaderboard {
  private state: DurableObjectState;
  private entries: Record<string, LeaderboardEntry> = {};
  private backfilled: string[] = [];
  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get<string>("data");
      if (saved) this.entries = JSON.parse(saved);
      const backfilled = await this.state.storage.get<string>("backfilled");
      if (backfilled) this.backfilled = JSON.parse(backfilled);
    });
  }

  private persist() {
    this.state.storage.put("data", JSON.stringify(this.entries)).catch(() => {});
  }

  private persistBackfilled() {
    this.state.storage.put("backfilled", JSON.stringify(this.backfilled)).catch(() => {});
  }

  private credit(did: string, handle: string, displayName: string, avatar: string, chambers: string) {
    const entry: LeaderboardEntry = this.entries[did] || { did, handle, displayName: handle, avatar: "", counts: {} };
    entry.handle = handle;
    entry.displayName = displayName || handle;
    entry.avatar = avatar;
    entry.counts[chambers] = (entry.counts[chambers] || 0) + 1;
    this.entries[did] = entry;
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/record" && request.method === "POST") {
      const body = await safeJson(request);
      const did = cleanStr(body?.did, 200);
      const handle = cleanStr(body?.handle, 80);
      if (!did || !handle) return json({ error: "bad record" }, 400);
      this.credit(did, handle, cleanStr(body?.displayName, 100), cleanStr(body?.avatar, 500), String(clampInt(body?.chambers, 2, 8, 6)));
      this.persist();
      return json({ ok: true });
    }

    // One-off credit for a round that resolved before this DO existed —
    // idempotent per roundId so replaying the same backfill list never
    // double-counts. See BACKFILL_ROUND_IDS in src/index.ts.
    if (url.pathname === "/backfill" && request.method === "POST") {
      const body = await safeJson(request);
      const roundId = cleanStr(body?.roundId, 60);
      const did = cleanStr(body?.did, 200);
      const handle = cleanStr(body?.handle, 80);
      if (!roundId || !did || !handle) return json({ error: "bad backfill" }, 400);
      if (this.backfilled.includes(roundId)) return json({ ok: true, skipped: true });
      this.credit(did, handle, cleanStr(body?.displayName, 100), cleanStr(body?.avatar, 500), String(clampInt(body?.chambers, 2, 8, 6)));
      this.backfilled.push(roundId);
      this.persist();
      this.persistBackfilled();
      return json({ ok: true });
    }

    if (url.pathname === "/state" && request.method === "GET") {
      return json({ entries: Object.values(this.entries) });
    }

    return json({ error: "not found" }, 404);
  }
}
