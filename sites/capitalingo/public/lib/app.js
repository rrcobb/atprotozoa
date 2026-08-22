// capitalingo — lesson engine. All state lives in localStorage; no backend.
// Every question renders a quote/scenario card live from data in lessons.js.
// One unit ("handoff") is a scripted story beat instead of a quiz — that's
// where Adam Smith hands the course over to Karl Marx.
(function () {
  "use strict";

  const STORE_KEY = "capitalingo_state_v1";
  const STARTING_HEARTS = 3;
  const XP_PER_CORRECT = 10;
  const XP_PERFECT_BONUS = 20;
  const SITE_URL = "https://capitalingo.bisks.net/";

  function buildFinalUnit() {
    const spec = window.CAPITALINGO_FINAL;
    const sources = window.CAPITALINGO_UNITS.filter((u) => spec.sourceUnitIds.indexOf(u.id) !== -1);
    let items = [];
    sources.forEach((u) => { items = items.concat(u.items); });
    const unit = Object.assign({}, spec);
    unit.items = items;
    return unit;
  }
  const UNITS = window.CAPITALINGO_UNITS.concat([buildFinalUnit()]);

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

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---- cartoon teacher portraits (pure inline SVG, no image assets) ----
  function portraitSvg(teacher, size, label) {
    const body = teacher === "marx" ? PORTRAIT_MARX : PORTRAIT_SMITH;
    const alt = label || (teacher === "marx" ? "cartoon portrait of Karl Marx" : "cartoon portrait of Adam Smith");
    return '<svg class="portrait" viewBox="0 0 100 100" width="' + size + '" height="' + size +
      '" role="img" aria-label="' + esc(alt) + '">' + body + "</svg>";
  }
  const PORTRAIT_SMITH =
    '<circle cx="50" cy="54" r="27" fill="#f0c8a0"/>' +
    '<path d="M18,52 Q13,14 50,12 Q87,14 82,52 Q84,34 68,28 Q74,44 63,40 Q66,53 54,46 Q57,16 50,16 Q43,16 46,46 Q34,53 37,40 Q26,44 32,28 Q16,34 18,52 Z" fill="#f5f0e6" stroke="#d8cfb8" stroke-width="1"/>' +
    '<circle cx="16" cy="58" r="9" fill="#f5f0e6" stroke="#d8cfb8" stroke-width="1"/>' +
    '<circle cx="84" cy="58" r="9" fill="#f5f0e6" stroke="#d8cfb8" stroke-width="1"/>' +
    '<path d="M6,100 Q50,74 94,100 Z" fill="#1f4d3a"/>' +
    '<path d="M40,82 L60,82 L53,99 L47,99 Z" fill="#fdfaf2"/>' +
    '<path d="M35,44 Q41,40 47,44" stroke="#241b12" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<path d="M53,44 Q59,40 65,44" stroke="#241b12" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<circle cx="41" cy="51" r="2.1" fill="#241b12"/>' +
    '<circle cx="59" cy="51" r="2.1" fill="#241b12"/>' +
    '<path d="M42,66 Q50,71 58,66" stroke="#241b12" stroke-width="2" fill="none" stroke-linecap="round"/>';
  const PORTRAIT_MARX =
    '<circle cx="50" cy="52" r="27" fill="#e8c19c"/>' +
    '<path d="M19,44 Q16,9 50,9 Q84,9 81,44 Q80,29 50,27 Q20,29 19,44 Z" fill="#232323"/>' +
    '<path d="M15,50 Q11,92 50,97 Q89,92 85,50 Q80,74 50,76 Q20,74 15,50 Z" fill="#3a3a3a"/>' +
    '<path d="M28,56 Q50,70 72,56 Q66,64 50,65 Q34,64 28,56 Z" fill="#4a4a4a"/>' +
    '<path d="M4,100 Q50,76 96,100 Z" fill="#171717"/>' +
    '<path d="M45,88 L55,88 L59,100 L41,100 Z" fill="#b3261e"/>' +
    '<path d="M33,40 Q40,35 47,40" stroke="#111" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<path d="M53,40 Q60,35 67,40" stroke="#111" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<circle cx="40" cy="47" r="2.1" fill="#111"/>' +
    '<circle cx="60" cy="47" r="2.1" fill="#111"/>';

  const TEACHER_NAME = { smith: "Adam Smith", marx: "Karl Marx" };

  function quoteCard(item) {
    return (
      '<div class="quotecard" data-teacher="' + item.teacher + '">' +
      '<div class="qc-portrait">' + portraitSvg(item.teacher, 56) + "</div>" +
      '<div class="qc-text">' + esc(item.prompt) + "</div>" +
      "</div>"
    );
  }

  // ---- sound effects (synthesized, no audio assets) ----
  const SFX_KEY = "capitalingo_sfx_v1";
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
  // Flips tone and color once the learner has finished any Marx-taught unit —
  // the ticker gets nationalized right along with everything else.
  const TICKER_CAPITAL = [
    "MRR up and to the right, allegedly",
    "shareholder sentiment: cautiously euphoric",
    "the invisible hand approves this message",
    "quarterly guidance reaffirmed",
    "board deck slide 14 just says “synergy”",
    "burn rate: a rounding error, trust us",
    "investors report feeling very seen",
  ];
  const TICKER_MARX = [
    "surplus value redistribution pending committee review",
    "the means of ticker production have been seized",
    "central planning bureau reports record pin output",
    "shareholders reclassified as comrades, effective immediately",
    "quarterly guidance abolished along with private property",
    "your MRR has been expropriated for the common good",
    "WoW growth: not applicable, the revolution doesn't do growth metrics",
  ];
  const MARX_UNIT_IDS = ["marx-basics", "marx-struggle", "marx-revolution"];
  function marxMode() {
    return MARX_UNIT_IDS.some((id) => !!state.completed[id]);
  }
  let tickerCount = 2400 + Math.floor(Math.random() * 300);
  let tickerI = 0;
  function renderTicker() {
    const el = document.getElementById("tickerText");
    const countEl = document.getElementById("tickerCount");
    const wrap = document.querySelector(".ticker");
    const iconEl = document.getElementById("tickerIcon");
    const labelEl = document.getElementById("tickerLabel");
    if (!el || !countEl || !wrap) return;
    const mode = marxMode();
    wrap.classList.toggle("marx-mode", mode);
    const lines = mode ? TICKER_MARX : TICKER_CAPITAL;
    el.textContent = lines[tickerI % lines.length];
    countEl.textContent = tickerCount.toLocaleString();
    if (iconEl) iconEl.textContent = mode ? "✊" : "\u{1F4C8}";
    if (labelEl) labelEl.textContent = mode ? "comrades currently studying" : "learners studying right now";
  }
  function startTicker() {
    renderTicker();
    setInterval(() => {
      tickerI++;
      tickerCount += Math.floor(Math.random() * 9) - 2;
      if (tickerCount < 1900) tickerCount = 1900;
      renderTicker();
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
    teacherChip: document.getElementById("teacherChip"),
    quitBtn: document.getElementById("quitBtn"),
    qLabel: document.getElementById("qLabel"),
    qPrompt: document.getElementById("qPrompt"),
    qChoices: document.getElementById("qChoices"),
    fbar: document.getElementById("fbar"),
    fLabel: document.getElementById("fLabel"),
    fCite: document.getElementById("fCite"),
    fNext: document.getElementById("fNext"),
    storyView: document.getElementById("storyView"),
    storyPortraitLeft: document.getElementById("storyPortraitLeft"),
    storyPortraitRight: document.getElementById("storyPortraitRight"),
    storySpeaker: document.getElementById("storySpeaker"),
    storyText: document.getElementById("storyText"),
    storyNext: document.getElementById("storyNext"),
    storyQuit: document.getElementById("storyQuit"),
    resultScreen: document.getElementById("resultScreen"),
    resultEmoji: document.getElementById("resultEmoji"),
    resultTitle: document.getElementById("resultTitle"),
    resultSub: document.getElementById("resultSub"),
    resultXp: document.getElementById("resultXp"),
    resultStars: document.getElementById("resultStars"),
    resultContinue: document.getElementById("resultContinue"),
    resultRetry: document.getElementById("resultRetry"),
    resultShareBsky: document.getElementById("resultShareBsky"),
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
    openDashboard: document.getElementById("openDashboard"),
    dashboardPanel: document.getElementById("dashboardPanel"),
    dashboardQuit: document.getElementById("dashboardQuit"),
    dashTiles: document.getElementById("dashTiles"),
    dashChart: document.getElementById("dashChart"),
    dashTip: document.getElementById("dashTip"),
    dashFootnote: document.getElementById("dashFootnote"),
    openSources: document.getElementById("openSources"),
    sourcesPanel: document.getElementById("sourcesPanel"),
    sourcesQuit: document.getElementById("sourcesQuit"),
    srcList: document.getElementById("srcList"),
  };

  function showOnly(el) {
    for (const s of [els.pathView, els.lessonView, els.storyView, els.resultScreen, els.certScreen, els.dashboardPanel, els.sourcesPanel]) {
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
    els.xpStat.textContent = "\u{2726} " + (state.xp || 0) + " IP";
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
      btn.className = "node" + (done ? " done" : "") + (unlocked ? "" : " locked") + (u.story ? " story-node" : "");
      btn.dataset.teacher = u.teacher || "";
      btn.disabled = !unlocked;
      const stars = done ? done.stars || 0 : 0;
      const rightCol = u.story
        ? '<div class="stars">' + (unlocked ? (done ? "✓" : "→") : "\u{1F512}") + "</div>"
        : '<div class="stars">' + (unlocked ? "★".repeat(stars) + "☆".repeat(3 - stars) : "\u{1F512}") + "</div>";
      btn.innerHTML =
        '<div class="icon">' + u.icon + '</div>' +
        '<div class="meta"><div class="t">' + u.title + '</div><div class="b">' + u.blurb + '</div></div>' +
        rightCol;
      if (unlocked) btn.addEventListener("click", () => (u.story ? startStory(i) : startLesson(i)));
      els.pathList.appendChild(btn);
    });

    const allDone = UNITS.every((u) => state.completed[u.id]);
    els.certNode.classList.toggle("locked", !allDone);
    els.certNode.querySelector(".b").textContent = allDone
      ? "Every unit passed. Come collect your diversified portfolio."
      : "Finish every unit to diversify your ideological portfolio.";
    els.certNode.onclick = allDone ? showCert : null;
    els.certNode.disabled = !allDone;

    renderTopStats();
    renderTicker();
  }

  // ---- Investor Relations dashboard (CAPL stock) ----
  const DASH = window.CAPITALINGO_DASHBOARD || [];

  function revealedDashCount() {
    let n = 0;
    for (const p of DASH) {
      if (!state.completed[p.id]) break;
      n++;
    }
    return n;
  }

  function renderDashTiles(revealed) {
    const last = revealed > 0 ? DASH[revealed - 1] : null;
    const first = DASH[0];
    const price = last ? last.price : first.price;
    const up = last ? last.teacher === "smith" : true;
    const mode = marxMode();
    const mrr = Math.round(price * (tickerCount / 38));
    const nps = mode ? "N/A — question rejected as bourgeois" : "72 (industry-leading)";
    els.dashTiles.innerHTML = [
      { l: "CAPL LAST PRINT", n: "$" + price + ".00", cls: up ? "up" : "down" },
      { l: mode ? "COMRADES ENLISTED" : "LEARNERS STUDYING", n: tickerCount.toLocaleString(), cls: "" },
      { l: mode ? "CENTRAL PLANNING ALLOCATION" : "MRR (est.)", n: "$" + mrr.toLocaleString(), cls: "" },
      { l: "NPS", n: nps, cls: "" },
    ].map((t) => '<div class="tile ' + t.cls + '"><div class="tn">' + esc(t.n) + '</div><div class="tl">' + esc(t.l) + "</div></div>").join("");
  }

  function renderDashChart(revealed) {
    const W = 600, H = 220, padL = 30, padR = 16, padT = 14, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxPrice = 85;
    const n = DASH.length;
    const xAt = (i) => padL + (plotW * i) / (n - 1);
    const yAt = (v) => padT + plotH - (plotH * v) / maxPrice;

    let svg = "";
    // recessive gridlines + $ axis labels
    [0, 40, 80].forEach((v) => {
      const y = yAt(v);
      svg += '<line class="gridline" x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '"/>';
      svg += '<text class="axislabel" x="4" y="' + (y + 3) + '">$' + v + "</text>";
    });

    // segments, colored by the regime being ENTERED
    for (let i = 0; i < n - 1; i++) {
      const a = DASH[i], b = DASH[i + 1];
      const bRevealed = i + 1 < revealed;
      const cls = !bRevealed ? "seg-future" : b.teacher === "marx" ? "seg-marx" : "seg-smith";
      svg += '<path class="segline ' + cls + '" d="M' + xAt(i) + "," + yAt(a.price) + " L" + xAt(i + 1) + "," + yAt(bRevealed ? b.price : a.price) + '"/>';
    }

    // points + hit targets + x labels
    DASH.forEach((p, i) => {
      const shown = i < revealed;
      const x = xAt(i), y = yAt(shown ? p.price : DASH[Math.max(revealed - 1, 0)].price);
      const dotCls = !shown ? "dot-future" : p.teacher === "marx" ? "dot-marx" : "dot-smith";
      svg += '<circle class="dot ' + dotCls + '" cx="' + x + '" cy="' + y + '" r="4"/>';
      svg += '<circle class="hit" data-i="' + i + '" cx="' + x + '" cy="' + y + '" r="14"/>';
      svg += '<text class="axislabel" x="' + x + '" y="' + (H - 8) + '" text-anchor="middle">' + p.label + "</text>";
      if (shown && (i === revealed - 1)) {
        svg += '<text class="pointlabel" x="' + x + '" y="' + (y - 10) + '" text-anchor="middle">$' + p.price + "</text>";
      }
    });

    els.dashChart.innerHTML = svg;
    els.dashChart.querySelectorAll(".hit").forEach((hit) => {
      const i = Number(hit.dataset.i);
      const p = DASH[i];
      const shown = i < revealed;
      hit.addEventListener("mouseenter", (ev) => showDashTip(ev, p, shown));
      hit.addEventListener("mousemove", (ev) => showDashTip(ev, p, shown));
      hit.addEventListener("mouseleave", hideDashTip);
    });
  }

  function showDashTip(ev, p, shown) {
    const wrap = els.dashChart.closest(".chartwrap");
    const rect = wrap.getBoundingClientRect();
    els.dashTip.innerHTML = shown
      ? "<b>" + p.label + " · $" + p.price + "</b>" + esc(p.note)
      : "<b>" + p.label + " · TBD</b>consensus estimate — pass more units to confirm.";
    els.dashTip.style.left = ev.clientX - rect.left + "px";
    els.dashTip.style.top = ev.clientY - rect.top + "px";
    els.dashTip.classList.add("show");
  }
  function hideDashTip() {
    els.dashTip.classList.remove("show");
  }

  function renderDashboard() {
    const revealed = revealedDashCount();
    renderDashTiles(revealed);
    renderDashChart(revealed);
    els.dashFootnote.textContent =
      revealed >= DASH.length
        ? "Full quarter-over-quarter history disclosed. The board thanks you for your continued confidence."
        : "Pass “" + (UNITS[revealed] ? UNITS[revealed].title : "the next unit") + "” to print the next quarter.";
  }

  els.openDashboard.addEventListener("click", () => {
    renderDashboard();
    showOnly(els.dashboardPanel);
  });
  els.dashboardQuit.addEventListener("click", () => {
    showOnly(els.pathView);
    renderPath();
  });

  // ---- Sources panel ----
  function renderSources() {
    const list = window.CAPITALINGO_SOURCES || [];
    els.srcList.innerHTML = list
      .map(
        (s) =>
          '<div class="srcitem" data-teacher="' + s.teacher + '">' +
          '<span class="swork">' + esc(s.work) + "</span> <span class=\"syear\">(" + esc(s.year) + ")</span>" +
          '<div class="snote">' + esc(s.note) + "</div>" +
          '<a href="' + s.url + '" target="_blank" rel="noopener">Read the full text on ' + esc(s.host) + " →</a>" +
          "</div>"
      )
      .join("");
  }

  els.openSources.addEventListener("click", () => {
    renderSources();
    showOnly(els.sourcesPanel);
  });
  els.sourcesQuit.addEventListener("click", () => {
    showOnly(els.pathView);
    renderPath();
  });

  // ---- story beat (the handoff from Smith to Marx) ----
  let story = null; // { unitIndex, li }

  function startStory(unitIndex) {
    story = { unitIndex, li: 0 };
    showOnly(els.storyView);
    els.storyPortraitLeft.innerHTML = portraitSvg("smith", 84);
    els.storyPortraitRight.innerHTML = portraitSvg("marx", 84);
    renderStoryLine();
  }

  function renderStoryLine() {
    const unit = UNITS[story.unitIndex];
    const line = unit.lines[story.li];
    els.storyPortraitLeft.classList.toggle("active", line.teacher === "smith");
    els.storyPortraitRight.classList.toggle("active", line.teacher === "marx");
    els.storySpeaker.textContent = TEACHER_NAME[line.teacher] || "";
    els.storyText.textContent = line.text;
    els.storyNext.textContent = story.li + 1 >= unit.lines.length ? "Continue to the next unit" : "Next";
  }

  els.storyNext.addEventListener("click", () => {
    const unit = UNITS[story.unitIndex];
    story.li++;
    if (story.li >= unit.lines.length) {
      state.completed[unit.id] = {};
      saveState();
      story = null;
      showOnly(els.pathView);
      renderPath();
      return;
    }
    renderStoryLine();
  });

  els.storyQuit.addEventListener("click", () => {
    story = null;
    showOnly(els.pathView);
    renderPath();
  });

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
      const distractorPool = shuffle(items.filter((x) => x !== item));
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
    els.qLabel.textContent = q.item.q || "Which concept does this describe?";
    els.qPrompt.innerHTML = quoteCard(q.item);
    if (els.teacherChip) {
      els.teacherChip.innerHTML = portraitSvg(q.item.teacher, 26) + '<span>' + esc(TEACHER_NAME[q.item.teacher] || "") + "</span>";
      els.teacherChip.dataset.teacher = q.item.teacher;
    }
    els.qChoices.innerHTML = "";
    els.fbar.classList.remove("show", "ok", "bad");
    q.choices.forEach((choice) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.dataset.itemId = choice.id;
      b.innerHTML =
        '<span class="ctext"><span class="clabel">' + esc(choice.label) + '</span>' +
        '<span class="csub">' + esc(choice.sub) + "</span></span>";
      b.addEventListener("click", () => answerQuestion(choice, b));
      els.qChoices.appendChild(b);
    });
  }

  function answerQuestion(choice, btnEl) {
    const q = lesson.questions[lesson.qi];
    const correct = choice === q.item;
    for (const b of els.qChoices.querySelectorAll(".choice")) {
      b.disabled = true;
      if (b.dataset.itemId === q.item.id) b.classList.add("correct");
      else if (b === btnEl) b.classList.add("wrong");
    }
    if (els.fCite) els.fCite.textContent = q.item.cite;
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
      els.resultTitle.textContent = perfect ? "Ideologically airtight!" : "Lesson complete!";
      els.resultSub.textContent = unit.title + " — " + lesson.correct + "/" + lesson.questions.length + " correct.";
      els.resultXp.textContent = "+" + earned;
      els.resultStars.textContent = "★".repeat(lesson.hearts) + "☆".repeat(3 - lesson.hearts);
      els.resultRetry.style.display = "none";
      els.resultContinue.textContent = "Continue";

      const shareText =
        "Passed “" + unit.title + "” on capitalingo (taught by " + (TEACHER_NAME[unit.teacher] || "the faculty") +
        ") — " + (state.xp || 0) + " IP, " + (state.streak.count || 0) + "-day streak. " + SITE_URL;
      els.resultShareBsky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
      els.resultShareBsky.style.display = "";

      // showOnly/renderTopStats must land before the sound call below: a
      // throwing AudioContext must never strand the player on a dead lesson
      // screen (same bug class as answerQuestion's citation-after-sound fix).
      showOnly(els.resultScreen);
      renderTopStats();
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
      els.resultShareBsky.style.display = "none";

      showOnly(els.resultScreen);
      renderTopStats();
      playFail();
    }
  }

  els.resultContinue.addEventListener("click", () => {
    showOnly(els.pathView);
    renderPath();
  });
  els.resultRetry.addEventListener("click", () => {
    startLesson(lesson.unitIndex);
  });

  els.resetBtn.addEventListener("click", () => {
    if (!confirm("Reset all capitalingo progress? This can't be undone.")) return;
    state = { xp: 0, streak: { count: 0, last: null }, completed: {} };
    saveState();
    renderPath();
  });

  els.cheatBtn.addEventListener("click", () => {
    let totalXp = 0;
    for (const u of UNITS) {
      if (u.story) {
        state.completed[u.id] = {};
        continue;
      }
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

  function loadPortraitImage(teacher) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "data:image/svg+xml;utf8," + encodeURIComponent(portraitSvg(teacher, 100));
    });
  }

  function showCert() {
    const xp = state.xp || 0;
    const streak = state.streak.count || 0;
    els.certXp.textContent = xp;
    els.certStreak.textContent = streak;
    drawCert(xp, streak).catch(() => {});
    certShareText =
      "Just diversified my ideological portfolio \u{1F4C8}☭ (" + xp + " IP, " + streak + "-day streak) — capitalingo, duolingo for economics: Adam Smith, then Karl Marx. " + SITE_URL;
    els.certShareBsky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(certShareText);
    showOnly(els.certScreen);
  }

  async function drawCert(xp, streak) {
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

    const [smithImg, marxImg] = await Promise.all([loadPortraitImage("smith"), loadPortraitImage("marx")]);
    const pSize = 96;
    if (smithImg) ctx.drawImage(smithImg, W / 2 - 118 - pSize / 2, 60, pSize, pSize);
    if (marxImg) ctx.drawImage(marxImg, W / 2 + 118 - pSize / 2, 60, pSize, pSize);

    ctx.textAlign = "center";
    ctx.fillStyle = "#7a6f5d";
    ctx.font = `700 20px ${mono}`;
    ctx.fillText("CERTIFICATE OF IDEOLOGICAL FLEXIBILITY", W / 2, 190);

    ctx.fillStyle = "#241b12";
    ctx.font = `800 56px ${mono}`;
    ctx.fillText("capitalingo", W / 2, 250);

    ctx.fillStyle = "#c9a227";
    ctx.font = `700 20px ${mono}`;
    ctx.fillText("\u{1F4BC} diversified portfolio (theoretical)", W / 2, 282);

    ctx.fillStyle = "#3d3324";
    ctx.font = `600 21px ${mono}`;
    ctx.fillText("This certifies fluency in both the invisible hand and the", W / 2, 336);
    ctx.fillText("labour theory of value — whichever the room needs.", W / 2, 362);

    ctx.font = `800 34px ${mono}`;
    ctx.fillStyle = "#1f7a4d";
    ctx.fillText(xp + " IP", W / 2 - 160, 430);
    ctx.fillStyle = "#ff9500";
    ctx.fillText("\u{1F525} " + streak + " day streak", W / 2 + 170, 430);

    ctx.fillStyle = "#7a6f5d";
    ctx.font = `600 19px ${mono}`;
    ctx.fillText("cited: Wealth of Nations (1776) · Capital, Vol. I (1867) · The Communist Manifesto (1848)", W / 2, 480);

    ctx.fillStyle = "#7a6f5d";
    ctx.font = `700 24px ${mono}`;
    ctx.fillText("capitalingo.bisks.net", W / 2, 570);

    certDataUrl = canvas.toDataURL("image/png");
    els.certImg.src = certDataUrl;
  }

  els.certDownload.addEventListener("click", () => {
    els.shareCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "capitalingo-certificate.png";
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
        const file = new File([blob], "capitalingo-certificate.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: certShareText, title: "capitalingo" });
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
