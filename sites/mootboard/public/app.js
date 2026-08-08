// mootboard — resolve a handle, pull posts from its moots, pick the
// suspiciously medium-liked ones, pin them to a corkboard with yarn.
import { gatherEvidence, mulberry32 } from "./lib/evidence.js";

const CARD_COLORS = ["#f2e8c9", "#f6f0df", "#ecd9a6", "#f3d9de", "#d7e6ee", "#e6ecd2"];
const PIN_COLORS = ["#d1263b", "#2560c4", "#e0a622", "#2a9d4f", "#7c3aed"];
const LAST_HANDLE_KEY = "mootboard-last-handle";

function seedFromString(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}
function randSeed() {
  return seedFromString(Math.random().toString(36) + Date.now().toString(36));
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

const els = {
  form: document.getElementById("f"),
  handle: document.getElementById("handle"),
  goBtn: document.getElementById("goBtn"),
  statusLine: document.getElementById("statusLine"),
  toolbar: document.getElementById("toolbar"),
  restring: document.getElementById("restring"),
  reset: document.getElementById("reset"),
  boardwrap: document.getElementById("boardwrap"),
  cards: document.getElementById("cards"),
  yarn: document.getElementById("yarn"),
  empty: document.getElementById("emptyMsg"),
  share: document.getElementById("share"),
  shareCanvas: document.getElementById("shareCanvas"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  copyLink: document.getElementById("copyLink"),
  shareStatus: document.getElementById("shareStatus"),
};

if (window.attachHandleTypeahead) {
  attachHandleTypeahead(els.handle, {
    onSelect: (actor) => {
      els.handle.value = actor.handle;
    },
  });
}

const state = { handle: "", seed: 0, self: null, mootCount: 0, evidence: [] };

function setStatus(text, isErr) {
  els.statusLine.textContent = text || "";
  els.statusLine.classList.toggle("err", !!isErr);
}

function computeLayout(n, seed) {
  const rng = mulberry32(seed);
  const positions = [];
  const margin = 14;
  for (let i = 0; i < n; i++) {
    let best = null,
      bestScore = -1;
    const attempts = 30;
    for (let a = 0; a < attempts; a++) {
      const x = margin + rng() * (100 - 2 * margin);
      const y = margin + rng() * (100 - 2 * margin);
      let minDist = Infinity;
      for (let j = 0; j < positions.length; j++) {
        const dx = positions[j].x - x,
          dy = (positions[j].y - y) * 1.6;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) minDist = d;
      }
      if (positions.length === 0) minDist = 999;
      if (minDist > bestScore) {
        bestScore = minDist;
        best = { x, y };
      }
      if (bestScore > 26) break;
    }
    const rot = rng() * 14 - 7;
    const color = CARD_COLORS[Math.floor(rng() * CARD_COLORS.length)];
    const pinColor = PIN_COLORS[Math.floor(rng() * PIN_COLORS.length)];
    positions.push({ x: best.x, y: best.y, rot, color, pinColor });
  }

  const edges = [];
  for (let k = 1; k < n; k++) {
    let count = 1;
    if (rng() < 0.45) count++;
    if (rng() < 0.15) count++;
    count = Math.min(count, k);
    const pool = [];
    for (let p = 0; p < k; p++) pool.push(p);
    for (let c = 0; c < count; c++) {
      const idx = Math.floor(rng() * pool.length);
      edges.push([k, pool[idx]]);
      pool.splice(idx, 1);
      if (!pool.length) break;
    }
  }

  return { positions, edges };
}

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function renderBoard() {
  const n = state.evidence.length;
  const layout = computeLayout(n, state.seed);
  const rect = els.boardwrap.getBoundingClientRect();
  const w = rect.width,
    h = rect.height;

  els.empty.style.display = n ? "none" : "flex";
  els.empty.textContent = n
    ? ""
    : "the board is bare. enter a handle above to start the investigation.";

  els.yarn.setAttribute("width", w);
  els.yarn.setAttribute("height", h);
  els.yarn.setAttribute("viewBox", `0 0 ${w} ${h}`);
  els.yarn.innerHTML = "";
  const sagRng = mulberry32(state.seed ^ 0x9e3779b9);
  layout.edges.forEach((e) => {
    const a = layout.positions[e[0]],
      b = layout.positions[e[1]];
    if (!a || !b) return;
    const ax = (a.x / 100) * w,
      ay = (a.y / 100) * h;
    const bx = (b.x / 100) * w,
      by = (b.y / 100) * h;
    const mx = (ax + bx) / 2,
      my = (ay + by) / 2;
    const dx = bx - ax,
      dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len,
      ny = dx / len;
    const sag = (sagRng() - 0.5) * Math.min(70, len * 0.35);
    const cx = mx + nx * sag,
      cy = my + ny * sag + Math.min(len * 0.06, 14);
    els.yarn.appendChild(
      svgEl("path", {
        d: `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`,
        stroke: "#c81e1e",
        "stroke-width": 2.2,
        fill: "none",
        opacity: 0.85,
        "stroke-linecap": "round",
      }),
    );
  });

  els.cards.innerHTML = "";
  layout.positions.forEach((p, i) => {
    const item = state.evidence[i];
    const card = document.createElement("a");
    card.className = "card";
    card.href = item.uri ? item.handleUrl : "#";
    card.target = "_blank";
    card.rel = "noopener";
    card.style.left = p.x + "%";
    card.style.top = p.y + "%";
    card.style.transform = `translate(-50%, -50%) rotate(${p.rot.toFixed(1)}deg)`;
    card.style.background = p.color;

    const pin = document.createElement("div");
    pin.className = "pin";
    pin.style.background = p.pinColor;
    card.appendChild(pin);

    const rm = document.createElement("button");
    rm.className = "rm";
    rm.type = "button";
    rm.title = "not evidence — unpin";
    rm.textContent = "✕";
    rm.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      state.evidence.splice(i, 1);
      renderBoard();
      updateShare();
    });
    card.appendChild(rm);

    const meta = document.createElement("div");
    meta.className = "meta";
    if (item.author.avatar) {
      const img = document.createElement("img");
      img.src = item.author.avatar;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      meta.appendChild(img);
    }
    const handleEl = document.createElement("span");
    handleEl.className = "handle";
    handleEl.textContent = "@" + item.author.handle;
    meta.appendChild(handleEl);
    const likes = document.createElement("span");
    likes.className = "likes";
    likes.textContent = "❤ " + item.likeCount;
    meta.appendChild(likes);
    card.appendChild(meta);

    const txt = document.createElement("div");
    txt.className = "txt";
    txt.textContent = truncate(item.text, 200);
    card.appendChild(txt);

    els.cards.appendChild(card);
  });
}

