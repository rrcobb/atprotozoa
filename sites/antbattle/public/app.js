import { buildCluster } from "./lib/cluster.js";
import { buildColonies, fight } from "./lib/battle.js";

const els = {
  form: document.getElementById("searchForm"),
  input: document.getElementById("handleInput"),
  loadBtn: document.getElementById("loadBtn"),
  status: document.getElementById("status"),
  warSection: document.getElementById("warSection"),
  clusterAvatar: document.getElementById("clusterAvatar"),
  clusterWho: document.getElementById("clusterWho"),
  clusterMeta: document.getElementById("clusterMeta"),
  fightBtn: document.getElementById("fightBtn"),
  forestLabel: document.getElementById("forestLabel"),
  desertLabel: document.getElementById("desertLabel"),
  forestCount: document.getElementById("forestCount"),
  desertCount: document.getElementById("desertCount"),
  forestFill: document.getElementById("forestFill"),
  desertFill: document.getElementById("desertFill"),
  forestGrid: document.getElementById("forestGrid"),
  desertGrid: document.getElementById("desertGrid"),
  skipBtn: document.getElementById("skipBtn"),
  rematchBtn: document.getElementById("rematchBtn"),
  log: document.getElementById("log"),
  result: document.getElementById("result"),
  winnerText: document.getElementById("winnerText"),
  resultSub: document.getElementById("resultSub"),
  mvpBox: document.getElementById("mvpBox"),
  mvpAvatar: document.getElementById("mvpAvatar"),
  mvpName: document.getElementById("mvpName"),
  mvpStat: document.getElementById("mvpStat"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  shareCanvas: document.getElementById("shareCanvas"),
};

const TICK_MS = 70;

let cluster = null;
let colonies = null;
let outcome = null;
let antById = new Map();
let elById = new Map();
let playbackTimer = null;
let playbackIndex = 0;
let lastShareText = "";

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function sanitizeId(did) {
  return did.replace(/[^a-zA-Z0-9]/g, "_");
}

function antChipHTML(ant) {
  const av = ant.avatar
    ? `<img src="${ant.avatar}" alt="" loading="lazy" />`
    : `<div class="fallback-av"></div>`;
  const title = `${ant.isSelf ? "(you) " : ""}@${ant.handle} — HP ${ant.hp} ATK ${ant.atk} SPD ${ant.spd}`;
  return `
    <div class="ant" id="ant-${sanitizeId(ant.id)}" title="${escapeHtml(title)}">
      ${av}
      <div class="hpbar"><div style="width:100%"></div></div>
      <div class="handle">${ant.isSelf ? "★" : "🐜"}${escapeHtml(ant.handle.split(".")[0])}</div>
    </div>
  `;
}

function renderRosters() {
  els.forestGrid.innerHTML = colonies.forest.map(antChipHTML).join("");
  els.desertGrid.innerHTML = colonies.desert.map(antChipHTML).join("");
  elById = new Map();
  for (const ant of [...colonies.forest, ...colonies.desert]) {
    elById.set(ant.id, document.getElementById(`ant-${sanitizeId(ant.id)}`));
  }
  els.forestLabel.textContent = `🌲 forest — ${colonies.forest.length}`;
  els.desertLabel.textContent = `🏜️ desert — ${colonies.desert.length}`;
  updateWarbar(colonies.forest.length, colonies.desert.length);
}

function updateWarbar(forestAlive, desertAlive) {
  const total = Math.max(1, forestAlive + desertAlive);
  els.forestFill.style.width = `${(forestAlive / total) * 100}%`;
  els.desertFill.style.width = `${(desertAlive / total) * 100}%`;
  els.forestCount.textContent = `${forestAlive} alive`;
  els.desertCount.textContent = `${desertAlive} alive`;
}

function logLine(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  els.log.appendChild(div);
  els.log.scrollTop = els.log.scrollHeight;
}

function applyEvent(ev) {
  if (ev.type === "round") {
    if (ev.round > 1) logLine(`<span class="round">— round ${ev.round} —</span>`);
    return;
  }
  const attacker = antById.get(ev.attackerId);
  const target = antById.get(ev.targetId);
  target.hp = ev.targetHp;
  if (ev.died) target.alive = false;

  const el = elById.get(ev.targetId);
  if (el) {
    const pct = Math.max(0, (ev.targetHp / ev.targetMaxHp) * 100);
    el.querySelector(".hpbar > div").style.width = `${pct}%`;
    el.classList.add("hit");
    setTimeout(() => el.classList.remove("hit"), 300);
    if (ev.died) el.classList.add("dead");
  }

  const cls = attacker.team === "forest" ? "fdmg" : "ddmg";
  const bite = attacker.team === "forest" ? "bites" : "stings";
  logLine(
    `<span class="${cls}">@${escapeHtml(attacker.handle)}</span> ${bite} ` +
    `<span>@${escapeHtml(target.handle)}</span> for ${ev.dmg}` +
    (ev.died ? ` <span class="death">— @${escapeHtml(target.handle)} falls</span>` : ``)
  );

  if (ev.died) {
    const forestAlive = colonies.forest.filter((a) => antById.get(a.id).alive).length;
    const desertAlive = colonies.desert.filter((a) => antById.get(a.id).alive).length;
    updateWarbar(forestAlive, desertAlive);
  }
}

function stopPlayback() {
  if (playbackTimer) clearInterval(playbackTimer);
  playbackTimer = null;
}

function finishBattle() {
  stopPlayback();
  els.skipBtn.style.display = "none";
  els.rematchBtn.style.display = "";
  showResult();
}

function playTick() {
  if (playbackIndex >= outcome.events.length) {
    finishBattle();
    return;
  }
  applyEvent(outcome.events[playbackIndex]);
  playbackIndex++;
}

function startPlayback() {
  antById = new Map([...colonies.forest, ...colonies.desert].map((a) => [a.id, { ...a }]));
  playbackIndex = 0;
  els.log.innerHTML = "";
  els.result.classList.remove("show");
  els.skipBtn.style.display = "";
  els.rematchBtn.style.display = "none";
  els.fightBtn.disabled = true;
  updateWarbar(colonies.forest.length, colonies.desert.length);
  for (const el of elById.values()) el.classList.remove("dead", "hit");
  playbackTimer = setInterval(playTick, TICK_MS);
}

els.skipBtn.addEventListener("click", () => {
  stopPlayback();
  while (playbackIndex < outcome.events.length) {
    applyEvent(outcome.events[playbackIndex]);
    playbackIndex++;
  }
  finishBattle();
});

els.rematchBtn.addEventListener("click", () => {
  els.rematchBtn.style.display = "none";
  els.fightBtn.disabled = false;
  runFight();
});

function buildShareText() {
  const url = `https://antbattle.bisks.net/?h=${encodeURIComponent(cluster.handle)}`;
  const winnerLabel = outcome.winner === "forest" ? "🌲 forest ants" : "🏜️ desert ants";
  const score = `${outcome.forestSurvivors}-${outcome.desertSurvivors}`;
  return `@${cluster.handle}'s SimCluster went to war: ${winnerLabel} win, ${score} survivors left standing. ${url}`;
}

async function loadImg(src) {
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function buildShareCard() {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "ui-monospace, monospace";
  const forestColor = "#6ee06e", desertColor = "#ffb15c";
  const winnerColor = outcome.winner === "forest" ? forestColor : desertColor;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0c0f0a";
  ctx.fillRect(0, 0, W, H);
  const half = ctx.createLinearGradient(0, 0, W, 0);
  half.addColorStop(0, "#1c3312");
  half.addColorStop(0.5, "#0c0f0a");
  half.addColorStop(1, "#3a2708");
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = half;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  ctx.textAlign = "left";
  ctx.fillStyle = winnerColor;
  ctx.font = `800 40px ${mono}`;
  ctx.fillText("ant battle", 56, 76);
  ctx.fillStyle = "#9db08c";
  ctx.font = `400 18px ${mono}`;
  ctx.fillText("@" + cluster.handle + "'s SimCluster", 56, 106);

  ctx.textAlign = "center";
  ctx.fillStyle = forestColor;
  ctx.font = `700 24px ${mono}`;
  ctx.fillText("🌲 forest", W * 0.28, 220);
  ctx.font = `800 90px ${mono}`;
  ctx.fillText(String(outcome.forestSurvivors), W * 0.28, 320);

  ctx.fillStyle = "#eef4e3";
  ctx.font = `700 28px ${mono}`;
  ctx.fillText("vs", W * 0.5, 280);

  ctx.fillStyle = desertColor;
  ctx.font = `700 24px ${mono}`;
  ctx.fillText("🏜️ desert", W * 0.72, 220);
  ctx.font = `800 90px ${mono}`;
  ctx.fillText(String(outcome.desertSurvivors), W * 0.72, 320);

  ctx.fillStyle = winnerColor;
  ctx.font = `800 34px ${mono}`;
  const winLabel = outcome.winner === "forest" ? "FOREST COLONY WINS" : "DESERT COLONY WINS";
  ctx.fillText(winLabel, W / 2, 420);

  if (outcome.mvp) {
    const avatar = await loadImg(outcome.mvp.avatar);
    const cx = W / 2, cy = 490;
    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx - 90, cy, 34, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, cx - 124, cy - 34, 68, 68);
      ctx.restore();
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "#eef4e3";
    ctx.font = `700 22px ${mono}`;
    ctx.fillText(`MVP: @${outcome.mvp.handle}`, cx - 42, cy - 2);
    ctx.fillStyle = "#9db08c";
    ctx.font = `400 16px ${mono}`;
    ctx.fillText(`${outcome.mvp.kills} kills · ${outcome.mvp.damageDealt} dmg`, cx - 42, cy + 24);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#6ee06e";
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("antbattle.bisks.net", W / 2, H - 40);
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

function showResult() {
  const forestWon = outcome.winner === "forest";
  els.winnerText.textContent = forestWon ? "🌲 the forest colony wins" : "🏜️ the desert colony wins";
  els.winnerText.className = "winner " + outcome.winner;
  const rounds = outcome.timedOut ? `${outcome.rounds}+ rounds (called on remaining HP)` : `${outcome.rounds} rounds`;
  els.resultSub.textContent =
    `${outcome.forestSurvivors}/${outcome.forestTotal} forest ants and ${outcome.desertSurvivors}/${outcome.desertTotal} desert ants survived · ${rounds}`;

  if (outcome.mvp) {
    els.mvpBox.style.display = "";
    els.mvpAvatar.src = outcome.mvp.avatar || "";
    els.mvpName.textContent = `@${outcome.mvp.handle}${outcome.mvp.isSelf ? " (you)" : ""}`;
    els.mvpStat.textContent = `${outcome.mvp.kills} kills · ${outcome.mvp.damageDealt} damage dealt`;
  } else {
    els.mvpBox.style.display = "none";
  }

  lastShareText = buildShareText();
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  buildShareCard();
  els.result.classList.add("show");
}

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `antbattle-${(cluster?.handle || "battle").replace(/[^a-z0-9.-]/gi, "_")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "antbattle.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "ant battle" });
      } catch {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

function runFight() {
  outcome = fight(colonies);
  startPlayback();
}

els.fightBtn.addEventListener("click", () => {
  if (!colonies) return;
  runFight();
});

async function loadHandle(rawHandle) {
  const handle = (rawHandle || "").trim().replace(/^@/, "");
  if (!handle) { setStatus("enter a handle first.", true); return; }

  stopPlayback();
  els.loadBtn.disabled = true;
  els.fightBtn.disabled = true;
  els.warSection.classList.remove("show");
  els.result.classList.remove("show");
  els.log.innerHTML = "";
  els.skipBtn.style.display = "none";
  els.rematchBtn.style.display = "none";
  setStatus(`resolving @${handle}...`);

  try {
    cluster = await buildCluster(handle, { onStep: (s) => setStatus(s) });
    colonies = buildColonies(cluster);
    outcome = null;

    els.clusterAvatar.src = cluster.self.avatar || "";
    els.clusterWho.textContent = "@" + cluster.self.handle;
    const clusterSize = cluster.counts.pool + 1;
    const poolNote = cluster.counts.truncated ? `${clusterSize}+ in SimCluster` : `${clusterSize} in SimCluster`;
    const rosterNote = colonies.truncated ? ` · roster capped to ${colonies.forest.length + colonies.desert.length} ants for battle` : "";
    els.clusterMeta.textContent = `${cluster.kind} · ${poolNote} · ${colonies.forest.length} forest / ${colonies.desert.length} desert${rosterNote}`;

    renderRosters();
    els.warSection.classList.add("show");
    els.fightBtn.disabled = false;
    setStatus("");
  } catch (err) {
    setStatus("couldn't muster that cluster: " + err.message, true);
  } finally {
    els.loadBtn.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  loadHandle(els.input.value);
});

const sharedHandle = new URLSearchParams(location.search).get("h");
if (sharedHandle) {
  els.input.value = sharedHandle;
  loadHandle(sharedHandle);
} else {
  els.input.value = "cee.wtf";
  loadHandle("cee.wtf");
}
