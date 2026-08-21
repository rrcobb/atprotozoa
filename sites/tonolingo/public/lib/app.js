// tonolingo — lesson engine. All state lives in localStorage; no backend.
// Each "tone" is a synthesized pitch contour (Web Audio oscillator + a
// vibrato LFO + an optional glottal-creak flutter), not an audio file.
(function () {
  "use strict";

  const STORE_KEY = "tonolingo_state_v1";
  const STARTING_HEARTS = 3;
  const XP_PER_CORRECT = 10;
  const XP_PERFECT_BONUS = 20;
  const SITE_URL = "https://tonolingo.bisks.net/";
  const TONE_BASE_FREQ = 200; // Hz, Chao level 3 ("mid")

  function buildFinalUnit() {
    const spec = window.TONOLINGO_FINAL;
    const sources = window.TONOLINGO_UNITS.filter((u) => spec.sourceUnitIds.indexOf(u.id) !== -1);
    let items = [];
    sources.forEach((u) => { items = items.concat(u.items); });
    const unit = Object.assign({}, spec);
    unit.items = items;
    return unit;
  }
  const UNITS = window.TONOLINGO_UNITS.concat([buildFinalUnit()]);

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

  // ---- audio engine (synthesized, no audio assets) ----
  const SFX_KEY = "tonolingo_sfx_v1";
  const sfx = { on: localStorage.getItem(SFX_KEY) !== "off", ctx: null };
  function actx() {
    if (!sfx.ctx) sfx.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (sfx.ctx.state === "suspended") sfx.ctx.resume();
    return sfx.ctx;
  }

  function freqForLevel(level) {
    return TONE_BASE_FREQ * Math.pow(2, (level - 3) / 5);
  }

  // Renders one contour item as a sung "ma"-like syllable: sawtooth through a
  // lowpass (for warmth) + a light vibrato + a piecewise-linear frequency
  // ramp over the item's Chao-level breakpoints. Items with a `creak` window
  // get a fast amplitude flutter there to fake vocal fry / a glottal break.
  function playContour(ctx, t0, item, speedMul) {
    const durBase = item.dur || 0.85;
    const dur = durBase * (speedMul || 1);
    const contour = item.contour;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1600;
    filter.Q.value = 0.5;
    const creakGain = ctx.createGain();
    creakGain.gain.value = 1;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(0.22, t0 + 0.025);
    amp.gain.setValueAtTime(0.22, Math.max(t0 + 0.03, t0 + dur - 0.09));
    amp.gain.exponentialRampToValueAtTime(0.0008, t0 + dur + 0.03);

    osc.connect(filter);
    filter.connect(creakGain);
    creakGain.connect(amp);
    amp.connect(ctx.destination);

    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 4; // cents of detune
    vib.connect(vibGain);
    vibGain.connect(osc.detune);
    vib.start(t0);
    vib.stop(t0 + dur + 0.05);

    osc.frequency.setValueAtTime(freqForLevel(contour[0][1]), t0);
    for (let i = 1; i < contour.length; i++) {
      osc.frequency.linearRampToValueAtTime(freqForLevel(contour[i][1]), t0 + contour[i][0] * dur);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);

    if (item.creak) {
      const from = t0 + item.creak.from * dur;
      const to = t0 + item.creak.to * dur;
      const floor = 1 - (item.creak.depth != null ? item.creak.depth : 0.25);
      const stepDur = 1 / 30; // ~30 Hz glottal-fry pulse rate
      creakGain.gain.setValueAtTime(1, from);
      for (let t = from; t < to; t += stepDur) {
        creakGain.gain.setValueAtTime(1, t);
        creakGain.gain.linearRampToValueAtTime(floor, t + stepDur * 0.15);
        creakGain.gain.linearRampToValueAtTime(1, t + stepDur * 0.55);
      }
      creakGain.gain.setValueAtTime(1, to);
    }
  }

  function playItem(item, speedMul) {
    const ctx = actx();
    playContour(ctx, ctx.currentTime + 0.02, item, speedMul || 1);
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
  // shared plate-style reverb bus for the "correct" ping (convolution over a
  // synthesized, highpass-shaped noise tail — no audio assets)
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
  // long, bright stereo reverb bus for the level-up shimmer — decays slower
  // than the "correct" bus above so the tail keeps ringing under the climb
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
  // tiny high-passed noise tick at the onset of each shimmer strike
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
  // one shimmer strike: a click, a damped sine fundamental, a quiet
  // sub-octave for body, and five detuned upper partials for dense sparkle —
  // all fed through the long bright reverb bus above
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
  // level-up: a rapid F#-major arpeggio (F#-A#-C#) climbing across three
  // octaves, ~55-80ms staggered strikes overlapping into a rising shimmer
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
    qPlayBtn: document.getElementById("qPlayBtn"),
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
    els.xpStat.textContent = "\u{2726} " + (state.xp || 0) + " xp";
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
      ? "Every unit passed. Come collect your certificate."
      : "Finish every unit to sit the tonolingo ear exam.";
    els.certNode.onclick = allDone ? showCert : null;
    els.certNode.disabled = !allDone;

    renderTopStats();
  }

  // ---- lesson state ----
  let lesson = null; // { unitIndex, questions: [...], qi, hearts, correct, speedMul }

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
      speedMul: UNITS[unitIndex].speedMul || 1,
    };
    showOnly(els.lessonView);
    renderHearts();
    renderQuestion();
  }

  function renderHearts() {
    els.lessonHearts.textContent = "❤️".repeat(lesson.hearts) + "\u{1F90D}".repeat(STARTING_HEARTS - lesson.hearts);
  }

  function contourSvg(item) {
    const w = 56, h = 22, pad = 3;
    let d = "";
    item.contour.forEach((pt, i) => {
      const x = pad + pt[0] * (w - 2 * pad);
      const y = pad + (1 - (pt[1] - 1) / 4) * (h - 2 * pad);
      d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1) + " ";
    });
    let creakDot = "";
    if (item.creak) {
      const cx = pad + item.creak.from * (w - 2 * pad);
      creakDot = '<circle cx="' + cx.toFixed(1) + '" cy="' + (h - 3) + '" r="1.6" fill="currentColor" opacity="0.55"/>';
    }
    return (
      '<svg class="contour" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' +
      '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      creakDot +
      "</svg>"
    );
  }

  function renderQuestion() {
    const q = lesson.questions[lesson.qi];
    els.lessonFill.style.width = Math.round((lesson.qi / lesson.questions.length) * 100) + "%";
    els.qLabel.textContent = "Listen, then pick the tone you heard";
    els.qChoices.innerHTML = "";
    els.fbar.classList.remove("show", "ok", "bad");
    q.choices.forEach((choice) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.dataset.itemId = choice.id;
      b.innerHTML =
        '<span class="cicon">' + contourSvg(choice) + "</span>" +
        '<span class="ctext"><span class="clabel">' + choice.label + '</span>' +
        '<span class="csub">' + choice.sub + "</span></span>";
      b.addEventListener("click", () => answerQuestion(choice, b));
      els.qChoices.appendChild(b);
    });
    playItem(q.item, lesson.speedMul);
  }

  els.qPlayBtn.addEventListener("click", () => {
    if (!lesson) return;
    playItem(lesson.questions[lesson.qi].item, lesson.speedMul);
  });

  function answerQuestion(choice, btnEl) {
    const q = lesson.questions[lesson.qi];
    const correct = choice === q.item;
    for (const b of els.qChoices.querySelectorAll(".choice")) {
      b.disabled = true;
      if (b.dataset.itemId === q.item.id) b.classList.add("correct");
      else if (b === btnEl) b.classList.add("wrong");
    }
    if (correct) {
      lesson.correct++;
      els.fbar.classList.add("show", "ok");
      els.fLabel.textContent = "\u{1F442} Nailed it — that's " + q.item.label + ".";
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
      els.resultTitle.textContent = perfect ? "Perfect ear!" : "Lesson complete!";
      els.resultSub.textContent = unit.title + " — " + lesson.correct + "/" + lesson.questions.length + " correct.";
      els.resultXp.textContent = "+" + earned;
      els.resultStars.textContent = "★".repeat(lesson.hearts) + "☆".repeat(3 - lesson.hearts);
      els.resultRetry.style.display = "none";
      els.resultContinue.textContent = "Continue";
      if (perfect) playLevelUp();
      else playFanfare();
    } else {
      els.resultEmoji.textContent = "\u{1F494}";
      els.resultTitle.textContent = "Out of hearts";
      els.resultSub.textContent = unit.title + " — " + lesson.correct + "/" + lesson.questions.length + " correct before you ran out.";
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
    if (!confirm("Reset all tonolingo progress? This can't be undone.")) return;
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
      "My ears are certified \u{1F442} (" + xp + " XP, " + streak + "-day streak) — tonolingo, duolingo for telling tones apart. " + SITE_URL;
    els.certShareBsky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(certShareText);
    showOnly(els.certScreen);
  }

  function drawCert(xp, streak) {
    const canvas = els.shareCanvas;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const mono = "ui-monospace, monospace";

    ctx.fillStyle = "#f4faf9";
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.8, -H * 0.1, 0, W * 0.8, -H * 0.1, W * 0.6);
    glow.addColorStop(0, "#d8ece9");
    glow.addColorStop(1, "rgba(244,250,249,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#0e7c86";
    ctx.lineWidth = 6;
    ctx.strokeRect(28, 28, W - 56, H - 56);
    ctx.strokeStyle = "#cfe3e0";
    ctx.lineWidth = 2;
    ctx.strokeRect(44, 44, W - 88, H - 88);

    ctx.textAlign = "center";
    ctx.fillStyle = "#6b8582";
    ctx.font = `700 24px ${mono}`;
    ctx.fillText("CERTIFICATE OF TONE PERCEPTION", W / 2, 140);

    ctx.fillStyle = "#173330";
    ctx.font = `800 64px ${mono}`;
    ctx.fillText("tonolingo", W / 2, 230);

    // a little rise-fall-dip squiggle under the title
    ctx.strokeStyle = "#0e7c86";
    ctx.lineWidth = 5;
    ctx.beginPath();
    const bx = W / 2 - 140, by = 260, bw = 280;
    ctx.moveTo(bx, by + 10);
    ctx.lineTo(bx + bw * 0.3, by - 22);
    ctx.lineTo(bx + bw * 0.55, by + 22);
    ctx.lineTo(bx + bw, by - 30);
    ctx.stroke();

    ctx.fillStyle = "#3d4e4c";
    ctx.font = `600 22px ${mono}`;
    ctx.fillText("This certifies the ability to tell Mandarin, Vietnamese,", W / 2, 340);
    ctx.fillText("and Cantonese tones apart — by ear, no characters needed.", W / 2, 370);

    ctx.font = `800 36px ${mono}`;
    ctx.fillStyle = "#0e7c86";
    ctx.fillText(xp + " XP", W / 2 - 160, 460);
    ctx.fillStyle = "#ff9500";
    ctx.fillText("\u{1F525} " + streak + " day streak", W / 2 + 160, 460);

    ctx.fillStyle = "#6b8582";
    ctx.font = `700 24px ${mono}`;
    ctx.fillText("tonolingo.bisks.net", W / 2, 560);

    certDataUrl = canvas.toDataURL("image/png");
    els.certImg.src = certDataUrl;
  }

  els.certDownload.addEventListener("click", () => {
    els.shareCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "tonolingo-certificate.png";
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
        const file = new File([blob], "tonolingo-certificate.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: certShareText, title: "tonolingo" });
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

  renderPath();
  showOnly(els.pathView);
})();
