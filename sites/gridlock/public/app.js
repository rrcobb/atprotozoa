// gridlock client — landing form resolves a handle's moots (lib/cluster.js,
// public AppView, no auth) and hands the room off to a WebSocket-backed
// Durable Object (see src/index.ts's Jam class) for live presence, the CB
// note thread, honks, and the co-op "spot it" board.

import { resolveDid, moots, getProfiles } from "./lib/cluster.js";

const LS_ME = "gridlock:me";

const els = {
  landing: document.getElementById("landing"),
  jam: document.getElementById("jam"),
  startForm: document.getElementById("start-form"),
  handleInput: document.getElementById("handle-input"),
  landingStatus: document.getElementById("landing-status"),
  jamOwnerName: document.getElementById("jam-owner-name"),
  jamKind: document.getElementById("jam-kind"),
  jamStatus: document.getElementById("jam-status"),
  meName: document.getElementById("me-name"),
  meEdit: document.getElementById("me-edit"),
  shareBtn: document.getElementById("share-btn"),
  copyBtn: document.getElementById("copy-btn"),
  cars: document.getElementById("cars"),
  honkBtn: document.getElementById("honk-btn"),
  honkTally: document.getElementById("honk-tally"),
  notesFeed: document.getElementById("notes-feed"),
  noteForm: document.getElementById("note-form"),
  noteInput: document.getElementById("note-input"),
  boardList: document.getElementById("board-list"),
  boardClears: document.getElementById("board-clears"),
  flyLayer: document.getElementById("note-fly-layer"),
};

const room = {
  handle: "",
  owner: null,
  pool: [],
  kind: "",
  board: [],
  spotted: {},
  clears: 0,
  honks: 0,
  presence: [],
  myId: null,
  mySeat: null,
  ws: null,
  seenNoteIds: new Set(),
};

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
  const m = location.pathname.match(/^\/j\/([^/]+)\/?$/);
  if (m) {
    startJam(decodeURIComponent(m[1]));
  } else {
    els.landing.hidden = false;
    els.jam.hidden = true;
  }
}

els.startForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const handle = cleanHandle(els.handleInput.value);
  if (!handle) return;
  localStorage.setItem(LS_ME, handle);
  history.pushState({}, "", `/j/${encodeURIComponent(handle)}`);
  route();
});

window.addEventListener("popstate", route);

// ---- jam boot ----

