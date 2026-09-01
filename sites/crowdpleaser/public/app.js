(function () {
  "use strict";

  // Kept in sync with src/index.ts's copy — see the comment there on why the
  // server needs its own copy of these tables (unfurl cards render before any
  // client JS runs).
  var ANIMALS = [
    "a golden retriever puppy meeting stairs for the first time",
    "a kitten discovering its own reflection",
    "two otters holding hands so they don't drift apart",
    "a baby penguin faceplanting into snow, then getting right back up",
    "a hedgehog eating a single blueberry with both paws",
    "a duckling riding piggyback on its mom",
    "a baby elephant sneezing and scaring itself",
    "a tortoise wearing a tiny raincoat",
  ];
  var RELATABLE = [
    "the wifi reconnects right as you're about to rage quit",
    "you find a $20 in a coat you haven't worn since last winter",
    "the barista writes something nice on your cup",
    "your package shows up a day early",
    "someone lets you merge in traffic and you actually get to wave",
    "the group chat agrees on a restaurant on the first try",
    "you wake up and remember it's Saturday",
    "the vending machine drops two",
  ];
  var OUTCOMES = [
    "everyone in the room claps",
    "gets forwarded to the family group chat within the hour",
    "makes your coworker cry a little, in a good way",
    "ends up taped to someone's fridge",
    "gets read out loud at a wedding, unprompted",
    "becomes the office screensaver by Friday",
    "makes the local news, somehow",
    "gets a slow clap from total strangers",
  ];

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    animal: $("animal"),
    relatable: $("relatable"),
    outcome: $("outcome"),
    meterFill: $("meter-fill"),
    meterPct: $("meter-pct"),
    liveN: $("live-n"),
    generate: $("generate"),
    shareBluesky: $("share-bluesky"),
    shareImage: $("share-image"),
    copyLink: $("copy-link"),
    cardCanvas: $("card-canvas"),
    confetti: $("confetti"),
  };

  var current = [0, 0, 0];

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function sentence(seed) {
    return cap(ANIMALS[seed[0]]) + ", plus " + RELATABLE[seed[1]] + " — " + OUTCOMES[seed[2]] + ".";
  }

  function parseSeedFromPath() {
    var m = location.pathname.match(/^\/s\/([0-9]+)-([0-9]+)-([0-9]+)\/?$/);
    if (!m) return null;
    var a = parseInt(m[1], 10), b = parseInt(m[2], 10), c = parseInt(m[3], 10);
    if (a < 0 || a >= ANIMALS.length) return null;
    if (b < 0 || b >= RELATABLE.length) return null;
    if (c < 0 || c >= OUTCOMES.length) return null;
    return [a, b, c];
  }

  function randomSeed() {
    return [
      Math.floor(Math.random() * ANIMALS.length),
      Math.floor(Math.random() * RELATABLE.length),
      Math.floor(Math.random() * OUTCOMES.length),
    ];
  }

  function shareUrl(seed) {
    return "https://crowdpleaser.bisks.net/s/" + seed.join("-");
  }

  function animateMeter() {
    els.meterFill.style.width = "0%";
    els.meterPct.textContent = "0";
    requestAnimationFrame(function () {
      els.meterFill.style.width = "100%";
    });
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / 1100);
      els.meterPct.textContent = Math.round(t * 100);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function render(seed, opts) {
    current = seed;
    els.animal.textContent = cap(ANIMALS[seed[0]]);
    els.relatable.textContent = RELATABLE[seed[1]];
    els.outcome.textContent = OUTCOMES[seed[2]];
    animateMeter();
    var url = shareUrl(seed);
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText(seed));
    history.replaceState(null, "", "/s/" + seed.join("-"));
    if (!opts || !opts.silent) burstConfetti();
  }

  function buildShareText(seed) {
    var line = sentence(seed);
    var url = shareUrl(seed);
    var text = "Certified 100% Crowd-Pleaser: " + line + " " + url;
    if (text.length <= 300) return text;
    // budget the sentence against the 300-grapheme cap, URL always survives
    var suffix = " " + url;
    var max = 300 - suffix.length - 1;
    return "Certified 100% Crowd-Pleaser: " + line.slice(0, max).trim() + "…" + suffix;
  }

  els.generate.addEventListener("click", function () { render(randomSeed()); });

  els.copyLink.addEventListener("click", function () {
    var url = shareUrl(current);
    var done = function () {
      var old = els.copyLink.textContent;
      els.copyLink.textContent = "copied!";
      setTimeout(function () { els.copyLink.textContent = old; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, done);
    } else {
      var ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(ta);
      done();
    }
  });

  // --- share card (canvas) ---------------------------------------------------

  function drawCard(seed) {
    var c = els.cardCanvas, ctx = c.getContext("2d");
    var W = c.width, H = c.height;
    var grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#fff6e9");
    grad.addColorStop(1, "#ffe0b0");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ff5d73";
    ctx.font = "bold 64px sans-serif";
    ctx.fillText("crowdpleaser", 60, 110);

    ctx.fillStyle = "#2a1e12";
    ctx.font = "bold 30px sans-serif";
    wrapText(ctx, sentence(seed), 60, 190, W - 120, 42, 6);

    ctx.fillStyle = "#2fb88a";
    ctx.font = "bold 48px sans-serif";
    ctx.fillText("✓ 100% Certified Approval", 60, H - 110);

    ctx.fillStyle = "#7a6a55";
    ctx.font = "26px sans-serif";
    ctx.fillText(shareUrl(seed).replace("https://", ""), 60, H - 60);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = text.split(" ");
    var line = "";
    var lines = 0;
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i] + " ";
      if (ctx.measureText(test).width > maxWidth && line !== "") {
        ctx.fillText(line, x, y);
        line = words[i] + " ";
        y += lineHeight;
        lines++;
        if (lines >= maxLines - 1) {
          ctx.fillText(line + words.slice(i + 1).join(" "), x, y);
          return;
        }
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, y);
  }

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      var probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (_) { return false; }
  }

  els.shareImage.addEventListener("click", function () {
    drawCard(current);
    els.cardCanvas.toBlob(function (blob) {
      if (!blob) return;
      if (canShareFiles()) {
        var file = new File([blob], "crowdpleaser.png", { type: "image/png" });
        navigator.share({ files: [file], text: buildShareText(current), title: "crowdpleaser" }).catch(function () {});
        return;
      }
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "crowdpleaser.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, "image/png");
  });

  // --- confetti ---------------------------------------------------------------

  var confettiCtx = els.confetti.getContext("2d");
  var particles = [];
  var colors = ["#ff5d73", "#f5a623", "#2fb88a", "#5b8def", "#c65bde"];

  function resizeConfetti() {
    els.confetti.width = window.innerWidth;
    els.confetti.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeConfetti);
  resizeConfetti();

  function burstConfetti() {
    for (var i = 0; i < 90; i++) {
      particles.push({
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
        y: window.innerHeight * 0.25,
        vx: (Math.random() - 0.5) * 9,
        vy: Math.random() * -9 - 3,
        g: 0.28,
        size: 4 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 90 + Math.random() * 30,
      });
    }
  }

  function tickConfetti() {
    confettiCtx.clearRect(0, 0, els.confetti.width, els.confetti.height);
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      confettiCtx.globalAlpha = Math.max(0, p.life / 90);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(p.x, p.y, p.size, p.size);
    });
    confettiCtx.globalAlpha = 1;
    requestAnimationFrame(tickConfetti);
  }
  requestAnimationFrame(tickConfetti);

  // --- live firehose counter ---------------------------------------------------
  // Real count of app.bsky.feed.post creates seen on Jetstream in the last
  // WINDOW_MS — no fabricated inflation, the joke is entirely in the caption
  // text ("would, statistically, love this"), not in the number itself.
  var WINDOW_MS = 8000;
  var seenAt = [];
  var ws;
  function connectJetstream() {
    try {
      ws = new WebSocket("wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post");
    } catch (_) { return; }
    ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.kind === "commit" && msg.commit && msg.commit.operation === "create" && msg.commit.collection === "app.bsky.feed.post") {
          seenAt.push(Date.now());
        }
      } catch (_) {}
    };
    ws.onclose = function () { setTimeout(connectJetstream, 3000); };
    ws.onerror = function () { try { ws.close(); } catch (_) {} };
  }
  connectJetstream();

  setInterval(function () {
    var cutoff = Date.now() - WINDOW_MS;
    seenAt = seenAt.filter(function (t) { return t >= cutoff; });
    els.liveN.textContent = seenAt.length;
  }, 1000);

  // --- boot ---------------------------------------------------------------
  // Silent on the very first render (arriving via a shared /s/<seed> link
  // shouldn't dump confetti before the page has even painted) — every
  // generate click after that bursts normally.
  render(parseSeedFromPath() || randomSeed(), { silent: true });
})();
