(function () {
  "use strict";

  // --- the space-filling tree -------------------------------------------
  //
  // The canvas starts as one empty rectangle. The first real post just
  // occupies it. Every post after that finds the LARGEST rectangle
  // currently on screen and splits it in two: the existing occupant keeps
  // one (smaller) half, the new post gets the other. That's the whole
  // mechanism — no layout engine, just repeated bisection, so the canvas
  // is always 100% full and every new arrival makes the average tile a
  // little smaller than the moment before.
  //
  // MIN_SPLIT is a real limit, not a guessed one (see the "question every
  // cap" order in sites/buildthis/builder/INSTRUCTIONS.md): below a few
  // pixels a rectangle can't usefully hold its own fill color or border
  // distinct from its neighbors, and the total number of tiles this
  // produces is already bounded by actual screen pixels, not a chosen
  // ceiling. Once nothing on screen is bigger than MIN_SPLIT, the canvas
  // is provably full — that's the moment the concept stops being about
  // *space* running out and starts being about posts *burying* each
  // other instead, which is the whole point of the piece.
  var MIN_SPLIT = 16;

  var field = document.getElementById("field");
  var fctx = field.getContext("2d");
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var root = null;
  var allLeaves = []; // every leaf ever created — bounded by screen pixels
  var heap = []; // max-heap of currently-splittable leaves, keyed by area

  function area(n) { return n.w * n.h; }

  function heapPush(n) {
    heap.push(n);
    var i = heap.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (area(heap[p]) >= area(heap[i])) break;
      var t = heap[p]; heap[p] = heap[i]; heap[i] = t;
      i = p;
    }
  }

  function heapPop() {
    if (!heap.length) return null;
    var top = heap[0];
    var last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      var i = 0;
      while (true) {
        var l = i * 2 + 1, r = i * 2 + 2, biggest = i;
        if (l < heap.length && area(heap[l]) > area(heap[biggest])) biggest = l;
        if (r < heap.length && area(heap[r]) > area(heap[biggest])) biggest = r;
        if (biggest === i) break;
        var t = heap[i]; heap[i] = heap[biggest]; heap[biggest] = t;
        i = biggest;
      }
    }
    return top;
  }

  function canSplit(n) {
    return (n.w >= MIN_SPLIT * 2 && n.h >= MIN_SPLIT) || (n.h >= MIN_SPLIT * 2 && n.w >= MIN_SPLIT);
  }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function colorFor(post) {
    var h = hashStr((post && (post.did + post.rkey)) || String(Math.random()));
    var hue = h % 360;
    return { hue: hue, css: "hsl(" + hue + ", 62%, 46%)" };
  }

  function makeLeaf(x, y, w, h, post) {
    var n = { x: x, y: y, w: w, h: h, post: post, children: null, sediment: 0, color: colorFor(post) };
    allLeaves.push(n);
    return n;
  }

  function resetTree() {
    root = makeLeaf(0, 0, field.width / DPR, field.height / DPR, null);
    allLeaves = [root];
    heap = [];
    if (canSplit(root)) heapPush(root);
  }

  // --- rendering -----------------------------------------------------------

  function truncateToWidth(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var lo = 0, hi = text.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid + 1;
      else hi = mid;
    }
    return text.slice(0, Math.max(0, lo - 1)).trimEnd() + "…";
  }

  function paintLeaf(n, opts) {
    var overwrite = !!(opts && opts.overwrite);
    fctx.save();
    fctx.globalAlpha = overwrite ? 0.55 : 1;
    fctx.fillStyle = n.color.css;
    fctx.fillRect(n.x, n.y, n.w, n.h);
    fctx.restore();

    if (n.w >= 3 && n.h >= 3) {
      fctx.strokeStyle = "rgba(11, 16, 23, 0.55)";
      fctx.lineWidth = 1;
      fctx.strokeRect(n.x + 0.5, n.y + 0.5, Math.max(0, n.w - 1), Math.max(0, n.h - 1));
    }

    // The tinier and the more times a tile's been written over, the less
    // legible its text gets — mirrors the concept directly: readability
    // degrades with volume, not just size.
    var readable = n.sediment <= 1 && n.w >= 46 && n.h >= 22;
    if (readable && n.post && n.post.text) {
      var fontSize = Math.max(9, Math.min(15, Math.min(n.h * 0.4, n.w * 0.11)));
      fctx.save();
      fctx.beginPath();
      fctx.rect(n.x + 3, n.y + 2, Math.max(0, n.w - 6), Math.max(0, n.h - 4));
      fctx.clip();
      fctx.fillStyle = "rgba(244, 241, 234, " + Math.max(0.4, 1 - n.sediment * 0.35) + ")";
      fctx.font = fontSize + "px ui-monospace, monospace";
      fctx.textBaseline = "top";
      var line = n.post.text.replace(/\s+/g, " ").trim();
      fctx.fillText(truncateToWidth(fctx, line, n.w - 8), n.x + 4, n.y + 3);
      fctx.restore();
    }
  }

  function paintAll() {
    fctx.clearRect(0, 0, field.width / DPR, field.height / DPR);
    (function walk(n) {
      if (n.children) { walk(n.children[0]); walk(n.children[1]); return; }
      paintLeaf(n);
    })(root);
  }

  // --- point lookup (for hover) --------------------------------------------

  function leafAt(px, py) {
    var n = root;
    while (n && n.children) {
      var a = n.children[0];
      n = (px >= a.x && px < a.x + a.w && py >= a.y && py < a.y + a.h) ? a : n.children[1];
    }
    return n;
  }

  // --- ingestion -------------------------------------------------------

  var stats = { placed: 0, buried: 0, startedAt: Date.now() };
  var recentAt = [];

  function ingest(post) {
    recentAt.push(Date.now());

    if (root.post === null && root.children === null) {
      root.post = post;
      root.color = colorFor(post);
      paintLeaf(root);
      stats.placed++;
      return;
    }

    var node = heapPop();
    if (node) {
      var vertical = node.w >= node.h;
      var ratio = 0.38 + Math.random() * 0.24;
      var a, b;
      if (vertical) {
        // Clamp to [MIN_SPLIT, node.w - MIN_SPLIT] rather than just the low
        // end — clamping only the low end let the *other* half dip below
        // MIN_SPLIT when node.w sat right at the 2*MIN_SPLIT boundary.
        var wa = Math.min(node.w - MIN_SPLIT, Math.max(MIN_SPLIT, node.w * ratio));
        a = makeLeaf(node.x, node.y, wa, node.h, node.post);
        b = makeLeaf(node.x + wa, node.y, node.w - wa, node.h, post);
      } else {
        var ha = Math.min(node.h - MIN_SPLIT, Math.max(MIN_SPLIT, node.h * ratio));
        a = makeLeaf(node.x, node.y, node.w, ha, node.post);
        b = makeLeaf(node.x, node.y + ha, node.w, node.h - ha, post);
      }
      node.children = [a, b];
      node.post = null;
      paintLeaf(a);
      paintLeaf(b);
      if (canSplit(a)) heapPush(a);
      if (canSplit(b)) heapPush(b);
      stats.placed++;
      return;
    }

    // Saturated: nothing left on screen is big enough to split. New
    // information keeps arriving anyway — it just buries something older.
    var target = allLeaves[(Math.random() * allLeaves.length) | 0];
    target.post = post;
    target.sediment++;
    target.color = colorFor(post);
    paintLeaf(target, { overwrite: true });
    stats.buried++;
  }

  // --- HUD -----------------------------------------------------------------

  var els = {
    count: document.getElementById("stat-count"),
    buried: document.getElementById("stat-buried"),
    elapsed: document.getElementById("stat-elapsed"),
    rate: document.getElementById("stat-rate"),
    toggle: document.getElementById("toggle"),
    shareBluesky: document.getElementById("share-bluesky"),
    shareImage: document.getElementById("share-image"),
    tooltip: document.getElementById("tooltip"),
    cardCanvas: document.getElementById("card-canvas"),
  };

  function fmtDuration(sec) {
    if (sec < 60) return sec + "s";
    var m = Math.floor(sec / 60);
    if (m < 60) return m + "m " + Math.floor(sec % 60) + "s";
    var h = Math.floor(m / 60);
    return h + "h " + (m % 60) + "m";
  }

  function shareUrl(count, seconds) {
    return "https://unread.bisks.net/s/" + count + "/" + seconds;
  }

  function buildShareText(count, seconds) {
    var url = shareUrl(count, seconds);
    var text = count + " posts have poured into unread.bisks.net in " + fmtDuration(seconds) +
      " since I opened it. I've read approximately none of them. " + url;
    if (text.length <= 300) return text;
    var suffix = " " + url;
    return ("" + count + " posts, " + fmtDuration(seconds) + ", zero read").slice(0, 300 - suffix.length - 1) + "…" + suffix;
  }

  function tick() {
    var total = stats.placed + stats.buried;
    var elapsedSec = Math.max(1, Math.round((Date.now() - stats.startedAt) / 1000));
    var cutoff = Date.now() - 10000;
    recentAt = recentAt.filter(function (t) { return t >= cutoff; });

    els.count.textContent = total;
    els.buried.textContent = stats.buried;
    els.elapsed.textContent = fmtDuration(elapsedSec);
    els.rate.textContent = (recentAt.length / 10).toFixed(1);

    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" +
      encodeURIComponent(buildShareText(total, elapsedSec));
  }

  // --- pause / resume --------------------------------------------------

  var paused = false;
  els.toggle.addEventListener("click", function () {
    paused = !paused;
    els.toggle.textContent = paused ? "resume" : "pause";
  });

  // --- hover tooltip -----------------------------------------------------

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  field.addEventListener("mousemove", function (ev) {
    var n = leafAt(ev.clientX, ev.clientY);
    if (!n || !n.post) { els.tooltip.hidden = true; return; }
    var who = n.post.did ? "@" + n.post.did.slice(0, 24) : "unknown";
    var link = n.post.did && n.post.rkey
      ? "https://bsky.app/profile/" + n.post.did + "/post/" + n.post.rkey
      : null;
    els.tooltip.innerHTML =
      '<span class="who">' + (link ? '<a href="' + link + '" target="_blank" rel="noopener" style="color:inherit;pointer-events:auto">' + who + "</a>" : who) +
      (n.sediment ? " · buried under " + n.sediment + " more since" : "") + "</span>" +
      (n.post.text ? escapeHtml(n.post.text.slice(0, 240)) : "(no text)");
    els.tooltip.style.left = ev.clientX + "px";
    els.tooltip.style.top = ev.clientY + "px";
    els.tooltip.hidden = false;
  });
  field.addEventListener("mouseleave", function () { els.tooltip.hidden = true; });

  // --- share card image ----------------------------------------------------

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      var probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (_) { return false; }
  }

  function drawCard(count, elapsedSec) {
    var c = els.cardCanvas, ctx = c.getContext("2d");
    var W = c.width, H = c.height;
    ctx.fillStyle = "#0b1017";
    ctx.fillRect(0, 0, W, H);
    // shrink the live field into the card as a texture sample of the pile-up
    var scale = Math.min(W / field.width, (H - 170) / field.height);
    var dw = field.width * scale, dh = field.height * scale;
    ctx.drawImage(field, (W - dw) / 2, 20, dw, dh);

    ctx.fillStyle = "rgba(11, 16, 23, 0.85)";
    ctx.fillRect(0, H - 150, W, 150);

    ctx.fillStyle = "#ff5d5d";
    ctx.font = "800 44px ui-monospace, monospace";
    ctx.fillText("unread", 50, H - 96);

    ctx.fillStyle = "#f4f1ea";
    ctx.font = "700 26px ui-monospace, monospace";
    ctx.fillText(count + " posts I will never read, " + fmtDuration(elapsedSec) + " in", 50, H - 56);

    ctx.fillStyle = "#5ddcff";
    ctx.font = "20px ui-monospace, monospace";
    ctx.fillText("unread.bisks.net", 50, H - 24);
  }

  els.shareImage.addEventListener("click", function () {
    var total = stats.placed + stats.buried;
    var elapsedSec = Math.max(1, Math.round((Date.now() - stats.startedAt) / 1000));
    drawCard(total, elapsedSec);
    els.cardCanvas.toBlob(function (blob) {
      if (!blob) return;
      if (canShareFiles()) {
        var file = new File([blob], "unread.png", { type: "image/png" });
        navigator.share({ files: [file], text: buildShareText(total, elapsedSec), title: "unread" }).catch(function () {});
        return;
      }
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "unread.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, "image/png");
  });

  // --- sizing ------------------------------------------------------------

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    field.width = Math.round(w * DPR);
    field.height = Math.round(h * DPR);
    field.style.width = w + "px";
    field.style.height = h + "px";
    fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    resetTree();
    paintAll();
  }
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 200);
  });
  resize();

  // --- live firehose ---------------------------------------------------

  var ws;
  function connectJetstream() {
    try {
      ws = new WebSocket("wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post");
    } catch (_) { return; }
    ws.onmessage = function (ev) {
      if (paused) return;
      try {
        var msg = JSON.parse(ev.data);
        if (msg.kind === "commit" && msg.commit && msg.commit.operation === "create" && msg.commit.collection === "app.bsky.feed.post") {
          var text = msg.commit.record && msg.commit.record.text;
          if (typeof text === "string" && text.trim().length > 0) {
            ingest({ text: text, did: msg.did, rkey: msg.commit.rkey });
          }
        }
      } catch (_) {}
    };
    ws.onclose = function () { setTimeout(connectJetstream, 3000); };
    ws.onerror = function () { try { ws.close(); } catch (_) {} };
  }
  connectJetstream();
  setInterval(tick, 1000);
  tick();
})();
