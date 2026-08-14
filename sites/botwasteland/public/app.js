import { buildCluster } from "./lib/cluster.js";
import { makeBot, genPost, relTime } from "./lib/wasteland.js";

const $ = (id) => document.getElementById(id);
const els = {
  form: $("searchForm"),
  input: $("handleInput"),
  genBtn: $("genBtn"),
  status: $("status"),
  resultWrap: $("resultWrap"),
  sBots: $("sBots"),
  sPosts: $("sPosts"),
  sUptime: $("sUptime"),
  btnCalm: $("btnCalm"),
  btnChaos: $("btnChaos"),
  btnPause: $("btnPause"),
  btnClear: $("btnClear"),
  feed: $("feed"),
  shareRow: $("shareRow"),
  shareBluesky: $("shareBluesky"),
  shareDownload: $("shareDownload"),
  shareNative: $("shareNative"),
  canvas: $("cardCanvas"),
};

const short = (h) => "@" + String(h || "").replace(/\.bsky\.social$/, "");
const initials = (p) =>
  (p.displayName || p.handle || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function setAvatar(el, bot) {
  if (bot.avatar) {
    el.style.backgroundImage = `url("${bot.avatar}")`;
    el.textContent = "";
  } else {
    el.style.backgroundImage = "none";
    el.style.background = bot.tint;
    el.textContent = initials(bot);
  }
}

// ── swarm state ────────────────────────────────────────────────────────
let bots = [];
let hostHandle = "";
let postCount = 0;
let seq = 0;
let startedAt = 0;
let timer = null;
let uptimeTimer = null;
let paused = false;
let speed = "calm"; // "calm" | "chaos"
const SPEED_MS = { calm: [900, 1900], chaos: [140, 420] };
const MAX_ROWS = 200;
let lastShareText = "";
let lastCard = null; // { hostHandle, botCount, sampleDid }

function fmtUptime(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function scheduleNext() {
  clearTimeout(timer);
  if (paused || !bots.length) return;
  const [lo, hi] = SPEED_MS[speed];
  const delay = lo + Math.random() * (hi - lo);
  timer = setTimeout(tick, delay);
}

function tick() {
  if (paused || !bots.length) return;
  const bot = bots[Math.floor(Math.random() * bots.length)];
  seq++;
  bot.posts++;
  postCount++;
  const text = genPost(bot, seq);
  appendPost(bot, text);
  els.sPosts.textContent = postCount.toLocaleString();
  scheduleNext();
}

function appendPost(bot, text) {
  const empty = els.feed.querySelector(".feed-empty");
  if (empty) empty.remove();

  const row = document.createElement("div");
  row.className = "post";
  const av = document.createElement("div");
  av.className = "av";
  setAvatar(av, bot);
  const body = document.createElement("div");
  body.className = "body";
  const prow = document.createElement("div");
  prow.className = "prow";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = bot.displayName || bot.handle;
  const hn = document.createElement("span");
  hn.className = "hn";
  hn.textContent = short(bot.handle);
  const pds = document.createElement("span");
  pds.className = "pds";
  pds.textContent = "· " + bot.fakePds;
  const ts = document.createElement("span");
  ts.className = "ts";
  ts.textContent = "now";
  prow.append(name, hn, pds, ts);
  const txt = document.createElement("div");
  txt.className = "txt";
  txt.textContent = text;
  body.append(prow, txt);
  row.append(av, body);
  row.addEventListener("click", () => openDossier(bot));
  els.feed.prepend(row);

  while (els.feed.children.length > MAX_ROWS) {
    els.feed.removeChild(els.feed.lastChild);
  }
}

// ── dossier modal ──────────────────────────────────────────────────────
function openDossier(bot) {
  const box = document.createElement("div");
  box.className = "modal-overlay";
  const fields = [
    ["host account (real)", short(bot.handle)],
    ["fake DID", bot.fakeDid],
    ["fake PDS", "https://" + bot.fakePds],
    ["activated", relTime(bot.activatedAt)],
    ["transmissions this session", String(bot.posts)],
    ["real followers", (bot.followersCount || 0).toLocaleString()],
  ];
  box.innerHTML = `
    <div class="modal">
      <h2>${bot.displayName || bot.handle}</h2>
      <div class="sub">bot dossier — costume worn by a real profile, nothing here is real</div>
      ${fields.map(([k, v]) => `<div class="dfield"><span class="k">${k}</span><span class="v"></span></div>`).join("")}
      <div class="modal-actions"><button type="button" class="btn-ghost" id="dClose">close</button></div>
    </div>`;
  const vEls = box.querySelectorAll(".v");
  fields.forEach(([, v], i) => (vEls[i].textContent = v));
  document.body.appendChild(box);
  box.addEventListener("click", (e) => {
    if (e.target === box) box.remove();
  });
  box.querySelector("#dClose").onclick = () => box.remove();
}

// ── controls ───────────────────────────────────────────────────────────
els.btnCalm.addEventListener("click", () => {
  speed = "calm";
  els.btnCalm.classList.add("active");
  els.btnChaos.classList.remove("active");
});
els.btnChaos.addEventListener("click", () => {
  speed = "chaos";
  els.btnChaos.classList.add("active");
  els.btnCalm.classList.remove("active");
});
els.btnPause.addEventListener("click", () => {
  paused = !paused;
  els.btnPause.textContent = paused ? "resume" : "pause";
  els.btnPause.classList.toggle("active", paused);
  if (!paused) scheduleNext();
  else clearTimeout(timer);
});
els.btnClear.addEventListener("click", () => {
  els.feed.innerHTML = '<div class="feed-empty">feed cleared. the swarm keeps working.</div>';
});

// ── share card ─────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function drawCard(canvas, card) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const MONO = "ui-monospace, monospace";

  ctx.fillStyle = "#0c0a08";
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(120, 0, 0, 120, 0, 700);
  g.addColorStop(0, "rgba(217,115,26,0.16)");
  g.addColorStop(1, "rgba(217,115,26,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#17130f";
  roundRect(ctx, 60, 60, W - 120, H - 120, 20);
  ctx.fill();
  ctx.strokeStyle = "#332920";
  ctx.lineWidth = 2;
  roundRect(ctx, 60, 60, W - 120, H - 120, 20);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = "#d9731a";
  ctx.font = `700 22px ${MONO}`;
  ctx.fillText("BOTWASTELAND — SWARM REPORT", 100, 140);

  ctx.fillStyle = "#e8ddc8";
  ctx.font = `800 46px ${MONO}`;
  ctx.fillText(`${card.botCount} bots unleashed`, 100, 210);

  ctx.fillStyle = "#8a7c66";
  ctx.font = `400 21px ${MONO}`;
  ctx.fillText(`on ${short(card.hostHandle)}'s SimCluster`, 100, 250);

  ctx.fillStyle = "#5c6b8a";
  ctx.font = `400 17px ${MONO}`;
  ctx.fillText(`sample fake DID: ${card.sampleDid}`, 100, 300);
  ctx.fillText(`${card.postCount} transmissions logged this session`, 100, 330);

  ctx.fillStyle = "#8a7c66";
  ctx.font = `400 15px ${MONO}`;
  const lines = [
    "no real accounts. no real PDS. nothing here has ever posted",
    "to Bluesky — everything above is generated in one browser tab.",
  ];
  lines.forEach((l, i) => ctx.fillText(l, 100, H - 150 + i * 24));

  ctx.textAlign = "center";
  ctx.fillStyle = "#d9731a";
  ctx.font = `700 20px ${MONO}`;
  ctx.fillText("botwasteland.bisks.net", W / 2, H - 80);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

els.shareDownload.addEventListener("click", () => {
  if (lastCard) drawCard(els.canvas, { ...lastCard, postCount });
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `botwasteland-${(hostHandle || "swarm").replace(/[^a-z0-9.-]/gi, "_")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    if (lastCard) drawCard(els.canvas, { ...lastCard, postCount });
    els.canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "botwasteland.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "botwasteland" });
      } catch {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

function buildShareText(handle, count) {
  const url = `https://botwasteland.bisks.net/s/${encodeURIComponent(handle)}`;
  return `unleashed ${count} bots on ${short(handle)}'s SimCluster, each on its own fake PDS. nothing real, all in the browser. ${url}`;
}

// ── main flow ──────────────────────────────────────────────────────────
function stopSwarm() {
  clearTimeout(timer);
  clearInterval(uptimeTimer);
  timer = null;
  uptimeTimer = null;
}

async function generate(rawHandle) {
  const handle = (rawHandle || "").trim().replace(/^@/, "");
  if (!handle) {
    setStatus("enter a handle first.", true);
    return;
  }

  stopSwarm();
  els.genBtn.disabled = true;
  els.resultWrap.classList.remove("show");
  els.shareRow.classList.remove("show");
  els.feed.innerHTML = '<div class="feed-empty">waiting for the first transmission…</div>';
  paused = false;
  els.btnPause.textContent = "pause";
  els.btnPause.classList.remove("active");
  postCount = 0;
  seq = 0;
  els.sPosts.textContent = "0";
  setStatus(`resolving @${handle}...`);

  try {
    const cluster = await buildCluster(handle, { onStep: (s) => setStatus(s) });
    const pool = [cluster.self, ...cluster.pool];
    bots = pool.map((p, i) => makeBot(p, i));
    hostHandle = cluster.handle;

    els.sBots.textContent = bots.length.toLocaleString();
    els.resultWrap.classList.add("show");
    setStatus(`${bots.length} bots activated from ${short(cluster.handle)}'s SimCluster (${cluster.kind}). swarm running.`);

    startedAt = Date.now();
    uptimeTimer = setInterval(() => {
      els.sUptime.textContent = fmtUptime(Date.now() - startedAt);
    }, 1000);
    tick(); // fires immediately, then schedules its own follow-up

    lastShareText = buildShareText(cluster.handle, bots.length);
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
    lastCard = {
      hostHandle: cluster.handle,
      botCount: bots.length,
      sampleDid: bots[Math.floor(Math.random() * bots.length)].fakeDid,
    };
    drawCard(els.canvas, { ...lastCard, postCount: 0 });
    els.shareRow.classList.add("show");
  } catch (err) {
    setStatus("couldn't unleash that one: " + (err.message || "try again") + ".", true);
  } finally {
    els.genBtn.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  generate(els.input.value);
});

const pathHandle = (location.pathname.match(/^\/s\/([^/]+)\/?$/) || [])[1];
const sharedHandle = new URLSearchParams(location.search).get("h") || (pathHandle && decodeURIComponent(pathHandle));
if (sharedHandle) {
  els.input.value = sharedHandle;
  generate(sharedHandle);
} else {
  els.input.value = "norvid-studies.bsky.social";
  generate("norvid-studies.bsky.social");
}
