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
// Routes:
//   GET  /r/<id>              -> personalized-OG unfurl shell (same SPA,
//                                 index.html reads the id from the path)
//   /api/round/<id>/create    -> POST, forwarded to the Round DO
//   /api/round/<id>/join      -> POST
//   /api/round/<id>/agree     -> POST
//   /api/round/<id>/decline   -> POST
//   /api/round/<id>/pull      -> POST
//   /api/round/<id>/ws        -> WebSocket upgrade (state push only)
//   /api/round/<id>           -> GET, bare state fetch
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
  private sessions = new Map<WebSocket, { role: string }>();
  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
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

  private publicState() {
    const showDares = !!(this.creator && this.joiner);
    return {
      chambers: this.chambers,
      targetHandle: this.targetHandle,
      createdAt: this.createdAt,
      creator: this.publicPlayer(this.creator, showDares),
      joiner: this.publicPlayer(this.joiner, showDares),
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
    const payload = JSON.stringify({ t: "state", state: this.publicState() });
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(ws);
      }
    }
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
      return json(this.publicState());
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
      return json({ ok: true, token, role: "creator", state: this.publicState() });
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
      return json({ ok: true, token, role: "joiner", state: this.publicState() });
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
      return json({ ok: true, state: this.publicState() });
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
      return json({ ok: true, state: this.publicState() });
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
      } else {
        this.currentTurn = role === "creator" ? "joiner" : "creator";
      }
      this.persist();
      this.broadcast();
      return json({ ok: true, state: this.publicState() });
    }

    if (path === "/ws" && request.method === "GET") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const role = url.searchParams.get("role") || "spectator";
      const token = url.searchParams.get("token") || "";
      const player = this.playerFor(role);
      const verifiedRole = player && player.token === token ? role : "spectator";
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sessions.set(server, { role: verifiedRole });
      server.send(JSON.stringify({ t: "state", state: this.publicState() }));
      const onClose = () => this.sessions.delete(server);
      server.addEventListener("close", onClose);
      server.addEventListener("error", onClose);
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: "not found" }, 404);
  }
}
