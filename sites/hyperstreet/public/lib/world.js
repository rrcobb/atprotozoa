// hyperstreet world model. No imports, no DOM: the same file runs in the page
// and in `node cli.mjs`. The world is a pure function of the Jetstream commit
// stream — every view (web canvas, cardboard VR, terminal) is a projection of
// this one object.

export const L = 6000; // length of the Street (a loop)
export const STREET_HALF = 14; // half-width of the roadway

// Browser memory + draw cost, not taste: every active DID becomes a building,
// and the renderer walks them all each frame. Least-recently-seen are evicted.
const MAX_ENTS = 1500;
// getProfiles accepts at most 25 actors per call.
const PROFILE_BATCH = 25;

const JETSTREAMS = [
  "wss://jetstream2.us-east.bsky.network/subscribe",
  "wss://jetstream1.us-east.bsky.network/subscribe",
  "wss://jetstream2.us-west.bsky.network/subscribe",
  "wss://jetstream1.us-west.bsky.network/subscribe",
];
const COLLECTIONS = {
  "app.bsky.feed.post": "post",
  "app.bsky.feed.like": "like",
  "app.bsky.feed.repost": "repost",
  "app.bsky.graph.follow": "follow",
};
const APPVIEW = "https://public.api.bsky.app";

export function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BLADES = ["katana", "wakizashi", "claymore", "rapier", "zweihander", "cutlass", "dao", "kukri", "estoc", "nodachi", "falchion", "sabre"];
const EDGES = ["monofilament", "plasma", "vorpal", "neon", "hyperscale", "carbon", "mirror", "static", "cold-iron", "tungsten", "dreaming", "thermal"];
const RARITY = [
  [0.99, "mythic", 60],
  [0.95, "legendary", 35],
  [0.8, "rare", 15],
  [0, "common", 0],
];

// A sword is a deterministic function of a DID. Nobody picks one.
export function makeSword(did) {
  const r = rng(fnv(did) ^ 0x5bd1e995);
  const blade = BLADES[(r() * BLADES.length) | 0];
  const edge = EDGES[(r() * EDGES.length) | 0];
  const roll = r();
  const [, rarity, bonus] = RARITY.find(([min]) => roll >= min);
  const len = 0.5 + r() * 0.5; // 0..1 of max blade length
  const guard = 0.2 + r() * 0.8;
  const curve = r() < 0.4 ? r() * 0.6 : 0;
  const hue = (r() * 360) | 0;
  const power = Math.round(len * 30 + guard * 10 + bonus + r() * 40);
  return { name: `${edge} ${blade}`, blade, edge, rarity, len, guard, curve, hue, power };
}

function makeEnt(did) {
  const h = fnv(did);
  const r = rng(Math.imul(h, 2654435761) >>> 0);
  return {
    did,
    handle: null,
    name: null,
    x: (Math.imul(h, 2654435761) >>> 0) % L,
    side: (h >>> 9) & 1 ? 1 : -1,
    off: 3 + r() * 12, // distance back from the kerb
    w: 4 + r() * 5,
    floors: 3 + ((r() * 9) | 0),
    hue: (r() * 360) | 0,
    sword: makeSword(did),
    posts: 0,
    likes: 0,
    reposts: 0,
    follows: 0,
    given: 0, // likes received
    last: 0,
    signs: [],
    flash: 0,
  };
}

export class World {
  constructor() {
    this.ents = new Map();
    this.plugins = new Map();
    this.events = []; // recent, newest last
    this.listeners = new Set();
    this.counts = { post: 0, like: 0, repost: 0, follow: 0 };
    this.recent = []; // timestamps for rate
    this.me = { x: 0, y: 0, yaw: 0, auto: true };
    this.status = "idle";
    this.host = 0;
    this.pending = new Set();
    this.log = (m) => {};
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  ent(did) {
    let e = this.ents.get(did);
    if (!e) {
      if (this.ents.size >= MAX_ENTS) this.evict();
      e = makeEnt(did);
      this.ents.set(did, e);
    }
    return e;
  }

  evict() {
    let oldest = null;
    for (const e of this.ents.values()) if (!oldest || e.last < oldest.last) oldest = e;
    if (oldest) this.ents.delete(oldest.did);
  }

  label(e) { return e.handle ? "@" + e.handle : e.did.replace("did:plc:", "").slice(0, 8) + "…"; }

  // Ingest one Jetstream JSON message.
  ingest(msg) {
    if (msg.kind !== "commit" || msg.commit?.operation !== "create") return;
    const type = COLLECTIONS[msg.commit.collection];
    if (!type) return;
    const now = Date.now();
    const rec = msg.commit.record || {};
    const e = this.ent(msg.did);
    e.last = now;
    const ev = { type, did: msg.did, t: now, ent: e };
    if (type === "post") {
      e.posts++;
      ev.text = String(rec.text || "").replace(/\s+/g, " ").trim();
      if (ev.text) {
        e.signs.push({ text: ev.text.slice(0, 120), t: now });
        if (e.signs.length > 3) e.signs.shift();
      }
    } else if (type === "like" || type === "repost") {
      e[type === "like" ? "likes" : "reposts"]++;
      const target = String(rec.subject?.uri || "").split("/")[2];
      if (target?.startsWith("did:")) {
        const te = this.ent(target);
        te.last = Math.max(te.last, now);
        te.given++;
        te.flash = 1;
        ev.target = te;
      }
    } else if (type === "follow") {
      e.follows++;
      const target = String(rec.subject || "");
      if (target.startsWith("did:")) ev.target = this.ent(target);
    }
    this.counts[type]++;
    this.recent.push(now);
    while (this.recent.length && now - this.recent[0] > 5000) this.recent.shift();
    this.events.push(ev);
    if (this.events.length > 200) this.events.shift();
    this.pending.add(e.did);
    for (const p of this.plugins.values()) {
      if (!p.enabled || !p.onEvent) continue;
      try { p.onEvent(ev, this); } catch (err) { this.fail(p, err); }
    }
    for (const fn of this.listeners) fn(ev);
  }

  fail(p, err) {
    p.enabled = false;
    p.error = String(err?.message || err);
    this.log(`plugin ${p.id} crashed and was switched off: ${p.error}`);
  }

  rate() {
    const now = Date.now();
    return this.recent.filter((t) => now - t < 5000).length / 5;
  }

  // ---- plugins: the whole world is built from these ----
  use(p) {
    const plugin = { enabled: true, ...p };
    this.plugins.set(plugin.id, plugin);
    try { plugin.init?.(this); } catch (err) { this.fail(plugin, err); }
    return plugin;
  }
  setEnabled(id, on) {
    const p = this.plugins.get(id);
    if (!p) return false;
    p.enabled = on;
    if (on) p.error = null;
    return true;
  }

  // Everything plugins can add to the terminal, merged by name.
  pluginCommands() {
    const out = {};
    for (const p of this.plugins.values()) {
      if (!p.enabled || !p.commands) continue;
      for (const [k, c] of Object.entries(p.commands)) out[k] = { ...c, plugin: p.id };
    }
    return out;
  }

  // ---- identity ----
  async fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }

