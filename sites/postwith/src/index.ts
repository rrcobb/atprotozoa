// postwith Worker — mounted at bisks.net/postwith/ (see notes/40-new-site-playbook.md).
//
// @antiali.as's idea: an atproto matchmaker, Lunchclub-style but peer-to-peer /
// ad hoc. Post a profile (interest topic + goal), get auto-matched with other
// people on the same topic, propose a meeting, they accept or decline, and
// either side can log a feedback record once it happens.
//
// Every write is a plain record the author signs and writes straight to their
// OWN PDS from the browser (public-client OAuth, PKCE + DPoP — copied from
// sites/padmoot). "Match people across everyone's repos" needs an index the
// AppView doesn't provide, so a KV snapshot stores a best-effort cross-user
// index. The browser notifies that index after it writes a record; the PDS is
// still authoritative and the index may be stale, duplicated, or incomplete.
//
// Collections:
//   net.bisks.postwith.profile   rkey "self" — {topic, goal, note?, location?, createdAt}
//   net.bisks.postwith.meeting   rkey auto   — {toDid, toHandle, topic, message, createdAt}
//   net.bisks.postwith.response  rkey auto   — {meetingUri, status, createdAt}
//   net.bisks.postwith.feedback  rkey auto   — {meetingUri, outcome, note?, rematch, createdAt}
//
// Every request first gets its "/postwith" mount prefix stripped; what's left
// is matched against /api/* and otherwise falls through to ASSETS.

export interface KVNamespace {
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  HUB_STATE: KVNamespace;
}

const PREFIX = "/postwith";

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

    if (url.pathname.startsWith("/api/")) {
      return new MatchStore(env.HUB_STATE).fetch(stripped);
    }

    return env.ASSETS.fetch(stripped);
  },
};

// ---------------------------------------------------------------------------
// MatchStore — the one global KV-backed index of profiles, meeting proposals,
// responses (accept/decline), and feedback.
// ---------------------------------------------------------------------------

const PROFILE_COLLECTION = "net.bisks.postwith.profile";
const MEETING_COLLECTION = "net.bisks.postwith.meeting";
const RESPONSE_COLLECTION = "net.bisks.postwith.response";
const FEEDBACK_COLLECTION = "net.bisks.postwith.feedback";

const APPVIEW = "https://public.api.bsky.app/xrpc";
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000;

const MAX_TOPIC = 32;
const MAX_GOAL = 240;
const MAX_NOTE = 240;
const MAX_LOCATION = 60;
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
  location: string;
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

export class MatchStore {
  private state: KVNamespace;
  private ready: Promise<void>;
  private profiles: Map<string, ProfileEntry> = new Map();
  private meetings: Map<string, MeetingEntry> = new Map();
  private responses: Map<string, ResponseEntry> = new Map();
  private feedback: Map<string, FeedbackEntry[]> = new Map();
  private profileCache: Map<string, CachedProfile> = new Map();

  constructor(state: KVNamespace) {
    this.state = state;
    const kv = state;
    this.ready = (async () => {
      const [profiles, meetings, responses, feedback] = await Promise.all([
        kv.get<Record<string, ProfileEntry>>("profiles", "json"),
        kv.get<Record<string, MeetingEntry>>("meetings", "json"),
        kv.get<Record<string, ResponseEntry>>("responses", "json"),
        kv.get<Record<string, FeedbackEntry[]>>("feedback", "json"),
      ]);
      this.profiles = new Map(Object.entries(profiles ?? {}));
      this.meetings = new Map(Object.entries(meetings ?? {}));
      this.responses = new Map(Object.entries(responses ?? {}));
      this.feedback = new Map(Object.entries(feedback ?? {}));
    })();
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
      location: cleanStr(rec.location, MAX_LOCATION),
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
    await this.state.put(key, JSON.stringify(Object.fromEntries(map)));
  }

  private async indexRecord(body: any): Promise<void> {
    const did = body?.did;
    const collection = body?.collection;
    const operation = body?.operation || "create";
    const rkey = typeof body?.rkey === "string" ? body.rkey : "";
    if (!isDid(did) || typeof collection !== "string") throw new Error("bad index record");
    if (collection === PROFILE_COLLECTION) return this.onProfile(did, operation, body.record);
    if (collection === MEETING_COLLECTION) {
      if (!rkey) throw new Error("missing record key");
      return this.onMeeting(did, operation, rkey, body.record);
    }
    if (collection === RESPONSE_COLLECTION) return this.onResponse(did, operation, body.record);
    if (collection === FEEDBACK_COLLECTION) return this.onFeedback(did, operation, body.record);
    throw new Error("unknown collection");
  }

  // ---- http ------------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;

    const url = new URL(request.url);

    if (url.pathname === "/api/index" && request.method === "POST") {
      try {
        await this.indexRecord(await request.json());
        return json({ ok: true });
      } catch (error: any) {
        return json({ error: error?.message || "could not index record" }, 400);
      }
    }

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
    const myLoc = (profile?.location || "").toLowerCase();

    const candidates = profile
      ? Array.from(this.profiles.values())
          .filter((p) => p.did !== did && p.topic === profile.topic)
          // Same-location candidates first (when I've set one) — topic alone
          // can match you with someone across the planet, which is useless
          // for anyone actually trying to meet up in person.
          .sort((a, b) => {
            if (myLoc) {
              const aNear = a.location.toLowerCase() === myLoc ? 1 : 0;
              const bNear = b.location.toLowerCase() === myLoc ? 1 : 0;
              if (aNear !== bNear) return bNear - aNear;
            }
            return b.updatedAt - a.updatedAt;
          })
          .slice(0, 40)
          .map((p) => {
            const already = Array.from(this.meetings.values()).find(
              (m) =>
                (m.fromDid === did && m.toDid === p.did) || (m.fromDid === p.did && m.toDid === did),
            );
            return {
              ...p,
              near: !!myLoc && !!p.location && p.location.toLowerCase() === myLoc,
              existingMeetingUri: already ? already.uri : null,
            };
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
