// rantwalk — a Wikipedia-speedrun-style game played on
// @norvid-studies.bsky.social's own post history. The graph (public/data/graph.json)
// is a topologically-sorted-by-time, weighted DAG baked by ../build-graph.mjs:
// node i can only ever link forward to nodes j > i in posting order. The game:
// start on one post, reach a target post later in the timeline, by only ever
// clicking forward along the links the graph gives you.
const SITE_URL = "https://rantwalk.bisks.net/";

const DIFFICULTIES = {
  easy: { label: "easy", min: 2, max: 4 },
  normal: { label: "normal", min: 4, max: 7 },
  hard: { label: "hard", min: 7, max: 13 },
};

const els = {
  loading: document.getElementById("loading"),
  intro: document.getElementById("intro"),
  game: document.getElementById("game"),
  win: document.getElementById("win"),
  diffButtons: document.getElementById("diffButtons"),
  dealBtn: document.getElementById("dealBtn"),
  targetPreview: document.getElementById("targetPreview"),
  targetCard: document.getElementById("targetCard"),
  currentCard: document.getElementById("currentCard"),
  relatedList: document.getElementById("relatedList"),
  breadcrumb: document.getElementById("breadcrumb"),
  moves: document.getElementById("moves"),
  timer: document.getElementById("timer"),
  par: document.getElementById("par"),
  hintBtn: document.getElementById("hintBtn"),
  giveUpBtn: document.getElementById("giveUpBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  winStats: document.getElementById("winStats"),
  winPath: document.getElementById("winPath"),
  playAgainBtn: document.getElementById("playAgainBtn"),
  shareCanvas: document.getElementById("shareCanvas"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  avatarImg: document.getElementById("avatarImg"),
};

let graph = null;
let byId = null; // node id -> node
let outEdges = null; // node id -> [{to, w, kw}]
let inEdges = null; // node id -> [fromId]  (for BFS reachability we only need out edges, but keep for hint pathing)

let difficulty = "normal";
let session = null; // { start, target, par, path: [ids], current, startedAt, elapsedTimer, finished }

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s, n) {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1).trimEnd() + "…" : clean;
}

function relTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

async function loadGraph() {
  const res = await fetch("/data/graph.json");
  graph = await res.json();
  byId = new Map(graph.nodes.map((n) => [n.id, n]));
  outEdges = new Map(graph.nodes.map((n) => [n.id, graph.edges[n.id] || []]));
  if (graph.avatar) els.avatarImg.src = graph.avatar;
}

// BFS forward from `start`, unweighted hop count. Returns {dist: Map, parent: Map}.
function bfsForward(start) {
  const dist = new Map([[start, 0]]);
  const parent = new Map();
  const q = [start];
  let head = 0;
  while (head < q.length) {
    const u = q[head++];
    const d = dist.get(u);
    for (const e of outEdges.get(u) || []) {
      if (!dist.has(e.to)) {
        dist.set(e.to, d + 1);
        parent.set(e.to, u);
        q.push(e.to);
      }
    }
  }
  return { dist, parent };
}

function pickGame(diffKey) {
  const diff = DIFFICULTIES[diffKey];
  const N = graph.nodes.length;
  let best = null;
  for (let tries = 0; tries < 60; tries++) {
    const start = Math.floor(Math.random() * (N - 5));
    const { dist } = bfsForward(start);
    const candidates = [...dist.entries()].filter(([id, d]) => d >= diff.min && d <= diff.max);
    if (candidates.length > 0) {
      const [target, par] = candidates[Math.floor(Math.random() * candidates.length)];
      return { start, target, par };
    }
    // remember the best fallback (largest reachable hop count) in case no try
    // lands in range — sparse tails of the graph can make some starts unlucky.
    const maxEntry = [...dist.entries()].filter(([id]) => id !== start).sort((a, b) => b[1] - a[1])[0];
    if (maxEntry && (!best || maxEntry[1] > best.par)) {
      best = { start, target: maxEntry[0], par: maxEntry[1] };
    }
  }
  return best;
}

function buildLinkedHtml(node, edges) {
  const text = node.text;
  const ranges = [];
  const used = [];
  const inline = new Set();
  for (const e of edges) {
    let placed = false;
    for (const kw of e.kw) {
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      const m = re.exec(text);
      if (!m) continue;
      const start = m.index;
      const end = start + m[0].length;
      const overlaps = used.some((r) => start < r.end && end > r.start);
      if (overlaps) continue;
      ranges.push({ start, end, to: e.to, w: e.w });
      used.push({ start, end });
      placed = true;
      break;
    }
    if (placed) inline.add(e.to);
  }
  ranges.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const r of ranges) {
    out += esc(text.slice(cursor, r.start));
    out += `<a href="#" class="lk" data-to="${r.to}" title="strength ${r.w}">${esc(text.slice(r.start, r.end))}</a>`;
    cursor = r.end;
  }
  out += esc(text.slice(cursor));
  return { html: out, inline };
}

