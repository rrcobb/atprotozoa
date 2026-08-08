// thewall Worker — thewall.bisks.net
//
// An infinite conspiracy corkboard: pin notes, import real skeets as cards,
// draw your own yarn between any two pieces, and the board lives under a
// short id in the URL (/b/<id>) that anyone with the link can open and keep
// adding to. No login — the link IS the access control, same trust model as
// sites/the-place's shared canvas.
//
// One Durable Object instance PER BOARD (idFromName(boardId)), holding cards
// + yarn edges in transactional storage. The client polls GET /api/board/:id
// every few seconds and re-fetches right after its own writes, which is
// enough for "multiplayer encouraged but not required" without the added
// surface of WebSocket hibernation — same call sites/the-place made for its
// shared-canvas DO (plain HTTP poll, not sockets).

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
  put(key: string, value: unknown): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  BOARD: DurableObjectNamespace;
}

const BOARD_ID_RE = /^[a-z0-9]{4,32}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = /^\/api\/board\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (m) {
      const boardId = m[1];
      if (!BOARD_ID_RE.test(boardId)) {
        return json({ error: "bad board id" }, 400);
      }
      const id = env.BOARD.idFromName(boardId);
      const stub = env.BOARD.get(id);
      // Hand the DO the sub-path only (everything after /api/board/<id>) so
      // it doesn't need to know its own id or the mount shape.
      const inner = new URL(request.url);
      inner.pathname = m[2] || "/";
      return stub.fetch(new Request(inner, request));
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

// ---- board shape -----------------------------------------------------------

interface Card {
  id: string;
  kind: "note" | "skeet";
  x: number;
  y: number;
  rot: number;
  color: string;
  pinColor: string;
  text: string;
  addedAt: number;
  // skeet-only
  uri?: string;
  authorHandle?: string;
  authorDisplayName?: string;
  authorAvatar?: string;
  postedAt?: string;
}

const CARD_COLORS = ["#f2e8c9", "#f6f0df", "#ecd9a6", "#f3d9de", "#d7e6ee", "#e6ecd2"];
const PIN_COLORS = ["#d1263b", "#2560c4", "#e0a622", "#2a9d4f", "#7c3aed"];
const MAX_CARDS = 150;
const MAX_NOTE_LEN = 220;
const MAX_SKEET_TEXT_LEN = 320;
const MAX_STR_LEN = 400; // generic ceiling for handle/displayName/avatar/uri fields

// Small stable hash so a card's tilt/color are deterministic from its id
// (same id -> same look for every client, no extra fields to sync).
function hash(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

function clip(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export class Board {
  private state: DurableObjectState;
  private cards = new Map<string, Card>();
  private edges = new Set<string>(); // canonical "a|b" with a<b lexicographically
  private version = 0;
  private createdAt = 0;
  private updatedAt = 0;
  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [cards, edges, version, createdAt, updatedAt] = await Promise.all([
        this.state.storage.get<Card[]>("cards"),
        this.state.storage.get<string[]>("edges"),
        this.state.storage.get<number>("version"),
        this.state.storage.get<number>("createdAt"),
        this.state.storage.get<number>("updatedAt"),
      ]);
      for (const c of cards ?? []) this.cards.set(c.id, c);
      for (const e of edges ?? []) this.edges.add(e);
      this.version = version ?? 0;
      this.createdAt = createdAt ?? 0;
      this.updatedAt = updatedAt ?? 0;
    });
  }

  private edgeKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  private async persist(): Promise<void> {
    this.updatedAt = Date.now();
    await this.state.storage.put({
      cards: Array.from(this.cards.values()),
      edges: Array.from(this.edges),
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    });
  }

  private snapshot() {
    return {
      version: this.version,
      cards: Array.from(this.cards.values()),
      edges: Array.from(this.edges, (e) => e.split("|")),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      full: this.cards.size >= MAX_CARDS,
      maxCards: MAX_CARDS,
    };
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" && request.method === "GET") {
      return json(this.snapshot());
    }

    if (path === "/cards" && request.method === "POST") {
      return this.addCard(request);
    }

    const cardMatch = /^\/cards\/([^/]+)$/.exec(path);
    if (cardMatch && request.method === "PATCH") {
      return this.updateCard(cardMatch[1], request);
    }
    if (cardMatch && request.method === "DELETE") {
      return this.removeCard(cardMatch[1]);
    }

    if (path === "/edges" && request.method === "POST") {
      return this.addEdge(request);
    }
    if (path === "/edges" && request.method === "DELETE") {
      return this.removeEdge(request);
    }

    return json({ error: "not found" }, 404);
  }

  private async addCard(request: Request): Promise<Response> {
    if (this.cards.size >= MAX_CARDS) return json({ error: "board full" }, 409);
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    if (!finite(body.x) || !finite(body.y)) return json({ error: "bad position" }, 400);
    const kind = body.kind === "skeet" ? "skeet" : "note";

    const id = crypto.randomUUID().slice(0, 8);
    const h = hash(id);
    const rot = (h % 1700) / 100 - 8.5; // ~[-8.5, 8.5] degrees
    const color = CARD_COLORS[h % CARD_COLORS.length];
    const pinColor = PIN_COLORS[Math.floor(h / CARD_COLORS.length) % PIN_COLORS.length];

    let card: Card;
    if (kind === "skeet") {
      const uri = clip(body.uri, MAX_STR_LEN);
      if (!/^at:\/\/did:[a-zA-Z0-9._:%-]+\/app\.bsky\.feed\.post\/[a-zA-Z0-9._~-]+$/.test(uri)) {
        return json({ error: "bad skeet uri" }, 400);
      }
      card = {
        id,
        kind: "skeet",
        x: body.x,
        y: body.y,
        rot,
        color,
        pinColor,
        text: clip(body.text, MAX_SKEET_TEXT_LEN),
        addedAt: Date.now(),
        uri,
        authorHandle: clip(body.authorHandle, MAX_STR_LEN),
        authorDisplayName: clip(body.authorDisplayName, MAX_STR_LEN),
        authorAvatar: clip(body.authorAvatar, MAX_STR_LEN),
        postedAt: clip(body.postedAt, 64),
      };
    } else {
      const text = clip(body.text, MAX_NOTE_LEN).trim();
      if (!text) return json({ error: "empty note" }, 400);
      card = { id, kind: "note", x: body.x, y: body.y, rot, color, pinColor, text, addedAt: Date.now() };
    }

    this.cards.set(id, card);
    if (!this.createdAt) this.createdAt = Date.now();
    this.version++;
    await this.persist();
    return json({ card, version: this.version });
  }

  private async updateCard(id: string, request: Request): Promise<Response> {
    const card = this.cards.get(id);
    if (!card) return json({ error: "no such card" }, 404);
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    if (finite(body.x) && finite(body.y)) {
      card.x = body.x;
      card.y = body.y;
    }
    if (card.kind === "note" && typeof body.text === "string") {
      const text = clip(body.text, MAX_NOTE_LEN).trim();
      if (text) card.text = text;
    }
    this.version++;
    await this.persist();
    return json({ card, version: this.version });
  }

  private async removeCard(id: string): Promise<Response> {
    if (!this.cards.delete(id)) return json({ error: "no such card" }, 404);
    for (const e of Array.from(this.edges)) {
      const [a, b] = e.split("|");
      if (a === id || b === id) this.edges.delete(e);
    }
    this.version++;
    await this.persist();
    return json({ ok: true, version: this.version });
  }

  private async addEdge(request: Request): Promise<Response> {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const a = clip(body.a, 32), b = clip(body.b, 32);
    if (!a || !b || a === b || !this.cards.has(a) || !this.cards.has(b)) {
      return json({ error: "bad edge" }, 400);
    }
    this.edges.add(this.edgeKey(a, b));
    this.version++;
    await this.persist();
    return json({ ok: true, version: this.version });
  }

  private async removeEdge(request: Request): Promise<Response> {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const a = clip(body.a, 32), b = clip(body.b, 32);
    if (!a || !b) return json({ error: "bad edge" }, 400);
    this.edges.delete(this.edgeKey(a, b));
    this.version++;
    await this.persist();
    return json({ ok: true, version: this.version });
  }
}