window.addEventListener("resize", debounce(() => state.evidence.length && renderBoard(), 150));
function debounce(fn, ms) {
  let t;
  return function () {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

// --- fetch + run ---
async function run(handleInput, seed) {
  els.goBtn.disabled = true;
  els.restring.disabled = true;
  setStatus("resolving handle…");
  try {
    const result = await gatherEvidence(handleInput, {
      seed,
      onStep: (s) => setStatus(s),
    });
    state.handle = result.self.handle || handleInput.replace(/^@/, "");
    state.seed = seed;
    state.self = result.self;
    state.mootCount = result.moots.length;
    state.evidence = result.evidence;

    try {
      localStorage.setItem(LAST_HANDLE_KEY, state.handle);
    } catch {}

    setStatus(
      `pinned ${state.evidence.length} pieces of evidence from ${state.mootCount} moots of @${state.handle}.`,
    );
    els.toolbar.hidden = false;
    els.share.hidden = false;
    renderBoard();
    updateShare();
    pushUrl();
  } catch (err) {
    setStatus(err.message || "couldn't build a case for that handle.", true);
  } finally {
    els.goBtn.disabled = false;
    els.restring.disabled = false;
  }
}

function pushUrl() {
  const u = new URL(location.href);
  u.searchParams.set("u", state.handle);
  u.searchParams.set("s", String(state.seed));
  history.replaceState(null, "", u.toString());
}

// --- form + toolbar wiring ---
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = els.handle.value.trim();
  if (!v) return;
  run(v, randSeed());
});

els.restring.addEventListener("click", () => {
  if (!state.handle) return;
  run(state.handle, randSeed());
});

els.reset.addEventListener("click", () => {
  state.handle = "";
  state.evidence = [];
  els.handle.value = "";
  els.toolbar.hidden = true;
  els.share.hidden = true;
  setStatus("");
  renderBoard();
  const u = new URL(location.href);
  u.searchParams.delete("u");
  u.searchParams.delete("s");
  history.replaceState(null, "", u.toString());
  els.handle.focus();
});

// --- share ---
function shareUrl() {
  return `https://mootboard.bisks.net/?u=${encodeURIComponent(state.handle)}&s=${state.seed}`;
}

