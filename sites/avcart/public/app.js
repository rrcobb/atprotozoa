// app.js — wires the three.js classroom (scene.js), the AV cart's refried
// slideshow (refry.js), the procedural soundtrack (corecore.js), and the
// shared-room API (src/index.ts's Classroom Durable Object) together.
//
// Shared state is polled, not pushed (same shape as sites/the-place): every
// 2.5s every open tab asks /api/state "what does the room look like now"
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
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
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
    noteBody: document.getElementById("noteBody"),
    noteActions: document.getElementById("noteActions"),
  };

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
    const { ok, data } = await api("/api/sit", { sid: SID, seat });
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
    await api("/api/leave", { sid: SID });
    mySeat = null;
    scene.standUp();
    els.hint.hidden = false;
    els.seatStatus.textContent = "";
    els.standUp.hidden = true;
    renderNote(lastNote, mySeat);
  });

  // ---- the passed note ----------------------------------------------------
  // One shared note, held by at most one seat at a time. Holding it is what
  // gates writing on it — that's what makes it travel seat-to-seat instead
  // of turning into a free-for-all shoutbox.
  function renderNote(note, seat) {
    lastNote = note;
    if (!note) return;

    if (!note.lines.length) {
      els.noteBody.innerHTML = '<span class="empty">blank so far — pick it up and scribble something</span>';
    } else {
      els.noteBody.innerHTML = note.lines
        .map((l) => `<div class="note-line"><b>${esc(l.seat)}</b> ${esc(l.text)}</div>`)
        .join("");
      els.noteBody.scrollTop = els.noteBody.scrollHeight;
    }

    if (!seat) {
      els.noteActions.innerHTML = '<div class="muted">sit down to join the note</div>';
      return;
    }

    if (!note.holderSeat) {
      els.noteActions.innerHTML = '<button id="noteTakeBtn" class="note-wide-btn" type="button">pick up the note</button>';
      document.getElementById("noteTakeBtn").addEventListener("click", async () => {
        const { ok, data } = await api("/api/note/take", { sid: SID });
        if (ok) applyState(data);
      });
      return;
    }

    if (note.holderSeat !== seat) {
      els.noteActions.innerHTML = `<div class="muted">seat ${esc(note.holderSeat)} has it</div>`;
      return;
    }

    els.noteActions.innerHTML =
      '<form id="noteScribbleForm"><textarea id="noteText" rows="2" maxlength="200" placeholder="scribble something…"></textarea>' +
      '<button class="note-wide-btn" type="submit">write it</button></form>' +
      '<div class="note-pass-row" id="notePassRow"></div>';

    document.getElementById("noteScribbleForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const ta = document.getElementById("noteText");
      const text = ta.value.trim();
      if (!text) return;
      const { ok, data } = await api("/api/note/scribble", { sid: SID, text });
      if (ok) applyState(data);
    });

    const [r, c] = seat.split("-").map(Number);
    const dirs = [
      ["↑ pass", r - 1, c],
      ["↓ pass", r + 1, c],
      ["← pass", r, c - 1],
      ["→ pass", r, c + 1],
    ];
    const passRow = document.getElementById("notePassRow");
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
        const { ok, data } = await api("/api/note/pass", { sid: SID, toSeat });
        if (ok) applyState(data);
      });
      passRow.appendChild(btn);
    }
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
    const { ok, data } = await api("/api/select", { handle });
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
    const { ok, data } = await api("/api/state");
    if (ok) applyState(data);
    setTimeout(poll, POLL_MS);
  }
  poll();

  setInterval(() => {
    if (mySeat) api("/api/heartbeat", { sid: SID, seat: mySeat });
  }, HEARTBEAT_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !mySeat) return;
    api("/api/heartbeat", { sid: SID, seat: mySeat });
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
