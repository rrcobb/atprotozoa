import { getProfile } from "./lib/profile.js";
import { mulberry32, randomSeed, rollBuild, buildTitle, buildSubtitle, TIERS } from "./lib/carbuilder.js";
import { carSVG } from "./lib/cargen.js";

const TIER_BY_ID = Object.fromEntries(TIERS.map((t) => [t.id, t]));
const GARAGE_KEY = "bodyshop-garage";
const SITE = "bodyshop.bisks.net";

const els = {
  form: document.getElementById("pullForm"),
  input: document.getElementById("handleInput"),
  pullBtn: document.getElementById("pullBtn"),
  status: document.getElementById("status"),
  bay: document.getElementById("bay"),
  whoAvatar: document.getElementById("whoAvatar"),
  whoHandle: document.getElementById("whoHandle"),
  reveal: document.getElementById("reveal"),
  shareRow: document.getElementById("shareRow"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  shareCanvas: document.getElementById("shareCanvas"),
  pullAgain: document.getElementById("pullAgain"),
  garageGrid: document.getElementById("garageGrid"),
  garageEmpty: document.getElementById("garageEmpty"),
  garageActions: document.getElementById("garageActions"),
  clearGarage: document.getElementById("clearGarage"),
};

let lastShareText = "";
let lastBuild = null;
let lastHandle = "";

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function loadGarage() {
  try {
    return JSON.parse(localStorage.getItem(GARAGE_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveGarage(list) {
  try {
    localStorage.setItem(GARAGE_KEY, JSON.stringify(list));
  } catch {
    // storage full or unavailable — the pull still shows, it just won't persist
  }
}

function renderGarage() {
  const list = loadGarage();
  els.garageEmpty.style.display = list.length ? "none" : "block";
  els.garageActions.style.display = list.length ? "block" : "none";
  els.garageGrid.innerHTML = list
    .map((entry) => {
      const tier = TIER_BY_ID[entry.build.tier.id] || entry.build.tier;
      return `
        <div class="ggcard">
          ${carSVG(entry.build)}
          <span class="rarity" style="background:${tier.color};color:#1a1006;">${escapeHtml(tier.label)}</span>
          <div class="gtitle">${escapeHtml(buildTitle(entry.build))}</div>
          <div class="gwho">@${escapeHtml(entry.handle)}</div>
        </div>
      `;
    })
    .join("");
}

function addToGarage(entry) {
  const list = loadGarage();
  list.unshift(entry);
  saveGarage(list);
  renderGarage();
}

function restartAnimation(el, className) {
  el.classList.remove(className || "show");
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  el.classList.add(className || "show");
}

function buildShareText(handle, build, seed) {
  const url = `https://${SITE}/?h=${encodeURIComponent(handle)}&b=${seed}`;
  return `Pulled a ${build.tier.label}: ${buildTitle(build)} for @${handle} at bodyshop! ${url}`;
}

function svgDataUri(svg) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function loadSvgImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = svgDataUri(svg);
  });
}

async function buildShareCard(build, handle) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "ui-monospace, monospace";
  const tier = build.tier;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#14100c";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, W * 0.6);
  glow.addColorStop(0, tier.color + "33");
  glow.addColorStop(1, "rgba(20,16,12,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ff8a3d";
  ctx.font = `800 44px ${mono}`;
  ctx.fillText("bodyshop", 56, 76);
  ctx.fillStyle = "#a8998a";
  ctx.font = `400 18px ${mono}`;
  ctx.fillText("pulled for @" + handle, 56, 106);

  try {
    const img = await loadSvgImage(carSVG(build));
    ctx.drawImage(img, 90, 160, 700, 350);
  } catch {
    // image failed to rasterize — card still gets the text below
  }

  ctx.textAlign = "left";
  ctx.fillStyle = tier.color;
  ctx.font = `800 26px ${mono}`;
  ctx.fillText(tier.label.toUpperCase(), 90, 555);
  ctx.fillStyle = "#f2e8db";
  ctx.font = `800 30px ${mono}`;
  ctx.fillText(buildTitle(build), 90, 592);

  ctx.textAlign = "right";
  ctx.fillStyle = "#ffd24e";
  ctx.font = `700 22px ${mono}`;
  ctx.fillText(SITE, W - 56, H - 40);
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

function showBuild(build, handle, profile) {
  lastBuild = build;
  lastHandle = handle;

  els.whoAvatar.src = profile.avatar || "";
  els.whoHandle.textContent = "@" + profile.handle;

  els.reveal.className = "reveal tier-" + build.tier.id;
  els.reveal.innerHTML = `
    <span class="tier-badge" style="background:${build.tier.color};color:#1a1006;">${escapeHtml(build.tier.label)}</span>
    ${carSVG(build)}
    <div class="build-title">${escapeHtml(buildTitle(build))}</div>
    <div class="build-sub">${escapeHtml(buildSubtitle(build)) || "&nbsp;"}</div>
  `;
  restartAnimation(els.reveal, "tier-" + build.tier.id);

  lastShareText = buildShareText(profile.handle, build, build.seed);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  els.shareRow.style.display = "flex";
  buildShareCard(build, profile.handle);

  els.bay.classList.add("show");

  addToGarage({
    handle: profile.handle,
    avatar: profile.avatar || "",
    ts: Date.now(),
    build,
  });
}

async function pull(rawHandle, forcedSeed) {
  const handle = (rawHandle || "").trim().replace(/^@/, "");
  if (!handle) {
    setStatus("enter a handle first.", true);
    return;
  }
  els.pullBtn.disabled = true;
  els.pullAgain.disabled = true;
  setStatus(`resolving @${handle}...`);
  try {
    const profile = await getProfile(handle);
    const seed = forcedSeed != null ? forcedSeed : randomSeed();
    const rng = mulberry32(seed);
    const build = rollBuild(rng, seed);
    showBuild(build, handle, profile);
    setStatus("");
  } catch (err) {
    setStatus(err.message || `couldn't pull for "${handle}".`, true);
  } finally {
    els.pullBtn.disabled = false;
    els.pullAgain.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  pull(els.input.value);
});
els.pullAgain.addEventListener("click", () => pull(lastHandle || els.input.value));

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bodyshop-${(lastHandle || "build").replace(/[^a-z0-9.-]/gi, "_")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "bodyshop.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "bodyshop" });
      } catch {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

els.clearGarage.addEventListener("click", () => {
  if (!confirm("clear your local garage? this can't be undone.")) return;
  saveGarage([]);
  renderGarage();
});

renderGarage();

const params = new URLSearchParams(location.search);
const sharedHandle = params.get("h");
const sharedSeed = params.get("b");
if (sharedHandle) {
  els.input.value = sharedHandle;
  pull(sharedHandle, sharedSeed != null ? Number(sharedSeed) : undefined);
} else {
  els.input.value = "norvid-studies.bsky.social";
  pull("norvid-studies.bsky.social");
}