function buildShareText() {
  const url = shareUrl();
  const n = state.evidence.length;
  if (!n) return "an empty mootboard. the investigation has not yet begun.\n\n" + url;
  const lead = `the mootboard for @${state.handle}: ${n} suspiciously medium-liked posts from their moots, all connected. it's probably nothing.`;
  const budget = 300 - (url.length + 2);
  const trimmed = lead.length > budget ? lead.slice(0, Math.max(0, budget - 1)) + "…" : lead;
  return trimmed + "\n\n" + url;
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(" ");
  let line = "",
    cy = y,
    lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (line && ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cy);
      line = words[i];
      cy += lineHeight;
      lines++;
      if (lines >= maxLines - 1) {
        line = line + "…";
        break;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function drawShareCard() {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width,
    H = canvas.height;

  ctx.fillStyle = "#3a2415";
  ctx.fillRect(0, 0, W, H);
  const bx = 24,
    by = 24,
    bw = W - 48,
    bh = H - 48;
  const grad = ctx.createLinearGradient(0, by, 0, by + bh);
  grad.addColorStop(0, "#c69a5c");
  grad.addColorStop(1, "#a97e42");
  ctx.fillStyle = grad;
  ctx.fillRect(bx, by, bw, bh);

  ctx.fillStyle = "rgba(0,0,0,0.12)";
  const specRng = mulberry32(state.seed ^ 0x1234567);
  for (let i = 0; i < 260; i++) {
    const px = bx + specRng() * bw,
      py = by + specRng() * bh;
    ctx.beginPath();
    ctx.arc(px, py, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  const sample = state.evidence.slice(0, Math.min(state.evidence.length, 6));
  const pts = [];
  const cols = 3,
    rows = 2;
  const cellW = bw / cols,
    cellH = bh / rows;
  const rng = mulberry32(state.seed);
  const images = await Promise.all(sample.map((it) => loadImage(it.author.avatar)));
  sample.forEach((it, i) => {
    const col = i % cols,
      row = Math.floor(i / cols);
    const jx = (rng() - 0.5) * cellW * 0.3;
    const jy = (rng() - 0.5) * cellH * 0.25;
    const cx = bx + cellW * col + cellW / 2 + jx;
    const cy = by + cellH * row + cellH / 2 + jy;
    pts.push({ x: cx, y: cy, rot: rng() * 12 - 6, img: images[i] });
  });

  ctx.strokeStyle = "#c81e1e";
  ctx.lineWidth = 3;
  for (let e = 1; e < pts.length; e++) {
    const a = pts[e],
      b = pts[Math.floor(rng() * e)];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const mx = (a.x + b.x) / 2 + (rng() - 0.5) * 40;
    const my = (a.y + b.y) / 2 + (rng() - 0.5) * 40;
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    ctx.stroke();
  }

  pts.forEach((p, i) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rot * Math.PI) / 180);
    const cw = 200,
      ch = 108;
    ctx.fillStyle = CARD_COLORS[i % CARD_COLORS.length];
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    if (p.img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(-cw / 2 + 20, -ch / 2 + 20, 10, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(p.img, -cw / 2 + 10, -ch / 2 + 10, 20, 20);
      ctx.restore();
    }
    ctx.fillStyle = "#1c1c1c";
    ctx.font = "700 12px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("@" + sample[i].author.handle, -cw / 2 + 36, -ch / 2 + 24);

    ctx.font = "600 15px ui-monospace, monospace";
    wrapCanvasText(ctx, sample[i].text, -cw / 2 + 12, -ch / 2 + 44, cw - 24, 19, 4);

    ctx.beginPath();
    ctx.fillStyle = PIN_COLORS[i % PIN_COLORS.length];
    ctx.arc(0, -ch / 2 - 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "#fff2ea";
  ctx.font = "800 44px ui-monospace, monospace";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.fillText("mootboard", bx + 30, by + 56);
  ctx.shadowBlur = 0;

  ctx.font = "700 18px ui-monospace, monospace";
  ctx.fillStyle = "#ffe4d6";
  ctx.fillText(`@${state.handle}'s moots, allegedly`, bx + 30, by + 80);

  ctx.font = "700 20px ui-monospace, monospace";
  ctx.fillStyle = "#ffe4d6";
  ctx.textAlign = "right";
  ctx.fillText("mootboard.bisks.net", bx + bw - 24, by + bh - 20);
}

function updateShare() {
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText());
  drawShareCard();
}

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mootboard.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

els.copyLink.addEventListener("click", () => {
  const url = shareUrl();
  const done = () => {
    els.shareStatus.textContent = "link copied.";
    setTimeout(() => (els.shareStatus.textContent = ""), 2500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, () => prompt("copy this link:", url));
  } else {
    prompt("copy this link:", url);
  }
});

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}
if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "mootboard.png", { type: "image/png" });
      navigator.share({ files: [file], text: buildShareText(), title: "mootboard" }).catch(() => {});
    }, "image/png");
  });
}

// --- boot ---
(function boot() {
  const params = new URL(location.href).searchParams;
  const u = params.get("u");
  const s = params.get("s");
  if (u && s && /^-?\d+$/.test(s)) {
    els.handle.value = u;
    run(u, Number(s));
    return;
  }
  try {
    const last = localStorage.getItem(LAST_HANDLE_KEY);
    if (last) els.handle.value = last;
  } catch {}
  renderBoard();
})();
