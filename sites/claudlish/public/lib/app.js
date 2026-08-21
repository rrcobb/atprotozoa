// claudlish — lesson engine. All state lives in localStorage; no backend.
(function () {
  "use strict";

  const UNITS = window.CLAUDLISH_UNITS;
  const STORE_KEY = "claudlish_state_v1";
  const QUESTIONS_PER_LESSON = 6;
  const STARTING_HEARTS = 3;
  const XP_PER_CORRECT = 10;
  const XP_PERFECT_BONUS = 20;
  const SITE_URL = "https://claudlish.bisks.net/";

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
    shareCanvas: document.getElementById("shareCanvas"),
  };

  function allPairs() {
    const out = [];
    for (const u of UNITS) for (const p of u.pairs) out.push(p);
    return out;
  }

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
      : "Finish every unit to sit the Claudlish fluency exam.";
    els.certNode.onclick = allDone ? showCert : null;
    els.certNode.disabled = !allDone;

    renderTopStats();
  }

  // ---- lesson state ----
  let lesson = null; // { unitIndex, questions: [...], qi, hearts, correct }

  function buildQuestions(unitIndex) {
    const unit = UNITS[unitIndex];
    const pool = allPairs();
    const qs = unit.pairs.map((pair) => {
      const dir = Math.random() < 0.5 ? "toClaudlish" : "toPlain";
      const answerField = dir === "toClaudlish" ? "cl" : "en";
      const promptField = dir === "toClaudlish" ? "en" : "cl";
      const distractorPool = pool.filter((p) => p !== pair);
      shuffle(distractorPool);
      const distractors = [];
      const seen = new Set([pair[answerField]]);
      for (const d of distractorPool) {
        if (distractors.length >= 3) break;
        if (seen.has(d[answerField])) continue;
        seen.add(d[answerField]);
        distractors.push(d[answerField]);
      }
      const choices = shuffle([pair[answerField], ...distractors]);
      return { dir, prompt: pair[promptField], answer: pair[answerField], choices };
    });
    return shuffle(qs);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
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
    els.qLabel.textContent = q.dir === "toClaudlish" ? "Translate to Claudlish" : "Translate to plain English";
    els.qPrompt.textContent = "“" + q.prompt + "”";
    els.qChoices.innerHTML = "";
    els.fbar.classList.remove("show", "ok", "bad");
    q.choices.forEach((choice) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.textContent = choice;
      b.addEventListener("click", () => answerQuestion(choice, b));
      els.qChoices.appendChild(b);
    });
  }

  function answerQuestion(choice, btnEl) {
    const q = lesson.questions[lesson.qi];
    const correct = choice === q.answer;
    for (const b of els.qChoices.querySelectorAll(".choice")) {
      b.disabled = true;
      if (b.textContent === q.answer) b.classList.add("correct");
      else if (b === btnEl) b.classList.add("wrong");
    }
    if (correct) {
      lesson.correct++;
      els.fbar.classList.add("show", "ok");
      els.fLabel.textContent = "\u{1F389} That's fluent Claudlish.";
    } else {
      lesson.hearts--;
      renderHearts();
      els.fbar.classList.add("show", "bad");
      els.fLabel.textContent = "Not quite — the correct answer is highlighted.";
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
      els.resultTitle.textContent = perfect ? "Perfect lesson!" : "Lesson complete!";
      els.resultSub.textContent = unit.title + " — " + lesson.correct + "/" + lesson.questions.length + " correct.";
      els.resultXp.textContent = "+" + earned;
      els.resultStars.textContent = "★".repeat(lesson.hearts) + "☆".repeat(3 - lesson.hearts);
      els.resultRetry.style.display = "none";
      els.resultContinue.textContent = "Continue";
    } else {
      els.resultEmoji.textContent = "\u{1F494}";
      els.resultTitle.textContent = "Out of hearts";
      els.resultSub.textContent = unit.title + " — " + lesson.correct + "/" + lesson.questions.length + " correct before you ran out.";
      els.resultXp.textContent = "+0";
      els.resultStars.textContent = "☆☆☆";
      els.resultRetry.style.display = "";
      els.resultContinue.textContent = "Back to path";
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
    if (!confirm("Reset all Claudlish progress? This can't be undone.")) return;
    state = { xp: 0, streak: { count: 0, last: null }, completed: {} };
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
      "I'm fluent in Claudlish \u{1F393} (" + xp + " XP, " + streak + "-day streak) — duolingo for the AI assistant dialect. " + SITE_URL;
    els.certShareBsky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(certShareText);
    showOnly(els.certScreen);
  }

  function drawCert(xp, streak) {
    const canvas = els.shareCanvas;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const mono = "ui-monospace, monospace";

    ctx.fillStyle = "#faf6ee";
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.8, -H * 0.1, 0, W * 0.8, -H * 0.1, W * 0.6);
    glow.addColorStop(0, "#f1e0d4");
    glow.addColorStop(1, "rgba(250,246,238,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#cc785c";
    ctx.lineWidth = 6;
    ctx.strokeRect(28, 28, W - 56, H - 56);
    ctx.strokeStyle = "#e5ddc8";
    ctx.lineWidth = 2;
    ctx.strokeRect(44, 44, W - 88, H - 88);

    ctx.textAlign = "center";
    ctx.fillStyle = "#8a8371";
    ctx.font = `700 24px ${mono}`;
    ctx.fillText("CERTIFICATE OF FLUENCY", W / 2, 140);

    ctx.fillStyle = "#3d3929";
    ctx.font = `800 64px ${mono}`;
    ctx.fillText("Claudlish", W / 2, 230);

    ctx.fillStyle = "#cc785c";
    ctx.font = `700 26px ${mono}`;
    ctx.fillText("“I cannot and will not proceed with that request.”", W / 2, 285);

    ctx.fillStyle = "#3d3929";
    ctx.font = `600 22px ${mono}`;
    ctx.fillText("This certifies fluent command of the warm, hedged,", W / 2, 370);
    ctx.fillText("over-disclaimed dialect spoken by every AI assistant.", W / 2, 400);

    ctx.font = `800 36px ${mono}`;
    ctx.fillStyle = "#cc785c";
    ctx.fillText(xp + " XP", W / 2 - 160, 480);
    ctx.fillStyle = "#ff9500";
    ctx.fillText("\u{1F525} " + streak + " day streak", W / 2 + 160, 480);

    ctx.fillStyle = "#8a8371";
    ctx.font = `700 24px ${mono}`;
    ctx.fillText("claudlish.bisks.net", W / 2, 570);

    certDataUrl = canvas.toDataURL("image/png");
    els.certImg.src = certDataUrl;
  }

  els.certDownload.addEventListener("click", () => {
    els.shareCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "claudlish-certificate.png";
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
        const file = new File([blob], "claudlish-certificate.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: certShareText, title: "claudlish" });
        } catch (_) {}
      }, "image/png");
    });
  }

  els.certBack.addEventListener("click", () => {
    showOnly(els.pathView);
    renderPath();
  });

  renderPath();
  showOnly(els.pathView);
})();
