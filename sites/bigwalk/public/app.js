// bigwalk client — landing form resolves a handle's moots (lib/cluster.js,
// public AppView, no auth) and hands the room off to a WebSocket-backed
// Durable Object (see src/index.ts's Walk class) for live presence, the race
// clock, and elimination. Everyone connected joins the next race when
// someone hits start; alternate L/R (keys or on-screen buttons) to walk.

import { resolveDid, moots, getProfiles } from "./lib/cluster.js";

const LS_ME = "bigwalk:me";

const els = {
  landing: document.getElementById("landing"),
  walk: document.getElementById("walk"),
  startForm: document.getElementById("start-form"),
  handleInput: document.getElementById("handle-input"),
  landingStatus: document.getElementById("landing-status"),
  walkOwnerName: document.getElementById("walk-owner-name"),
  walkKind: document.getElementById("walk-kind"),
  walkStatus: document.getElementById("walk-status"),
  meName: document.getElementById("me-name"),
  meEdit: document.getElementById("me-edit"),
  shareBtn: document.getElementById("share-btn"),
  copyBtn: document.getElementById("copy-btn"),
  walkers: document.getElementById("walkers"),
  track: document.getElementById("track"),
  startRaceBtn: document.getElementById("start-race-btn"),
  countdown: document.getElementById("countdown"),
  raceStatusLine: document.getElementById("race-status-line"),
  footControls: document.getElementById("foot-controls"),
  footLeft: document.getElementById("foot-left"),
  footRight: document.getElementById("foot-right"),
  recordLine: document.getElementById("record-line"),
  historyList: document.getElementById("history-list"),
  resultsPanel: document.getElementById("results-panel"),
  resultsList: document.getElementById("results-list"),
  rosterList: document.getElementById("roster-list"),
  cheerFlyLayer: document.getElementById("cheer-fly-layer"),
};

const room = {
  handle: "",
  owner: null,
  pool: [],
  kind: "",
  trackMeters: 300,
  bestMs: null,
  bestBy: "",
  history: [],
  presence: [],
  myId: null,
  mySeat: null,
  ws: null,
  race: { state: "lobby", startedAt: 0, walkers: [] },
};

const walkerEls = new Map(); // seat -> DOM element
let countdownTimer = null;
let localLastFoot = "";

function cleanHandle(raw) {
  return (raw || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split(/[\/\s]/)[0]
    .toLowerCase();
}

function setStatus(el, text, isError) {
  el.textContent = text || "";
  el.classList.toggle("error", !!isError);
}

// ---- routing ----

function route() {
  const m = location.pathname.match(/^\/w\/([^/]+)\/?$/);
  if (m) {
    startWalk(decodeURIComponent(m[1]));
  } else {
    els.landing.hidden = false;
    els.walk.hidden = true;
  }
}

els.startForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const handle = cleanHandle(els.handleInput.value);
  if (!handle) return;
  localStorage.setItem(LS_ME, handle);
  history.pushState({}, "", `/w/${encodeURIComponent(handle)}`);
  route();
});

window.addEventListener("popstate", route);

// ---- walk boot ----