  // Resolve a handle (or did) to an entity, creating it if it's quiet right now.
  async find(q) {
    q = String(q || "").trim().replace(/^@/, "");
    if (!q) throw new Error("who?");
    let did = q;
    if (!q.startsWith("did:")) {
      const j = await this.fetchJson(`${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(q.toLowerCase())}`);
      did = j.did;
    }
    const e = this.ent(did);
    if (!q.startsWith("did:")) e.handle = q.toLowerCase();
    else this.pending.add(did);
    e.last = Math.max(e.last, Date.now());
    return e;
  }

  // Look up handles for DIDs we've seen. `want` is the list of entities the
  // viewer can currently see, so the street names what's on screen first.
  async flushHandles(want = []) {
    const ids = [];
    for (const e of want) if (!e.handle && !e.tried && ids.length < PROFILE_BATCH) ids.push(e);
    if (!ids.length) return;
    for (const e of ids) e.tried = true;
    try {
      const qs = ids.map((e) => "actors=" + encodeURIComponent(e.did)).join("&");
      const j = await this.fetchJson(`${APPVIEW}/xrpc/app.bsky.actor.getProfiles?${qs}`);
      for (const p of j.profiles || []) {
        const e = this.ents.get(p.did);
        if (e) { e.handle = p.handle; e.name = p.displayName || null; }
      }
    } catch (err) {
      for (const e of ids) e.tried = false; // try again later
    }
  }

  // ---- the firehose ----
  connect(WS = globalThis.WebSocket) {
    if (this.ws || !WS) return;
    const cols = Object.keys(COLLECTIONS).map((c) => "wantedCollections=" + c).join("&");
    const open = () => {
      const url = `${JETSTREAMS[this.host % JETSTREAMS.length]}?${cols}`;
      this.status = "tuning in…";
      const ws = new WS(url);
      this.ws = ws;
      let got = false;
      ws.onopen = () => { this.status = "live"; };
      ws.onmessage = (m) => {
        got = true;
        try { this.ingest(JSON.parse(m.data)); } catch (err) {}
      };
      ws.onclose = () => {
        this.status = "reconnecting…";
        if (!got) this.host++;
        this.ws = null;
        if (!this.stopped) setTimeout(open, 1500);
      };
      ws.onerror = () => { try { ws.close(); } catch (err) {} };
    };
    open();
  }
  disconnect() { this.stopped = true; try { this.ws?.close(); } catch (err) {} }

  // Nearby entities, nearest first. Wraps around the loop.
  near(x = this.me.x, radius = 120) {
    const out = [];
    for (const e of this.ents.values()) {
      const d = wrap(e.x - x);
      if (Math.abs(d) <= radius) out.push({ e, d });
    }
    out.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
    return out;
  }
}

export function wrap(d) {
  d = ((d % L) + L) % L;
  return d > L / 2 ? d - L : d;
}

// Deterministic duel: sword power plus a roll seeded by both DIDs, so the same
// two swords always settle it the same way, whoever asks.
export function duel(a, b) {
  const [lo, hi] = a.did < b.did ? [a, b] : [b, a];
  const r = rng(fnv(lo.did + "|" + hi.did));
  const rLo = r() * 40, rHi = r() * 40; // drawn in DID order, not argument order
  const sa = a.sword.power + (a === lo ? rLo : rHi);
  const sb = b.sword.power + (b === lo ? rLo : rHi);
  return { winner: sa >= sb ? a : b, loser: sa >= sb ? b : a, sa, sb };
}
