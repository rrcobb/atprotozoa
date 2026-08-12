(function () {
  "use strict";

  var HE = window.HiveEngine;
  var STORAGE_KEY = "hivemind:bee:v1";
  var SITE_URL = "https://hivemind.bisks.net/";

  var els = {
    beeName: document.getElementById("beeName"),
    renameBtn: document.getElementById("renameBtn"),
    beeStage: document.getElementById("beeStage"),
    levelTitle: document.getElementById("levelTitle"),
    moodBadge: document.getElementById("moodBadge"),
    xpFill: document.getElementById("xpFill"),
    xpText: document.getElementById("xpText"),
    hungerFill: document.getElementById("hungerFill"),
    hungerText: document.getElementById("hungerText"),
    wordsLearned: document.getElementById("wordsLearned"),
    mathSolved: document.getElementById("mathSolved"),
    streakOut: document.getElementById("streakOut"),
    bestStreakOut: document.getElementById("bestStreakOut"),
    badgeCase: document.getElementById("badgeCase"),
    feedChoice: document.getElementById("feedChoice"),
    feedMath: document.getElementById("feedMath"),
    feedWord: document.getElementById("feedWord"),
    quiz: document.getElementById("quiz"),
    quizKindLabel: document.getElementById("quizKindLabel"),
    quizPrompt: document.getElementById("quizPrompt"),
    quizChoices: document.getElementById("quizChoices"),
    quizFeedback: document.getElementById("quizFeedback"),
    quizNext: document.getElementById("quizNext"),
    quizStop: document.getElementById("quizStop"),
    submitBtn: document.getElementById("submitBtn"),
    lbMeta: document.getElementById("lbMeta"),
    lbList: document.getElementById("lbList"),
    shareCanvas: document.getElementById("shareCanvas"),
    sharePreview: document.getElementById("sharePreview"),
    shareBluesky: document.getElementById("shareBluesky"),
    shareDownload: document.getElementById("shareDownload"),
    shareNative: document.getElementById("shareNative"),
  };

  var words = [];

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "b" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  var ADJ = ["buzzy", "golden", "tiny", "fuzzy", "brave", "clever", "sunny", "sleepy", "zippy", "royal"];
  var NOUN = ["forager", "buzzer", "pollinator", "nectar-hunter", "wanderer", "scholar", "worker", "drone"];
  function randomBeeName() {
    return ADJ[Math.floor(Math.random() * ADJ.length)] + " " + NOUN[Math.floor(Math.random() * NOUN.length)];
  }

  function defaultState() {
    return {
      clientId: uid(),
      name: randomBeeName(),
      xp: 0,
      mathSolved: 0,
      wordsLearned: 0,
      wordsSeenCorrect: [],
      streak: 0,
      bestStreak: 0,
      hunger: HE.HUNGER_MAX,
      lastFedAt: null,
      badgesSeen: [],
      createdAt: Date.now(),
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      var base = defaultState();
      return Object.assign(base, parsed, { clientId: parsed.clientId || base.clientId });
    } catch (e) {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // storage full/blocked — the session still works, just won't persist
    }
  }

  var state = loadState();
  var currentQuestion = null; // { kind, prompt, choices, answer|definition, word }

  // ---- bee rendering --------------------------------------------------

  function renderBeeSvg(level, mood) {
    var t = Math.min(1, (level - 1) / (HE.MAX_LEVEL - 1));
    var size = 100 + t * 90; // 100..190
    var stripes = Math.max(2, Math.min(6, 2 + Math.floor(level / 5)));
    var isMax = level >= HE.MAX_LEVEL;
    var hasCrown = level >= 15;
    var hasSparkles = level >= 22;

    var bodyColor = isMax ? "#ffd35c" : "#f4b731";
    var stripeColor = "#22190a";

    var stripeEls = "";
    var bodyW = size * 0.92, bodyH = size * 0.68;
    for (var i = 0; i < stripes; i++) {
      var x = -bodyW / 2 + ((i + 1) * bodyW) / (stripes + 1);
      stripeEls +=
        '<ellipse cx="' + x.toFixed(1) + '" cy="0" rx="' + (bodyW / (stripes * 3.2)).toFixed(1) +
        '" ry="' + (bodyH / 2 - 2).toFixed(1) + '" fill="' + stripeColor + '" opacity="0.85"/>';
    }

    var eyes, mouth;
    if (mood === "sluggish") {
      eyes =
        '<line x1="-22" y1="-8" x2="-10" y2="-8" stroke="#22190a" stroke-width="3" stroke-linecap="round"/>' +
        '<line x1="10" y1="-8" x2="22" y2="-8" stroke="#22190a" stroke-width="3" stroke-linecap="round"/>';
      mouth = '<path d="M -10 12 Q 0 8 10 12" stroke="#22190a" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
    } else if (mood === "content") {
      eyes = '<circle cx="-16" cy="-8" r="5" fill="#22190a"/><circle cx="16" cy="-8" r="5" fill="#22190a"/>';
      mouth = '<path d="M -10 10 Q 0 16 10 10" stroke="#22190a" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
    } else {
      eyes =
        '<circle cx="-16" cy="-8" r="6" fill="#22190a"/><circle cx="-14" cy="-10" r="1.6" fill="#fff"/>' +
        '<circle cx="16" cy="-8" r="6" fill="#22190a"/><circle cx="18" cy="-10" r="1.6" fill="#fff"/>';
      mouth = '<path d="M -10 10 Q 0 20 10 10" stroke="#22190a" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
    }

    var crown = hasCrown
      ? '<g transform="translate(0,-' + (bodyH / 2 + 22).toFixed(1) + ')">' +
        '<path d="M -16 10 L -16 -6 L -8 4 L 0 -12 L 8 4 L 16 -6 L 16 10 Z" fill="#f4b731" stroke="#c98d0f" stroke-width="1.5"/>' +
        '<circle cx="0" cy="-12" r="2.4" fill="#ff9d2e"/>' +
        "</g>"
      : "";

    var sparkles = "";
    if (hasSparkles) {
      var pts = [
        [-size * 0.62, -size * 0.28],
        [size * 0.6, -size * 0.1],
        [-size * 0.5, size * 0.32],
        [size * 0.55, size * 0.3],
      ];
      for (var s = 0; s < pts.length; s++) {
        sparkles +=
          '<g transform="translate(' + pts[s][0].toFixed(1) + "," + pts[s][1].toFixed(1) + ')" opacity="0.85">' +
          '<path d="M 0 -6 L 1.6 -1.6 L 6 0 L 1.6 1.6 L 0 6 L -1.6 1.6 L -6 0 L -1.6 -1.6 Z" fill="#ffe08a"/>' +
          "</g>";
      }
    }

    var halo = isMax
      ? '<circle cx="0" cy="0" r="' + (size * 0.62).toFixed(1) + '" fill="none" stroke="#ffd35c" stroke-width="2" opacity="0.35"/>'
      : "";

    var wingW = size * 0.42, wingH = size * 0.5;
    var wings =
      '<g class="wings">' +
      '<ellipse cx="-' + (bodyW * 0.28).toFixed(1) + '" cy="-' + (bodyH * 0.42).toFixed(1) + '" rx="' + wingW.toFixed(1) +
      '" ry="' + wingH.toFixed(1) + '" fill="#eaf6ff" opacity="0.75" stroke="#bcdcec" stroke-width="1"/>' +
      '<ellipse cx="' + (bodyW * 0.28).toFixed(1) + '" cy="-' + (bodyH * 0.42).toFixed(1) + '" rx="' + wingW.toFixed(1) +
      '" ry="' + wingH.toFixed(1) + '" fill="#eaf6ff" opacity="0.75" stroke="#bcdcec" stroke-width="1"/>' +
      "</g>";

    var antennae =
      '<path d="M -10 -' + (bodyH / 2).toFixed(1) + ' Q -18 -' + (bodyH / 2 + 22).toFixed(1) + ' -24 -' + (bodyH / 2 + 26).toFixed(1) +
      '" stroke="#22190a" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M 10 -' + (bodyH / 2).toFixed(1) + ' Q 18 -' + (bodyH / 2 + 22).toFixed(1) + ' 24 -' + (bodyH / 2 + 26).toFixed(1) +
      '" stroke="#22190a" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<circle cx="-24" cy="-' + (bodyH / 2 + 26).toFixed(1) + '" r="3" fill="#22190a"/>' +
      '<circle cx="24" cy="-' + (bodyH / 2 + 26).toFixed(1) + '" r="3" fill="#22190a"/>';

    var vb = size * 1.6;
    return (
      '<svg viewBox="-' + (vb / 2).toFixed(1) + " -" + (vb / 2).toFixed(1) + " " + vb.toFixed(1) + " " + vb.toFixed(1) +
      '" width="' + vb.toFixed(0) + '" height="' + vb.toFixed(0) + '" xmlns="http://www.w3.org/2000/svg">' +
      halo +
      sparkles +
      wings +
      antennae +
      '<ellipse cx="0" cy="0" rx="' + (bodyW / 2).toFixed(1) + '" ry="' + (bodyH / 2).toFixed(1) + '" fill="' + bodyColor + '" stroke="#22190a" stroke-width="2.5"/>' +
      stripeEls +
      eyes +
      mouth +
      crown +
      "</svg>"
    );
  }

  // ---- render -----------------------------------------------------------

  function currentHunger() {
    return HE.decayedHunger(state.hunger, state.lastFedAt, Date.now());
  }

  function render() {
    var progress = HE.levelProgress(state.xp);
    var level = progress.level;
    var mood = HE.moodFor(currentHunger());

    els.beeName.value = state.name;
    els.beeStage.innerHTML = renderBeeSvg(level, mood);
    els.levelTitle.textContent = HE.titleForLevel(level) + " · level " + level;
    els.moodBadge.textContent = mood;
    els.moodBadge.setAttribute("data-mood", mood);

    var xpPct = level >= HE.MAX_LEVEL ? 100 : Math.round(progress.frac * 100);
    els.xpFill.style.width = xpPct + "%";
    els.xpText.textContent = level >= HE.MAX_LEVEL ? "MAX" : progress.into + " / " + progress.span;

    var hungerNow = Math.round(currentHunger());
    els.hungerFill.style.width = hungerNow + "%";
    els.hungerText.textContent = String(hungerNow);

    els.wordsLearned.textContent = String(state.wordsLearned);
    els.mathSolved.textContent = String(state.mathSolved);
    els.streakOut.textContent = String(state.streak);
    els.bestStreakOut.textContent = String(state.bestStreak);

    var earned = HE.computeBadges({
      mathSolved: state.mathSolved,
      wordsLearned: state.wordsLearned,
      bestStreak: state.bestStreak,
      level: level,
    });
    els.badgeCase.innerHTML = earned.length
      ? earned
          .map(function (id) {
            var def = HE.BADGE_DEFS.filter(function (b) { return b.id === id; })[0];
            return '<span class="badge" title="' + esc(def ? def.desc : "") + '">' + esc(def ? def.name : id) + "</span>";
          })
          .join("")
      : '<span style="color:var(--muted);font-size:12px;">no badges yet — feed your bee to earn some</span>';

    var newlyEarned = earned.filter(function (id) { return state.badgesSeen.indexOf(id) === -1; });
    if (newlyEarned.length) {
      state.badgesSeen = earned.slice();
      saveState();
    }

    updateShareCard(level, mood);
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---- feeding / quiz -----------------------------------------------------

  function startQuiz(kind) {
    els.feedChoice.hidden = true;
    els.quiz.hidden = false;
    nextQuestion(kind);
  }

  function stopQuiz() {
    els.quiz.hidden = true;
    els.feedChoice.hidden = false;
    currentQuestion = null;
  }

  function nextQuestion(kind) {
    var level = HE.levelProgress(state.xp).level;
    els.quizFeedback.textContent = "";
    els.quizFeedback.className = "quiz-feedback";
    els.quizNext.hidden = true;

    if (kind === "math") {
      var p = HE.generateMathProblem(level, Math.random);
      currentQuestion = { kind: "math", prompt: p.prompt, answer: p.answer, choices: p.choices };
      els.quizKindLabel.textContent = "math";
      els.quizPrompt.textContent = p.prompt;
      renderChoices(p.choices, function (c) { return String(c); });
    } else {
      var q = HE.pickVocabQuestion(words, level, state.wordsSeenCorrect, Math.random);
      if (!q) {
        currentQuestion = null;
        els.quizKindLabel.textContent = "vocabulary";
        els.quizPrompt.textContent = "the word bank hasn't loaded yet — try again in a moment, or do some math instead.";
        els.quizChoices.innerHTML = "";
        return;
      }
      currentQuestion = { kind: "word", word: q.word, definition: q.definition, choices: q.choices };
      els.quizKindLabel.textContent = "vocabulary";
      els.quizPrompt.textContent = '"' + q.word + '" means...';
      renderChoices(q.choices, function (c) { return String(c); });
    }
  }

  function renderChoices(choices, labelFn) {
    els.quizChoices.innerHTML = "";
    choices.forEach(function (choice) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = labelFn(choice);
      btn.addEventListener("click", function () { handleAnswer(choice, btn); });
      els.quizChoices.appendChild(btn);
    });
  }

  function handleAnswer(choice, btnEl) {
    if (!currentQuestion) return;
    var correctVal = currentQuestion.kind === "math" ? currentQuestion.answer : currentQuestion.definition;
    var isCorrect = choice === correctVal;

    var buttons = els.quizChoices.querySelectorAll("button");
    buttons.forEach(function (b) {
      b.disabled = true;
      if (b.textContent === String(correctVal)) b.classList.add("correct");
      else if (b === btnEl && !isCorrect) b.classList.add("wrong");
    });

    if (isCorrect) {
      feedCorrect(currentQuestion);
      els.quizFeedback.textContent = "correct! your bee is fed.";
      els.quizFeedback.className = "quiz-feedback good";
    } else {
      state.streak = 0;
      els.quizFeedback.textContent =
        currentQuestion.kind === "math"
          ? "not quite — the answer was " + correctVal + "."
          : '"' + currentQuestion.word + '" means: ' + correctVal;
      els.quizFeedback.className = "quiz-feedback bad";
      saveState();
    }

    els.quizNext.hidden = false;
    render();
  }

  function feedCorrect(q) {
    var xpGain = q.kind === "math" ? 10 : 12;
    var streakBonus = Math.min(20, Math.max(0, (state.streak - 2)) * 2);
    state.xp += xpGain + streakBonus;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.hunger = Math.min(HE.HUNGER_MAX, currentHunger() + 15);
    state.lastFedAt = Date.now();

    if (q.kind === "math") {
      state.mathSolved += 1;
    } else {
      if (state.wordsSeenCorrect.indexOf(q.word) === -1) {
        state.wordsSeenCorrect.push(q.word);
        state.wordsLearned = state.wordsSeenCorrect.length;
      }
    }
    saveState();
    maybeAutoSubmit();
  }

  els.feedMath.addEventListener("click", function () { startQuiz("math"); });
  els.feedWord.addEventListener("click", function () { startQuiz("word"); });
  els.quizStop.addEventListener("click", stopQuiz);
  els.quizNext.addEventListener("click", function () {
    nextQuestion(currentQuestion && currentQuestion.kind === "math" ? "math" : "word");
  });

  els.renameBtn.addEventListener("click", function () {
    var v = els.beeName.value.trim().slice(0, 24);
    state.name = v || randomBeeName();
    els.beeName.value = state.name;
    saveState();
    render();
  });

  // ---- leaderboard --------------------------------------------------------

  var lastAutoSubmitLevel = 0;

  function maybeAutoSubmit() {
    var level = HE.levelProgress(state.xp).level;
    if (level > lastAutoSubmitLevel) {
      lastAutoSubmitLevel = level;
      submitScore(true);
    }
  }

  function renderLeaderboard(data) {
    if (!data || !data.board) {
      els.lbMeta.textContent = "couldn't reach the hive right now.";
      return;
    }
    els.lbMeta.textContent = data.hiveSize + " bee" + (data.hiveSize === 1 ? "" : "s") + " in the swarm so far.";
    els.lbList.innerHTML = data.board
      .map(function (b, i) {
        var mine = b.clientId === state.clientId;
        return (
          '<li class="' + (mine ? "me" : "") + '">' +
          '<span class="lb-rank">#' + (i + 1) + "</span>" +
          '<span class="lb-name">' + esc(b.name) + "</span>" +
          '<span class="lb-level">Lv.' + b.level + " · " + b.xp + " xp</span>" +
          "</li>"
        );
      })
      .join("");
  }

  function fetchLeaderboard() {
    fetch("/api/leaderboard")
      .then(function (r) { return r.json(); })
      .then(renderLeaderboard)
      .catch(function () { els.lbMeta.textContent = "couldn't reach the hive right now."; });
  }

  function submitScore(silent) {
    var level = HE.levelProgress(state.xp).level;
    var body = {
      clientId: state.clientId,
      name: state.name,
      level: level,
      xp: state.xp,
      wordsLearned: state.wordsLearned,
      mathSolved: state.mathSolved,
      streak: state.bestStreak,
    };
    fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        renderLeaderboard(data);
        if (!silent) els.lbMeta.textContent = "your bee ranks #" + (data.rank || "?") + " in the swarm.";
      })
      .catch(function () {
        if (!silent) els.lbMeta.textContent = "couldn't submit right now — try again later.";
      });
  }

  els.submitBtn.addEventListener("click", function () { submitScore(false); });

  // ---- sharing --------------------------------------------------------

  function buildShareText(level) {
    var text =
      "my hivemind bee (" + state.name + ") is level " + level + " — " +
      HE.titleForLevel(level) + ", " + state.wordsLearned + " words learned, " +
      state.mathSolved + " problems solved. feed your own bee some homework: " + SITE_URL;
    return text.length > 300 ? text.slice(0, 296) + "..." : text;
  }

  function updateShareCard(level, mood) {
    var canvas = els.shareCanvas;
    var ctx = canvas.getContext("2d");
    var W = canvas.width, H = canvas.height;

    ctx.fillStyle = "#12100a";
    ctx.fillRect(0, 0, W, H);
    var glow = ctx.createRadialGradient(W * 0.2, H * 0.15, 0, W * 0.2, H * 0.15, W * 0.55);
    glow.addColorStop(0, "#332512");
    glow.addColorStop(1, "rgba(18,16,10,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#f4b731";
    ctx.font = "700 40px monospace";
    ctx.fillText("🐝 hivemind", 56, 90);
    ctx.fillStyle = "#b8ab8a";
    ctx.font = "16px monospace";
    ctx.fillText("hivemind.bisks.net", 56, 118);

    // bee, rasterized via an offscreen SVG image
    var svgStr = renderBeeSvg(level, mood);
    var svgBlob = new Blob([svgStr], { type: "image/svg+xml" });
    var url = URL.createObjectURL(svgBlob);
    var img = new Image();
    img.onload = function () {
      var size = 320;
      ctx.drawImage(img, W - size - 80, 100, size, size);
      URL.revokeObjectURL(url);
      finishCard();
    };
    img.onerror = function () { URL.revokeObjectURL(url); finishCard(); };
    img.src = url;

    function finishCard() {
      ctx.fillStyle = "#f3ecd8";
      ctx.font = "700 34px monospace";
      ctx.fillText(state.name, 56, 200);
      ctx.fillStyle = "#f4b731";
      ctx.font = "700 24px monospace";
      ctx.fillText(HE.titleForLevel(level) + " · level " + level, 56, 240);

      var rows = [
        ["words learned", String(state.wordsLearned)],
        ["problems solved", String(state.mathSolved)],
        ["best streak", String(state.bestStreak)],
        ["total xp", String(state.xp)],
      ];
      ctx.font = "18px monospace";
      rows.forEach(function (r, i) {
        var y = 300 + i * 44;
        ctx.fillStyle = "#b8ab8a";
        ctx.fillText(r[0], 56, y);
        ctx.fillStyle = "#f3ecd8";
        ctx.font = "700 20px monospace";
        ctx.fillText(r[1], 320, y);
        ctx.font = "18px monospace";
      });

      ctx.fillStyle = "#b8ab8a";
      ctx.font = "16px monospace";
      ctx.fillText("help the swarm do its homework — feed your own bee at hivemind.bisks.net", 56, H - 40);

      canvas.toBlob(function (blob) {
        if (!blob) return;
        els.sharePreview.src = URL.createObjectURL(blob);
      }, "image/png");

      els.shareBluesky.href =
        "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText(level));
    }
  }

  els.shareDownload.addEventListener("click", function () {
    els.shareCanvas.toBlob(function (blob) {
      if (!blob) return;
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "hivemind-" + state.name.replace(/[^a-z0-9.-]/gi, "_") + ".png";
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  });

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      var probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (e) {
      return false;
    }
  }
  if (canShareFiles()) {
    els.shareNative.hidden = false;
    els.shareNative.addEventListener("click", function () {
      els.shareCanvas.toBlob(function (blob) {
        if (!blob) return;
        var file = new File([blob], "hivemind-bee.png", { type: "image/png" });
        var level = HE.levelProgress(state.xp).level;
        navigator.share({ files: [file], text: buildShareText(level), title: "hivemind" }).catch(function () {});
      }, "image/png");
    });
  }

  // ---- boot -------------------------------------------------------------

  function boot() {
    fetch("data/words.json")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        words = data;
        render();
      })
      .catch(function () {
        words = [];
        render();
      });
    fetchLeaderboard();
    setInterval(render, 30000); // keep the hunger bar honest between feedings
  }

  boot();
})();
