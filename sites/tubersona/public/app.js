import { getProfile } from "./lib/profile.js";
import {
  mulberry32,
  randomSeed,
  rollBuild,
  buildthisTuber,
  buildTitle,
  buildSubtitle,
  TIERS,
} from "./lib/tuberbuilder.js";
import { tuberSVG } from "./lib/tubergen.js";

const TIER_BY_ID = Object.fromEntries(TIERS.map((t) => [t.id, t]));
const PATCH_KEY = "tubersona-patch";
const SITE = "tubersona.bisks.net";
const BUILDTHIS_HANDLE = "buildthis.bisks.net";

const els = {
  form: document.getElementById("digForm"),
  input: document.getElementById("handleInput"),
  digBtn: document.getElementById("digBtn"),
  buildthisBtn: document.getElementById("buildthisBtn"),
  status: document.getElementById("status"),
  patch: document.getElementById("patch"),
  whoAvatar: document.getElementById("whoAvatar"),
  whoHandle: document.getElementById("whoHandle"),
  reveal: document.getElementById("reveal"),
  shareRow: document.getElementById("shareRow"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  shareCanvas: document.getElementById("shareCanvas"),
  digAgain: document.getElementById("digAgain"),
  patchGrid: document.getElementById("patchGrid"),
  patchEmpty: document.getElementById("patchEmpty"),
  patchActions: document.getElementById("patchActions"),
  clearPatch: document.getElementById("clearPatch"),
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

function loadPatch() {
  try {
    return JSON.parse(localStorage.getItem(PATCH_KEY) || "[]");
  } catch {
    return [];
  }
}
function savePatch(list) {
  try {
    localStorage.setItem(PATCH_KEY, JSON.stringify(list));
  } catch {
    // storage full or unavailable — the dig still shows, it just won't persist
  }
}

function renderPatch() {
  const list = loadPatch();
  els.patchEmpty.style.display = list.length ? "none" : "block";
  els.patchActions.style.display = list.length ? "block" : "none";
  els.patchGrid.innerHTML = list
    .map((entry) => {
      const tier = TIER_BY_ID[entry.build.tier.id] || entry.build.tier;
      return `
        <div class="pgcard">
          ${tuberSVG(entry.build)}
          <span class="rarity" style="background:${tier.color};color:#1a1006;">${escapeHtml(tier.label)}</span>
          <div class="ptitle">${escapeHtml(buildTitle(entry.build))}</div>
          <div class="pwho">@${escapeHtml(entry.handle)}</div>
        </div>
      `;
    })
    .join("");
}

function addToPatch(entry) {
  const list = loadPatch();
  list.unshift(entry);
  savePatch(list);
  renderPatch();
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
  return `Dug up a ${buildTitle(build)} for @${handle} at tubersona 🥔 ${url}`;
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
  ctx.fillStyle = "#16130e";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, W * 0.6);
  glow.addColorStop(0, tier.color + "33");
  glow.addColorStop(1, "rgba(22,19,14,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#8fae63";
  ctx.font = `800 44px ${mono}`;
  ctx.fillText("tubersona", 56, 76);
  ctx.fillStyle = "#b3a58f";
  ctx.font = `400 18px ${mono}`;
  ctx.fillText("dug up for @" + handle, 56, 106);

  try {
    const img = await loadSvgImage(tuberSVG(build));
    ctx.drawImage(img, 220, 130, 360, 360);
  } catch {
    // image failed to rasterize — card still gets the text below
  }

  ctx.textAlign = "left";
  ctx.fillStyle = tier.color;
  ctx.font = `800 26px ${mono}`;
  ctx.fillText(tier.label.toUpperCase(), 90, 555);
  ctx.fillStyle = "#f2ead9";
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
    ${tuberSVG(build)}
    <div class="build-title">${escapeHtml(buildTitle(build))}</div>
    <div class="build-sub">${escapeHtml(buildSubtitle(build)) || "&nbsp;"}</div>
  `;
  restartAnimation(els.reveal, "tier-" + build.tier.id);

  lastShareText = buildShareText(profile.handle, build, build.seed);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  els.shareRow.style.display = "flex";
  buildShareCard(build, profile.handle);

  els.patch.classList.add("show");

  addToPatch({
    handle: profile.handle,
    avatar: profile.avatar || "",
    ts: Date.now(),
    build,
  });
}

async function dig(rawHandle, forcedSeed) {
  const handle = (rawHandle || "").trim().replace(/^@/, "");
  if (!handle) {
    setStatus("enter a handle first.", true);
    return;
  }
  els.digBtn.disabled = true;
  els.digAgain.disabled = true;
  setStatus(`digging up @${handle}...`);
  try {
    const profile = await getProfile(handle);
    let build;
    if (profile.handle.toLowerCase() === BUILDTHIS_HANDLE) {
      build = buildthisTuber();
    } else {
      const seed = forcedSeed != null ? forcedSeed : randomSeed();
      const rng = mulberry32(seed);
      build = rollBuild(rng, seed);
    }
    showBuild(build, handle, profile);
    setStatus("");
  } catch (err) {
    setStatus(err.message || `couldn't dig one up for "${handle}".`, true);
  } finally {
    els.digBtn.disabled = false;
    els.digAgain.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  dig(els.input.value);
});
els.digAgain.addEventListener("click", () => dig(lastHandle || els.input.value));
els.buildthisBtn.addEventListener("click", () => {
  els.input.value = BUILDTHIS_HANDLE;
  dig(BUILDTHIS_HANDLE);
});

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tubersona-${(lastHandle || "tuber").replace(/[^a-z0-9.-]/gi, "_")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "tubersona.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "tubersona" });
      } catch {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

els.clearPatch.addEventListener("click", () => {
  if (!confirm("clear your local patch? this can't be undone.")) return;
  savePatch([]);
  renderPatch();
});

renderPatch();

const params = new URLSearchParams(location.search);
const sharedHandle = params.get("h");
const sharedSeed = params.get("b");
if (sharedHandle) {
  els.input.value = sharedHandle;
  dig(sharedHandle, sharedSeed != null ? Number(sharedSeed) : undefined);
} else {
  els.input.value = BUILDTHIS_HANDLE;
  dig(BUILDTHIS_HANDLE);
}