function postMetaHtml(node) {
  const bits = [relTime(node.createdAt)];
  if (node.likeCount) bits.push(`${node.likeCount} likes`);
  if (node.hasImage) bits.push("🖼 image");
  if (node.isQuote) bits.push("↪ quote");
  return bits.join(" · ");
}

function renderTargetCard() {
  const t = byId.get(session.target);
  els.targetPreview.innerHTML = `
    <div class="pc-head">
      <img class="pc-avatar" src="${esc(graph.avatar || "")}" alt="" />
      <div>
        <div class="pc-name">${esc(graph.displayName)}</div>
        <div class="pc-meta">${postMetaHtml(t)}</div>
      </div>
    </div>
    <div class="pc-text">${esc(t.text)}</div>
    <a class="pc-link" href="${esc(t.url)}" target="_blank" rel="noopener">view on bluesky ↗</a>
  `;
}

function renderCurrent() {
  const node = byId.get(session.current);
  const edges = outEdges.get(session.current) || [];
  const { html, inline } = buildLinkedHtml(node, edges);
  const isTarget = session.current === session.target;

  els.currentCard.innerHTML = `
    <div class="pc-head">
      <img class="pc-avatar" src="${esc(graph.avatar || "")}" alt="" />
      <div>
        <div class="pc-name">${esc(graph.displayName)}</div>
        <div class="pc-meta">${postMetaHtml(node)}</div>
      </div>
    </div>
    <div class="pc-text">${html}</div>
    <a class="pc-link" href="${esc(node.url)}" target="_blank" rel="noopener">view on bluesky ↗</a>
  `;

  if (isTarget) {
    finishGame();
    return;
  }

  els.relatedList.innerHTML = "";
  if (edges.length === 0) {
    els.relatedList.innerHTML = `<p class="dead-end">this rant is a dead end — no rants after it connect. hit "give up" to see a route.</p>`;
  }
  for (const e of edges) {
    const to = byId.get(e.to);
    const btn = document.createElement("button");
    btn.className = "related-card" + (inline.has(e.to) ? " has-inline" : "");
    btn.type = "button";
    btn.dataset.to = e.to;
    const kw = e.kw.length ? `via “${esc(e.kw[0])}”` : "next in the timeline";
    btn.innerHTML = `<span class="rc-snip">${esc(truncate(to.text, 90))}</span><span class="rc-kw">${kw}</span>`;
    els.relatedList.appendChild(btn);
  }

  els.currentCard.querySelectorAll("a.lk").forEach((a) => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      go(parseInt(a.dataset.to, 10));
    });
  });
  els.relatedList.querySelectorAll(".related-card").forEach((btn) => {
    btn.addEventListener("click", () => go(parseInt(btn.dataset.to, 10)));
  });
}

function renderBreadcrumb() {
  els.breadcrumb.innerHTML = session.path
    .map((id, i) => {
      const n = byId.get(id);
      const isLast = i === session.path.length - 1;
      return `<span class="crumb${isLast ? " current" : ""}" title="${esc(n.text)}">${i === 0 ? "start" : "#" + i}</span>`;
    })
    .join('<span class="crumb-sep">→</span>');
}

function go(id) {
  if (session.finished) return;
  session.path.push(id);
  session.current = id;
  renderBreadcrumb();
  renderStats();
  renderCurrent();
}

function renderStats() {
  els.moves.textContent = String(session.path.length - 1);
  els.par.textContent = String(session.par);
}

