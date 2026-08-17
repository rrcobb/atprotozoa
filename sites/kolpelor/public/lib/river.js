// river.js — Ῥεῖ ποταμὸς ἀφανὴς δι' ὅλου κόσμου, φέρων ἀγγελίας ζώσας ἀπ'
// ἄστρων· ἐξαίφνης δ' ὄμβρος πίπτει, ἢ πέλωρ μέγα φαίνεται πᾶσιν ὁμοῦ.
// εἷς γὰρ κόσμος, μία ῥοή, πάντες συνάμα πάσχομεν. — @antiali.as's own words,
// tagging the bot straight onto the request. "An invisible river runs through
// the whole world, carrying living messages from the stars; suddenly rain
// falls, or a great pelor appears to all together. One world, one flow, we
// all feel it together." The river IS Jetstream, atproto's public firehose
// (no auth, no key) — every post a "living message from a star." Watched
// live, its rate becomes ambient world weather (calm/drizzle/rain/storm),
// and when it truly surges, a World Pelor spawns — built from whichever real
// account's post rode the spike, via pelora.js's own peloraFor() (pool of
// one, so tierOf always reads it as legendary) scaled up so it reads as an
// event. Pure client-side WebSocket, no server state: every visitor's
// browser watches the same public river and reacts on its own — "one world,
// one flow" doesn't need a backend to be true when everyone really is
// watching the same firehose.

import { peloraFor } from "./pelora.js";

const WS_URL = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const PUB = "https://api.bsky.app/xrpc";

const TICK_MS = 2000; // recompute rate/condition every 2s
const RATE_WINDOW_MS = 8000; // rate = create-events in the trailing 8s
const HISTORY_LEN = 90; // ~3 minutes of tick history for the baseline mean/std
const SPIKE_COOLDOWN_MS = 90_000; // minimum gap between World Pelor appearances
const GUARANTEE_MS = 4 * 60_000; // ἐξαίφνης shouldn't mean "never" on a short visit — force one appearance if the river hasn't organically spiked by then
const AUTHOR_BUFFER = 50;
const MAX_PROFILE_ATTEMPTS = 5;

export const CONDITIONS = [
  { id: "calm", label: "Calm", greek: "Γαλήνη", emoji: "\u{1F324}\u{FE0F}" },
  { id: "drizzle", label: "Drizzle", greek: "Ψεκάς", emoji: "\u{1F326}\u{FE0F}" },
  { id: "rain", label: "Rain", greek: "Ὄμβρος", emoji: "\u{1F327}\u{FE0F}" },
  { id: "storm", label: "Storm", greek: "Καταιγίς", emoji: "\u{26C8}\u{FE0F}" },
];

let socket = null;
let connecting = false;
let tickerStarted = false;
let eventTimes = []; // timestamps of recent post-create events, trimmed to RATE_WINDOW_MS
let authorBuffer = []; // recent {did}s, most recent last
let history = []; // recent per-tick rates, for the rolling baseline
let listeners = new Set();
let connectedAt = 0;
let lastSpikeAt = 0;
let everSpiked = false;
let spawnInFlight = false;

const state = {
  condition: "calm",
  ratePerSec: 0,
  z: 0,
  worldPelor: null, // a pelor object while an appearance is live, else null
  updatedAt: 0,
};

function notify() {
  state.updatedAt = Date.now();
  const snapshot = { ...state };
  for (const cb of listeners) {
    try { cb(snapshot); } catch { /* one bad listener shouldn't sink the river */ }
  }
}

function conditionFor(z) {
  if (z >= 2.4) return CONDITIONS[3];
  if (z >= 1.5) return CONDITIONS[2];
  if (z >= 0.8) return CONDITIONS[1];
  return CONDITIONS[0];
}

