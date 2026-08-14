// app.js — browser-owned classroom draft. AppView supplies real public feeds;
// seats, channel choice, and the note stay local to this browser.
//
       // The local draft is refreshed from localStorage, not presented as live multiplayer: every
// 2.5s every open tab reloads the browser-owned room draft.
// and reconciles. Simple, cheap, and good enough for a classroom that
// changes a few times a minute, not every frame.

import { initScene } from "./scene.js";
import { RefriedSlideshow } from "./refry.js";
import { createCorecoreEngine } from "./corecore.js";

const POLL_MS = 2500;
const HEARTBEAT_MS = 15000;

function sid() {
  try {
    let s = localStorage.getItem("avcart-sid");
    if (!s) {
      s = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("avcart-sid", s);
    }
    return s;
  } catch {
    return "anon-" + Math.random().toString(36).slice(2);
  }
}
const SID = sid();

async function api(path, body) {
  let data;
  try { data = JSON.parse(localStorage.getItem("avcart-state") || "null"); } catch (e) { data = null; }
  data ||= { version: 0, rows: 4, cols: 5, seats: {}, current: null,
    note: { strokes: [], holderSeat: null, updatedAt: 0 } };
  if (!body) return { ok: true, status: 200, data };
  if (path === "sit") {
    if (data.seats[body.seat] && data.seats[body.seat].sid !== body.sid) return { ok: false, status: 409, data: { error: "taken" } };
    Object.keys(data.seats).forEach((s) => { if (data.seats[s].sid === body.sid) delete data.seats[s]; });
    data.seats[body.seat] = { sid: body.sid, ts: Date.now() };
  } else if (path === "leave") {
    Object.keys(data.seats).forEach((s) => { if (data.seats[s].sid === body.sid) delete data.seats[s]; });
  } else if (path === "note/take") {
    const seat = Object.keys(data.seats).find((s) => data.seats[s].sid === body.sid);
    if (!seat) return { ok: false, status: 400, data: { error: "sit down first" } };
    if (data.note.holderSeat) return { ok: false, status: 409, data: { error: "someone already has it" } };
    data.note.holderSeat = seat;
  } else if (path === "note/scribble") {
    const seat = Object.keys(data.seats).find((s) => data.seats[s].sid === body.sid);
    if (!seat || data.note.holderSeat !== seat) return { ok: false, status: 403, data: { error: "you don't have the note" } };
    data.note.strokes.push({ ...body.stroke, seat, ts: Date.now() });
    data.note.strokes = data.note.strokes.slice(-24);
  } else if (path === "note/pass") {
    if (!data.seats[body.toSeat]) return { ok: false, status: 400, data: { error: "nobody's sitting there" } };
    data.note.holderSeat = body.toSeat;
  } else if (path === "select") {
    const actor = String(body.handle || "").replace(/^@/, "");
    try {
      const profile = await (await fetch("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=" + encodeURIComponent(actor))).json();
      const feed = await (await fetch("https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=" + encodeURIComponent(profile.did) + "&filter=posts_with_media&limit=100")).json();
      const images = [];
      for (const item of feed.feed || []) for (const image of (item.post?.embed?.images || [])) if (image.thumb) images.push({ url: image.thumb, alt: image.alt || "" });
      data.current = { handle: profile.handle || actor, displayName: profile.displayName || actor, avatar: profile.avatar || "", images, truncated: false, selectedAt: Date.now() };
    } catch (e) { return { ok: false, status: 404, data: { error: "couldn't find that account" } }; }
  }
  data.version++;
  try { localStorage.setItem("avcart-state", JSON.stringify(data)); } catch (e) {}
  return { ok: true, status: 200, data };
}

