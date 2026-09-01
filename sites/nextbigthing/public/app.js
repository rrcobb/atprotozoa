(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    crownWord: $("crown-word"),
    crownN: $("crown-n"),
    crownTarget: $("crown-target"),
    board: $("board"),
    liveN: $("live-n"),
    windowMin: $("window-min"),
    shareBluesky: $("share-bluesky"),
    shareImage: $("share-image"),
    copyLink: $("copy-link"),
    cardCanvas: $("card-canvas"),
    flock: $("flock"),
  };

  // --- honest trend tally -------------------------------------------------
  // Nothing here is manufactured: every word tallied is a word that showed
  // up in a real, live app.bsky.feed.post create event, counted once per
  // post it appeared in (not per occurrence — a spammy repeated word in one
  // post shouldn't outweigh ten different people saying something once).

  // 4 minutes: long enough for a real trend to separate itself from noise,
  // short enough that "right now" still means now. Recomputed fresh every
  // second regardless, so this is a product decision about what "trending"
  // means here, not a correctness cap — see notes on caps in
  // sites/buildthis/builder/INSTRUCTIONS.md.
  var WINDOW_SEC = 240;
  var buckets = new Array(WINDOW_SEC);

  var STOPWORDS = new Set([
    "the", "and", "for", "are", "but", "not", "you", "your", "with", "this",
    "that", "these", "those", "have", "has", "had", "having", "was", "were",
    "been", "being", "will", "would", "could", "should", "shall", "might",
    "must", "what", "which", "who", "whom", "whose", "when", "where", "why",
    "how", "all", "any", "both", "each", "few", "more", "most", "other",
    "some", "such", "only", "own", "same", "just", "very", "too", "also",
    "still", "again", "once", "here", "there", "about", "into", "through",
    "during", "before", "after", "above", "below", "between", "because",
    "while", "from", "they", "them", "their", "theirs", "then", "than",
    "does", "did", "doing", "done", "can", "cant", "dont", "wont", "didnt",
    "isnt", "wasnt", "arent", "youre", "theyre", "were", "ive", "ill", "id",
    "its", "lol", "lmao", "omg", "yeah", "okay", "well", "right", "know",
    "think", "one", "get", "got", "going", "go", "want", "need", "make",
    "made", "see", "said", "say", "says", "new", "good", "day", "today",
    "now", "like", "really", "actually", "literally", "thing", "things",
    "stuff", "gonna", "wanna", "gotta", "im", "hey", "yes", "youve", "weve",
    "theyve", "youll", "shes", "hes", "isn", "aren", "didn", "doesn",
    "wasn", "weren", "wouldn", "couldn", "shouldn", "won", "don",
    "over", "under", "off", "out", "our", "ours", "myself", "yourself",
    "himself", "herself", "itself", "ourselves", "themselves",
  ]);

  function nowSec() { return Math.floor(Date.now() / 1000); }

  function getBucket(sec) {
    var idx = ((sec % WINDOW_SEC) + WINDOW_SEC) % WINDOW_SEC;
    var b = buckets[idx];
    if (!b || b.sec !== sec) {
      b = { sec: sec, counts: new Map() };
      buckets[idx] = b;
    }
    return b;
  }

  // Returns a Set of distinct terms found in this one post, or null.
  function extractTerms(text) {
    if (!text) return null;
    var stripped = text
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/@[a-zA-Z0-9.-]+/g, " ");
    var terms = new Set();

    var tagRe = /#[a-zA-Z][a-zA-Z0-9_]{1,40}/g;
    var m;
    while ((m = tagRe.exec(stripped))) terms.add(m[0].toLowerCase());

    var wordRe = /[a-zA-Z][a-zA-Z''-]{2,}/g;
    while ((m = wordRe.exec(stripped))) {
      var w = m[0].toLowerCase().replace(/^['-]+|['-]+$/g, "");
      if (w.length < 4 || STOPWORDS.has(w)) continue;
      terms.add(w);
    }
    return terms.size ? terms : null;
  }

  function recordPost(text) {
    var terms = extractTerms(text);
    if (!terms) return null;
    var bucket = getBucket(nowSec());
    terms.forEach(function (term) {
      bucket.counts.set(term, (bucket.counts.get(term) || 0) + 1);
    });
    return terms;
  }

  function recomputeTotals() {
    var cutoff = nowSec() - WINDOW_SEC;
    var totals = new Map();
    for (var i = 0; i < buckets.length; i++) {
      var b = buckets[i];
      if (!b || b.sec < cutoff) continue;
      b.counts.forEach(function (v, k) { totals.set(k, (totals.get(k) || 0) + v); });
    }
    return totals;
  }

  // --- leaderboard / crown rendering --------------------------------------

  var crownedTerm = null;
  var crownedCount = 0;

  function renderBoard(entries) {
    var board = els.board;
    board.textContent = "";
    if (!entries.length) {
      var li = document.createElement("li");
      li.className = "empty";
      li.textContent = "waiting for the firehose…";
      board.appendChild(li);
      return;
    }
    var max = entries[0][1];
    entries.forEach(function (entry, i) {
      var term = entry[0], count = entry[1];
      var row = document.createElement("li");

      var rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = (i + 1) + ".";

      var barWrap = document.createElement("span");
      barWrap.className = "bar-wrap";
      var fill = document.createElement("span");
      fill.className = "bar-fill";
      fill.style.width = Math.max(4, Math.round((count / max) * 100)) + "%";
      var termSpan = document.createElement("span");
      termSpan.className = "term";
      termSpan.textContent = term;
      barWrap.appendChild(fill);
      barWrap.appendChild(termSpan);

      var countSpan = document.createElement("span");
      countSpan.className = "count";
      countSpan.textContent = count;

      row.appendChild(rank);
      row.appendChild(barWrap);
      row.appendChild(countSpan);
      board.appendChild(row);
    });
  }

  function shareUrl(term, count) {
    return "https://nextbigthing.bisks.net/s/" + encodeURIComponent(term) + "/" + count;
  }

  function buildShareText(term, count) {
    var url = shareUrl(term, count);
    var text = 'the next big thing on bluesky right now: "' + term + '" (' + count +
      " real posts in the last " + Math.round(WINDOW_SEC / 60) + " min, no hype added) " + url;
    if (text.length <= 300) return text;
    var suffix = " " + url;
    var max = 300 - suffix.length - 1;
    var head = 'the next big thing on bluesky right now: "' + term + '"';
    return head.slice(0, Math.max(0, max)).trim() + "…" + suffix;
  }

  function tick() {
    var cutoff = Date.now() - 10000;
    totalSeenAt = totalSeenAt.filter(function (t) { return t >= cutoff; });
    els.liveN.textContent = Math.round(totalSeenAt.length / 10);

    var totals = recomputeTotals();
    var sorted = Array.from(totals.entries()).sort(function (a, b) { return b[1] - a[1]; });
    renderBoard(sorted.slice(0, 8));

    if (sorted.length) {
      crownedTerm = sorted[0][0];
      crownedCount = sorted[0][1];
      els.crownWord.textContent = crownedTerm;
      els.crownN.textContent = crownedCount;
      els.shareBluesky.href = "https://bsky.app/intent/compose?text=" +
        encodeURIComponent(buildShareText(crownedTerm, crownedCount));
    } else {
      crownedTerm = null;
      crownedCount = 0;
      els.crownWord.textContent = "gathering the flock…";
      els.crownN.textContent = "0";
    }
  }

  els.windowMin.textContent = Math.round(WINDOW_SEC / 60);

  // --- live firehose ---------------------------------------------------------
  var totalSeenAt = [];
  var ws;
  function connectJetstream() {
    try {
      ws = new WebSocket("wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post");
    } catch (_) { return; }
    ws.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.kind === "commit" && msg.commit && msg.commit.operation === "create" && msg.commit.collection === "app.bsky.feed.post") {
          totalSeenAt.push(Date.now());
          var text = msg.commit.record && msg.commit.record.text;
          var terms = recordPost(text);
          if (terms) {
            if (crownedTerm && terms.has(crownedTerm)) {
              spawnTargeted();
            } else if (Math.random() < 0.12) {
              spawnAmbient();
            }
          }
        }
      } catch (_) {}
    };
    ws.onclose = function () { setTimeout(connectJetstream, 3000); };
    ws.onerror = function () { try { ws.close(); } catch (_) {} };
  }
  connectJetstream();
  setInterval(tick, 1000);

  // --- flock canvas: real posts drawn flying toward the crowned term --------

  var fctx = els.flock.getContext("2d");
  var particles = [];

  function resizeFlock() {
    els.flock.width = window.innerWidth;
    els.flock.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeFlock);
  resizeFlock();

  function edgeSpawnPoint() {
    var edge = Math.floor(Math.random() * 4);
    var w = window.innerWidth, h = window.innerHeight;
    if (edge === 0) return { x: Math.random() * w, y: -20 };
    if (edge === 1) return { x: w + 20, y: Math.random() * h };
    if (edge === 2) return { x: Math.random() * w, y: h + 20 };
    return { x: -20, y: Math.random() * h };
  }

  function spawnAmbient() {
    var p = edgeSpawnPoint();
    var w = window.innerWidth, h = window.innerHeight;
    var tx = Math.random() * w, ty = Math.random() * h;
    var dx = tx - p.x, dy = ty - p.y;
    var dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    particles.push({
      x: p.x, y: p.y,
      vx: (dx / dist) * 2.4, vy: (dy / dist) * 2.4,
      mode: "ambient", age: 0, life: 140 + Math.random() * 80,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  function spawnTargeted() {
    if (!els.crownTarget) return;
    var rect = els.crownTarget.getBoundingClientRect();
    var p = edgeSpawnPoint();
    particles.push({
      x: p.x, y: p.y,
      tx: rect.left + rect.width / 2, ty: rect.top + rect.height / 2,
      mode: "target", age: 0, life: 60 + Math.random() * 30,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  function drawButterfly(ctx, x, y, scale, color, age) {
    var flap = Math.sin(age * 0.6) * 0.5 + 0.5;
    var wing = (6 + flap * 3) * scale;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - wing, y - wing, x - wing * 1.3, y + 2);
    ctx.quadraticCurveTo(x - wing * 0.4, y + wing * 0.6, x, y);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + wing, y - wing, x + wing * 1.3, y + 2);
    ctx.quadraticCurveTo(x + wing * 0.4, y + wing * 0.6, x, y);
    ctx.fill();
  }

  function tickFlock() {
    fctx.clearRect(0, 0, els.flock.width, els.flock.height);
    particles = particles.filter(function (p) { return p.age < p.life; });
    particles.forEach(function (p) {
      p.age += 1;
      var t = p.age / p.life;
      if (p.mode === "target") {
        p.x += (p.tx - p.x) * 0.07;
        p.y += (p.ty - p.y) * 0.07 + Math.sin(p.age * 0.35 + p.wobble) * 1.4;
        fctx.globalAlpha = Math.max(0, 1 - t);
        drawButterfly(fctx, p.x, p.y, 1 - t * 0.25, "#1185fe", p.age);
      } else {
        p.x += p.vx + Math.sin(p.age * 0.2 + p.wobble) * 0.6;
        p.y += p.vy;
        fctx.globalAlpha = Math.max(0, (1 - t) * 0.32);
        drawButterfly(fctx, p.x, p.y, 0.6, "#9fc4ee", p.age);
      }
    });
    fctx.globalAlpha = 1;
    requestAnimationFrame(tickFlock);
  }
  requestAnimationFrame(tickFlock);

  // --- sharing -----------------------------------------------------------

  els.copyLink.addEventListener("click", function () {
    if (!crownedTerm) return;
    var url = shareUrl(crownedTerm, crownedCount);
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

  function drawCard(term, count) {
    var c = els.cardCanvas, ctx = c.getContext("2d");
    var W = c.width, H = c.height;
    var grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#eaf3ff");
    grad.addColorStop(1, "#bcdcff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#1185fe";
    ctx.font = "bold 56px sans-serif";
    ctx.fillText("nextbigthing", 60, 100);

    ctx.fillStyle = "#0b1f33";
    ctx.font = "24px sans-serif";
    ctx.fillText("the next big thing on bluesky, decided honestly", 60, 140);

    ctx.fillStyle = "#f5a623";
    ctx.font = "bold 68px sans-serif";
    wrapText(ctx, '"' + (term || "") + '"', 60, 260, W - 120, 78, 3);

    ctx.fillStyle = "#2fb88a";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText((count || 0) + " real posts mentioned it, live", 60, H - 140);

    ctx.fillStyle = "#57708c";
    ctx.font = "24px sans-serif";
    ctx.fillText(shareUrl(term || "", count || 0).replace("https://", ""), 60, H - 80);
  }

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      var probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (_) { return false; }
  }

  els.shareImage.addEventListener("click", function () {
    if (!crownedTerm) return;
    drawCard(crownedTerm, crownedCount);
    els.cardCanvas.toBlob(function (blob) {
      if (!blob) return;
      if (canShareFiles()) {
        var file = new File([blob], "nextbigthing.png", { type: "image/png" });
        navigator.share({ files: [file], text: buildShareText(crownedTerm, crownedCount), title: "nextbigthing" }).catch(function () {});
        return;
      }
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "nextbigthing.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, "image/png");
  });

  // --- boot ----------------------------------------------------------------
  // A /s/<term>/<count> link is a snapshot of the past, not a live feed —
  // show it immediately so the page isn't blank while Jetstream reconnects,
  // then let the very next real tick take over.
  (function primeFromShareLink() {
    var m = location.pathname.match(/^\/s\/([^/]+)\/([0-9]+)\/?$/);
    if (!m) return;
    var term = decodeURIComponent(m[1]);
    var count = parseInt(m[2], 10);
    if (!term || !Number.isFinite(count)) return;
    els.crownWord.textContent = term;
    els.crownN.textContent = count;
  })();
})();