let tickHandle = null;
function renderTimer() {
  const secs = Math.floor((Date.now() - session.startedAt) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  els.timer.textContent = `${m}:${String(s).padStart(2, "0")}`;
}

function startGame() {
  const picked = pickGame(difficulty);
  if (!picked) return;
  session = {
    start: picked.start,
    target: picked.target,
    par: picked.par,
    path: [picked.start],
    current: picked.start,
    startedAt: Date.now(),
    finished: false,
  };
  els.intro.style.display = "none";
  els.win.style.display = "none";
  els.game.style.display = "block";
  renderTargetCard();
  renderBreadcrumb();
  renderStats();
  renderCurrent();
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(renderTimer, 1000);
  renderTimer();
}

function verdictFor(moves, par) {
  if (moves <= par) return "perfect run — you found the shortest walk through the rants.";
  if (moves <= par + 2) return "solid. a little detour, but you made it.";
  if (moves <= par + 5) return "the scenic route, but you got there.";
  return "you basically read his whole timeline to get here. respect.";
}

function finishGame() {
  session.finished = true;
  if (tickHandle) clearInterval(tickHandle);
  const moves = session.path.length - 1;
  const secs = Math.max(1, Math.floor((Date.now() - session.startedAt) / 1000));
  els.game.style.display = "none";
  els.win.style.display = "block";
  els.winStats.innerHTML = `
    <div class="win-big">${moves} click${moves === 1 ? "" : "s"}</div>
    <div class="win-sub">par ${session.par} · ${secs}s · ${verdictFor(moves, session.par)}</div>
  `;
  els.winPath.innerHTML = session.path
    .map((id, i) => {
      const n = byId.get(id);
      return `<a href="${esc(n.url)}" target="_blank" rel="noopener" class="path-step">${i + 1}. ${esc(truncate(n.text, 60))}</a>`;
    })
    .join("");

  const shareText =
    `I got from one @norvid-studies.bsky.social rant to another in ${moves} click${moves === 1 ? "" : "s"} ` +
    `(par ${session.par}) on rantwalk.\n\n${SITE_URL}`;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  drawShareCard(moves, secs);
  els._lastShareText = shareText;
}

// hint: BFS forward from the CURRENT node (player may have wandered off the
// original path), highlight whichever visible link takes the next step of a
// fresh shortest route to the target.
function useHint() {
  if (!session || session.finished) return;
  const { dist, parent } = bfsForward(session.current);
  if (!dist.has(session.target)) {
    alert("no forward route to the target from here — try \"give up\" to see the answer.");
    return;
  }
  // walk parent pointers back from target to find the first hop from current
  let node = session.target;
  while (parent.get(node) !== session.current && parent.has(node)) node = parent.get(node);
  const nextHop = node;
  const el = els.relatedList.querySelector(`.related-card[data-to="${nextHop}"]`);
  const inlineEl = els.currentCard.querySelector(`a.lk[data-to="${nextHop}"]`);
  [el, inlineEl].forEach((n) => {
    if (!n) return;
    n.classList.add("hinted");
    setTimeout(() => n.classList.remove("hinted"), 2200);
  });
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function giveUp() {
  if (!session || session.finished) return;
  const { dist, parent } = bfsForward(session.current);
  if (!dist.has(session.target)) {
    alert("this walk hit a dead end with no way forward. starting a new game.");
    startGame();
    return;
  }
  const route = [];
  let node = session.target;
  while (node !== session.current) {
    route.unshift(node);
    node = parent.get(node);
  }
  for (const id of route) go(id);
}

els.diffButtons.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => {
    els.diffButtons.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    difficulty = btn.dataset.diff;
  });
});
els.dealBtn.addEventListener("click", startGame);
els.newGameBtn.addEventListener("click", startGame);
els.playAgainBtn.addEventListener("click", startGame);
els.hintBtn.addEventListener("click", useHint);
els.giveUpBtn.addEventListener("click", giveUp);

function drawShareCard(moves, secs) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const serif = "Georgia, 'Times New Roman', serif";
  const mono = "ui-monospace, 'JetBrains Mono', monospace";

  ctx.fillStyle = "#f8f7f2";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#c8c2ae";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);

  ctx.textAlign = "left";
  ctx.fillStyle = "#202122";
  ctx.font = `700 46px ${serif}`;
  ctx.fillText("rantwalk", 60, 100);
  ctx.fillStyle = "#54595d";
  ctx.font = `italic 20px ${serif}`;
  ctx.fillText("a free rant that anyone can click through", 60, 132);

  ctx.strokeStyle = "#a2a9b1";
  ctx.beginPath();
  ctx.moveTo(60, 155);
  ctx.lineTo(W - 60, 155);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#0645ad";
  ctx.font = `800 120px ${mono}`;
  ctx.fillText(String(moves), W / 2, 340);
  ctx.fillStyle = "#54595d";
  ctx.font = `700 26px ${mono}`;
  ctx.fillText(`click${moves === 1 ? "" : "s"} (par ${session.par}) · ${secs}s`, W / 2, 385);

  ctx.textAlign = "left";
  ctx.fillStyle = "#202122";
  ctx.font = `400 20px ${serif}`;
  const path = session.path.map((id) => truncate(byId.get(id).text, 34));
  let y = 450;
  const shown = path.slice(0, 4);
  shown.forEach((p, i) => {
    ctx.fillStyle = i === 0 || i === shown.length - 1 && path.length <= 4 ? "#0645ad" : "#54595d";
    ctx.fillText(`${i + 1}. ${p}`, 60, y);
    y += 34;
  });
  if (path.length > shown.length) {
    ctx.fillStyle = "#72777d";
    ctx.fillText(`… ${path.length - shown.length} more`, 60, y);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#0645ad";
  ctx.font = `700 24px ${mono}`;
  ctx.fillText("rantwalk.bisks.net", 60, H - 40);
  ctx.fillStyle = "#72777d";
  ctx.font = `400 16px ${mono}`;
  ctx.fillText("@norvid-studies.bsky.social's rants, topologically sorted", 60, H - 16);
}

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "rantwalk-result.png";
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
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "rantwalk-result.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: els._lastShareText || "", title: "rantwalk" });
      } catch (_) {
        // cancelled — no-op
      }
    }, "image/png");
  });
}

loadGraph().then(() => {
  els.loading.style.display = "none";
  els.intro.style.display = "block";
});
