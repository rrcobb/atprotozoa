// storygoeslikethis — a browser stage production of norvidstudies.substack.com's
// "the story goes like this" anthology. Fourteen posts, fourteen synthesized
// voices (Web Speech API, deterministic per-handle pitch/rate so the same
// cast member always sounds the same on repeat viewings), staged as a little
// play with an optional in-browser video recorder for a real, downloadable
// file. No server, no ffmpeg, no Workers AI — see notes/40 & the Cloudflare
// cost wall in builder/INSTRUCTIONS.md for why.

const SOURCE_URL = "https://norvidstudies.substack.com/p/the-story-goes-like-this";

// Verbatim excerpts (1 sentence each) from the posts anthologized on that
// page, in the order they appear. `direction` lines are original staging —
// clearly not quotes — written to give each cast member a little bit of
// business while they "perform." schwarzposter_'s post is a vocal
// performance, not text, so its line is marked as paraphrase rather than quote.
const CAST_COLORS = {
  abelian_soup: "#e0c36b",
  norvid_studies: "#d4af37",
  voooooogel: "#ff6fae",
  croissanthology: "#f2a65a",
  lion_tender: "#7fb2e5",
  octogorn: "#8fd694",
  schwarzposter_: "#9a8cc2",
  theogcb405: "#e15b5b",
  architectonyx: "#5bc9c0",
  pavedwalden: "#c9a0dc",
  punished_daniel: "#d9944c",
  hdevalence: "#f0d264",
};

const SCRIPT = [
  {
    handle: "abelian_soup",
    direction: "unrolls a paper map, weighting each corner down with a teacup",
    quote: "The story goes like this: tea leaves scatter on Places Centroids, proxying for user locations.",
    isQuote: true,
  },
  {
    handle: "norvid_studies",
    direction: "sketches a small figure in the margin of an open laptop",
    quote: "The story goes like this: a cute anime girl, impressed by your work ethic and your high-quality code.",
    isQuote: true,
  },
  {
    handle: "voooooogel",
    direction: "produces a pair of cat ears from somewhere, entirely unbothered by the question of where",
    quote: "The story goes like this: Earth is captured by forehead kisses, as catgirl carcinization and commoditized attention lock into takeoff.",
    isQuote: true,
  },
  {
    handle: "croissanthology",
    direction: "sets down a full glass of water very deliberately, watches it start to evaporate",
    quote: "The story goes like this: Mr. Croissant uses one to two Swiss lakes' worth of water a day, just by generating AI slop.",
    isQuote: true,
  },
  {
    handle: "lion_tender",
    direction: "salutes, then winces, favoring one side",
    quote: "The story goes like this: Colonel Willis Corto, badly wounded in a special-forces mission that went awry.",
    isQuote: true,
  },
  {
    handle: "octogorn",
    direction: "counts to eight on its fingers, comes up one short, shrugs",
    quote: "The story goes like this: neo-China does not arrive from the future. China is mentioned only once.",
    isQuote: true,
  },
  {
    handle: "norvid_studies",
    direction: "moves a chess piece, then several more, all at once",
    quote: "The story goes like this: the model got to superhuman therapy performance by learning to play five-dimensional chess.",
    isQuote: true,
  },
  {
    handle: "norvid_studies",
    direction: "holds up two vials, one far smaller than the other, and tips the small one first",
    quote: "The story goes like this: picomolar lead outcompetes micromolar calcium, and the brain is where that fight happens.",
    isQuote: true,
  },
  {
    handle: "schwarzposter_",
    direction: "clears their throat once, lets the silence sit a beat too long",
    quote: "A vocal delivery pitched somewhere inside “Dead Flag Blues” — flat, funereal, entirely certain of itself. (paraphrased — the original post is a vocal performance, not text.)",
    isQuote: false,
  },
  {
    handle: "theogcb405",
    direction: "raises a banner nobody quite recognizes, plants it in the stage floor anyway",
    quote: "The story goes like this: Esdeath leads an anarcho-tyrannic resistance made up of mutants.",
    isQuote: true,
  },
  {
    handle: "architectonyx",
    direction: "gestures at a globe, then slowly turns it upside down",
    quote: "The story goes like this: Earth is captured by a technocapital singularity as renaissance rationalization and oceanic navigation lock into commoditization takeoff.",
    isQuote: true,
  },
  {
    handle: "pavedwalden",
    direction: "chalks cell boundaries across the stage floor, dividing it up",
    quote: "The story goes like this: the Milky Way is divvied up into Voronoi volumes of speciated drones, each centered on the most senior command-and-control server.",
    isQuote: true,
  },
  {
    handle: "punished_daniel",
    direction: "stands slightly apart from the rest of the cast, arms folded, chin up",
    quote: "The story goes like this: you are the isolated minority who doesn't fit in, because your cultural values are distinct.",
    isQuote: true,
  },
  {
    handle: "hdevalence",
    direction: "produces a single ear of corn, sets it center stage like a prop of great importance",
    quote: "The story goes like this: the USA is captured by a corn singularity as postwar Haber–Bosch capacity locks into commoditization takeoff.",
    isQuote: true,
  },
];

