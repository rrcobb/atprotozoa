// postwith Worker — mounted at bisks.net/postwith/ (see notes/40-new-site-playbook.md).
//
// @antiali.as's idea: an atproto matchmaker, Lunchclub-style but peer-to-peer /
// ad hoc. Post a profile (interest topic + goal), get auto-matched with other
// people on the same topic, propose a meeting, they accept or decline, and
// either side can log a feedback record once it happens.
//
// Every write is a plain record the author signs and writes straight to their
// OWN PDS from the browser (public-client OAuth, PKCE + DPoP — copied from
// sites/padmoot). There is no server-side write endpoint anywhere in this
// file. "Match people across everyone's repos" needs an index the AppView
// doesn't provide, so one Durable Object (name "global") keeps a live
// Jetstream subscription filtered to the four net.bisks.postwith.* collections
// and maintains a running cross-user index — same shape as sites/quadrants'
// QuadrantHub. The DO's HTTP surface below is entirely read-only (GET).
//
// Collections:
//   net.bisks.postwith.profile   rkey "self" — {topic, goal, note?, createdAt}
//   net.bisks.postwith.meeting   rkey auto   — {toDid, toHandle, topic, message, createdAt}
//   net.bisks.postwith.response  rkey auto   — {meetingUri, status, createdAt}
//   net.bisks.postwith.feedback  rkey auto   — {meetingUri, outcome, note?, rematch, createdAt}
//
// Every request first gets its "/postwith" mount prefix stripped; what's left
// is matched against /api/* (forwarded to the DO) and otherwise falls through
// to ASSETS.

export interface DurableObjectId {
  toString(): string;
}
export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
export interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(time: number | Date): Promise<void>;
}
export interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  HUB: DurableObjectNamespace;
}

const PREFIX = "/postwith";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    const stripped = new Request(url, request);

    if (url.pathname.startsWith("/api/")) {
      const stub = env.HUB.get(env.HUB.idFromName("global"));
      return stub.fetch(stripped);
    }

    return env.ASSETS.fetch(stripped);
  },
};

// ---------------------------------------------------------------------------
// MatchHub — the one global Durable Object. Firehose-fed index of profiles,
// meeting proposals, responses (accept/decline), and feedback.
// ---------------------------------------------------------------------------

const PROFILE_COLLECTION = "net.bisks.postwith.profile";
const MEETING_COLLECTION = "net.bisks.postwith.meeting";
const RESPONSE_COLLECTION = "net.bisks.postwith.response";
const FEEDBACK_COLLECTION = "net.bisks.postwith.feedback";

const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?" +
  [PROFILE_COLLECTION, MEETING_COLLECTION, RESPONSE_COLLECTION, FEEDBACK_COLLECTION]
    .map((c) => "wantedCollections=" + encodeURIComponent(c))
    .join("&");

const APPVIEW = "https://public.api.bsky.app/xrpc";
const ALARM_MS = 20 * 1000; // reconnect heartbeat, same cadence as sites/ratioed / sites/quadrants
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000;

const MAX_TOPIC = 32;
const MAX_GOAL = 240;
const MAX_NOTE = 240;
const MAX_MESSAGE = 300;
const MAX_PROFILES = 3000;
const MAX_MEETINGS = 8000;

interface ProfileEntry {
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  topic: string;
  goal: string;
  note: string;
  updatedAt: number;
}

interface MeetingEntry {
  uri: string;
  fromDid: string;
  fromHandle: string;
  fromAvatar: string;
  toDid: string;
  toHandle: string;
  topic: string;
  message: string;
  createdAt: string;
  indexedAt: number;
}

interface ResponseEntry {
  meetingUri: string;
  byDid: string;
  status: "accepted" | "declined";
  createdAt: string;
}

interface FeedbackEntry {
  meetingUri: string;
  byDid: string;
  byHandle: string;
  outcome: "great" | "ok" | "noshow";
  note: string;
  rematch: boolean;
  createdAt: string;
}