function connect() {
  if (socket || connecting) return;
  connecting = true;
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    connecting = false;
    return;
  }
  if (!connectedAt) connectedAt = Date.now();

  socket.onopen = () => { connecting = false; };
  socket.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.kind !== "commit" || !msg.commit || msg.commit.operation !== "create") return;
    eventTimes.push(Date.now());
    if (msg.did) {
      authorBuffer.push(msg.did);
      if (authorBuffer.length > AUTHOR_BUFFER) authorBuffer.shift();
    }
  };
  socket.onclose = () => {
    socket = null;
    connecting = false;
    setTimeout(connect, 2000);
  };
  socket.onerror = () => {
    try { socket.close(); } catch { /* onclose reconnects */ }
  };
}

function tick() {
  const now = Date.now();
  eventTimes = eventTimes.filter((t) => now - t <= RATE_WINDOW_MS);
  const rate = eventTimes.length / (RATE_WINDOW_MS / 1000);

  history.push(rate);
  if (history.length > HISTORY_LEN) history.shift();

  const baseline = history.slice(0, -1);
  let z = 0;
  if (baseline.length >= 8) {
    const mean = baseline.reduce((a, v) => a + v, 0) / baseline.length;
    const variance = baseline.reduce((a, v) => a + (v - mean) ** 2, 0) / baseline.length;
    const std = Math.max(Math.sqrt(variance), 0.5);
    z = (rate - mean) / std;
  }

  state.condition = conditionFor(z).id;
  state.ratePerSec = rate;
  state.z = z;

  maybeSpawnWorldPelor(now, z);
  notify();
}

function maybeSpawnWorldPelor(now, z) {
  if (state.worldPelor || spawnInFlight) return;
  if (now - lastSpikeAt < SPIKE_COOLDOWN_MS) return;
  if (!authorBuffer.length) return;

  const organicSpike = z >= 2.2;
  const overdue = !everSpiked && connectedAt && now - connectedAt >= GUARANTEE_MS;
  if (!organicSpike && !overdue) return;

  everSpiked = true;
  lastSpikeAt = now;
  spawnWorldPelor();
}

async function fetchProfile(did) {
  const r = await fetch(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const p = await r.json();
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName || p.handle,
    avatar: p.avatar || "",
    followersCount: p.followersCount || 0,
    followsCount: p.followsCount || 0,
    postsCount: p.postsCount || 0,
  };
}

// A pool of exactly one always lands in pelora.js's top percentile — tierOf
// reads that as legendary, which is exactly right for something the whole
// river just surfaced. Scaled up further so facing it feels like an event,
// not just another wild encounter.
function worldPeloraFor(profile) {
  const base = peloraFor(profile, [profile]);
  const scale = 1.7;
  return {
    ...base,
    isWorld: true,
    stats: {
      hp: Math.round(base.stats.hp * scale),
      atk: Math.round(base.stats.atk * scale),
      def: Math.round(base.stats.def * scale),
      spd: Math.round(base.stats.spd * scale),
    },
  };
}

async function spawnWorldPelor() {
  spawnInFlight = true;
  const candidates = authorBuffer.slice().reverse();
  const tried = new Set();
  for (const did of candidates) {
    if (tried.has(did)) continue;
    tried.add(did);
    try {
      const profile = await fetchProfile(did);
      state.worldPelor = worldPeloraFor(profile);
      notify();
      spawnInFlight = false;
      return;
    } catch {
      // suspended/deleted/rate-limited — try the next candidate
    }
    if (tried.size >= MAX_PROFILE_ATTEMPTS) break;
  }
  spawnInFlight = false; // river surged but nobody resolvable rode it this time — quietly skip
}

export function dismissWorldPelor() {
  state.worldPelor = null;
  notify();
}

// Subscribe to river state. Calls `cb` immediately with the current state,
// then again on every tick or World Pelor appearance/dismissal. Returns an
// unsubscribe function.
export function subscribeRiver(cb) {
  listeners.add(cb);
  connect();
  if (!tickerStarted) {
    tickerStarted = true;
    tick();
    setInterval(tick, TICK_MS);
  }
  cb({ ...state });
  return () => listeners.delete(cb);
}