// --- deterministic per-handle voice/pitch/rate --------------------------

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

let voices = [];
function loadVoices() {
  voices = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
}
if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function voiceFor(handle) {
  if (!voices.length) return null;
  const englishish = voices.filter((v) => /^en/i.test(v.lang));
  const pool = englishish.length ? englishish : voices;
  return pool[hashStr(handle + "|voice") % pool.length];
}

function paramsFor(handle) {
  const h1 = hashStr(handle + "|pitch");
  const h2 = hashStr(handle + "|rate");
  return {
    pitch: 0.75 + (h1 % 9) * 0.06,
    rate: 0.88 + (h2 % 7) * 0.045,
  };
}

// --- DOM refs -------------------------------------------------------------

const els = {
  curtainL: document.getElementById("curtainL"),
  curtainR: document.getElementById("curtainR"),
  spotlight: document.getElementById("spotlight"),
  castRow: document.getElementById("castRow"),
  playbill: document.getElementById("playbill"),
  playbillList: document.getElementById("playbillList"),
  beginBtn: document.getElementById("beginBtn"),
  recordToggle: document.getElementById("recordToggle"),
  recordHint: document.getElementById("recordHint"),
  performance: document.getElementById("performance"),
  speakerName: document.getElementById("speakerName"),
  speakerHandle: document.getElementById("speakerHandle"),
  stageDirection: document.getElementById("stageDirection"),
  quoteText: document.getElementById("quoteText"),
  progressFill: document.getElementById("progressFill"),
  curtainCall: document.getElementById("curtainCall"),
  bowRow: document.getElementById("bowRow"),
  watchAgainBtn: document.getElementById("watchAgainBtn"),
  shareBtn: document.getElementById("shareBtn"),
  controls: document.getElementById("controls"),
  pauseBtn: document.getElementById("pauseBtn"),
  skipBtn: document.getElementById("skipBtn"),
  muteBtn: document.getElementById("muteBtn"),
  stopBtn: document.getElementById("stopBtn"),
  speedRange: document.getElementById("speedRange"),
};

// unique cast list, in first-appearance order, for the playbill + cast row
const CAST = [];
const seen = new Set();
for (const beat of SCRIPT) {
  if (!seen.has(beat.handle)) {
    seen.add(beat.handle);
    CAST.push(beat.handle);
  }
}

function initial(handle) {
  return handle.replace(/_/g, "").charAt(0).toUpperCase();
}

function buildCastRow() {
  els.castRow.innerHTML = "";
  CAST.forEach((handle) => {
    const el = document.createElement("div");
    el.className = "cast-token";
    el.id = "token-" + handle;
    el.style.background = CAST_COLORS[handle] || "#ccc";
    el.style.color = CAST_COLORS[handle] || "#ccc";
    el.textContent = initial(handle);
    el.title = "@" + handle;
    els.castRow.appendChild(el);
  });
}