interface CachedProfile {
  handle: string;
  displayName: string;
  avatar: string;
  resolvedAt: number;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

function cleanStr(s: unknown, max: number): string {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}

function isDid(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("did:") && s.length < 128;
}

export class MatchHub {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private profiles: Map<string, ProfileEntry> = new Map();
  private meetings: Map<string, MeetingEntry> = new Map();
  private responses: Map<string, ResponseEntry> = new Map();
  private feedback: Map<string, FeedbackEntry[]> = new Map();
  private profileCache: Map<string, CachedProfile> = new Map();
  private ws: any = null;
  private reconnectDelay = 1000;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [profiles, meetings, responses, feedback] = await Promise.all([
        this.state.storage.get<Record<string, ProfileEntry>>("profiles"),
        this.state.storage.get<Record<string, MeetingEntry>>("meetings"),
        this.state.storage.get<Record<string, ResponseEntry>>("responses"),
        this.state.storage.get<Record<string, FeedbackEntry[]>>("feedback"),
      ]);
      this.profiles = new Map(Object.entries(profiles ?? {}));
      this.meetings = new Map(Object.entries(meetings ?? {}));
      this.responses = new Map(Object.entries(responses ?? {}));
      this.feedback = new Map(Object.entries(feedback ?? {}));
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose ------------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade header,
  // not the browser-style `new WebSocket(url)` constructor. Same shape as
  // sites/quadrants, sites/ratioed, sites/mootstream.
  private async connectSocket(): Promise<void> {
    try {
      const resp: any = await fetch(JETSTREAM_URL, { headers: { Upgrade: "websocket" } });
      const ws = resp.webSocket;
      if (!ws) throw new Error("jetstream didn't upgrade");
      ws.accept();
      this.ws = ws;
      this.reconnectDelay = 1000;
      ws.addEventListener("message", (ev: any) => {
        this.handleMessage(String(ev.data)).catch(() => {
          // one bad message shouldn't kill the stream
        });
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

  private async handleMessage(raw: string): Promise<void> {
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    if (evt.kind !== "commit") return;
    const commit = evt.commit;
    const did = evt.did;
    if (!commit || typeof did !== "string") return;
    const { collection, operation, rkey } = commit;

    if (collection === PROFILE_COLLECTION) return this.onProfile(did, operation, commit.record);
    if (collection === MEETING_COLLECTION) return this.onMeeting(did, operation, rkey, commit.record);
    if (collection === RESPONSE_COLLECTION) return this.onResponse(did, operation, commit.record);
    if (collection === FEEDBACK_COLLECTION) return this.onFeedback(did, operation, commit.record);
  }

  private async onProfile(did: string, op: string, rec: any): Promise<void> {
    if (op === "delete") {
      if (this.profiles.delete(did)) await this.persist("profiles", this.profiles);
      return;
    }
    if (op !== "create" && op !== "update") return;
    if (!rec || typeof rec.topic !== "string") return;

    const profile = await this.resolveProfile(did);
    if (this.profiles.size >= MAX_PROFILES && !this.profiles.has(did)) return;
    this.profiles.set(did, {
      did,
      handle: profile?.handle || did,
      displayName: profile?.displayName || profile?.handle || did,
      avatar: profile?.avatar || "",
      topic: cleanStr(rec.topic, MAX_TOPIC).toLowerCase(),
      goal: cleanStr(rec.goal, MAX_GOAL),
      note: cleanStr(rec.note, MAX_NOTE),
      updatedAt: Date.now(),
    });
    await this.persist("profiles", this.profiles);
  }

  private async onMeeting(did: string, op: string, rkey: string, rec: any): Promise<void> {
    const uri = `at://${did}/${MEETING_COLLECTION}/${rkey}`;
    if (op === "delete") {
      if (this.meetings.delete(uri)) await this.persist("meetings", this.meetings);
      return;
    }
    if (op !== "create") return; // meetings are immutable proposals, no update path
    if (!rec || !isDid(rec.toDid) || typeof rec.topic !== "string") return;
    if (this.meetings.size >= MAX_MEETINGS) return;

    const profile = await this.resolveProfile(did);
    this.meetings.set(uri, {
      uri,
      fromDid: did,
      fromHandle: profile?.handle || did,
      fromAvatar: profile?.avatar || "",
      toDid: rec.toDid,
      toHandle: cleanStr(rec.toHandle, 128) || rec.toDid,
      topic: cleanStr(rec.topic, MAX_TOPIC).toLowerCase(),
      message: cleanStr(rec.message, MAX_MESSAGE),
      createdAt: typeof rec.createdAt === "string" ? rec.createdAt : new Date().toISOString(),
      indexedAt: Date.now(),
    });
    await this.persist("meetings", this.meetings);
  }

  private async onResponse(did: string, op: string, rec: any): Promise<void> {
    if (op !== "create" && op !== "update") return;
    if (!rec || typeof rec.meetingUri !== "string") return;
    if (rec.status !== "accepted" && rec.status !== "declined") return;
    const meeting = this.meetings.get(rec.meetingUri);
    // Integrity check: only the invitee's own response counts, so a random
    // writer can't fabricate someone else's accept/decline.
    if (!meeting || meeting.toDid !== did) return;

    this.responses.set(rec.meetingUri, {
      meetingUri: rec.meetingUri,
      byDid: did,
      status: rec.status,
      createdAt: typeof rec.createdAt === "string" ? rec.createdAt : new Date().toISOString(),
    });
    await this.persist("responses", this.responses);
  }

  private async onFeedback(did: string, op: string, rec: any): Promise<void> {
    if (op !== "create" && op !== "update") return;
    if (!rec || typeof rec.meetingUri !== "string") return;
    if (!["great", "ok", "noshow"].includes(rec.outcome)) return;
    const meeting = this.meetings.get(rec.meetingUri);
    // Only a meeting's two participants can leave feedback on it.
    if (!meeting || (meeting.fromDid !== did && meeting.toDid !== did)) return;

    const profile = await this.resolveProfile(did);
    const list = this.feedback.get(rec.meetingUri) || [];
    const next = list.filter((f) => f.byDid !== did);
    next.push({
      meetingUri: rec.meetingUri,
      byDid: did,
      byHandle: profile?.handle || did,
      outcome: rec.outcome,
      note: cleanStr(rec.note, MAX_NOTE),
      rematch: rec.rematch === true,
      createdAt: typeof rec.createdAt === "string" ? rec.createdAt : new Date().toISOString(),
    });
    this.feedback.set(rec.meetingUri, next);
    await this.persist("feedback", this.feedback);
  }

  private async resolveProfile(did: string): Promise<CachedProfile | null> {
    const cached = this.profileCache.get(did);
    if (cached && Date.now() - cached.resolvedAt < PROFILE_TTL_MS) return cached;
    try {
      const r = await fetch(`${APPVIEW}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
      if (!r.ok) return cached || null;
      const data: any = await r.json();
      const profile: CachedProfile = {
        handle: data.handle || did,
        displayName: data.displayName || data.handle || did,
        avatar: data.avatar || "",
        resolvedAt: Date.now(),
      };
      this.profileCache.set(did, profile);
      return profile;
    } catch {
      return cached || null;
    }
  }

  private async persist(key: string, map: Map<string, unknown>): Promise<void> {
    await this.state.storage.put({ [key]: Object.fromEntries(map) });
  }

  // ---- alarm: reconnect heartbeat -------------------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});
    await this.state.storage.setAlarm(Date.now() + ALARM_MS);
  }

  // ---- http (read-only) ------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);

    if (url.pathname === "/api/topics" && request.method === "GET") {
      const counts: Record<string, number> = {};
      for (const p of this.profiles.values()) counts[p.topic] = (counts[p.topic] || 0) + 1;
      return json({ counts });
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
      const did = url.searchParams.get("did") || "";
      if (!isDid(did)) return json({ error: "bad did" }, 400);
      return json(this.buildMe(did));
    }

    return json({ error: "not found" }, 404);
  }

  private meetingView(m: MeetingEntry) {
    const response = this.responses.get(m.uri) || null;
    const feedback = this.feedback.get(m.uri) || [];
    const status = response ? response.status : "proposed";
    return { ...m, status, response, feedback };
  }

  private buildMe(did: string) {
    const profile = this.profiles.get(did) || null;

    const candidates = profile
      ? Array.from(this.profiles.values())
          .filter((p) => p.did !== did && p.topic === profile.topic)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 40)
          .map((p) => {
            const already = Array.from(this.meetings.values()).find(
              (m) =>
                (m.fromDid === did && m.toDid === p.did) || (m.fromDid === p.did && m.toDid === did),
            );
            return { ...p, existingMeetingUri: already ? already.uri : null };
          })
      : [];

    const sent = Array.from(this.meetings.values())
      .filter((m) => m.fromDid === did)
      .sort((a, b) => b.indexedAt - a.indexedAt)
      .map((m) => this.meetingView(m));

    const inbox = Array.from(this.meetings.values())
      .filter((m) => m.toDid === did)
      .sort((a, b) => b.indexedAt - a.indexedAt)
      .map((m) => this.meetingView(m));

    return { profile, candidates, sent, inbox };
  }
}
