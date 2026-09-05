// orrery — draws every sites/*/site.json manifest (public/data/fleet.json)
// as a tiny solar system. One canvas, one render loop, no framework and no
// deps: 582 dots redraw at 60fps trivially on plain 2D canvas.
//
// Layout: six fixed orbits by type (toy/game/tool/joke/explainer/art),
// leftover types fold into a seventh "other" orbit. Within an orbit, a
// site's angle is index * the golden angle (a sunflower-seed fill, spreads
// hundreds of points on a ring without exact overlaps) and its radius gets
// a small per-site jitter (hashed from its name, stable across reloads) so
// a ring reads as a fuzzy band instead of a perfect circle. Orbital speed
// scales with 1/sqrt(radius), same shape as Kepler's third law, so inner
// orbits visibly spin faster than outer ones.

(function () {
  "use strict";

  const TYPE_ORDER = ["toy", "game", "tool", "joke", "explainer", "art", "other"];
  const TYPE_LABEL = {
    toy: "toy",
    game: "game",
    tool: "tool",
    joke: "joke",
    explainer: "explainer",
    art: "art",
    other: "other",
  };

  const RING_START = 70;
  const RING_GAP = 58;
  const JITTER = 15;
  const GOLDEN_ANGLE = 2.39996323;
  const SUN_RADIUS = 15;
  const DOT_RADIUS = 2.6;
  const ANGULAR_BASE = 5.2; // speed = ANGULAR_BASE / sqrt(radius); tuned by eye

  const canvas = document.getElementById("sky");
  const ctx = canvas.getContext("2d");
  const cardEl = document.getElementById("card");
  const legendEl = document.getElementById("legend");
  const countEl = document.getElementById("count");
  const footerCountEl = document.getElementById("footer-count");
  const searchEl = document.getElementById("search");
  const selectedEl = document.getElementById("selected");
  const selectedTitle = document.getElementById("selected-title");
  const selectedBlurb = document.getElementById("selected-blurb");
  const selectedMeta = document.getElementById("selected-meta");
  const selectedVisit = document.getElementById("selected-visit");
  const selectedShare = document.getElementById("selected-share");
  const selectedClose = document.getElementById("selected-close");
  const shareLink = document.getElementById("share-link");

  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let width = 0, height = 0;
  let sites = [];
  let hidden = new Set(); // types toggled off via legend
  let query = "";
  let hoverSite = null;
  let selectedSite = null;
  let positions = new Map(); // name -> {x, y, screenX, screenY, r}

  const cam = { x: 0, y: 0, zoom: 1 };
  let drag = null;

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296; // 0..1
  }

  function typeColor(type) {
    return getComputedStyle(document.documentElement).getPropertyValue("--type-" + type).trim() || "#6b6a63";
  }

  function layout(list) {
    const ringIndexOf = {};
    TYPE_ORDER.forEach((t, i) => (ringIndexOf[t] = i));
    const counters = {};
    for (const s of list) {
      const ring = ringIndexOf[s.type] ?? ringIndexOf.other;
      const idx = (counters[s.type] = (counters[s.type] || 0) + 1) - 1;
      const j = hash(s.name);
      const radius = RING_START + ring * RING_GAP + (j - 0.5) * 2 * JITTER;
      const baseAngle = idx * GOLDEN_ANGLE + j * Math.PI * 2 * 0.05;
      const speed = ANGULAR_BASE / Math.sqrt(RING_START + ring * RING_GAP);
      s._ring = ring;
      s._radius = radius;
      s._baseAngle = baseAngle;
      s._speed = speed;
      s._color = typeColor(s.type);
    }
  }

  function worldToScreen(x, y) {
    return [width / 2 + (x - cam.x) * cam.zoom, height / 2 + (y - cam.y) * cam.zoom];
  }
  function screenToWorld(sx, sy) {
    return [(sx - width / 2) / cam.zoom + cam.x, (sy - height / 2) / cam.zoom + cam.y];
  }

  function matchesQuery(s) {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      (s.by && s.by.toLowerCase().includes(q))
    );
  }

  function draw(t) {
    ctx.clearRect(0, 0, width, height);

    // orbit rings, faint
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i < TYPE_ORDER.length; i++) {
      const r = RING_START + i * RING_GAP;
      const [cx, cy] = worldToScreen(0, 0);
      ctx.beginPath();
      ctx.arc(cx, cy, r * cam.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }

    // sun
    {
      const [cx, cy] = worldToScreen(0, 0);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, SUN_RADIUS * cam.zoom * 2.4);
      grad.addColorStop(0, "rgba(255, 230, 160, 0.9)");
      grad.addColorStop(1, "rgba(255, 230, 160, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, SUN_RADIUS * cam.zoom * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffe6a0";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3, SUN_RADIUS * cam.zoom * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }

    positions.clear();
    const anyQuery = !!query;
    for (const s of sites) {
      const angle = s._baseAngle + t * s._speed;
      const wx = Math.cos(angle) * s._radius;
      const wy = Math.sin(angle) * s._radius;
      const [sx, sy] = worldToScreen(wx, wy);
      positions.set(s.name, { x: sx, y: sy, r: DOT_RADIUS * cam.zoom + 3 });

      if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue;

      const typeOff = hidden.has(s.type);
      const queryOff = anyQuery && !matchesQuery(s);
      const dim = typeOff || queryOff;
      const isHover = hoverSite === s;
      const isSelected = selectedSite === s;

      ctx.globalAlpha = dim ? 0.08 : 1;
      if (isHover || isSelected) {
        ctx.beginPath();
        ctx.fillStyle = s._color;
        ctx.globalAlpha = dim ? 0.08 : 0.28;
        ctx.arc(sx, sy, (DOT_RADIUS + 5) * cam.zoom + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = dim ? 0.08 : 1;
      }
      ctx.beginPath();
      ctx.fillStyle = s._color;
      ctx.arc(sx, sy, Math.max(1.2, DOT_RADIUS * cam.zoom), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let rafId = null;
  function frame(ts) {
    draw(ts / 1000);
    rafId = requestAnimationFrame(frame);
  }

  function findNearest(sx, sy) {
    let best = null, bestD = Infinity;
    for (const s of sites) {
      const p = positions.get(s.name);
      if (!p) continue;
      const dx = p.x - sx, dy = p.y - sy;
      const d = dx * dx + dy * dy;
      const rr = p.r * p.r;
      if (d < rr && d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1).trimEnd() + "…" : str;
  }

  function showCard(s, sx, sy) {
    const p = positions.get(s.name);
    const x = p ? p.x : sx;
    const y = p ? p.y : sy;
    cardEl.innerHTML =
      '<h3><span class="type-dot" style="background:' + s._color + '"></span>' +
      escapeHtml(s.title) + "</h3>" +
      "<div>" + escapeHtml(truncate(s.blurb, 160)) + "</div>" +
      '<div class="meta">' + TYPE_LABEL[s.type] + (s.by ? " · asked by @" + escapeHtml(s.by) : "") + "</div>";
    cardEl.classList.add("visible");
    const cw = 300;
    let left = x + 16;
    if (left + cw > width - 10) left = x - cw - 16;
    let top = Math.min(Math.max(10, y - 20), height - 140);
    cardEl.style.left = left + "px";
    cardEl.style.top = top + "px";
  }
  function hideCard() {
    cardEl.classList.remove("visible");
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function openSelected(s) {
    selectedSite = s;
    selectedTitle.textContent = s.title;
    selectedBlurb.textContent = s.blurb;
    selectedMeta.textContent = TYPE_LABEL[s.type] + (s.by ? " · asked by @" + s.by : "");
    selectedVisit.href = s.url;
    selectedEl.classList.add("visible");
    history.replaceState(null, "", "/s/" + encodeURIComponent(s.name));

    const shareText =
      "found in the " + TYPE_LABEL[s.type] + " orbit: " + s.title + " — " +
      truncate(s.blurb, 140) + " https://orrery.bisks.net/s/" + encodeURIComponent(s.name);
    selectedShare.onclick = () => {
      window.open(
        "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText),
        "_blank",
        "noopener"
      );
    };
  }
  function closeSelected() {
    selectedSite = null;
    selectedEl.classList.remove("visible");
    history.replaceState(null, "", "/");
  }
  selectedClose.addEventListener("click", closeSelected);

  // --- input: hover, click, drag, zoom ---
  canvas.addEventListener("mousemove", (e) => {
    if (drag) {
      const dx = (e.clientX - drag.x) / cam.zoom;
      const dy = (e.clientY - drag.y) / cam.zoom;
      cam.x -= dx;
      cam.y -= dy;
      drag.x = e.clientX;
      drag.y = e.clientY;
      hideCard();
      return;
    }
    const s = findNearest(e.clientX, e.clientY);
    hoverSite = s;
    canvas.style.cursor = s ? "pointer" : "grab";
    if (s) showCard(s, e.clientX, e.clientY);
    else hideCard();
  });
  canvas.addEventListener("mousedown", (e) => {
    if (hoverSite) return; // click handled on mouseup below
    drag = { x: e.clientX, y: e.clientY };
    canvas.classList.add("dragging");
  });
  window.addEventListener("mouseup", () => {
    drag = null;
    canvas.classList.remove("dragging");
  });
  canvas.addEventListener("click", (e) => {
    const s = findNearest(e.clientX, e.clientY);
    if (s) openSelected(s);
  });
  canvas.addEventListener("mouseleave", () => {
    hoverSite = null;
    hideCard();
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const before = screenToWorld(e.clientX, e.clientY);
      const factor = Math.exp(-e.deltaY * 0.0012);
      cam.zoom = Math.min(6, Math.max(0.15, cam.zoom * factor));
      const after = screenToWorld(e.clientX, e.clientY);
      cam.x += before[0] - after[0];
      cam.y += before[1] - after[1];
    },
    { passive: false }
  );

  // touch: one-finger pan, two-finger pinch
  let touchState = null;
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1) {
        touchState = { mode: "pan", x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const [a, b] = e.touches;
        touchState = {
          mode: "pinch",
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          zoom: cam.zoom,
        };
      }
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (touchState && touchState.mode === "pan" && e.touches.length === 1) {
        const dx = (e.touches[0].clientX - touchState.x) / cam.zoom;
        const dy = (e.touches[0].clientY - touchState.y) / cam.zoom;
        cam.x -= dx;
        cam.y -= dy;
        touchState.x = e.touches[0].clientX;
        touchState.y = e.touches[0].clientY;
      } else if (touchState && touchState.mode === "pinch" && e.touches.length === 2) {
        const [a, b] = e.touches;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        cam.zoom = Math.min(6, Math.max(0.15, touchState.zoom * (dist / touchState.dist)));
      }
    },
    { passive: false }
  );
  canvas.addEventListener("touchend", () => {
    touchState = null;
  });

  searchEl.addEventListener("input", () => {
    query = searchEl.value.trim();
  });

  function buildLegend() {
    legendEl.innerHTML = "";
    const counts = {};
    for (const s of sites) counts[s.type] = (counts[s.type] || 0) + 1;
    for (const type of TYPE_ORDER) {
      if (!counts[type]) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-pressed", "true");
      btn.innerHTML =
        '<span class="swatch" style="background:' + typeColor(type) + '"></span>' +
        TYPE_LABEL[type] + " (" + counts[type] + ")";
      btn.addEventListener("click", () => {
        if (hidden.has(type)) {
          hidden.delete(type);
          btn.setAttribute("aria-pressed", "true");
        } else {
          hidden.add(type);
          btn.setAttribute("aria-pressed", "false");
        }
      });
      legendEl.appendChild(btn);
    }
  }

  async function init() {
    const res = await fetch("/data/fleet.json");
    const data = await res.json();
    sites = data.sites;
    layout(sites);
    const outerRadius = RING_START + (TYPE_ORDER.length - 1) * RING_GAP + JITTER;
    cam.zoom = (Math.min(width, height) * 0.46) / outerRadius;
    buildLegend();
    countEl.textContent = sites.length + " worlds";
    footerCountEl.textContent = sites.length + " sites";

    const m = location.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) {
      const name = decodeURIComponent(m[1]);
      const s = sites.find((x) => x.name === name);
      if (s) {
        openSelected(s);
        searchEl.value = s.name;
        query = s.name;
        // center the camera roughly where this world sits right now
        const angle = s._baseAngle + performance.now() / 1000 * s._speed;
        cam.x = Math.cos(angle) * s._radius;
        cam.y = Math.sin(angle) * s._radius;
        cam.zoom = 2.2;
      }
    }

    rafId = requestAnimationFrame(frame);
  }

  init();
})();
