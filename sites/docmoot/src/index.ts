// docmoot Worker — mounted at bisks.net/docmoot (see notes/40-new-site-playbook.md).
//
// @riziles.bsky.social asked, replying to a "sign this Google Doc" thread:
// "is there a way to do this on ATProto?" Honest answer: real-time multi-writer
// text merging needs a low-latency relay — atproto's per-writer signed-commit
// repo model isn't built for that, and nothing in the ecosystem solves it
// today. So this Worker + the Doc Durable Object below ARE that relay: one DO
// instance per document, holding the live text and a small in-memory op
// history, broadcasting edits over WebSocket to everyone with the link. The
// part that doesn't have to be centralized is durability — a signed-in user
// can snapshot the current text straight into their own PDS as a
// net.bisks.docmoot.snapshot record (public/index.html, saveSnapshot()) so
// the durable copy lives in their repo, not just in this Worker's storage.
//
// Editing itself needs no login, same as an "anyone with the link can edit"
// Google Doc — public/lib/oauth.js is only wired up for the snapshot feature.
//
// Every request's "/docmoot" mount prefix gets stripped first (the ASSETS
// binding and the DO have no idea they aren't living at the domain root).
// Routes after that:
//   GET /d/<id>          -> personalized-OG unfurl shell (falls through to the
//                            same SPA the client already renders from the path)
//   /api/doc/<id>        -> forwarded to the Doc DO as GET /state
//   /api/doc/<id>/ws     -> forwarded to the Doc DO as the WebSocket upgrade
//   /api/doc/<id>/seed   -> forwarded to the Doc DO as POST /seed (revives a
//                           PDS snapshot into a brand-new empty doc — see
//                           "restore a snapshot" in public/index.html)
//   everything else      -> ASSETS

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
  DOC: DurableObjectNamespace;
}

const PREFIX = "/docmoot";
const DOC_ID_RE = /^\/api\/doc\/([A-Za-z0-9_-]{4,64})(\/ws|\/seed)?$/;
const SHARE_RE = /^\/d\/([A-Za-z0-9_-]{4,64})\/?$/;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

const GENERIC_TITLE = "docmoot — write together, live, on atproto";
const GENERIC_DESC =
  "A shared document anyone with the link can edit in real time, no walled garden required. Sign in to snapshot it straight into your own PDS.";
const GENERIC_OG_URL = "https://bisks.net/docmoot/";

