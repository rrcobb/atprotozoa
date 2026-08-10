// loverob Worker — loverob.bisks.net
//
// A shrine for @bisks.net (Rob), the person behind this whole playground.
// The profile card and "reasons to love him" run entirely client-side
// (public/index.html hits the public AppView directly — CORS-open, no
// server needed). The one thing that needed a server: a public guestbook
// where anyone can leave their own reason, persisted across visitors. One
// Durable Object holds it — the "single-writer rolling state" shape
// notes/10-architecture.md calls out DOs for, borrowed from
// sites/simcluster-guests, trimmed down since a guestbook doesn't need that
// site's fuzzy-name-dedupe machinery — every note is just its own entry.

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

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  LOVEBOOK: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const id = env.LOVEBOOK.idFromName("global");
      const stub = env.LOVEBOOK.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- config -------------------------------------------------------------
const MAX_ENTRIES = 500; // evict the oldest entry past this
const SUBMIT_COOLDOWN_MS = 15 * 1000; // per-IP, between new notes
const NAME_MAX = 60;
const TEXT_MAX = 280;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Same shape as sites/simcluster-guests's looksLikeSpam — cheap heuristics,
// not a security boundary, just enough to keep an open guestbook readable.
function looksLikeSpam(text: string): boolean {
  if (/https?:\/\//i.test(text) && text.length < 40) return true;
  if (/shop now|buy now|amzn\.to|onelink\.to|prime members|\$\d+\.\d{2}\b/i.test(text)) return true;
  const hashtags = (text.match(/#/g) || []).length;
  if (hashtags >= 4) return true;
  return false;
}

function clean(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

interface Note {
  id: string;
  name: string; // display form; "anonymous admirer" if left blank
  text: string;
  createdAt: number;
}

export class LoveBook {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private notes: Note[] = [];
  private recentSubmits: Map<string, number> = new Map(); // ip -> last submit ts

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const notes = await this.state.storage.get<Note[]>("notes");
      this.notes = notes ?? [];
    });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put({ notes: this.notes });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const ip = request.headers.get("cf-connecting-ip") || "anon";

    if (url.pathname === "/api/notes" && request.method === "GET") {
      // newest first
      const out = [...this.notes].sort((a, b) => b.createdAt - a.createdAt);
      return json({ count: out.length, notes: out });
    }

    if (url.pathname === "/api/notes" && request.method === "POST") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }

      const text = clean(body.text, TEXT_MAX);
      const name = clean(body.name, NAME_MAX).replace(/^@/, "");

      if (!text) return json({ error: "say something nice about Rob" }, 400);
      if (looksLikeSpam(text) || (name && looksLikeSpam(name))) {
        return json({ error: "that looked like spam, try rephrasing" }, 400);
      }

      const lastSubmit = this.recentSubmits.get(ip) || 0;
      if (Date.now() - lastSubmit < SUBMIT_COOLDOWN_MS) {
        return json({ error: "slow down a moment before adding another" }, 429);
      }
      this.recentSubmits.set(ip, Date.now());

      const note: Note = {
        id: crypto.randomUUID(),
        name: name || "an anonymous admirer",
        text,
        createdAt: Date.now(),
      };
      this.notes.push(note);
      if (this.notes.length > MAX_ENTRIES) {
        this.notes.sort((a, b) => a.createdAt - b.createdAt);
        this.notes.splice(0, this.notes.length - MAX_ENTRIES);
      }
      await this.persist();
      return json({ ok: true, id: note.id, count: this.notes.length });
    }

    return json({ error: "not found" }, 404);
  }
}