function buildPlaybill() {
  els.playbillList.innerHTML = "";
  CAST.forEach((handle) => {
    const li = document.createElement("li");
    const sw = document.createElement("span");
    sw.className = "playbill-swatch";
    sw.style.background = CAST_COLORS[handle] || "#ccc";
    li.appendChild(sw);
    li.appendChild(document.createTextNode("@" + handle));
    els.playbillList.appendChild(li);
  });
}

buildCastRow();
buildPlaybill();

// --- recording (best-effort, tab capture) ---------------------------------

let mediaRecorder = null;
let recordedChunks = [];
let recordingActive = false;

function recordingSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);
}

els.recordToggle.addEventListener("change", () => {
  els.recordHint.classList.toggle("show", els.recordToggle.checked);
});
if (!recordingSupported()) {
  els.recordToggle.disabled = true;
  els.recordHint.textContent = "This browser can't record tab video/audio — playback below still works fine, it just won't save a file.";
  els.recordHint.classList.add("show");
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    recordedChunks = [];
    const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = candidates.find((t) => window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      recordingActive = false;
      if (!recordedChunks.length) return;
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "the-story-goes-like-this.webm";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    };
    stream.getVideoTracks()[0].addEventListener("ended", () => stopRecording());
    mediaRecorder.start();
    recordingActive = true;
    return true;
  } catch (err) {
    console.warn("recording not started:", err);
    return false;
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
}

// --- playback engine --------------------------------------------------------

let idx = 0;
let playing = false;
let paused = false;
let muted = false;
let lineToken = 0;
let holdTimer = null;
let holdRemaining = 0;
let holdStart = 0;
let holdCb = null;
let currentUtterance = null;

function speedMultiplier() {
  return parseFloat(els.speedRange.value) || 1;
}

function clearHold() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function startHold(ms, cb) {
  clearHold();
  holdRemaining = ms;
  holdCb = cb;
  holdStart = Date.now();
  holdTimer = setTimeout(() => {
    holdTimer = null;
    cb();
  }, ms);
}

function pauseHold() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
    holdRemaining -= Date.now() - holdStart;
  }
}

function resumeHold() {
  if (holdCb && holdRemaining > 0) {
    holdStart = Date.now();
    holdTimer = setTimeout(() => {
      holdTimer = null;
      holdCb();
    }, holdRemaining);
  }
}

function renderQuoteWords(text) {
  els.quoteText.innerHTML = "";
  const words = text.split(/(\s+)/);
  words.forEach((w) => {
    if (/^\s+$/.test(w)) {
      els.quoteText.appendChild(document.createTextNode(w));
    } else if (w) {
      const span = document.createElement("span");
      span.className = "word";
      span.textContent = w;
      els.quoteText.appendChild(span);
    }
  });
}

function highlightUpTo(charIndex) {
  const spans = els.quoteText.querySelectorAll(".word");
  let pos = 0;
  const text = els.quoteText.textContent;
  spans.forEach((span) => {
    const start = text.indexOf(span.textContent, pos);
    pos = start + span.textContent.length;
    span.classList.toggle("spoken", start <= charIndex);
  });
}

function setActiveToken(handle) {
  CAST.forEach((h) => {
    const el = document.getElementById("token-" + h);
    if (!el) return;
    el.classList.toggle("active", h === handle);
  });
}

function markTokenDone(handle) {
  const el = document.getElementById("token-" + handle);
  if (el && !el.classList.contains("active")) el.classList.add("done");
}

function renderBeat(beat) {
  els.speakerName.textContent = "@" + beat.handle;
  els.speakerHandle.textContent = "source ↗";
  els.speakerHandle.href = SOURCE_URL;
  els.stageDirection.textContent = beat.direction;
  renderQuoteWords(beat.quote);
  setActiveToken(beat.handle);
  els.progressFill.style.width = ((idx) / SCRIPT.length * 100) + "%";
}

function speakLine(beat, onDone) {
  const rate = speedMultiplier();
  if (muted || !("speechSynthesis" in window)) {
    const ms = Math.max(1600, (beat.quote.length * 42) / rate);
    startHold(ms, onDone);
    return;
  }
  const u = new SpeechSynthesisUtterance(beat.quote);
  const v = voiceFor(beat.handle);
  if (v) u.voice = v;
  const p = paramsFor(beat.handle);
  u.pitch = p.pitch;
  u.rate = p.rate * rate;
  u.onboundary = (e) => {
    if (typeof e.charIndex === "number") highlightUpTo(e.charIndex);
  };
  u.onend = onDone;
  u.onerror = onDone;
  currentUtterance = u;
  speechSynthesis.speak(u);
}

