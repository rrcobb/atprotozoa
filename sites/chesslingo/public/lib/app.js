// chesslingo — lesson engine. All state lives in localStorage; no backend.
// Every question renders an SVG chessboard or a move-notation card live from
// data in lessons.js — no board images, no chess engine, just enough pattern
// logic to place pieces, highlights, and arrows.
(function () {
  "use strict";

  const STORE_KEY = "chesslingo_state_v1";
  const STARTING_HEARTS = 3;
  const XP_PER_CORRECT = 10;
  const XP_PERFECT_BONUS = 20;
  const SITE_URL = "https://chesslingo.bisks.net/";

  function buildFinalUnit() {
    const spec = window.CHESSLINGO_FINAL;
    const sources = window.CHESSLINGO_UNITS.filter((u) => spec.sourceUnitIds.indexOf(u.id) !== -1);
    let items = [];
    sources.forEach((u) => { items = items.concat(u.items); });
    const unit = Object.assign({}, spec);
    unit.items = items;
    return unit;
  }
  const UNITS = window.CHESSLINGO_UNITS.concat([buildFinalUnit()]);

  function unitQuestionCount(u) {
    return Math.min(u.questionCount || u.items.length, u.items.length);
  }

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { xp: 0, streak: { count: 0, last: null }, completed: {} };
  }
  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  // ---- board rendering (pure SVG, no images, no chess engine) ----
  const GLYPH = {
    w: { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" },
    b: { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" },
  };
  const FILES = "abcdefgh";

  function sqToFR(sq) {
    return [FILES.indexOf(sq[0]), parseInt(sq[1], 10) - 1];
  }
  function frToSq(f, r) {
    return FILES[f] + (r + 1);
  }
  function inBounds(f, r) {
    return f >= 0 && f <= 7 && r >= 0 && r <= 7;
  }

  const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const QUEEN_DIRS = ROOK_DIRS.concat(BISHOP_DIRS);
  const KNIGHT_OFFSETS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

  // Movement pattern on an otherwise-empty board — a teaching aid, not full
  // legality (no blocking, no captures, no castling/en passant).
  function pieceMoveSquares(piece, color, sq) {
    const [f0, r0] = sqToFR(sq);
    const out = [];
    if (piece === "N") {
      KNIGHT_OFFSETS.forEach(([df, dr]) => {
        const f = f0 + df, r = r0 + dr;
        if (inBounds(f, r)) out.push(frToSq(f, r));
      });
      return out;
    }
    if (piece === "K") {
      QUEEN_DIRS.forEach(([df, dr]) => {
        const f = f0 + df, r = r0 + dr;
        if (inBounds(f, r)) out.push(frToSq(f, r));
      });
      return out;
    }
    if (piece === "P") {
      const dir = color === "w" ? 1 : -1;
      const startRank = color === "w" ? 1 : 6;
      if (inBounds(f0, r0 + dir)) out.push(frToSq(f0, r0 + dir));
      if (r0 === startRank && inBounds(f0, r0 + 2 * dir)) out.push(frToSq(f0, r0 + 2 * dir));
      return out;
    }
    const dirs = piece === "R" ? ROOK_DIRS : piece === "B" ? BISHOP_DIRS : QUEEN_DIRS;
    dirs.forEach(([df, dr]) => {
      let f = f0 + df, r = r0 + dr;
      while (inBounds(f, r)) {
        out.push(frToSq(f, r));
        f += df; r += dr;
      }
    });
    return out;
  }

  function itemBoard(item) {
    if (item.board) return item.board;
    const pieces = [{ sq: item.sq, piece: item.piece, color: item.color }];
    const dests = pieceMoveSquares(item.piece, item.color, item.sq);
    const highlights = [{ sq: item.sq, type: "from" }].concat(dests.map((sq) => ({ sq, type: "dot" })));
    return { pieces, highlights };
  }

  function svgEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Renders an 8x8 board: alternating squares, unicode glyphs for pieces,
  // small dots for reachable squares, a ring around a checked king, and
  // arrows between squares for tactic illustrations.
  function boardSvg(board) {
    const CELL = 42, PAD = 4, W = CELL * 8 + PAD * 2, H = W;
    let s = '<svg class="board" viewBox="0 0 ' + W + " " + H + '" width="100%" height="100%" role="img" aria-label="chess position">';
    s += '<defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--accent)"/></marker></defs>';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="var(--border)" rx="10"/>';
    for (let r = 7; r >= 0; r--) {
      for (let f = 0; f < 8; f++) {
        const x = PAD + f * CELL, y = PAD + (7 - r) * CELL;
        const light = (f + r) % 2 === 1;
        s += '<rect x="' + x + '" y="' + y + '" width="' + CELL + '" height="' + CELL + '" fill="' + (light ? "var(--sq-light)" : "var(--sq-dark)") + '"/>';
      }
    }
    const center = (sq) => {
      const [f, r] = sqToFR(sq);
      return [PAD + f * CELL + CELL / 2, PAD + (7 - r) * CELL + CELL / 2];
    };
    (board.highlights || []).forEach((h) => {
      const [cx, cy] = center(h.sq);
      if (h.type === "from") {
        const [f, r] = sqToFR(h.sq);
        const x = PAD + f * CELL, y = PAD + (7 - r) * CELL;
        s += '<rect x="' + x + '" y="' + y + '" width="' + CELL + '" height="' + CELL + '" fill="var(--gold)" opacity="0.45"/>';
      } else if (h.type === "dot") {
        s += '<circle cx="' + cx + '" cy="' + cy + '" r="6.5" fill="var(--accent)" opacity="0.75"/>';
      } else if (h.type === "ring") {
        s += '<circle cx="' + cx + '" cy="' + cy + '" r="18" fill="none" stroke="var(--red)" stroke-width="3.5" opacity="0.85"/>';
      }
    });
    (board.arrows || []).forEach(([from, to]) => {
      const [x1, y1] = center(from), [x2, y2] = center(to);
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const shorten = 14;
      const ex = x2 - (dx / len) * shorten, ey = y2 - (dy / len) * shorten;
      s += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + ex + '" y2="' + ey + '" stroke="var(--accent)" stroke-width="3.5" opacity="0.8" marker-end="url(#arrowhead)"/>';
    });
    (board.pieces || []).forEach((p) => {
      const [cx, cy] = center(p.sq);
      const fill = p.color === "w" ? "var(--piece-w)" : "var(--piece-b)";
      const stroke = p.color === "w" ? "var(--piece-w-stroke)" : "none";
      s += '<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" font-size="34" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="0.6"' : "") + '>' + GLYPH[p.color][p.piece] + "</text>";
    });
    s += "</svg>";
    return s;
  }

  function movesCard(moves) {
    const lines = moves.split("\n").map(svgEsc).join("<br>");
    return '<div class="movescard">' + lines + "</div>";
  }

  function promptHtml(item) {
    if (item.moves) return movesCard(item.moves);
    return boardSvg(itemBoard(item));
  }

  // ---- sound effects (synthesized, no audio assets) ----
  const SFX_KEY = "chesslingo_sfx_v1";
  const sfx = { on: localStorage.getItem(SFX_KEY) !== "off", ctx: null };
  function actx() {
    if (!sfx.ctx) sfx.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (sfx.ctx.state === "suspended") sfx.ctx.resume();
    return sfx.ctx;
  }
  function tone(ctx, t0, freq, dur, gainPeak, type) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function getReverbBus(ctx) {
    if (sfx.reverbNode && sfx.reverbCtx === ctx) return sfx.reverbNode;
    const convolver = ctx.createConvolver();
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * 1.1);
    const impulse = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let hp = 0;
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, 2.2);
        const n = (Math.random() * 2 - 1) * env;
        const out = n - hp;
        hp += 0.35 * out;
        data[i] = out;
      }
    }
    convolver.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.2;
    convolver.connect(wet).connect(ctx.destination);
    sfx.reverbNode = convolver;
    sfx.reverbCtx = ctx;
    return convolver;
  }
  function pingVoice(ctx, reverb, t0, freq, dur, gainPeak, detuneCents, attack) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (detuneCents) osc.detune.setValueAtTime(detuneCents, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak, t0 + (attack || 0.004));
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.connect(reverb);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function modalPing(ctx, t0, freq, gainPeak) {
    const reverb = getReverbBus(ctx);
    pingVoice(ctx, reverb, t0, freq, 0.19, gainPeak, 0, 0.003);
    pingVoice(ctx, reverb, t0, freq / 2, 0.22, gainPeak * 0.22, 0, 0.006);
    pingVoice(ctx, reverb, t0, freq / 4, 0.18, gainPeak * 0.1, 0, 0.008);
    [
      [2.76, 11, 0.09, 0.07],
      [3.41, -16, 0.07, 0.05],
      [4.2, 7, 0.05, 0.045],
    ].forEach(([mult, cents, level, dur]) => {
      pingVoice(ctx, reverb, t0, freq * mult, dur, gainPeak * level, cents, 0.002);
    });
  }
  function playCorrect() {
    if (!sfx.on) return;
    const ctx = actx();
    const t0 = ctx.currentTime;
    modalPing(ctx, t0, 1484, 0.2);
    modalPing(ctx, t0 + 0.125, 1871, 0.2);
  }
  function getWrongReverbBus(ctx) {
    if (sfx.wrongReverbNode && sfx.wrongReverbCtx === ctx) return sfx.wrongReverbNode;
    const convolver = ctx.createConvolver();
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * 2.4);
    const impulse = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, 1.3);
        const n = (Math.random() * 2 - 1) * env;
        lp += 0.18 * (n - lp);
        data[i] = lp;
      }
    }
    convolver.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    convolver.connect(wet).connect(ctx.destination);
    sfx.wrongReverbNode = convolver;
    sfx.wrongReverbCtx = ctx;
    return convolver;
  }
  function noiseAttack(ctx, reverb, t0, freq, gainPeak) {
    const dur = 0.012;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(bp).connect(gain);
    gain.connect(ctx.destination);
    gain.connect(reverb);
    src.start(t0);
    src.stop(t0 + dur + 0.01);
  }
  function dullClang(ctx, t0, freq, gainPeak) {
    const reverb = getWrongReverbBus(ctx);
    noiseAttack(ctx, reverb, t0, freq, gainPeak * 0.3);
    pingVoice(ctx, reverb, t0, freq, 0.2, gainPeak, 0, 0.004);
    pingVoice(ctx, reverb, t0, freq / 2, 0.24, gainPeak * 0.16, 0, 0.008);
    pingVoice(ctx, reverb, t0, freq / 3, 0.2, gainPeak * 0.08, 0, 0.01);
    [
      [2.03, -22, 0.09, 0.09],
      [3.12, 27, 0.06, 0.07],
    ].forEach(([mult, cents, level, dur]) => {
      pingVoice(ctx, reverb, t0, freq * mult, dur, gainPeak * level, cents, 0.006);
    });
  }
  function playWrong() {
    if (!sfx.on) return;
    const ctx = actx();
    const t0 = ctx.currentTime;
    dullClang(ctx, t0, 740, 0.19);
    dullClang(ctx, t0 + 0.128, 523.25, 0.19);
  }
  function playFanfare() {
    if (!sfx.on) return;
    const ctx = actx();
    const t0 = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, t0 + i * 0.09, f, 0.3, 0.16, "triangle"));
  }
  function getLevelupReverbBus(ctx) {
    if (sfx.levelupReverbNode && sfx.levelupReverbCtx === ctx) return sfx.levelupReverbNode;
    const convolver = ctx.createConvolver();
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * 2.6);
    const impulse = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let hp = 0;
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, 1.6);
        const n = (Math.random() * 2 - 1) * env;
        const out = n - hp;
        hp += 0.35 * out;
        data[i] = out;
      }
    }
    convolver.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.34;
    convolver.connect(wet).connect(ctx.destination);
    sfx.levelupReverbNode = convolver;
    sfx.levelupReverbCtx = ctx;
    return convolver;
  }
  function shimmerClick(ctx, reverb, t0, freq, gainPeak) {
    const dur = 0.006;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = freq * 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(hp).connect(gain);
    gain.connect(ctx.destination);
    gain.connect(reverb);
    src.start(t0);
    src.stop(t0 + dur + 0.005);
  }
  function shimmerStrike(ctx, t0, freq, gainPeak) {
    const reverb = getLevelupReverbBus(ctx);
    shimmerClick(ctx, reverb, t0, freq, gainPeak * 0.5);
    pingVoice(ctx, reverb, t0, freq, 0.45, gainPeak, 0, 0.002);
    pingVoice(ctx, reverb, t0, freq / 2, 0.5, gainPeak * 0.16, 0, 0.005);
    [
      [2.76, 11, 0.11, 0.16],
      [3.41, -16, 0.09, 0.14],
      [4.2, 7, 0.07, 0.11],
      [5.19, -9, 0.05, 0.09],
      [6.1, 13, 0.035, 0.07],
    ].forEach(([mult, cents, level, dur]) => {
      pingVoice(ctx, reverb, t0, freq * mult, dur, gainPeak * level, cents, 0.002);
    });
  }
  function playLevelUp() {
    if (!sfx.on) return;
    const ctx = actx();
    const notes = [369.99, 466.16, 554.37, 739.99, 932.33, 1108.73, 1479.98];
    const gaps = [0, 0.055, 0.06, 0.065, 0.07, 0.075, 0.08];
    let t = ctx.currentTime;
    notes.forEach((freq, i) => {
      t += gaps[i];
      shimmerStrike(ctx, t, freq, Math.max(0.16 - i * 0.008, 0.07));
    });
  }
  function playFail() {
    if (!sfx.on) return;
    const ctx = actx();
    const t0 = ctx.currentTime;
    [392, 349.2, 293.7].forEach((f, i) => tone(ctx, t0 + i * 0.11, f, 0.32, 0.15, "sawtooth"));
  }
  function setSfx(on) {
    sfx.on = on;
    localStorage.setItem(SFX_KEY, on ? "on" : "off");
    if (els.sfxBtn) els.sfxBtn.textContent = on ? "\u{1F50A} sound" : "\u{1F507} sound";
  }

  function bumpStreak() {
    const today = todayStr();
    if (state.streak.last === today) return;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0");
    state.streak.count = state.streak.last === yesterday ? state.streak.count + 1 : 1;
    state.streak.last = today;
  }

  // ---- fake investor ticker (pure cosmetics, no network calls) ----
  const TICKER_LINES = [
    "ELO under management up 14% WoW",
    "board-state engagement at an all-time high",
    "checkmate velocity trending up and to the right",
    "streak retention: best-in-class",
    "Series A conversation going great, thanks for asking",
    "pattern-recognition throughput scaling nicely",
    "investors cautiously optimistic about your knight forks",
  ];
  function startTicker() {
    const el = document.getElementById("tickerText");
    const countEl = document.getElementById("tickerCount");
    if (!el || !countEl) return;
    let i = 0;
    let count = 2400 + Math.floor(Math.random() * 300);
    const render = () => {
      el.textContent = TICKER_LINES[i % TICKER_LINES.length];
      countEl.textContent = count.toLocaleString();
    };
    render();
    setInterval(() => {
      i++;
      count += Math.floor(Math.random() * 9) - 2;
      if (count < 1900) count = 1900;
      render();
    }, 3400);
  }

  // ---- DOM refs ----
  const els = {
    pathView: document.getElementById("pathView"),
    pathList: document.getElementById("pathList"),
    certNode: document.getElementById("certNode"),
    lessonView: document.getElementById("lessonView"),
    lessonFill: document.getElementById("lessonFill"),
    lessonHearts: document.getElementById("lessonHearts"),
    quitBtn: document.getElementById("quitBtn"),
    qLabel: document.getElementById("qLabel"),
    qPrompt: document.getElementById("qPrompt"),
    qChoices: document.getElementById("qChoices"),
    fbar: document.getElementById("fbar"),
    fLabel: document.getElementById("fLabel"),
    fNext: document.getElementById("fNext"),
    resultScreen: document.getElementById("resultScreen"),
    resultEmoji: document.getElementById("resultEmoji"),
    resultTitle: document.getElementById("resultTitle"),
    resultSub: document.getElementById("resultSub"),
    resultXp: document.getElementById("resultXp"),
    resultStars: document.getElementById("resultStars"),
    resultContinue: document.getElementById("resultContinue"),
    resultRetry: document.getElementById("resultRetry"),
    certScreen: document.getElementById("certScreen"),
    certImg: document.getElementById("certImg"),
    certXp: document.getElementById("certXp"),
    certStreak: document.getElementById("certStreak"),
    certShareBsky: document.getElementById("certShareBsky"),
    certDownload: document.getElementById("certDownload"),
    certNative: document.getElementById("certNative"),
    certBack: document.getElementById("certBack"),
    streakStat: document.getElementById("streakStat"),
    xpStat: document.getElementById("xpStat"),
    resetBtn: document.getElementById("resetBtn"),
    cheatBtn: document.getElementById("cheatBtn"),
    sfxBtn: document.getElementById("sfxBtn"),
    shareCanvas: document.getElementById("shareCanvas"),
  };

  function showOnly(el) {
    for (const s of [els.pathView, els.lessonView, els.resultScreen, els.certScreen]) {
      s.classList.remove("show");
    }
    if (el === els.pathView) {
      el.classList.remove("hide");
    } else {
      els.pathView.classList.add("hide");
    }
    el.classList.add("show");
  }

  function renderTopStats() {
    els.streakStat.textContent = "\u{1F525} " + (state.streak.count || 0);
    els.xpStat.textContent = "\u{2726} " + (state.xp || 0) + " elo";
  }

  function isUnlocked(i) {
    if (i === 0) return true;
    return !!state.completed[UNITS[i - 1].id];
  }

  function renderPath() {
    els.pathList.innerHTML = "";
    UNITS.forEach((u, i) => {
      const done = state.completed[u.id];
      const unlocked = isUnlocked(i);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "node" + (done ? " done" : "") + (unlocked ? "" : " locked");
      btn.disabled = !unlocked;
      const stars = done ? done.stars || 0 : 0;
      btn.innerHTML =
        '<div class="icon">' + u.icon + '</div>' +
        '<div class="meta"><div class="t">' + u.title + '</div><div class="b">' + u.blurb + '</div></div>' +
        '<div class="stars">' + (unlocked ? "★".repeat(stars) + "☆".repeat(3 - stars) : "\u{1F512}") + '</div>';
      if (unlocked) btn.addEventListener("click", () => startLesson(i));
      els.pathList.appendChild(btn);
    });

    const allDone = UNITS.every((u) => state.completed[u.id]);
    els.certNode.classList.toggle("locked", !allDone);
    els.certNode.querySelector(".b").textContent = allDone
      ? "Every unit passed. Come collect your funding round."
      : "Finish every unit to close your Series C.";
    els.certNode.onclick = allDone ? showCert : null;
    els.certNode.disabled = !allDone;

    renderTopStats();
  }

  // ---- lesson state ----
  let lesson = null; // { unitIndex, questions: [...], qi, hearts, correct }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQuestions(unitIndex) {
    const unit = UNITS[unitIndex];
    const items = unit.items;
    const count = unitQuestionCount(unit);
    const chosen = shuffle(items).slice(0, count);
    return chosen.map((item) => {
      // Some units (e.g. "check") have more than one item sharing the exact
      // same label (two different boards both correctly called "Checkmate").
      // Picking a same-label item as a distractor makes two choices read as
      // equally correct while only one gets marked right — prefer distinct
      // labels for the 3 distractor slots, and only fall back to a same-label
      // item if a unit genuinely doesn't have 3 distinct-labeled alternatives.
      const rest = shuffle(items.filter((x) => x !== item));
      const distractorPool = rest
        .filter((x) => x.label !== item.label)
        .concat(rest.filter((x) => x.label === item.label));
      const choices = shuffle([item, ...distractorPool.slice(0, 3)]);
      return { item, choices };
    });
  }

  function startLesson(unitIndex) {
    lesson = {
      unitIndex,
      questions: buildQuestions(unitIndex),
      qi: 0,
      hearts: STARTING_HEARTS,
      correct: 0,
    };
    showOnly(els.lessonView);
    renderHearts();
    renderQuestion();
  }

  function renderHearts() {
    els.lessonHearts.textContent = "❤️".repeat(lesson.hearts) + "\u{1F90D}".repeat(STARTING_HEARTS - lesson.hearts);
  }

  function renderQuestion() {
    const q = lesson.questions[lesson.qi];
    els.lessonFill.style.width = Math.round((lesson.qi / lesson.questions.length) * 100) + "%";
    els.qLabel.textContent = q.item.q || "What's going on here?";
    els.qPrompt.innerHTML = promptHtml(q.item);
    els.qChoices.innerHTML = "";
    els.fbar.classList.remove("show", "ok", "bad");
    q.choices.forEach((choice) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.dataset.itemId = choice.id;
      b.innerHTML =
        '<span class="ctext"><span class="clabel">' + choice.label + '</span>' +
        '<span class="csub">' + choice.sub + "</span></span>";
      b.addEventListener("click", () => answerQuestion(choice, b));
      els.qChoices.appendChild(b);
    });
  }

  function answerQuestion(choice, btnEl) {
    const q = lesson.questions[lesson.qi];
    // Graded by label, not object identity: if a same-labeled distractor
    // ever does slip through (see buildQuestions), it's just as correct an
    // answer as the exact item chosen for the question.
    const correct = choice.label === q.item.label;
    for (const b of els.qChoices.querySelectorAll(".choice")) {
      b.disabled = true;
      const c = q.choices.find((x) => x.id === b.dataset.itemId);
      if (c && c.label === q.item.label) b.classList.add("correct");
      else if (b === btnEl) b.classList.add("wrong");
    }
    if (correct) {
      lesson.correct++;
      els.fbar.classList.add("show", "ok");
      els.fLabel.textContent = "✅ Nailed it — that's " + q.item.label + ".";
      playCorrect();
    } else {
      lesson.hearts--;
      renderHearts();
      els.fbar.classList.add("show", "bad");
      els.fLabel.textContent = "Not quite — that was " + q.item.label + ".";
      playWrong();
    }
    els.fNext.textContent = lesson.hearts <= 0 ? "See results" : (lesson.qi + 1 >= lesson.questions.length ? "Finish" : "Continue");
  }

  els.fNext.addEventListener("click", () => {
    if (lesson.hearts <= 0) return finishLesson(false);
    lesson.qi++;
    if (lesson.qi >= lesson.questions.length) return finishLesson(true);
    renderQuestion();
  });

  els.quitBtn.addEventListener("click", () => {
    lesson = null;
    showOnly(els.pathView);
    renderPath();
  });

  function finishLesson(passed) {
    els.lessonFill.style.width = "100%";
    const unit = UNITS[lesson.unitIndex];
    if (passed) {
      const perfect = lesson.hearts === STARTING_HEARTS;
      const earned = lesson.correct * XP_PER_CORRECT + (perfect ? XP_PERFECT_BONUS : 0);
      state.xp = (state.xp || 0) + earned;
      const prevStars = (state.completed[unit.id] && state.completed[unit.id].stars) || 0;
      state.completed[unit.id] = { stars: Math.max(prevStars, lesson.hearts) };
      bumpStreak();
      saveState();

      els.resultEmoji.textContent = perfect ? "\u{1F3C6}" : "\u{1F389}";
      els.resultTitle.textContent = perfect ? "Unicorn round!" : "Lesson complete!";
      els.resultSub.textContent = unit.title + " — " + lesson.correct + "/" + lesson.questions.length + " correct.";
      els.resultXp.textContent = "+" + earned;
      els.resultStars.textContent = "★".repeat(lesson.hearts) + "☆".repeat(3 - lesson.hearts);
      els.resultRetry.style.display = "none";
      els.resultContinue.textContent = "Continue";
      if (perfect) playLevelUp();
      else playFanfare();
    } else {
      els.resultEmoji.textContent = "\u{1F4C9}";
      els.resultTitle.textContent = "Down round";
      els.resultSub.textContent = unit.title + " — " + lesson.correct + "/" + lesson.questions.length + " correct before you ran out of hearts.";
      els.resultXp.textContent = "+0";
      els.resultStars.textContent = "☆☆☆";
      els.resultRetry.style.display = "";
      els.resultContinue.textContent = "Back to path";
      playFail();
    }
    showOnly(els.resultScreen);
    renderTopStats();
  }

  els.resultContinue.addEventListener("click", () => {
    showOnly(els.pathView);
    renderPath();
  });
  els.resultRetry.addEventListener("click", () => {
    startLesson(lesson.unitIndex);
  });

  els.resetBtn.addEventListener("click", () => {
    if (!confirm("Reset all chesslingo progress? This can't be undone.")) return;
    state = { xp: 0, streak: { count: 0, last: null }, completed: {} };
    saveState();
    renderPath();
  });

  els.cheatBtn.addEventListener("click", () => {
    let totalXp = 0;
    for (const u of UNITS) {
      const prevStars = (state.completed[u.id] && state.completed[u.id].stars) || 0;
      state.completed[u.id] = { stars: Math.max(prevStars, STARTING_HEARTS) };
      totalXp += unitQuestionCount(u) * XP_PER_CORRECT + XP_PERFECT_BONUS;
    }
    state.xp = (state.xp || 0) + totalXp;
    bumpStreak();
    saveState();
    renderPath();
  });

  // ---- certificate / share ----
  let certDataUrl = null;
  let certShareText = "";

  function showCert() {
    const xp = state.xp || 0;
    const streak = state.streak.count || 0;
    els.certXp.textContent = xp;
    els.certStreak.textContent = streak;
    drawCert(xp, streak);
    certShareText =
      "Just closed my Series C \u{1F4C8} (" + xp + " ELO, " + streak + "-day streak) — chesslingo, duolingo for chess. Investors are thrilled. " + SITE_URL;
    els.certShareBsky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(certShareText);
    showOnly(els.certScreen);
  }

  function drawCert(xp, streak) {
    const canvas = els.shareCanvas;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const mono = "ui-monospace, monospace";

    ctx.fillStyle = "#faf7f0";
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.8, -H * 0.1, 0, W * 0.8, -H * 0.1, W * 0.6);
    glow.addColorStop(0, "#e6f2ea");
    glow.addColorStop(1, "rgba(250,247,240,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#1f7a4d";
    ctx.lineWidth = 6;
    ctx.strokeRect(28, 28, W - 56, H - 56);
    ctx.strokeStyle = "#c9a227";
    ctx.lineWidth = 2;
    ctx.strokeRect(44, 44, W - 88, H - 88);

    ctx.textAlign = "center";
    ctx.fillStyle = "#7a6f5d";
    ctx.font = `700 22px ${mono}`;
    ctx.fillText("CERTIFICATE OF SUSTAINED GROWTH", W / 2, 138);

    ctx.fillStyle = "#241b12";
    ctx.font = `800 62px ${mono}`;
    ctx.fillText("chesslingo", W / 2, 226);

    ctx.fillStyle = "#c9a227";
    ctx.font = `700 22px ${mono}`;
    ctx.fillText("\u{1F984} pre-IPO grandmaster tier", W / 2, 264);

    // a little up-and-to-the-right sparkline, because the board asked nicely
    ctx.strokeStyle = "#1f7a4d";
    ctx.lineWidth = 5;
    ctx.beginPath();
    const bx = W / 2 - 150, by = 320;
    const pts = [[0, 20], [50, 8], [100, 24], [150, -4], [200, 10], [250, -22], [300, -34]];
    pts.forEach((p, i) => {
      const x = bx + p[0], y = by + p[1];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = "#3d3324";
    ctx.font = `600 22px ${mono}`;
    ctx.fillText("This certifies real, if modest, proficiency in recognizing", W / 2, 380);
    ctx.fillText("pieces, tactics, checkmates, and openings by sight.", W / 2, 408);

    ctx.font = `800 36px ${mono}`;
    ctx.fillStyle = "#1f7a4d";
    ctx.fillText(xp + " ELO", W / 2 - 160, 480);
    ctx.fillStyle = "#ff9500";
    ctx.fillText("\u{1F525} " + streak + " day streak", W / 2 + 170, 480);

    ctx.fillStyle = "#7a6f5d";
    ctx.font = `700 24px ${mono}`;
    ctx.fillText("chesslingo.bisks.net", W / 2, 570);

    certDataUrl = canvas.toDataURL("image/png");
    els.certImg.src = certDataUrl;
  }

  els.certDownload.addEventListener("click", () => {
    els.shareCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "chesslingo-certificate.png";
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  });

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (_) {
      return false;
    }
  }
  if (canShareFiles()) {
    els.certNative.style.display = "";
    els.certNative.addEventListener("click", () => {
      els.shareCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "chesslingo-certificate.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: certShareText, title: "chesslingo" });
        } catch (_) {}
      }, "image/png");
    });
  }

  els.certBack.addEventListener("click", () => {
    showOnly(els.pathView);
    renderPath();
  });

  els.sfxBtn.addEventListener("click", () => {
    setSfx(!sfx.on);
    if (sfx.on) playCorrect();
  });
  setSfx(sfx.on);

  startTicker();
  renderPath();
  showOnly(els.pathView);
})();