// GET /d/<id> gets its own real URL (not a query string) so every shared doc
// unfurls with its own title/description instead of Bluesky caching one
// generic card for every link — same fix as sites/didscope and sites/windmill,
// see notes/45-sharing-and-virality.md.
async function renderShare(env: Env, request: Request, id: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    const stub = env.DOC.get(env.DOC.idFromName(id));
    const stateRes = await stub.fetch(new Request(new URL("/state", request.url)));
    if (!stateRes.ok) throw new Error("no state");
    const state = (await stateRes.json()) as { title: string; wordCount: number; exists: boolean };
    if (!state.exists) throw new Error("empty doc");

    const title = state.title?.trim() || "Untitled document";
    const desc = truncate(
      `A live shared document on docmoot — ${state.wordCount} word${state.wordCount === 1 ? "" : "s"} so far. Anyone with this link can jump in and write.`,
      300,
    );
    const ogUrl = `https://bisks.net/docmoot/d/${encodeURIComponent(id)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(`${title} — docmoot`))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
  } catch {
    // Empty/nonexistent/unreachable doc — still serve the live shell so the
    // link isn't dead; the client renders its own "start writing" state.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    // Only strip when the prefix is actually present — on the subdomain
    // requests arrive without it, and an unconditional slice would chop
    // the front off short paths ("/app.js" -> "") so every asset would
    // silently serve index.html.
    if (url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }
    const stripped = new Request(url, request);

    const shareMatch = url.pathname.match(SHARE_RE);
    if (shareMatch && request.method === "GET") {
      return renderShare(env, stripped, shareMatch[1]);
    }

    const docMatch = url.pathname.match(DOC_ID_RE);
    if (docMatch) {
      const [, id, suffix] = docMatch;
      const stub = env.DOC.get(env.DOC.idFromName(id));
      const inner = new URL(request.url);
      inner.pathname = suffix || "/state";
      return stub.fetch(new Request(inner, stripped));
    }

    return env.ASSETS.fetch(stripped);
  },
};

// --- Doc Durable Object -------------------------------------------------

// One instance per document (idFromName(docId)). Holds the authoritative
// text + a rolling history of applied ops so a client's in-flight edit
// (computed against a version that may already be stale by the time it
// arrives) can be rebased forward before being applied. This is a
// deliberately simplified operational transform: single contiguous
// (pos, del, insert) regions only, resolved with a "first writer wins, clamp
// the rest" rule when two edits land in the exact same characters. That
// covers the overwhelming majority of real typing (different people editing
// different parts of the doc) correctly; the rare exact-same-spot collision
// degrades gracefully instead of corrupting the doc, and the client's
// periodic resync (public/lib/collab.js) catches any drift.
interface Op {
  p: number; // start position
  d: number; // delete count
  i: string; // insert text
}

function applyOp(text: string, op: Op): string {
  const p = Math.max(0, Math.min(op.p, text.length));
  const d = Math.max(0, Math.min(op.d, text.length - p));
  return text.slice(0, p) + op.i + text.slice(p + d);
}

// Adjusts `op` (defined against the text BEFORE `applied`) so it applies
// cleanly to the text AFTER `applied`. Non-overlapping edits shift cleanly;
// overlapping ones clamp to just after `applied`'s insert and drop the
// colliding delete rather than risk deleting the wrong span.
function rebase(op: Op, applied: Op): Op {
  const appliedEnd = applied.p + applied.d;
  const delta = applied.i.length - applied.d;
  if (appliedEnd <= op.p) return { p: op.p + delta, d: op.d, i: op.i };
  if (op.p + op.d <= applied.p) return op;
  const newStart = Math.max(0, applied.p + applied.i.length);
  return { p: newStart, d: 0, i: op.i };
}

const MAX_LEN = 300_000;
const MAX_HISTORY = 2000;
const MAX_TITLE = 200;
const PRESENCE_COLORS = [
  "#ff7a3d", "#4dd6c0", "#f2c94c", "#bb86fc", "#6fcf97", "#56ccf2", "#eb5757", "#f2994a",
];

interface Session {
  id: string;
  color: string;
  name: string;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
}

export class Doc {
  private state: DurableObjectState;
  private text = "";
  private title = "";
  private version = 0;
  private createdAt = 0;
  private updatedAt = 0;
  private history: { op: Op; version: number }[] = [];
  private sessions = new Map<WebSocket, Session>();
  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [text, title, version, createdAt, updatedAt] = await Promise.all([
        this.state.storage.get<string>("text"),
        this.state.storage.get<string>("title"),
        this.state.storage.get<number>("version"),
        this.state.storage.get<number>("createdAt"),
        this.state.storage.get<number>("updatedAt"),
      ]);
      this.text = text ?? "";
      this.title = title ?? "";
      this.version = version ?? 0;
      this.createdAt = createdAt ?? 0;
      this.updatedAt = updatedAt ?? 0;
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/state") {
      const wordCount = this.text.trim() ? this.text.trim().split(/\s+/).length : 0;
      return json({
        title: this.title,
        version: this.version,
        wordCount,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        exists: this.version > 0 || this.text.length > 0,
      });
    }

    // Revives a saved PDS snapshot into a fresh doc. Only works on a doc that
    // has never been written to (version 0, no text) — a brand-new docId
    // minted client-side right before this call — so there's no way for it
    // to clobber someone else's in-progress live document.
    if (url.pathname === "/seed" && request.method === "POST") {
      if (this.version > 0 || this.text.length > 0) {
        return json({ error: "doc already has content" }, 409);
      }
      const body = (await request.json().catch(() => null)) as { title?: string; text?: string } | null;
      const text = typeof body?.text === "string" ? body.text.slice(0, MAX_LEN) : "";
      const title = typeof body?.title === "string" ? body.title.slice(0, MAX_TITLE) : "";
      this.text = text;
      this.title = title;
      this.version = 1;
      this.createdAt = this.createdAt || Date.now();
      this.updatedAt = Date.now();
      this.persist();
      return json({ ok: true, version: this.version });
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.handleSession(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ error: "not found" }, 404);
  }

  private userList() {
    return [...this.sessions.values()].map((s) => ({ id: s.id, color: s.color, name: s.name }));
  }

  private broadcast(msg: unknown, exclude?: WebSocket) {
    const payload = JSON.stringify(msg);
    for (const ws of this.sessions.keys()) {
      if (ws === exclude) continue;
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }

  private handleSession(ws: WebSocket) {
    const id = crypto.randomUUID();
    const session: Session = { id, color: colorFor(id), name: "Anonymous" };
    this.sessions.set(ws, session);
    if (!this.createdAt) this.createdAt = Date.now();

    ws.send(
      JSON.stringify({
        t: "init",
        id,
        text: this.text,
        version: this.version,
        title: this.title,
        users: this.userList(),
      }),
    );
    this.broadcast({ t: "presence", users: this.userList() }, ws);

    ws.addEventListener("message", (evt: MessageEvent) => {
      try {
        this.onMessage(ws, session, JSON.parse(String(evt.data)));
      } catch {
        // malformed message from a client — ignore, don't take the DO down
      }
    });
    const onClose = () => {
      if (!this.sessions.delete(ws)) return;
      this.broadcast({ t: "presence", users: this.userList() });
    };
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onClose);
  }

  private onMessage(ws: WebSocket, session: Session, msg: any) {
    if (!msg || typeof msg !== "object") return;

    if (msg.t === "hello") {
      const name = typeof msg.name === "string" ? msg.name.trim().slice(0, 40) : "";
      session.name = name || "Anonymous";
      this.broadcast({ t: "presence", users: this.userList() });
      return;
    }

    if (msg.t === "edit") {
      const baseVersion = Number(msg.v);
      const rawOp = msg.op;
      if (
        !rawOp ||
        typeof rawOp.p !== "number" ||
        typeof rawOp.d !== "number" ||
        typeof rawOp.i !== "string" ||
        rawOp.p < 0 ||
        rawOp.d < 0 ||
        !Number.isFinite(baseVersion)
      ) {
        return;
      }
      let op: Op = { p: Math.floor(rawOp.p), d: Math.floor(rawOp.d), i: rawOp.i };
      for (const h of this.history) {
        if (h.version > baseVersion) op = rebase(op, h.op);
      }
      if (this.text.length - op.d + op.i.length > MAX_LEN) return;

      this.text = applyOp(this.text, op);
      this.version++;
      this.updatedAt = Date.now();
      this.history.push({ op, version: this.version });
      if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);

      this.broadcast({ t: "op", op, v: this.version, from: session.id });
      this.persist();
      return;
    }

    if (msg.t === "title") {
      const value = typeof msg.value === "string" ? msg.value.slice(0, MAX_TITLE) : "";
      this.title = value;
      this.updatedAt = Date.now();
      this.broadcast({ t: "title", value: this.title, from: session.id });
      this.persist();
      return;
    }

    if (msg.t === "resync") {
      ws.send(
        JSON.stringify({
          t: "init",
          id: session.id,
          text: this.text,
          version: this.version,
          title: this.title,
          users: this.userList(),
        }),
      );
      return;
    }
  }

  private persist() {
    this.state.storage
      .put("text", this.text)
      .then(() =>
        Promise.all([
          this.state.storage.put("title", this.title),
          this.state.storage.put("version", this.version),
          this.state.storage.put("createdAt", this.createdAt),
          this.state.storage.put("updatedAt", this.updatedAt),
        ]),
      )
      .catch(() => {});
  }
}