function playFrom(i) {
  if (i >= SCRIPT.length) {
    finishShow();
    return;
  }
  if (i > 0) markTokenDone(SCRIPT[i - 1].handle);
  idx = i;
  lineToken++;
  const myToken = lineToken;
  let settled = false;
  const done = () => {
    if (settled || myToken !== lineToken) return;
    settled = true;
    playFrom(i + 1);
  };
  renderBeat(SCRIPT[i]);
  speakLine(SCRIPT[i], done);
}

async function beginShow() {
  els.playbill.hidden = true;
  els.performance.hidden = false;
  els.controls.hidden = false;
  els.spotlight.classList.add("on");
  els.curtainL.classList.add("open");
  els.curtainR.classList.add("open");
  playing = true;
  paused = false;
  muted = false;

  if (els.recordToggle.checked && recordingSupported()) {
    const ok = await startRecording();
    if (!ok) {
      // user declined the share picker (or it failed) — keep the show going without it
    }
  }

  await new Promise((r) => setTimeout(r, 650)); // let the curtains actually open first
  playFrom(0);
}

function finishShow() {
  playing = false;
  els.performance.hidden = true;
  els.controls.hidden = true;
  els.curtainCall.hidden = false;
  els.bowRow.innerHTML = "";
  CAST.forEach((handle) => {
    const el = document.createElement("div");
    el.className = "cast-token active";
    el.style.background = CAST_COLORS[handle];
    el.style.color = CAST_COLORS[handle];
    el.textContent = initial(handle);
    el.title = "@" + handle;
    els.bowRow.appendChild(el);
  });
  const shareText =
    "watched \"the story goes like this\" get performed by 14 synthesized voices, staged in a browser: https://storygoeslikethis.bisks.net/";
  els.shareBtn.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  if (recordingActive) stopRecording();
}

function resetToPlaybill() {
  playing = false;
  paused = false;
  clearHold();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (recordingActive) stopRecording();
  els.curtainCall.hidden = true;
  els.performance.hidden = true;
  els.controls.hidden = true;
  els.playbill.hidden = false;
  els.spotlight.classList.remove("on");
  els.curtainL.classList.remove("open");
  els.curtainR.classList.remove("open");
  CAST.forEach((h) => {
    const el = document.getElementById("token-" + h);
    if (el) el.classList.remove("active", "done");
  });
  els.progressFill.style.width = "0%";
}

// --- controls ---------------------------------------------------------------

els.beginBtn.addEventListener("click", beginShow);
els.watchAgainBtn.addEventListener("click", () => {
  resetToPlaybill();
});

els.pauseBtn.addEventListener("click", () => {
  if (!playing) return;
  paused = !paused;
  if (paused) {
    if ("speechSynthesis" in window) speechSynthesis.pause();
    pauseHold();
  } else {
    if ("speechSynthesis" in window) speechSynthesis.resume();
    resumeHold();
  }
  els.pauseBtn.textContent = paused ? "▶" : "⏸";
});

els.skipBtn.addEventListener("click", () => {
  if (!playing) return;
  lineToken++; // disarm whatever's currently pending
  clearHold();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  paused = false;
  els.pauseBtn.textContent = "⏸";
  playFrom(idx + 1);
});

els.muteBtn.addEventListener("click", () => {
  muted = !muted;
  els.muteBtn.textContent = muted ? "🔇" : "🔊";
  if (muted && "speechSynthesis" in window) speechSynthesis.cancel();
});

els.stopBtn.addEventListener("click", () => {
  resetToPlaybill();
});

els.speedRange.addEventListener("change", () => {
  // takes effect on the next line; mid-utterance rate changes aren't supported
  // by the Web Speech API, so this doesn't try to rewrite the current one.
});