function main() {
  const canvas = document.getElementById("scene");
  const scene = initScene(canvas);

  function fit() {
    scene.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", fit);
  fit();

  let mySeat = null;
  let lastVersion = -1;
  let lastSeats = {};
  let lastNote = null;
  let audioCtx = null;
  let corecore = null;
  let slideshow = null;

  const els = {
    hint: document.getElementById("hint"),
    seatStatus: document.getElementById("seatStatus"),
    standUp: document.getElementById("standUp"),
    soundToggle: document.getElementById("soundToggle"),
    nowShowing: document.getElementById("nowShowing"),
    handleForm: document.getElementById("handleForm"),
    handleInput: document.getElementById("handleInput"),
    selectBtn: document.getElementById("selectBtn"),
    selectErr: document.getElementById("selectErr"),
    shareLink: document.getElementById("shareLink"),
    noteCanvas: document.getElementById("noteCanvas"),
    noteBody: document.getElementById("noteBody"),
    noteActions: document.getElementById("noteActions"),
  };
  const noteCtx = els.noteCanvas.getContext("2d");

  window.attachHandleTypeahead && window.attachHandleTypeahead(els.handleInput);

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      corecore = createCorecoreEngine(audioCtx);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    corecore.start();
    els.soundToggle.textContent = "🔊 sound on";
    els.soundToggle.classList.add("on");
  }

  let currentImages = [];
  let currentHandle = "";

  // The screen texture (and slideshow) exists from the start, playing "no
  // signal" static silently — corecore is undefined until ensureAudio()
  // runs on the first user gesture, and onSlide's `corecore &&` guard just
  // no-ops the glitch stinger until then.
  slideshow = new RefriedSlideshow(scene.screenCanvas, scene.screenCtx, scene.screenTex, {
    onSlide: () => corecore && corecore.glitchBurst(),
  });

  els.soundToggle.addEventListener("click", () => {
    if (audioCtx && audioCtx.state === "running") {
      corecore.stop();
      audioCtx.suspend();
      els.soundToggle.textContent = "🔈 sound off";
      els.soundToggle.classList.remove("on");
    } else {
      ensureAudio();
    }
  });

  // ---- seat picking -------------------------------------------------------
  canvas.addEventListener("click", async (e) => {
    const rect = canvas.getBoundingClientRect();
    const seat = scene.pick(e.clientX, e.clientY, rect);
    if (!seat || seat === mySeat) return;
    const { ok, data } = await api("sit", { sid: SID, seat });
    if (!ok) {
      if (data.error === "taken") flash(els.hint, "someone's already sitting there");
      return;
    }
    mySeat = seat;
    scene.sitAt(seat);
    scene.setSeats(data.seats, mySeat);
    els.hint.hidden = true;
    els.seatStatus.textContent = "seat " + seat.replace("-", " row / col ");
    els.standUp.hidden = false;
    renderNote(lastNote, mySeat);
    ensureAudio();
  });

  els.standUp.addEventListener("click", async () => {
    if (!mySeat) return;
    await api("leave", { sid: SID });
    mySeat = null;
    scene.standUp();
    els.hint.hidden = false;
    els.seatStatus.textContent = "";
    els.standUp.hidden = true;
    renderNote(lastNote, mySeat);
  });

  // ---- the passed note ----------------------------------------------------
  // One shared note, held by at most one seat at a time. Holding it is what
  // gates drawing on it — that's what makes it travel seat-to-seat instead
  // of turning into a free-for-all canvas everyone paints over at once.
  // It's a little MS-Paint-style pad: freehand strokes, not typed text.
  const NOTE_COLORS = ["#171310", "#d1453b", "#2f6fd1", "#2f9e52", "#e0a52c"];
  let noteColor = NOTE_COLORS[0];
  let drawingNote = false;
  let currentStroke = null; // { points: [x0, y0, x1, y1, ...] } — 0..1, canvas-local

  function canDrawNote() {
    return !!mySeat && !!lastNote && lastNote.holderSeat === mySeat;
  }

  function noteCanvasPoint(e) {
    const rect = els.noteCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
  }

  function drawStroke(w, h, points, color) {
    if (!points || points.length < 4) return;
    noteCtx.strokeStyle = color;
    noteCtx.lineWidth = 2.5;
    noteCtx.lineCap = "round";
    noteCtx.lineJoin = "round";
    noteCtx.beginPath();
    noteCtx.moveTo(points[0] * w, points[1] * h);
    for (let i = 2; i < points.length; i += 2) noteCtx.lineTo(points[i] * w, points[i + 1] * h);
    noteCtx.stroke();
  }

  function paintNoteCanvas() {
    const w = els.noteCanvas.width, h = els.noteCanvas.height;
    noteCtx.clearRect(0, 0, w, h);
    noteCtx.fillStyle = "#fdf8e8";
    noteCtx.fillRect(0, 0, w, h);
    const strokes = (lastNote && lastNote.strokes) || [];
    for (const s of strokes) drawStroke(w, h, s.points, s.color);
    if (currentStroke) drawStroke(w, h, currentStroke.points, noteColor);
    if (!strokes.length && !currentStroke) {
      noteCtx.fillStyle = "#9a8f78";
      noteCtx.font = "13px monospace";
      noteCtx.fillText("blank so far — pick it up and scribble", 10, h / 2);
    }
  }

  els.noteCanvas.addEventListener("pointerdown", (e) => {
    if (!canDrawNote()) return;
    drawingNote = true;
    els.noteCanvas.setPointerCapture(e.pointerId);
    currentStroke = { points: noteCanvasPoint(e) };
    paintNoteCanvas();
  });
  els.noteCanvas.addEventListener("pointermove", (e) => {
    if (!drawingNote || !currentStroke) return;
    const [x, y] = noteCanvasPoint(e);
    const pts = currentStroke.points;
    const lx = pts[pts.length - 2], ly = pts[pts.length - 1];
    if (Math.hypot(x - lx, y - ly) < 0.012) return; // skip near-duplicate points
    if (pts.length >= 120) return; // 60 (x,y) pairs — matches server's MAX_STROKE_POINTS
    pts.push(x, y);
    paintNoteCanvas();
  });
  async function finishNoteStroke() {
    if (!drawingNote || !currentStroke) return;
    drawingNote = false;
    const stroke = { color: noteColor, points: currentStroke.points };
    currentStroke = null;
    if (!canDrawNote()) {
      paintNoteCanvas();
      return;
    }
    const { ok, data } = await api("note/scribble", { sid: SID, stroke });
    if (ok) applyState(data);
    else paintNoteCanvas();
  }
  els.noteCanvas.addEventListener("pointerup", finishNoteStroke);
  els.noteCanvas.addEventListener("pointercancel", finishNoteStroke);

  function renderNote(note, seat) {
    lastNote = note;
    els.noteCanvas.classList.toggle("readonly", !(seat && note && note.holderSeat === seat));
    paintNoteCanvas();
    if (!note) return;

    if (!seat) {
      els.noteBody.textContent = "sit down to join the note";
      els.noteActions.innerHTML = "";
      return;
    }

    if (!note.holderSeat) {
      els.noteBody.textContent = "";
      els.noteActions.innerHTML = '<button id="noteTakeBtn" class="note-wide-btn" type="button">pick up the note</button>';
      document.getElementById("noteTakeBtn").addEventListener("click", async () => {
        const { ok, data } = await api("note/take", { sid: SID });
        if (ok) applyState(data);
      });
      return;
    }

    if (note.holderSeat !== seat) {
      els.noteBody.textContent = "";
      els.noteActions.innerHTML = `<div class="muted">seat ${esc(note.holderSeat)} has it</div>`;
      return;
    }

    els.noteBody.textContent = "it's yours — draw on it, then pass it on";
    els.noteActions.innerHTML = "";

    const palette = document.createElement("div");
    palette.className = "note-palette";
    for (const c of NOTE_COLORS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "note-swatch" + (c === noteColor ? " active" : "");
      b.style.background = c;
      b.title = c;
      b.addEventListener("click", () => {
        noteColor = c;
        palette.querySelectorAll(".note-swatch").forEach((el) => el.classList.remove("active"));
        b.classList.add("active");
      });
      palette.appendChild(b);
    }
    els.noteActions.appendChild(palette);

    const passRow = document.createElement("div");
    passRow.className = "note-pass-row";
    const [r, c] = seat.split("-").map(Number);
    const dirs = [
      ["↑ pass", r - 1, c],
      ["↓ pass", r + 1, c],
      ["← pass", r, c - 1],
      ["→ pass", r, c + 1],
    ];
    for (const [label, rr, cc] of dirs) {
      if (rr < 0 || rr >= scene.ROWS || cc < 0 || cc >= scene.COLS) continue;
      const toSeat = rr + "-" + cc;
      const occupied = !!lastSeats[toSeat];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ghost";
      btn.textContent = label;
      btn.disabled = !occupied;
      btn.title = occupied ? "" : "nobody's sitting there";
      btn.addEventListener("click", async () => {
        const { ok, data } = await api("note/pass", { sid: SID, toSeat });
        if (ok) applyState(data);
      });
      passRow.appendChild(btn);
    }
    els.noteActions.appendChild(passRow);
  }

  // ---- look-around while seated (mouse / touch, no pointer lock) ---------
  function lookFromEvent(clientX, clientY) {
    if (!mySeat) return;
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((clientY - rect.top) / rect.height) * 2 - 1;
    scene.setLook(nx, ny);
  }
  canvas.addEventListener("mousemove", (e) => lookFromEvent(e.clientX, e.clientY));
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches[0]) lookFromEvent(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true },
  );

  // ---- account selection ---------------------------------------------------
  els.handleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const handle = els.handleInput.value.trim();
    if (!handle) return;
    els.selectErr.hidden = true;
    els.selectBtn.disabled = true;
    els.selectBtn.textContent = "loading feed…";
    const { ok, data } = await api("select", { handle });
    els.selectBtn.disabled = false;
    els.selectBtn.textContent = "put it on";
    if (!ok) {
      els.selectErr.textContent =
        data.error === "cooldown"
          ? "hang on — someone just changed the channel, try again in a few seconds"
          : "couldn't find that account";
      els.selectErr.hidden = false;
      return;
    }
    els.handleInput.value = "";
    applyState(data);
    if (corecore) corecore.channelChangeBurst();
    ensureAudio();
  });

  // ---- shared state polling -------------------------------------------------
  function applyState(data) {
    if (data.version === lastVersion) return;
    lastVersion = data.version;
    lastSeats = data.seats;
    scene.setSeats(data.seats, mySeat);
    scene.setNote(data.note && data.note.holderSeat);
    renderNote(data.note, mySeat);

    if (data.current) {
      currentHandle = data.current.handle;
       currentImages = data.current.images.map((i) => i.url);
      els.nowShowing.innerHTML =
        (data.current.avatar ? `<img src="${data.current.avatar}" alt="" class="avatar" />` : "") +
        `<div><b>@${esc(data.current.handle)}</b><br><span class="muted">${
          data.current.images.length
        } photo${data.current.images.length === 1 ? "" : "s"} from their feed${
          data.current.truncated ? " (more than we scanned)" : ""
        }</span></div>`;
      slideshow.setImages(currentImages);
      updateShare();
    } else {
      els.nowShowing.textContent = "nobody's picked a feed yet — type a handle below.";
    }
  }

  function updateShare() {
    const url = "https://avcart.bisks.net/";
    const text = currentHandle
      ? `movie day at avcart.bisks.net: the class is watching @${currentHandle}'s feed as a refried slideshow. come pick a seat.`
      : `avcart.bisks.net — pick a seat, wheel in the AV cart, watch whoever's feed the room picked, refried into a corecore slideshow.`;
    els.shareLink.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " " + url);
  }
  updateShare();

  async function poll() {
    const { ok, data } = await api("state");
    if (ok) applyState(data);
    setTimeout(poll, POLL_MS);
  }
  poll();

  setInterval(() => {
    if (mySeat) api("heartbeat", { sid: SID, seat: mySeat });
  }, HEARTBEAT_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !mySeat) return;
    api("heartbeat", { sid: SID, seat: mySeat });
  });
}

function flash(el, text) {
  const prev = el.textContent;
  const prevHidden = el.hidden;
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => {
    el.textContent = prev;
    el.hidden = prevHidden;
  }, 2200);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

main();