async function startJam(handle) {
  room.handle = handle;
  els.landing.hidden = true;
  els.jam.hidden = false;
  els.jamOwnerName.textContent = handle;
  setStatus(els.jamStatus, "pulling up to the jam…");
  els.cars.innerHTML = "";
  els.notesFeed.innerHTML = "";
  els.boardList.innerHTML = "";

  let snap;
  try {
    const res = await fetch(`/api/jam/${encodeURIComponent(handle)}`);
    snap = await res.json();
  } catch {
    setStatus(els.jamStatus, "couldn't reach the jam. try again?", true);
    return;
  }

  if (!snap.exists) {
    try {
      setStatus(els.jamStatus, `resolving @${handle}…`);
      const result = await moots(handle, {
        onStep: (s) => setStatus(els.jamStatus, s),
      });
      setStatus(els.jamStatus, "lining everyone up bumper to bumper…");
      const seedRes = await fetch(`/api/jam/${encodeURIComponent(handle)}/seed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: result.self, pool: result.pool, kind: result.kind }),
      });
      snap = await seedRes.json();
    } catch (err) {
      setStatus(els.jamStatus, `couldn't find @${handle} — ${err.message || "check the handle"}`, true);
      return;
    }
  }

  room.owner = snap.owner;
  room.pool = snap.pool || [];
  room.kind = snap.kind || "moots";
  room.board = snap.board || [];
  room.spotted = snap.spotted || {};
  room.clears = snap.clears || 0;
  room.honks = snap.honks || 0;
  room.presence = snap.presence || [];

  els.jamOwnerName.textContent = room.owner.displayName || room.owner.handle;
  els.jamKind.textContent = room.pool.length
    ? `${room.pool.length} ${room.kind === "moots" ? "moots" : "riders"} in the jam`
    : "riding solo (for now)";
  setStatus(els.jamStatus, "");

  renderCars();
  renderBoard();
  renderHonkTally(snap.lastHonkBy);
  renderInitialNotes(snap.notes || []);
  connect(handle);
}

// ---- websocket ----

function connect(handle) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/api/jam/${encodeURIComponent(handle)}/ws`);
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
    setStatus(els.jamStatus, "disconnected — reconnecting…", true);
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
    room.presence = msg.presence || room.presence;
    renderCars();
    return;
  }
  if (msg.t === "seat") {
    if (msg.id === room.myId) room.mySeat = msg.seat;
    return;
  }
  if (msg.t === "presence") {
    room.presence = msg.presence || [];
    renderCars();
    return;
  }
  if (msg.t === "note") {
    addNote(msg.note, true);
    return;
  }
  if (msg.t === "honk") {
    room.honks = msg.honks;
    renderHonkTally(msg.by);
    honkEffect(msg.seat);
    return;
  }
  if (msg.t === "spot") {
    room.spotted[msg.i] = { by: msg.by, at: msg.at };
    renderBoard();
    if (msg.cleared) {
      room.clears = msg.clears;
      celebrateClear();
      setTimeout(() => {
        room.spotted = {};
        renderBoard();
      }, 1500);
    }
    return;
  }
}

// ---- rendering: cars ----

function seatKeyOf(rider, isOwner) {
  return isOwner ? "owner" : rider.did;
}

function presenceFor(seatKey) {
  return room.presence.filter((p) => p.seat === seatKey);
}

function makeCarEl(seatKey, name, handle, avatar, color) {
  const car = document.createElement("div");
  car.className = "car";
  car.dataset.seat = seatKey;
  car.style.background = color || "#c9c1d8";

  const present = presenceFor(seatKey);
  const isYou = present.some((p) => p.id === room.myId);
  if (present.length) car.classList.add("awake");
  if (isYou) car.classList.add("is-you");

  if (isYou) {
    const flag = document.createElement("div");
    flag.className = "you-flag";
    flag.textContent = "YOU";
    car.appendChild(flag);
  } else if (!present.length) {
    const zzz = document.createElement("div");
    zzz.className = "zzz";
    zzz.textContent = "💤";
    car.appendChild(zzz);
  }

  const win = document.createElement("div");
  win.className = "window";
  if (avatar) {
    const img = document.createElement("img");
    img.src = avatar;
    img.alt = "";
    img.loading = "lazy";
    win.appendChild(img);
  } else {
    win.textContent = "🙂";
  }
  car.appendChild(win);

  const plate = document.createElement("div");
  plate.className = "plate";
  plate.textContent = handle ? "@" + handle : name || "guest";
  car.appendChild(plate);

  return car;
}

function renderCars() {
  els.cars.innerHTML = "";
  if (room.owner) {
    els.cars.appendChild(
      makeCarEl("owner", room.owner.displayName, room.owner.handle, room.owner.avatar, "#ffd27a"),
    );
  }
  for (const rider of room.pool) {
    els.cars.appendChild(makeCarEl(rider.did, rider.displayName, rider.handle, rider.avatar, "#c9c1d8"));
  }
  const knownSeats = new Set(["owner", ...room.pool.map((r) => r.did)]);
  const passersby = room.presence.filter((p) => !knownSeats.has(p.seat));
  const uniqueSeats = new Map();
  for (const p of passersby) {
    if (!uniqueSeats.has(p.seat)) uniqueSeats.set(p.seat, p);
  }
  for (const p of uniqueSeats.values()) {
    els.cars.appendChild(makeCarEl(p.seat, p.displayName, p.handle, p.avatar, p.color));
  }
}

// ---- rendering: honk ----

function renderHonkTally(lastBy) {
  if (!room.honks) {
    els.honkTally.textContent = "no one's honked yet";
    return;
  }
  els.honkTally.textContent = `${room.honks} honk${room.honks === 1 ? "" : "s"} so far${lastBy ? ` — last from ${lastBy}` : ""}`;
}

let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = 220;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    osc.stop(audioCtx.currentTime + 0.35);
  } catch {}
}

function honkEffect(seat) {
  beep();
  if (!seat) return;
  const car = els.cars.querySelector(`[data-seat="${cssEscape(seat)}"]`);
  if (!car) return;
  car.classList.remove("honking");
  void car.offsetWidth;
  car.classList.add("honking");
  const bubble = document.createElement("div");
  bubble.className = "honk-bubble";
  bubble.textContent = "HONK!";
  car.appendChild(bubble);
  setTimeout(() => bubble.remove(), 1100);
}

els.honkBtn.addEventListener("click", () => {
  if (room.ws && room.ws.readyState === 1) room.ws.send(JSON.stringify({ t: "honk" }));
});

// ---- rendering: notes / CB ----

function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function noteLineEl(note) {
  const line = document.createElement("div");
  line.className = "note-line";
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = note.displayName || "a passerby";
  const when = document.createElement("span");
  when.className = "when";
  when.textContent = timeAgo(note.at);
  line.appendChild(who);
  line.append(": " + note.text);
  line.appendChild(when);
  return line;
}

function renderInitialNotes(notes) {
  els.notesFeed.innerHTML = "";
  if (!notes.length) {
    const empty = document.createElement("div");
    empty.className = "note-empty";
    empty.textContent = "it's quiet on the CB. say something.";
    els.notesFeed.appendChild(empty);
  }
  for (const n of notes) {
    room.seenNoteIds.add(n.id);
    els.notesFeed.appendChild(noteLineEl(n));
  }
  els.notesFeed.scrollTop = els.notesFeed.scrollHeight;
}

function addNote(note, animate) {
  if (room.seenNoteIds.has(note.id)) return;
  room.seenNoteIds.add(note.id);
  const empty = els.notesFeed.querySelector(".note-empty");
  if (empty) empty.remove();
  els.notesFeed.appendChild(noteLineEl(note));
  els.notesFeed.scrollTop = els.notesFeed.scrollHeight;
  if (animate) flyNote(note);
}

function flyNote(note) {
  const car = els.cars.querySelector(`[data-seat="${cssEscape(note.seat)}"]`);
  const target = els.notesFeed.getBoundingClientRect();
  const start = car ? car.getBoundingClientRect() : target;

  const chip = document.createElement("div");
  chip.className = "note-fly";
  chip.textContent = note.text.length > 28 ? note.text.slice(0, 27) + "…" : note.text;
  chip.style.left = start.left + start.width / 2 + "px";
  chip.style.top = start.top + "px";
  els.flyLayer.appendChild(chip);

  const anim = chip.animate(
    [
      { transform: "translate(-50%, 0) scale(1)", opacity: 1 },
      {
        transform: `translate(${target.left + target.width / 2 - (start.left + start.width / 2) - 20}px, ${target.top - start.top + 20}px) scale(0.85)`,
        opacity: 0.15,
      },
    ],
    { duration: 900, easing: "cubic-bezier(.2,.7,.3,1)" },
  );
  anim.onfinish = () => chip.remove();
}

els.noteForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.noteInput.value.trim();
  if (!text || !room.ws || room.ws.readyState !== 1) return;
  room.ws.send(JSON.stringify({ t: "note", text }));
  els.noteInput.value = "";
});

// ---- rendering: board ----

function cssEscape(s) {
  return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
}

function renderBoard() {
  els.boardList.innerHTML = "";
  room.board.forEach((label, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "board-item";
    const spot = room.spotted[i];
    btn.textContent = label;
    if (spot) {
      btn.classList.add("spotted");
      btn.disabled = true;
      const by = document.createElement("span");
      by.className = "by";
      by.textContent = `spotted by ${spot.by}`;
      btn.appendChild(by);
    } else {
      btn.addEventListener("click", () => {
        if (room.ws && room.ws.readyState === 1) room.ws.send(JSON.stringify({ t: "spot", i }));
      });
    }
    li.appendChild(btn);
    els.boardList.appendChild(li);
  });
  els.boardClears.textContent = room.clears
    ? `the jam has broken up ${room.clears} time${room.clears === 1 ? "" : "s"} 🎉`
    : "";
}

function celebrateClear() {
  const banner = document.createElement("div");
  banner.className = "jam-cleared-banner";
  banner.textContent = "🎉 board cleared — the jam breaks up! fresh round incoming…";
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 3200);
}

// ---- identity ----

els.meEdit.addEventListener("click", async () => {
  const current = localStorage.getItem(LS_ME) || "";
  const next = window.prompt("your bluesky handle (leave blank to ride anonymous):", current);
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
  const url = `${location.origin}/j/${encodeURIComponent(room.handle)}`;
  const name = room.owner ? room.owner.displayName || room.owner.handle : room.handle;
  const text = `stuck in traffic with ${name} and the moots 🚗🚦 hop in: ${url}`;
  window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`, "_blank", "noopener");
});

els.copyBtn.addEventListener("click", async () => {
  const url = `${location.origin}/j/${encodeURIComponent(room.handle)}`;
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