async function startWalk(handle) {
  room.handle = handle;
  els.landing.hidden = true;
  els.walk.hidden = false;
  els.walkOwnerName.textContent = handle;
  setStatus(els.walkStatus, "walking up to the start line…");
  els.walkers.innerHTML = "";
  els.historyList.innerHTML = "";
  els.rosterList.innerHTML = "";
  walkerEls.clear();

  let snap;
  try {
    const res = await fetch(`/api/walk/${encodeURIComponent(handle)}`);
    snap = await res.json();
  } catch {
    setStatus(els.walkStatus, "couldn't reach the walk. try again?", true);
    return;
  }

  if (!snap.exists) {
    try {
      setStatus(els.walkStatus, `resolving @${handle}…`);
      const result = await moots(handle, {
        onStep: (s) => setStatus(els.walkStatus, s),
      });
      setStatus(els.walkStatus, "lining everyone up at the start line…");
      const seedRes = await fetch(`/api/walk/${encodeURIComponent(handle)}/seed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: result.self, pool: result.pool, kind: result.kind }),
      });
      snap = await seedRes.json();
    } catch (err) {
      setStatus(els.walkStatus, `couldn't find @${handle} — ${err.message || "check the handle"}`, true);
      return;
    }
  }

  applySnapshot(snap);
  els.walkOwnerName.textContent = room.owner.displayName || room.owner.handle;
  els.walkKind.textContent = room.pool.length
    ? `${room.pool.length} ${room.kind === "moots" ? "moots" : "riders"} could join`
    : "walking solo (for now)";
  setStatus(els.walkStatus, "");

  renderRoster();
  renderRecord();
  renderHistory();
  renderRaceUI();
  connect(handle);
}

function applySnapshot(snap) {
  room.owner = snap.owner;
  room.pool = snap.pool || [];
  room.kind = snap.kind || "moots";
  room.trackMeters = snap.trackMeters || 300;
  room.bestMs = snap.bestMs ?? null;
  room.bestBy = snap.bestBy || "";
  room.history = snap.history || [];
  room.presence = snap.presence || [];
  room.race = snap.race || { state: "lobby", startedAt: 0, walkers: [] };
}

// ---- websocket ----

function connect(handle) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/api/walk/${encodeURIComponent(handle)}/ws`);
  room.ws = ws;

  ws.addEventListener("open", async () => {
    const me = await resolveMe();
    ws.send(JSON.stringify({ t: "hello", ...me }));
  });

  ws.addEventListener("message", (evt) => {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }
    handleMessage(msg);
  });

  ws.addEventListener("close", () => {
    setStatus(els.walkStatus, "disconnected — reconnecting…", true);
    setTimeout(() => {
      if (room.handle === handle) connect(handle);
    }, 1500);
  });
}

async function resolveMe() {
  const stored = localStorage.getItem(LS_ME);
  if (!stored) return { did: "", handle: "", displayName: "", avatar: "" };

  if (room.owner && stored === room.owner.handle.toLowerCase()) {
    updateMeLabel(room.owner.displayName || room.owner.handle);
    return { did: room.owner.did, handle: room.owner.handle, displayName: room.owner.displayName, avatar: room.owner.avatar };
  }
  const poolMatch = room.pool.find((r) => r.handle.toLowerCase() === stored);
  if (poolMatch) {
    updateMeLabel(poolMatch.displayName || poolMatch.handle);
    return { did: poolMatch.did, handle: poolMatch.handle, displayName: poolMatch.displayName, avatar: poolMatch.avatar };
  }
  try {
    const did = await resolveDid(stored);
    const profiles = await getProfiles([did]);
    const p = profiles[0];
    const me = {
      did,
      handle: p?.handle || stored,
      displayName: p?.displayName || p?.handle || stored,
      avatar: p?.avatar || "",
    };
    updateMeLabel(me.displayName);
    return me;
  } catch {
    updateMeLabel(stored);
    return { did: "", handle: stored, displayName: stored, avatar: "" };
  }
}

function updateMeLabel(name) {
  els.meName.textContent = name || "a passerby";
}

function handleMessage(msg) {
  if (msg.t === "init") {
    room.myId = msg.you.id;
    room.mySeat = msg.you.seat;
    applySnapshot(msg);
    renderRoster();
    renderRecord();
    renderHistory();
    renderRaceUI();
    return;
  }
  if (msg.t === "seat") {
    if (msg.id === room.myId) room.mySeat = msg.seat;
    renderRaceUI();
    return;
  }
  if (msg.t === "presence") {
    room.presence = msg.presence || [];
    renderRoster();
    return;
  }
  if (msg.t === "race_start") {
    room.race = { state: "racing", startedAt: msg.startedAt, walkers: msg.walkers || [] };
    walkerEls.clear();
    els.resultsPanel.hidden = true;
    renderTrackFull(room.race.walkers);
    beginCountdown();
    return;
  }
  if (msg.t === "pos") {
    updateWalkerPos(msg.seat, msg.distance, msg.finished, msg.place);
    return;
  }
  if (msg.t === "eliminated") {
    markEliminated(msg.seat);
    return;
  }
  if (msg.t === "race_over") {
    room.race = { state: "lobby", startedAt: 0, walkers: room.race.walkers };
    room.bestMs = msg.bestMs ?? room.bestMs;
    room.bestBy = msg.bestBy || room.bestBy;
    room.history = msg.history || room.history;
    renderRecord();
    renderHistory();
    renderResults(msg.results || []);
    renderRaceUI();
    celebrateRaceOver(msg.results || []);
    return;
  }
  if (msg.t === "cheer") {
    flyCheer(msg.seat, msg.emoji);
    return;
  }
}

// ---- rendering: roster (lobby) ----

function renderRoster() {
  els.rosterList.innerHTML = "";
  const knownSeats = new Set(["owner", ...room.pool.map((r) => r.did)]);
  const entries = [];
  if (room.owner) entries.push({ seat: "owner", name: room.owner.displayName || room.owner.handle, handle: room.owner.handle });
  for (const r of room.pool) entries.push({ seat: r.did, name: r.displayName || r.handle, handle: r.handle });

  for (const e of entries) {
    const present = room.presence.some((p) => p.seat === e.seat);
    const li = document.createElement("li");
    const isYou = e.seat === room.mySeat;
    li.textContent = `${present ? "🟢" : "⚪"} ${e.name}`;
    if (isYou) {
      const tag = document.createElement("span");
      tag.className = "you-tag";
      tag.textContent = "YOU";
      li.appendChild(tag);
    }
    els.rosterList.appendChild(li);
  }
  const passersby = room.presence.filter((p) => !knownSeats.has(p.seat));
  const uniqueSeats = new Map();
  for (const p of passersby) if (!uniqueSeats.has(p.seat)) uniqueSeats.set(p.seat, p);
  for (const p of uniqueSeats.values()) {
    const li = document.createElement("li");
    li.textContent = `🟢 ${p.displayName || "a passerby"}`;
    if (p.seat === room.mySeat) {
      const tag = document.createElement("span");
      tag.className = "you-tag";
      tag.textContent = "YOU";
      li.appendChild(tag);
    }
    els.rosterList.appendChild(li);
  }
  if (!entries.length && !uniqueSeats.size) {
    const li = document.createElement("li");
    li.textContent = "nobody here yet";
    els.rosterList.appendChild(li);
  }
}

// ---- rendering: track ----

function riderMeta(seat) {
  if (seat === "owner" && room.owner) return room.owner;
  const poolMatch = room.pool.find((r) => r.did === seat);
  if (poolMatch) return poolMatch;
  const presenceMatch = room.presence.find((p) => p.seat === seat);
  if (presenceMatch) return { displayName: presenceMatch.displayName, handle: presenceMatch.handle, avatar: presenceMatch.avatar };
  return null;
}

function pctFor(distance) {
  const pct = Math.max(0, Math.min(1, distance / room.trackMeters));
  return (pct * 88).toFixed(2) + "%";
}

function makeWalkerEl(w) {
  const meta = riderMeta(w.seat) || {};
  const lane = document.createElement("div");
  lane.className = "lane";

  const el = document.createElement("div");
  el.className = "walker";
  el.dataset.seat = w.seat;
  const present = room.presence.some((p) => p.seat === w.seat);
  if (present) el.classList.add("awake");
  if (w.seat === room.mySeat) el.classList.add("is-you");
  el.style.left = pctFor(w.distance || 0);

  const figure = document.createElement("div");
  figure.className = "figure";
  if (meta.avatar) {
    const img = document.createElement("img");
    img.src = meta.avatar;
    img.alt = "";
    img.loading = "lazy";
    figure.appendChild(img);
  } else {
    figure.textContent = "🚶";
  }
  el.appendChild(figure);

  const tag = document.createElement("div");
  tag.className = "tag";
  tag.textContent = w.displayName || meta.displayName || meta.handle || "guest";
  el.appendChild(tag);

  lane.appendChild(el);
  walkerEls.set(w.seat, el);
  return lane;
}

function renderTrackFull(walkers) {
  els.walkers.innerHTML = "";
  walkerEls.clear();
  const list = walkers && walkers.length ? walkers : lobbyPreviewWalkers();
  for (const w of list) {
    els.walkers.appendChild(makeWalkerEl(w));
  }
}

function lobbyPreviewWalkers() {
  const list = [];
  if (room.owner) list.push({ seat: "owner", distance: 0, displayName: room.owner.displayName || room.owner.handle });
  for (const r of room.pool) list.push({ seat: r.did, distance: 0, displayName: r.displayName || r.handle });
  return list;
}

function updateWalkerPos(seat, distance, finished, place) {
  const el = walkerEls.get(seat);
  if (!el) return;
  el.style.left = pctFor(distance);
  el.classList.remove("stepping");
  void el.offsetWidth;
  el.classList.add("stepping");
  if (finished) {
    el.classList.add("finished");
    if (place) {
      const flag = document.createElement("div");
      flag.className = "place-flag";
      flag.textContent = place === 1 ? "🥇 1st" : place === 2 ? "🥈 2nd" : place === 3 ? "🥉 3rd" : `${place}th`;
      el.appendChild(flag);
    }
  }
}

function markEliminated(seat) {
  const el = walkerEls.get(seat);
  if (el) el.classList.add("eliminated");
}

// ---- rendering: race controls ----

function renderRaceUI() {
  const racing = room.race.state === "racing";
  els.startRaceBtn.hidden = racing;
  els.footControls.hidden = !racing;
  if (!racing) {
    renderTrackFull(room.race.walkers && room.race.walkers.some((w) => w.finished || w.eliminated) ? room.race.walkers : null);
    els.countdown.hidden = true;
    els.startRaceBtn.disabled = false;
    const passerby = !room.mySeat || room.mySeat.startsWith("passerby:");
    els.raceStatusLine.textContent = passerby
      ? "tap \"change\" above and enter your handle to join the race yourself"
      : "hit start whenever — everyone connected joins";
  }
}

function beginCountdown() {
  els.raceStatusLine.textContent = "";
  els.startRaceBtn.hidden = true;
  const tick = () => {
    const remaining = room.race.startedAt - Date.now();
    if (remaining <= 0) {
      els.countdown.hidden = true;
      els.raceStatusLine.textContent = "GO — alternate L/R to walk!";
      clearInterval(countdownTimer);
      return;
    }
    els.countdown.hidden = false;
    els.countdown.textContent = Math.ceil(remaining / 1000);
  };
  clearInterval(countdownTimer);
  countdownTimer = setInterval(tick, 100);
  tick();
}

els.startRaceBtn.addEventListener("click", () => {
  if (room.ws && room.ws.readyState === 1) room.ws.send(JSON.stringify({ t: "start" }));
});

// ---- stepping ----

function sendStep(foot) {
  if (room.race.state !== "racing") return;
  if (!room.ws || room.ws.readyState !== 1) return;
  if (foot === localLastFoot) return; // client-side alternation hint; server re-checks anyway
  localLastFoot = foot;
  room.ws.send(JSON.stringify({ t: "step", foot }));
}

els.footLeft.addEventListener("click", () => sendStep("L"));
els.footRight.addEventListener("click", () => sendStep("R"));
els.footLeft.addEventListener("touchstart", (e) => { e.preventDefault(); sendStep("L"); }, { passive: false });
els.footRight.addEventListener("touchstart", (e) => { e.preventDefault(); sendStep("R"); }, { passive: false });

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  const key = e.key.toLowerCase();
  if (key === "arrowleft" || key === "a") sendStep("L");
  else if (key === "arrowright" || key === "d") sendStep("R");
});

// ---- rendering: record / history / results ----

function renderRecord() {
  els.recordLine.textContent = room.bestMs
    ? `${(room.bestMs / 1000).toFixed(2)}s — ${room.bestBy}`
    : "nobody's finished yet";
}

function renderHistory() {
  els.historyList.innerHTML = "";
  if (!room.history.length) {
    const li = document.createElement("li");
    li.textContent = "no walks yet";
    els.historyList.appendChild(li);
    return;
  }
  for (const h of room.history.slice().reverse()) {
    const li = document.createElement("li");
    li.textContent = h.winnerMs
      ? `${h.winner} won in ${(h.winnerMs / 1000).toFixed(2)}s (${h.racers} racing)`
      : `nobody finished (${h.racers} racing)`;
    els.historyList.appendChild(li);
  }
}

function renderResults(results) {
  els.resultsList.innerHTML = "";
  els.resultsPanel.hidden = results.length === 0;
  for (const r of results) {
    const li = document.createElement("li");
    const label = r.place
      ? `${r.displayName} — ${(r.finishMs / 1000).toFixed(2)}s`
      : `${r.displayName} — ${Math.round(r.distance)}m`;
    li.textContent = label;
    if (r.eliminated) {
      const tag = document.createElement("span");
      tag.className = "eliminated-tag";
      tag.textContent = "picked off";
      li.appendChild(tag);
    }
    els.resultsList.appendChild(li);
  }
}

function celebrateRaceOver(results) {
  const winner = results.find((r) => r.place === 1);
  const banner = document.createElement("div");
  banner.className = "race-over-banner";
  banner.textContent = winner ? `🏁 ${winner.displayName} wins the walk!` : "🏁 the walk's over — nobody made it";
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 3600);
}

// ---- cheer ----

function flyCheer(seat, emoji) {
  const el = walkerEls.get(seat);
  const rect = el ? el.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0 };
  const bubble = document.createElement("div");
  bubble.className = "cheer-bubble-fly";
  bubble.textContent = emoji;
  bubble.style.position = "absolute";
  bubble.style.left = rect.left + rect.width / 2 + "px";
  bubble.style.top = rect.top + "px";
  bubble.style.fontSize = "1.4rem";
  els.cheerFlyLayer.appendChild(bubble);
  const anim = bubble.animate(
    [
      { transform: "translate(-50%, 0)", opacity: 1 },
      { transform: "translate(-50%, -30px)", opacity: 0 },
    ],
    { duration: 900, easing: "ease-out" },
  );
  anim.onfinish = () => bubble.remove();
}

// ---- identity ----

els.meEdit.addEventListener("click", async () => {
  const current = localStorage.getItem(LS_ME) || "";
  const next = window.prompt("your bluesky handle (leave blank to walk anonymous):", current);
  if (next === null) return;
  const cleaned = cleanHandle(next);
  if (cleaned) localStorage.setItem(LS_ME, cleaned);
  else localStorage.removeItem(LS_ME);
  updateMeLabel(cleaned || "a passerby");
  if (room.ws && room.ws.readyState === 1) {
    const me = await resolveMe();
    room.ws.send(JSON.stringify({ t: "hello", ...me }));
  }
});

// ---- sharing ----

els.shareBtn.addEventListener("click", () => {
  const url = `${location.origin}/w/${encodeURIComponent(room.handle)}`;
  const name = room.owner ? room.owner.displayName || room.owner.handle : room.handle;
  const text = `racing ${name} and the moots down the track 🚶💨 hop in: ${url}`;
  window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`, "_blank", "noopener");
});

els.copyBtn.addEventListener("click", async () => {
  const url = `${location.origin}/w/${encodeURIComponent(room.handle)}`;
  try {
    await navigator.clipboard.writeText(url);
    els.copyBtn.textContent = "copied!";
    els.copyBtn.classList.add("copied");
  } catch {
    window.prompt("copy this link:", url);
  }
  setTimeout(() => {
    els.copyBtn.textContent = "copy link";
    els.copyBtn.classList.remove("copied");
  }, 1600);
});

// ---- boot ----

const savedMe = localStorage.getItem(LS_ME);
if (savedMe) els.handleInput.value = savedMe;
route();
