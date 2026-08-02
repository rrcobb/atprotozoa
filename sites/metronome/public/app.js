(() => {
  "use strict";

  const els = {
    bpmNumber: document.getElementById("bpmNumber"),
    bpmSlider: document.getElementById("bpmSlider"),
    tapBtn: document.getElementById("tapBtn"),
    tapHint: document.getElementById("tapHint"),
    playBtn: document.getElementById("playBtn"),
    volSlider: document.getElementById("volSlider"),
    timeSig: document.getElementById("timeSig"),
    subdiv: document.getElementById("subdiv"),
    beats: document.getElementById("beats"),
    presetName: document.getElementById("presetName"),
    savePreset: document.getElementById("savePreset"),
    presetList: document.getElementById("presetList"),
    emptyNote: document.getElementById("emptyNote"),
    shareLink: document.getElementById("shareLink"),
  };

  const MIN_BPM = 30;
  const MAX_BPM = 280;
  const STORE_KEY = "metronome.presets.v1";

  const state = {
    bpm: 120,
    beatsPerMeasure: 4, // numerator of the time signature
    subdivision: 1, // clicks per beat: 1=quarter 2=eighth 3=triplet 4=sixteenth
    volume: 0.7,
    playing: false,
  };

  function clampBpm(v) {
    if (Number.isNaN(v)) return state.bpm;
    return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(v)));
  }

  function setBpm(v, opts) {
    state.bpm = clampBpm(v);
    if (!opts || !opts.skipFieldSync) els.bpmNumber.value = String(state.bpm);
    els.bpmSlider.value = String(state.bpm);
    if (!opts || !opts.skipSave) saveLastSettings();
  }

  // While typing, only sync the engine + slider — rewriting the number
  // field's own value mid-keystroke (e.g. clamping "9" to "30" while the
  // user is still typing "90") would corrupt what they're typing.
  els.bpmNumber.addEventListener("input", () => {
    const v = parseInt(els.bpmNumber.value, 10);
    if (!Number.isNaN(v)) setBpm(v, { skipFieldSync: true });
  });
  els.bpmNumber.addEventListener("blur", () => setBpm(parseInt(els.bpmNumber.value, 10) || state.bpm));
  els.bpmSlider.addEventListener("input", () => setBpm(parseInt(els.bpmSlider.value, 10)));

  els.timeSig.addEventListener("change", () => {
    state.beatsPerMeasure = parseInt(els.timeSig.value.split("/")[0], 10);
    buildBeatDots();
    saveLastSettings();
  });

  els.subdiv.addEventListener("change", () => {
    state.subdivision = parseInt(els.subdiv.value, 10);
    saveLastSettings();
  });

  els.volSlider.addEventListener("input", () => {
    state.volume = parseInt(els.volSlider.value, 10) / 100;
    saveLastSettings();
  });

  // ---------- Tap tempo ----------
  let tapTimes = [];
  els.tapBtn.addEventListener("click", () => {
    const now = performance.now();
    if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2000) {
      tapTimes = [];
    }
    tapTimes.push(now);
    if (tapTimes.length > 6) tapTimes.shift();

    if (tapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = 60000 / avg;
      setBpm(Math.round(bpm));
      els.tapHint.textContent = `${state.bpm} bpm`;
    } else {
      els.tapHint.textContent = "tap again…";
    }
  });

  // ---------- Beat visualizer ----------
  let dotEls = [];
  function buildBeatDots() {
    els.beats.innerHTML = "";
    dotEls = [];
    for (let i = 0; i < state.beatsPerMeasure; i++) {
      const d = document.createElement("div");
      d.className = "beat-dot" + (i === 0 ? " down" : "");
      els.beats.appendChild(d);
      dotEls.push(d);
    }
  }
  buildBeatDots();

  function flashBeat(beatIndex, isDown) {
    const dot = dotEls[beatIndex];
    if (!dot) return;
    dot.classList.add("lit");
    setTimeout(() => dot.classList.remove("lit"), isDown ? 130 : 90);
  }

  // ---------- Audio engine ----------
  // Classic lookahead scheduler: a fast interval timer checks the audio
  // clock and schedules any clicks due in the next SCHEDULE_AHEAD window,
  // so timing rides on the audio clock rather than the timer's own jitter.
  const SCHEDULE_AHEAD = 0.12; // seconds
  const TIMER_INTERVAL = 25; // ms

  let audioCtx = null;
  let nextClickTime = 0;
  let clickCounter = 0; // counts subdivided clicks within the measure
  let schedulerId = null;

  function ensureAudio() {
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playClick(time, isDown) {
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = isDown ? 1500 : 900;

    const peak = state.volume * (isDown ? 0.9 : 0.6);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + (isDown ? 0.09 : 0.06));

    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  function scheduleClick(time, mainBeatIndex, isDown) {
    playClick(time, isDown);
    const delayMs = Math.max(0, (time - audioCtx.currentTime) * 1000);
    setTimeout(() => flashBeat(mainBeatIndex, isDown), delayMs);
  }

  function secondsPerSubClick() {
    const secPerBeat = 60 / state.bpm;
    return secPerBeat / state.subdivision;
  }

  function scheduler() {
    while (nextClickTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
      const clicksPerMeasure = state.beatsPerMeasure * state.subdivision;
      const posInMeasure = clickCounter % clicksPerMeasure;
      const isMainBeat = posInMeasure % state.subdivision === 0;
      const mainBeatIndex = Math.floor(posInMeasure / state.subdivision);
      const isDown = posInMeasure === 0;

      if (isMainBeat) {
        scheduleClick(nextClickTime, mainBeatIndex, isDown);
      } else {
        // Sub-clicks between main beats: quiet tick, no flash.
        playClick(nextClickTime, false);
      }

      nextClickTime += secondsPerSubClick();
      clickCounter++;
    }
    schedulerId = setTimeout(scheduler, TIMER_INTERVAL);
  }

  function start() {
    ensureAudio();
    clickCounter = 0;
    nextClickTime = audioCtx.currentTime + 0.05;
    scheduler();
    state.playing = true;
    els.playBtn.textContent = "stop";
    els.playBtn.classList.add("playing");
  }

  function stop() {
    if (schedulerId) clearTimeout(schedulerId);
    schedulerId = null;
    state.playing = false;
    els.playBtn.textContent = "start";
    els.playBtn.classList.remove("playing");
    dotEls.forEach((d) => d.classList.remove("lit"));
  }

  els.playBtn.addEventListener("click", () => {
    if (state.playing) stop();
    else start();
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      els.playBtn.click();
    }
  });

  // ---------- Presets (setlist mode) ----------
  function loadPresets() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function savePresets(list) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
    } catch {
      /* storage unavailable — presets just won't persist */
    }
  }

  function renderPresets() {
    const list = loadPresets();
    els.presetList.innerHTML = "";
    els.emptyNote.style.display = list.length ? "none" : "block";
    list.forEach((p, i) => {
      const li = document.createElement("li");

      const name = document.createElement("span");
      name.className = "pname";
      name.textContent = p.name;

      const meta = document.createElement("span");
      meta.className = "pmeta";
      meta.textContent = `${p.bpm} bpm · ${p.timeSig}`;

      const loadBtn = document.createElement("button");
      loadBtn.textContent = "load";
      loadBtn.addEventListener("click", () => {
        setBpm(p.bpm);
        els.timeSig.value = p.timeSig;
        state.beatsPerMeasure = parseInt(p.timeSig.split("/")[0], 10);
        buildBeatDots();
        if (p.subdiv) {
          els.subdiv.value = String(p.subdiv);
          state.subdivision = p.subdiv;
        }
        saveLastSettings();
      });

      const delBtn = document.createElement("button");
      delBtn.className = "del";
      delBtn.textContent = "✕";
      delBtn.setAttribute("aria-label", `delete ${p.name}`);
      delBtn.addEventListener("click", () => {
        const cur = loadPresets();
        cur.splice(i, 1);
        savePresets(cur);
        renderPresets();
      });

      li.appendChild(name);
      li.appendChild(meta);
      li.appendChild(loadBtn);
      li.appendChild(delBtn);
      els.presetList.appendChild(li);
    });
  }

  els.savePreset.addEventListener("click", () => {
    const name = els.presetName.value.trim() || `song ${loadPresets().length + 1}`;
    const list = loadPresets();
    list.push({
      name,
      bpm: state.bpm,
      timeSig: els.timeSig.value,
      subdiv: state.subdivision,
    });
    savePresets(list);
    els.presetName.value = "";
    renderPresets();
  });

  els.presetName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.savePreset.click();
  });

  // ---------- Persist last-used settings across visits ----------
  const LAST_KEY = "metronome.last.v1";
  function saveLastSettings() {
    try {
      localStorage.setItem(
        LAST_KEY,
        JSON.stringify({
          bpm: state.bpm,
          timeSig: els.timeSig.value,
          subdiv: state.subdivision,
          volume: Math.round(state.volume * 100),
        })
      );
    } catch {
      /* ignore */
    }
  }

  function restoreLastSettings() {
    try {
      const raw = localStorage.getItem(LAST_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.bpm) setBpm(s.bpm, { skipSave: true });
      if (s.timeSig) {
        els.timeSig.value = s.timeSig;
        state.beatsPerMeasure = parseInt(s.timeSig.split("/")[0], 10);
      }
      if (s.subdiv) {
        els.subdiv.value = String(s.subdiv);
        state.subdivision = s.subdiv;
      }
      if (typeof s.volume === "number") {
        els.volSlider.value = String(s.volume);
        state.volume = s.volume / 100;
      }
    } catch {
      /* ignore */
    }
  }

  // ---------- Share link ----------
  els.shareLink.href =
    "https://bsky.app/intent/compose?text=" +
    encodeURIComponent("tap, drag, or dial in a tempo — metronome.bisks.net");

  // ---------- Init ----------
  restoreLastSettings();
  buildBeatDots();
  renderPresets();
})();
