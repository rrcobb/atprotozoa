// DOOMOLINGO — the whole game. Vocab quiz dressed as a boomer-shooter: a
// demon throws an English word at you, you shoot the right translation
// before the timer (and your health) runs out. No owl. No streak freezes.
// No mercy.

(function () {
  "use strict";

  const DECKS = window.DOOMOLINGO_DECKS;
  const SITE_URL = "https://doomolingo.bisks.net/";

  const TIMER_START = 7000;
  const TIMER_FLOOR = 2200;
  const TIMER_STEP = 150;
  const HEALTH_START = 100;
  const REGEN_ON_CORRECT = 2;
  const WAVE_EVERY = 5; // correct answers per wave bump

  const DEMONS = ["\u{1F479}", "\u{1F47A}", "\u{1F480}", "\u{1F47B}", "\u{1F921}"]; // ogre, goblin, skull, ghost, clown (imp stand-ins)

  const TAUNTS_WRONG = [
    "WRONG. THE DEMONS LAUGH.",
    "PATHETIC.",
    "IT IS DONE. TO YOU.",
    "RIP. NO TEAR.",
    "STUDY OR DIE.",
    "THAT'S GOING TO LEAVE A MARK.",
    "HELL REMEMBERS THAT ANSWER.",
  ];
  const TAUNTS_TIMEOUT = [
    "TOO SLOW.",
    "HESITATION IS DEATH.",
    "THE CLOCK DOESN'T CARE.",
  ];
  const PRAISE_CORRECT = [
    "RIP AND TEAR.",
    "CORRECT. NOW BLEED FOR MORE.",
    "THE DEMON DISSOLVES.",
    "GOOD. NEXT.",
    "IT IS DONE.",
    "SLAIN.",
  ];

  const els = {};
  document.querySelectorAll("[id]").forEach((n) => (els[n.id] = n));

  let audioCtx = null;
  let muted = localStorage.getItem("doomolingo:muted") === "1";
  updateMuteButton();

  function ensureAudio() {
    if (muted) return null;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    return audioCtx;
  }

  function tone(freq, dur, type, gainStart) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainStart || 0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  function sfxCorrect() {
    tone(440, 0.08, "square");
    setTimeout(() => tone(660, 0.1, "square"), 60);
  }
  function sfxWrong() {
    tone(120, 0.35, "sawtooth", 0.12);
  }
  function sfxDeath() {
    tone(200, 0.15, "sawtooth", 0.14);
    setTimeout(() => tone(140, 0.2, "sawtooth", 0.14), 140);
    setTimeout(() => tone(80, 0.5, "sawtooth", 0.16), 320);
  }
  function sfxStart() {
    tone(180, 0.08, "square");
    setTimeout(() => tone(260, 0.08, "square"), 80);
    setTimeout(() => tone(360, 0.14, "square"), 160);
  }

  function updateMuteButton() {
    if (els.muteBtn) els.muteBtn.textContent = muted ? "\u{1F507} MUTED" : "\u{1F50A} SOUND";
  }

  // ---- state ------------------------------------------------------------

  const state = {
    deck: null,
    health: HEALTH_START,
    score: 0,
    streak: 0,
    bestStreak: 0,
    wave: 1,
    correctCount: 0,
    wrongCount: 0,
    learned: new Set(),
    timerMax: TIMER_START,
    timerId: null,
    barId: null,
    current: null,
    answered: false,
    lastWord: null,
  };

  function pickWord(deck) {
    const pool = deck.words;
    let w;
    do {
      w = pool[Math.floor(Math.random() * pool.length)];
    } while (pool.length > 1 && state.lastWord === w.en);
    state.lastWord = w.en;
    return w;
  }

  function buildChoices(deck, correct) {
    const pool = deck.words.filter((w) => w.target !== correct.target);
    const distractors = [];
    while (distractors.length < 3 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      distractors.push(pool.splice(i, 1)[0].target);
    }
    const choices = [correct.target, ...distractors];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return choices;
  }

  // ---- screens ------------------------------------------------------------

  function showScreen(name) {
    ["title", "game", "over"].forEach((s) => {
      els["screen-" + s].hidden = s !== name;
    });
  }

  function startGame(deckCode) {
    const deck = DECKS.find((d) => d.code === deckCode);
    if (!deck) return;
    sfxStart();
    state.deck = deck;
    state.health = HEALTH_START;
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.wave = 1;
    state.correctCount = 0;
    state.wrongCount = 0;
    state.learned = new Set();
    state.timerMax = TIMER_START;
    state.lastWord = null;
    els.hudLang.textContent = deck.label;
    showScreen("game");
    renderHud();
    nextQuestion();
  }

  function renderHud() {
    els.hudScore.textContent = String(state.score);
    els.hudWave.textContent = String(state.wave);
    els.hudStreak.textContent = String(state.streak);
    els.hudHealthNum.textContent = String(Math.max(0, state.health));
    const pct = Math.max(0, state.health);
    els.hudHealthBar.style.width = pct + "%";
    els.hudHealthBar.className =
      "healthfill " + (pct > 66 ? "hp-good" : pct > 33 ? "hp-warn" : "hp-crit");
    els.hudFace.textContent =
      state.health > 80 ? "\u{1F608}" : state.health > 50 ? "\u{1F620}" : state.health > 25 ? "\u{1F97A}" : state.health > 0 ? "\u{1F975}" : "\u{1F480}";
  }

  function nextQuestion() {
    state.answered = false;
    els.arena.classList.remove("shake", "hit-flash", "good-flash");
    const word = pickWord(state.deck);
    const choices = buildChoices(state.deck, word);
    state.current = { word, choices };

    els.demonGlyph.textContent = DEMONS[Math.floor(Math.random() * DEMONS.length)];
    els.demonGlyph.classList.remove("demon-die");
    els.promptWord.textContent = word.en.toUpperCase();
    els.taunt.textContent = "";

    els.choices.innerHTML = "";
    choices.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.innerHTML =
        '<span class="slot">' + (i + 1) + "</span><span class=\"word\">" + escapeHtml(c) + "</span>";
      btn.addEventListener("click", () => onAnswer(c));
      els.choices.appendChild(btn);
    });

    runTimer();
  }

  function runTimer() {
    clearInterval(state.timerId);
    const start = performance.now();
    const max = state.timerMax;
    els.timerBar.style.transition = "none";
    els.timerBar.style.width = "100%";
    // force reflow so the transition below actually animates from 100%
    void els.timerBar.offsetWidth;
    els.timerBar.style.transition = "width linear " + max + "ms";
    els.timerBar.style.width = "0%";

    state.timerId = setTimeout(() => {
      if (!state.answered) onAnswer(null);
    }, max);
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function onAnswer(choice) {
    if (state.answered) return;
    state.answered = true;
    clearTimeout(state.timerId);

    const correct = choice === state.current.word.target;
    const buttons = els.choices.querySelectorAll(".choice");
    buttons.forEach((b) => {
      const w = b.querySelector(".word").textContent;
      if (w === state.current.word.target) b.classList.add("correct");
      else if (w === choice) b.classList.add("wrong");
      b.disabled = true;
    });

    if (correct) {
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.correctCount++;
      state.learned.add(state.current.word.target);
      const gained = Math.round(100 * (1 + state.streak * 0.1));
      state.score += gained;
      state.health = Math.min(HEALTH_START, state.health + REGEN_ON_CORRECT);
      state.timerMax = Math.max(TIMER_FLOOR, state.timerMax - TIMER_STEP);
      if (state.correctCount % WAVE_EVERY === 0) state.wave++;
      els.demonGlyph.classList.add("demon-die");
      els.arena.classList.add("good-flash");
      els.taunt.textContent = "+" + gained + "  " + rand(PRAISE_CORRECT);
      els.taunt.className = "taunt taunt-good";
      sfxCorrect();
    } else {
      state.streak = 0;
      state.wrongCount++;
      const dmg = Math.min(34, 12 + state.wave * 2);
      state.health -= dmg;
      els.arena.classList.add("shake", "hit-flash");
      els.taunt.textContent = choice === null ? rand(TAUNTS_TIMEOUT) : "-" + dmg + " HP  " + rand(TAUNTS_WRONG);
      els.taunt.className = "taunt taunt-bad";
      sfxWrong();
    }

    renderHud();

    if (state.health <= 0) {
      state.health = 0;
      renderHud();
      setTimeout(gameOver, 650);
      return;
    }

    setTimeout(nextQuestion, 850);
  }

  function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function gameOver() {
    sfxDeath();
    showScreen("over");
    els.overLang.textContent = state.deck.label;
    els.overScore.textContent = String(state.score);
    els.overWave.textContent = String(state.wave);
    els.overLearned.textContent = String(state.learned.size);
    els.overStreak.textContent = String(state.bestStreak);

    const bestKey = "doomolingo:best:" + state.deck.code;
    const prevBest = Number(localStorage.getItem(bestKey) || 0);
    const isBest = state.score > prevBest;
    if (isBest) localStorage.setItem(bestKey, String(state.score));
    els.overBest.textContent = isBest
      ? "NEW BEST FOR " + state.deck.label
      : "BEST FOR " + state.deck.label + ": " + Math.max(prevBest, state.score);

    const shareText =
      "DOOMOLINGO: I survived wave " + state.wave + " in " + state.deck.label +
      " with a score of " + state.score + " and learned " + state.learned.size +
      " words the hard way. " + SITE_URL;
    els.shareBluesky.href =
      "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

    buildShareCard();
  }

  function restart() {
    showScreen("title");
  }

  // ---- share card (canvas) -------------------------------------------------

  function buildShareCard() {
    const canvas = els.shareCanvas;
    const ctx = canvas.getContext("2d");
    const W = (canvas.width = 1200);
    const H = (canvas.height = 630);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#1a0505");
    bg.addColorStop(1, "#3a0808");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#ff3b1f";
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ff2b17";
    ctx.font = "900 96px 'Nosifer', 'Arial Black', sans-serif";
    ctx.fillText("YOU DIED", W / 2, 190);

    ctx.fillStyle = "#ffb199";
    ctx.font = "700 34px 'JetBrains Mono', monospace";
    ctx.fillText("DOOMOLINGO — " + state.deck.label, W / 2, 250);

    ctx.fillStyle = "#fff2ee";
    ctx.font = "700 46px 'JetBrains Mono', monospace";
    ctx.fillText("SCORE " + state.score, W / 2, 340);

    ctx.fillStyle = "#ffcfc4";
    ctx.font = "400 26px 'JetBrains Mono', monospace";
    ctx.fillText(
      "wave " + state.wave + "  •  " + state.learned.size + " words learned  •  best streak " + state.bestStreak,
      W / 2,
      390
    );

    ctx.fillStyle = "#ff6a52";
    ctx.font = "700 28px 'JetBrains Mono', monospace";
    ctx.fillText("doomolingo.bisks.net", W / 2, 560);

    els.shareDownload.href = canvas.toDataURL("image/png");
  }

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  }

  async function nativeShare() {
    const shareText =
      "DOOMOLINGO: I survived wave " + state.wave + " in " + state.deck.label +
      " with a score of " + state.score + ". " + SITE_URL;
    if (canShareFiles()) {
      const blob = await new Promise((res) => els.shareCanvas.toBlob(res, "image/png"));
      const file = new File([blob], "doomolingo.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: shareText, title: "DOOMOLINGO" });
        return;
      } catch (e) {
        // fall through to compose link
      }
    }
    window.open(els.shareBluesky.href, "_blank");
  }

  // ---- wire up --------------------------------------------------------------

  document.querySelectorAll(".deck-btn").forEach((btn) => {
    btn.addEventListener("click", () => startGame(btn.dataset.deck));
  });
  els.playAgainBtn.addEventListener("click", restart);
  els.shareNative.addEventListener("click", nativeShare);
  els.muteBtn.addEventListener("click", () => {
    muted = !muted;
    localStorage.setItem("doomolingo:muted", muted ? "1" : "0");
    updateMuteButton();
  });

  window.addEventListener("keydown", (e) => {
    if (els["screen-game"].hidden) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 4) {
      const btn = els.choices.children[n - 1];
      if (btn && !btn.disabled) btn.click();
    }
  });

  showScreen("title");
})();
