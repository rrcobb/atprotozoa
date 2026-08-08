// thewall — client. An infinite pan/zoom corkboard backed by one Durable
// Object per board id (see src/index.ts). This file owns: board-id routing,
// the camera (pan/zoom), rendering cards + yarn from local state, drag /
// connect-mode interactions, importing a skeet from the public AppView, and
// a lightweight poll loop that keeps everyone looking at the same board a
// "multiplayer, encouraged but not required" experience.
(function () {
  "use strict";

  var PUB = "https://public.api.bsky.app/xrpc";
  var WORLD_OFFSET = 20000; // #yarn's local origin sits at world (-20000,-20000)
  var MIN_ZOOM = 0.25, MAX_ZOOM = 3;
  var POLL_MS = 3000;

  // ---- board id / routing ---------------------------------------------
  function boardIdFromPath() {
    var m = /^\/b\/([a-z0-9]{4,32})\/?$/.exec(location.pathname);
    return m ? m[1] : null;
  }
  function randomBoardId() {
    var bytes = crypto.getRandomValues(new Uint8Array(10));
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] % 36).toString(36);
    return s;
  }
  var BOARD_ID = boardIdFromPath();
  if (!BOARD_ID) {
    BOARD_ID = randomBoardId();
    history.replaceState(null, "", "/b/" + BOARD_ID);
  }
  var API = "/api/board/" + BOARD_ID;

  function shareUrl() {
    return "https://thewall.bisks.net/b/" + BOARD_ID;
  }

  // ---- tiny deterministic hash (mirrors src/index.ts's hash()) --------
  function hashStr(s) {
    var h = 1779033703 ^ s.length;
    for (var i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return (h ^ (h >>> 16)) >>> 0;
  }

  // ---- API client --------------------------------------------------------
  function apiGet() {
    return fetch(API).then(function (r) { return r.json(); });
  }
  function apiAddCard(payload) {
    return fetch(API + "/cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.error || "could not pin that");
        return data;
      });
    });
  }
  function apiUpdateCard(id, payload) {
    return fetch(API + "/cards/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(function () {});
  }
  function apiRemoveCard(id) {
    return fetch(API + "/cards/" + encodeURIComponent(id), { method: "DELETE" }).catch(function () {});
  }
  function apiAddEdge(a, b) {
    return fetch(API + "/edges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: a, b: b }),
    }).catch(function () {});
  }
  function apiRemoveEdge(a, b) {
    return fetch(API + "/edges", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: a, b: b }),
    }).catch(function () {});
  }

  // ---- skeet import: parse a post link/uri, resolve + fetch via the
  // public, unauthenticated AppView (no login needed — same pattern as
  // sites/commonplace, sites/quotebucket) ---------------------------------
  function parsePostRef(raw) {
    raw = String(raw || "").trim();
    var m = /^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([a-zA-Z0-9._~-]+)/.exec(raw);
    if (m) return { did: m[1], rkey: m[2] };
    m = /bsky\.app\/profile\/([^/]+)\/post\/([a-zA-Z0-9._~-]+)/.exec(raw);
    if (m) return { handleOrDid: decodeURIComponent(m[1]), rkey: m[2] };
    return null;
  }

  function jget(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("bluesky didn't have that (" + r.status + ")");
      return r.json();
    });
  }

  function fetchSkeet(ref) {
    var didP;
    if (ref.did) {
      didP = Promise.resolve(ref.did);
    } else if (/^did:/.test(ref.handleOrDid)) {
      didP = Promise.resolve(ref.handleOrDid);
    } else {
      didP = jget(PUB + "/com.atproto.identity.resolveHandle?handle=" + encodeURIComponent(ref.handleOrDid))
        .then(function (d) { return d.did; })
        .catch(function () { throw new Error("couldn't resolve that handle"); });
    }
    return didP.then(function (did) {
      var uri = "at://" + did + "/app.bsky.feed.post/" + ref.rkey;
      var url = new URL(PUB + "/app.bsky.feed.getPosts");
      url.searchParams.append("uris", uri);
      return jget(url.toString()).then(function (data) {
        var post = data.posts && data.posts[0];
        if (!post) throw new Error("post not found — deleted, or the account is private?");
        return {
          uri: post.uri,
          text: (post.record && post.record.text) || "",
          authorHandle: post.author.handle,
          authorDisplayName: post.author.displayName || post.author.handle,
          authorAvatar: post.author.avatar || "",
          postedAt: (post.record && post.record.createdAt) || post.indexedAt || "",
        };
      });
    });
  }

  // ---- state ---------------------------------------------------------
  var state = { cards: new Map(), edges: new Set(), version: -1, full: false };
  var camera = { x: 0, y: 0, zoom: 1 };
  var draggingId = null;
  var connecting = false;
  var pickedForEdge = null;

  // ---- elements --------------------------------------------------------
  var els = {
    boardwrap: document.getElementById("boardwrap"),
    world: document.getElementById("world"),
    cards: document.getElementById("cards"),
    yarn: document.getElementById("yarn"),
    empty: document.getElementById("emptyMsg"),
    noteForm: document.getElementById("noteForm"),
    noteText: document.getElementById("noteText"),
    noteBtn: document.getElementById("noteBtn"),
    skeetForm: document.getElementById("skeetForm"),
    skeetUrl: document.getElementById("skeetUrl"),
    skeetBtn: document.getElementById("skeetBtn"),
    skeetHint: document.getElementById("skeetHint"),
    connectMode: document.getElementById("connectMode"),
    connectHint: document.getElementById("connectHint"),
    zoomReset: document.getElementById("zoomReset"),
    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
    cardCount: document.getElementById("cardCount"),
    edgeCount: document.getElementById("edgeCount"),
    fullNote: document.getElementById("fullNote"),
    shareCanvas: document.getElementById("shareCanvas"),
    shareBluesky: document.getElementById("shareBluesky"),
    shareDownload: document.getElementById("shareDownload"),
    shareNative: document.getElementById("shareNative"),
    copyLink: document.getElementById("copyLink"),
    status: document.getElementById("status"),
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function svgEl(tag, attrs) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  // ---- camera ----------------------------------------------------------
  function applyCameraTransform() {
    els.world.style.transform = "translate(" + camera.x + "px, " + camera.y + "px) scale(" + camera.zoom + ")";
  }

  function viewCenterWorld() {
    var rect = els.boardwrap.getBoundingClientRect();
    return {
      x: (rect.width / 2 - camera.x) / camera.zoom,
      y: (rect.height / 2 - camera.y) / camera.zoom,
    };
  }

  function zoomAbout(localX, localY, newZoom) {
    newZoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
    var worldX = (localX - camera.x) / camera.zoom;
    var worldY = (localY - camera.y) / camera.zoom;
    camera.zoom = newZoom;
    camera.x = localX - worldX * newZoom;
    camera.y = localY - worldY * newZoom;
    applyCameraTransform();
  }

  function fitBoard() {
    var rect = els.boardwrap.getBoundingClientRect();
    if (!state.cards.size) {
      camera = { x: rect.width / 2, y: rect.height / 2, zoom: 1 };
      applyCameraTransform();
      return;
    }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.cards.forEach(function (c) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    });
    var pad = 160;
    var w = Math.max(1, maxX - minX + pad * 2), h = Math.max(1, maxY - minY + pad * 2);
    var zoom = clamp(Math.min(rect.width / w, rect.height / h), MIN_ZOOM, 1.4);
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    camera = { x: rect.width / 2 - cx * zoom, y: rect.height / 2 - cy * zoom, zoom: zoom };
    applyCameraTransform();
  }

  // ---- panning + pinch-zoom (pointer events) ----------------------------
  var activePointers = new Map();
  var panState = null;
  var pinchActive = false;

  els.boardwrap.addEventListener("pointerdown", function (ev) {
    if (ev.target.closest(".card")) return;
    if (pickedForEdge !== null) { pickedForEdge = null; highlightPicked(); }
    activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try { els.boardwrap.setPointerCapture(ev.pointerId); } catch (e) {}
    if (activePointers.size === 1) {
      panState = { id: ev.pointerId, startX: ev.clientX, startY: ev.clientY, camX: camera.x, camY: camera.y };
      els.boardwrap.classList.add("panning");
    } else if (activePointers.size >= 2) {
      panState = null;
      pinchActive = true;
    }
  });

  els.boardwrap.addEventListener("pointermove", function (ev) {
    if (!activePointers.has(ev.pointerId)) return;
    activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinchActive && activePointers.size >= 2) {
      var pts = Array.from(activePointers.values()).slice(0, 2);
      var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      var midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
      var rect = els.boardwrap.getBoundingClientRect();
      var localX = midX - rect.left, localY = midY - rect.top;
      if (pinchActive.lastDist) {
        var newZoom = camera.zoom * (dist / pinchActive.lastDist);
        zoomAbout(localX, localY, newZoom);
      }
      pinchActive.lastDist = dist;
      return;
    }
    if (panState && ev.pointerId === panState.id) {
      camera.x = panState.camX + (ev.clientX - panState.startX);
      camera.y = panState.camY + (ev.clientY - panState.startY);
      applyCameraTransform();
    }
  });

  function endPointer(ev) {
    activePointers.delete(ev.pointerId);
    try { els.boardwrap.releasePointerCapture(ev.pointerId); } catch (e) {}
    if (activePointers.size < 2) pinchActive = false;
    if (activePointers.size === 0) {
      panState = null;
      els.boardwrap.classList.remove("panning");
    } else if (activePointers.size === 1) {
      var entry = Array.from(activePointers.entries())[0];
      panState = { id: entry[0], startX: entry[1].x, startY: entry[1].y, camX: camera.x, camY: camera.y };
    }
  }
  els.boardwrap.addEventListener("pointerup", endPointer);
  els.boardwrap.addEventListener("pointercancel", endPointer);

  els.boardwrap.addEventListener("wheel", function (ev) {
    ev.preventDefault();
    var rect = els.boardwrap.getBoundingClientRect();
    var localX = ev.clientX - rect.left, localY = ev.clientY - rect.top;
    if (ev.ctrlKey) {
      zoomAbout(localX, localY, camera.zoom * Math.exp(-ev.deltaY * 0.012));
    } else {
      camera.x -= ev.deltaX;
      camera.y -= ev.deltaY;
      applyCameraTransform();
    }
  }, { passive: false });

  els.zoomIn.addEventListener("click", function () {
    var rect = els.boardwrap.getBoundingClientRect();
    zoomAbout(rect.width / 2, rect.height / 2, camera.zoom * 1.25);
  });
  els.zoomOut.addEventListener("click", function () {
    var rect = els.boardwrap.getBoundingClientRect();
    zoomAbout(rect.width / 2, rect.height / 2, camera.zoom * 0.8);
  });
  els.zoomReset.addEventListener("click", fitBoard);
  window.addEventListener("resize", debounce(function () {}, 150));
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  // ---- yarn (svg paths) --------------------------------------------------
  function edgePathD(ca, cb) {
    var ax = ca.x + WORLD_OFFSET, ay = ca.y + WORLD_OFFSET;
    var bx = cb.x + WORLD_OFFSET, by = cb.y + WORLD_OFFSET;
    var mx = (ax + bx) / 2, my = (ay + by) / 2;
    var dx = bx - ax, dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len;
    var key = ca.id < cb.id ? ca.id + cb.id : cb.id + ca.id;
    var h = hashStr(key);
    var sag = ((h % 1000) / 1000 - 0.5) * Math.min(80, len * 0.35);
    var cx = mx + nx * sag, cy = my + ny * sag + Math.min(len * 0.06, 16);
    return "M " + ax + " " + ay + " Q " + cx + " " + cy + " " + bx + " " + by;
  }

  function updateEdgePathsForCard(cardId) {
    state.edges.forEach(function (key) {
      var parts = key.split("|");
      if (parts[0] !== cardId && parts[1] !== cardId) return;
      var ca = state.cards.get(parts[0]), cb = state.cards.get(parts[1]);
      if (!ca || !cb) return;
      var path = els.yarn.querySelector('path[data-edge="' + key + '"]');
      if (path) path.setAttribute("d", edgePathD(ca, cb));
    });
  }

  // ---- rendering ---------------------------------------------------------
  function positionCardEl(el, card) {
    el.style.left = card.x + "px";
    el.style.top = card.y + "px";
    el.style.transform = "translate(-50%, -50%) rotate(" + card.rot.toFixed(1) + "deg)";
  }

  function buildCardEl(card) {
    var el = document.createElement("div");
    el.className = "card " + card.kind;
    el.dataset.id = card.id;
    el.style.background = card.color;
    positionCardEl(el, card);

    var pin = document.createElement("div");
    pin.className = "pin";
    pin.style.background = card.pinColor;
    el.appendChild(pin);

    var rm = document.createElement("button");
    rm.className = "rm";
    rm.type = "button";
    rm.title = "unpin";
    rm.textContent = "✕";
    rm.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
    rm.addEventListener("click", function (ev) {
      ev.stopPropagation();
      removeCardLocal(card.id);
    });
    el.appendChild(rm);

    if (card.kind === "skeet") {
      var head = document.createElement("div");
      head.className = "skeet-head";
      var img = document.createElement("img");
      img.src = card.authorAvatar || "";
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", function () { img.style.visibility = "hidden"; });
      var who = document.createElement("div");
      who.className = "who";
      var name = document.createElement("div");
      name.className = "name";
      name.textContent = card.authorDisplayName || card.authorHandle || "";
      var handle = document.createElement("div");
      handle.className = "handle";
      handle.textContent = "@" + (card.authorHandle || "");
      who.appendChild(name);
      who.appendChild(handle);
      head.appendChild(img);
      head.appendChild(who);
      el.appendChild(head);

      var text = document.createElement("div");
      text.className = "skeet-text";
      text.textContent = card.text;
      el.appendChild(text);

      var link = document.createElement("a");
      link.className = "skeet-link";
      link.href = "https://bsky.app/profile/" + (card.authorHandle || "") + "/post/" + String(card.uri).split("/").pop();
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "view on bluesky →";
      link.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
      el.appendChild(link);

      var mark = document.createElement("span");
      mark.className = "skeet-mark";
      mark.textContent = "🦋";
      el.appendChild(mark);
    } else {
      var txt = document.createElement("div");
      txt.textContent = card.text;
      el.appendChild(txt);
    }

    el.addEventListener("pointerdown", function (ev) {
      if (ev.target.closest(".rm") || ev.target.closest(".skeet-link")) return;
      ev.stopPropagation();
      if (connecting) {
        handleConnectPick(card.id);
        return;
      }
      startCardDrag(ev, el, card);
    });

    return el;
  }

  function startCardDrag(ev, el, card) {
    try { el.setPointerCapture(ev.pointerId); } catch (e) {}
    el.classList.add("dragging");
    var startScreenX = ev.clientX, startScreenY = ev.clientY;
    var startWorldX = card.x, startWorldY = card.y;
    draggingId = card.id;

    function onMove(mv) {
      if (mv.pointerId !== ev.pointerId) return;
      card.x = startWorldX + (mv.clientX - startScreenX) / camera.zoom;
      card.y = startWorldY + (mv.clientY - startScreenY) / camera.zoom;
      positionCardEl(el, card);
      updateEdgePathsForCard(card.id);
    }
    function onUp(up) {
      if (up.pointerId !== ev.pointerId) return;
      try { el.releasePointerCapture(up.pointerId); } catch (e) {}
      el.classList.remove("dragging");
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      draggingId = null;
      apiUpdateCard(card.id, { x: card.x, y: card.y });
    }
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  }

  function highlightPicked() {
    var nodes = els.cards.querySelectorAll(".card");
    nodes.forEach(function (n) {
      n.classList.toggle("pickable", connecting && n.dataset.id !== pickedForEdge);
      n.classList.toggle("picked", connecting && n.dataset.id === pickedForEdge);
    });
  }

  function handleConnectPick(id) {
    if (!connecting) return;
    if (pickedForEdge === null) {
      pickedForEdge = id;
      highlightPicked();
      return;
    }
    if (pickedForEdge === id) {
      pickedForEdge = null;
      highlightPicked();
      return;
    }
    var a = pickedForEdge, b = id;
    pickedForEdge = null;
    var key = a < b ? a + "|" + b : b + "|" + a;
    var existed = state.edges.has(key);
    if (existed) state.edges.delete(key); else state.edges.add(key);
    renderAll();
    if (existed) apiRemoveEdge(a, b); else apiAddEdge(a, b);
  }

  function removeCardLocal(id) {
    state.cards.delete(id);
    state.edges.forEach(function (key) {
      var parts = key.split("|");
      if (parts[0] === id || parts[1] === id) state.edges.delete(key);
    });
    if (pickedForEdge === id) pickedForEdge = null;
    renderAll();
    apiRemoveCard(id);
  }

  function renderAll() {
    els.cardCount.textContent = state.cards.size;
    els.edgeCount.textContent = state.edges.size;
    els.empty.style.display = state.cards.size ? "none" : "flex";
    els.fullNote.style.display = state.full ? "" : "none";
    els.noteBtn.disabled = state.full;
    els.skeetBtn.disabled = state.full;

    els.yarn.innerHTML = "";
    state.edges.forEach(function (key) {
      var parts = key.split("|");
      var ca = state.cards.get(parts[0]), cb = state.cards.get(parts[1]);
      if (!ca || !cb) return;
      els.yarn.appendChild(svgEl("path", {
        d: edgePathD(ca, cb),
        "data-edge": key,
        stroke: "#c81e1e",
        "stroke-width": 2.2,
        fill: "none",
        opacity: 0.85,
        "stroke-linecap": "round",
      }));
    });

    els.cards.innerHTML = "";
    state.cards.forEach(function (card) {
      els.cards.appendChild(buildCardEl(card));
    });
    highlightPicked();
    updateShare();
  }

  // ---- connect mode toggle ------------------------------------------------
  els.connectMode.addEventListener("click", function () {
    connecting = !connecting;
    pickedForEdge = null;
    els.connectMode.classList.toggle("on", connecting);
    els.boardwrap.classList.toggle("connecting", connecting);
    els.connectHint.textContent = connecting
      ? "connect mode: click a card, then click a second card to string yarn between them (click either again to cancel). click ✕ or press Esc to stop."
      : "drag a card to move it. click 🧷 connect mode, then click two cards to string yarn between them (click again to cut it).";
    highlightPicked();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (pickedForEdge !== null) { pickedForEdge = null; highlightPicked(); return; }
    if (connecting) els.connectMode.click();
  });

  // ---- add note / import skeet --------------------------------------------
  function jitteredCenter() {
    var c = viewCenterWorld();
    return { x: c.x + (Math.random() - 0.5) * 160, y: c.y + (Math.random() - 0.5) * 160 };
  }

  els.noteForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var text = els.noteText.value.trim();
    if (!text || state.full) return;
    els.noteBtn.disabled = true;
    var pos = jitteredCenter();
    apiAddCard({ kind: "note", text: text, x: pos.x, y: pos.y })
      .then(function (res) {
        state.cards.set(res.card.id, res.card);
        state.version = res.version;
        els.noteText.value = "";
        renderAll();
      })
      .catch(function (e) { showStatus(e.message || "could not pin that", true); })
      .finally(function () { els.noteBtn.disabled = state.full; });
  });

  function setSkeetHint(msg, isErr) {
    els.skeetHint.textContent = msg;
    els.skeetHint.style.color = isErr ? "#ff8f6b" : "";
  }

  els.skeetForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var raw = els.skeetUrl.value.trim();
    if (!raw || state.full) return;
    var ref = parsePostRef(raw);
    if (!ref) {
      setSkeetHint("couldn't read that as a post link — paste the full bsky.app URL or an at:// uri.", true);
      return;
    }
    els.skeetBtn.disabled = true;
    setSkeetHint("fetching…", false);
    fetchSkeet(ref)
      .then(function (meta) {
        var pos = jitteredCenter();
        return apiAddCard(Object.assign({ kind: "skeet", x: pos.x, y: pos.y }, meta));
      })
      .then(function (res) {
        state.cards.set(res.card.id, res.card);
        state.version = res.version;
        els.skeetUrl.value = "";
        setSkeetHint("works with any public post — paste the link from the share menu.", false);
        renderAll();
      })
      .catch(function (e) { setSkeetHint(e.message || "could not load that post", true); })
      .finally(function () { els.skeetBtn.disabled = state.full; });
  });

  function showStatus(msg, isErr) {
    els.status.textContent = msg;
    els.status.className = "msg" + (isErr ? " err" : "");
    setTimeout(function () { els.status.textContent = ""; els.status.className = "msg"; }, 3000);
  }

  // ---- server sync ---------------------------------------------------
  function applyServerSnapshot(data) {
    state.cards = new Map(data.cards.map(function (c) { return [c.id, c]; }));
    state.edges = new Set(data.edges.map(function (e) { return e[0] < e[1] ? e[0] + "|" + e[1] : e[1] + "|" + e[0]; }));
    state.full = !!data.full;
    state.version = data.version;
  }

  function loadBoard() {
    return apiGet().then(function (data) {
      applyServerSnapshot(data);
      fitBoard();
      renderAll();
    });
  }

  function pollBoard() {
    if (draggingId) return;
    apiGet().then(function (data) {
      if (data.version === state.version) return;
      applyServerSnapshot(data);
      renderAll();
    }).catch(function () {});
  }
  setInterval(pollBoard, POLL_MS);

  // ---- share ---------------------------------------------------------
  function buildShareText() {
    var url = shareUrl();
    var n = state.cards.size, m = state.edges.size;
    if (!n) return "an empty wall. the conspiracy has not yet begun.\n\n" + url;
    var lead = "my wall: " + n + " pinned, " + m + " thread" + (m === 1 ? "" : "s") + ". it's all connected — and you can add to it too.";
    var budget = 300 - (url.length + 2);
    if (lead.length > budget) lead = lead.slice(0, Math.max(0, budget - 1)) + "…";
    return lead + "\n\n" + url;
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text).split(" ");
    var line = "", cy = y, lines = 0;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (line && ctx.measureText(test).width > maxWidth) {
        ctx.fillText(line, x, cy);
        line = words[i];
        cy += lineHeight;
        lines++;
        if (lines >= maxLines - 1) { line = line + "…"; break; }
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
  }

  var CARD_COLORS = ["#f2e8c9", "#f6f0df", "#ecd9a6", "#f3d9de", "#d7e6ee", "#e6ecd2"];
  var PIN_COLORS = ["#d1263b", "#2560c4", "#e0a622", "#2a9d4f", "#7c3aed"];

  function drawShareCard() {
    var canvas = els.shareCanvas;
    var ctx = canvas.getContext("2d");
    var W = canvas.width, H = canvas.height;

    ctx.fillStyle = "#3a2415";
    ctx.fillRect(0, 0, W, H);
    var bx = 24, by = 24, bw = W - 48, bh = H - 48;
    var grad = ctx.createLinearGradient(0, by, 0, by + bh);
    grad.addColorStop(0, "#c69a5c");
    grad.addColorStop(1, "#a97e42");
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw, bh);

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    for (var i = 0; i < 260; i++) {
      var px = bx + Math.random() * bw, py = by + Math.random() * bh;
      ctx.beginPath();
      ctx.arc(px, py, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    var sample = Array.from(state.cards.values()).slice(0, 6);
    var pts = [];
    var cols = 3, rows = 2;
    var cellW = bw / cols, cellH = bh / rows;
    sample.forEach(function (c, idx) {
      var col = idx % cols, row = Math.floor(idx / cols);
      var jx = (Math.random() - 0.5) * cellW * 0.3;
      var jy = (Math.random() - 0.5) * cellH * 0.25;
      var cx = bx + cellW * col + cellW / 2 + jx;
      var cy = by + cellH * row + cellH / 2 + jy;
      pts.push({ x: cx, y: cy, rot: c.rot, card: c });
    });

    ctx.strokeStyle = "#c81e1e";
    ctx.lineWidth = 3;
    for (var e = 1; e < pts.length; e++) {
      var a = pts[e], b = pts[Math.floor(Math.random() * e)];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      var mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 40;
      var my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 40;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
    }

    pts.forEach(function (p, idx) {
      var c = p.card;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      var cw = 190, ch = 100;
      ctx.fillStyle = c.kind === "skeet" ? "#fbfaf7" : CARD_COLORS[idx % CARD_COLORS.length];
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = "#1c1c1c";
      ctx.textAlign = "left";
      if (c.kind === "skeet") {
        ctx.font = "700 13px ui-monospace, monospace";
        ctx.fillStyle = "#5b6b7a";
        ctx.fillText("🦋 @" + (c.authorHandle || ""), -cw / 2 + 12, -ch / 2 + 20);
        ctx.font = "600 15px ui-monospace, monospace";
        ctx.fillStyle = "#14181c";
        wrapCanvasText(ctx, c.text, -cw / 2 + 12, -ch / 2 + 42, cw - 24, 19, 3);
      } else {
        ctx.font = "700 17px ui-monospace, monospace";
        wrapCanvasText(ctx, c.text, -cw / 2 + 12, -ch / 2 + 26, cw - 24, 21, 4);
      }
      ctx.beginPath();
      ctx.fillStyle = PIN_COLORS[idx % PIN_COLORS.length];
      ctx.arc(0, -ch / 2 - 2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.textAlign = "left";
    ctx.fillStyle = "#fff2ea";
    ctx.font = "800 44px ui-monospace, monospace";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8;
    ctx.fillText("the wall", bx + 30, by + 56);
    ctx.shadowBlur = 0;

    ctx.font = "700 20px ui-monospace, monospace";
    ctx.fillStyle = "#ffe4d6";
    ctx.textAlign = "right";
    ctx.fillText("thewall.bisks.net", bx + bw - 24, by + bh - 20);
  }

  function updateShare() {
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText());
    drawShareCard();
  }

  els.shareDownload.addEventListener("click", function () {
    els.shareCanvas.toBlob(function (blob) {
      if (!blob) return;
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "thewall.png";
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  });

  els.copyLink.addEventListener("click", function () {
    var url = shareUrl();
    var done = function () { showStatus("link copied — anyone who opens it can add to this wall."); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { prompt("copy this link:", url); });
    } else {
      prompt("copy this link:", url);
    }
  });

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      var probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (e) { return false; }
  }
  if (canShareFiles()) {
    els.shareNative.style.display = "";
    els.shareNative.addEventListener("click", function () {
      els.shareCanvas.toBlob(function (blob) {
        if (!blob) return;
        var file = new File([blob], "thewall.png", { type: "image/png" });
        navigator.share({ files: [file], text: buildShareText(), title: "the wall" }).catch(function () {});
      }, "image/png");
    });
  }

  // ---- boot ---------------------------------------------------------
  applyCameraTransform();
  loadBoard();
})();
