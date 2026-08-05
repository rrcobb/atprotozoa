import { buildCluster } from "./lib/cluster.js";
import { buildBanner, pull, pullMany, getPity, getCollection, TIER_META, statsFor } from "./lib/gacha.js";

const els = {
  form: document.getElementById("searchForm"),
  input: document.getElementById("handleInput"),
  openBtn: document.getElementById("openBtn"),
  status: document.getElementById("status"),
  bannerSection: document.getElementById("bannerSection"),
  bannerAvatar: document.getElementById("bannerAvatar"),
  bannerWho: document.getElementById("bannerWho"),
  bannerMeta: document.getElementById("bannerMeta"),
  pityCount: document.getElementById("pityCount"),
  pityLimit: document.getElementById("pityLimit"),
  pityFill: document.getElementById("pityFill"),
  pull1: document.getElementById("pull1"),
  pull10: document.getElementById("pull10"),
  stage: document.getElementById("stage"),
  shareRow: document.getElementById("shareRow"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  shareCanvas: document.getElementById("shareCanvas"),
  collectionGrid: document.getElementById("collectionGrid"),
  collectionEmpty: document.getElementById("collectionEmpty"),
};

let banner = null;
let lastShareText = "";
let lastResult = null;

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function cardHTML(profile, tier, { big = false, isNew = false } = {}) {
  const meta = TIER_META[tier];
  const s = statsFor(profile);
  const av = profile.avatar
    ? `<img class="avatar" src="${profile.avatar}" alt="" loading="lazy" />`
    : `<div class="avatar"></div>`;
  return `
    ${profile.featured ? '<div class="featured-badge">★ banner</div>' : ""}
    ${isNew ? '<div class="new-badge">NEW</div>' : ""}
    ${av}
    <span class="rarity">${meta.label}</span>
    <div class="name">${escapeHtml(profile.displayName)}</div>
    <div class="handle">@${escapeHtml(profile.handle)}</div>
    <div class="stats"><span>ATK ${s.atk}</span><span>DEF ${s.def}</span><span>SPD ${s.spd}</span></div>
  `;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function updatePityUI() {
  if (!banner) return;
  const p = getPity(banner.ownerDid);
  els.pityCount.textContent = p;
  els.pityFill.style.width = Math.min(100, (p / 10) * 100) + "%";
}

function renderCollection() {
  if (!banner) return;
  const col = getCollection(banner.ownerDid);
  const entries = Object.entries(col).sort((a, b) => {
    const order = { SSR: 0, SR: 1, R: 2, N: 3 };
    return order[a[1].tier] - order[b[1].tier] || b[1].count - a[1].count;
  });
  els.collectionEmpty.style.display = entries.length ? "none" : "block";
  els.collectionGrid.innerHTML = entries
    .map(([did, c]) => {
      const av = c.avatar
        ? `<img src="${c.avatar}" alt="" loading="lazy" />`
        : `<div style="width:44px;height:44px;border-radius:50%;background:#2a1d3a;margin:0 auto 4px;"></div>`;
      return `<div class="cgrid-card tier-${c.tier}">
        ${av}
        <div class="handle">@${escapeHtml(c.handle)}</div>
        <span class="rarity" style="font-size:9px;padding:1px 5px;">${c.tier}</span>
        ${c.count > 1 ? `<div class="dupe">×${c.count}</div>` : ""}
      </div>`;
    })
    .join("");
}

function buildShareText(result) {
  const url = `https://simcluster-gacha.bisks.net/?h=${encodeURIComponent(banner.ownerHandle)}`;
  const article = ["SSR", "R"].includes(result.tier) ? "an" : "a";
  return `Just pulled ${article} ${result.tier} @${result.card.handle} from the SimCluster Gacha (banner: @${banner.ownerHandle})! ${url}`;
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

async function buildShareCard(result) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "ui-monospace, monospace";
  const meta = TIER_META[result.tier];
  const avatar = await loadImg(result.card.avatar);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0b0710";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.6);
  glow.addColorStop(0, meta.color + "33");
  glow.addColorStop(1, "rgba(11,7,16,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = meta.color;
  ctx.font = `800 40px ${mono}`;
  ctx.fillText("simcluster gacha", 56, 76);
  ctx.fillStyle = "#a996c4";
  ctx.font = `400 18px ${mono}`;
  ctx.fillText("banner: @" + banner.ownerHandle, 56, 106);

  const cardX = W / 2 - 220, cardY = 150, cardW = 440, cardH = 420;
  ctx.fillStyle = "#1c1128";
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 24);
  ctx.fill();
  ctx.strokeStyle = meta.color;
  ctx.lineWidth = 4;
  ctx.stroke();

  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, cardY + 110, 70, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, W / 2 - 70, cardY + 40, 140, 140);
    ctx.restore();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = meta.color;
  ctx.font = `800 30px ${mono}`;
  ctx.fillText(meta.label, W / 2, cardY + 220);

  ctx.fillStyle = "#f2e9ff";
  ctx.font = `800 28px ${mono}`;
  ctx.fillText(result.card.displayName, W / 2, cardY + 260);
  ctx.fillStyle = "#a996c4";
  ctx.font = `400 18px ${mono}`;
  ctx.fillText("@" + result.card.handle, W / 2, cardY + 288);

  const s = statsFor(result.card);
  ctx.fillStyle = "#f2e9ff";
  ctx.font = `700 16px ${mono}`;
  ctx.fillText(`ATK ${s.atk}   DEF ${s.def}   SPD ${s.spd}`, W / 2, cardY + 340);

  ctx.fillStyle = "#6ef2c9";
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("simcluster-gacha.bisks.net", W / 2, cardY + cardH - 30);
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

function showResults(results) {
  els.stage.innerHTML = "";
  results.forEach((r, i) => {
    const div = document.createElement("div");
    div.className = `gcard tier-${r.tier}${results.length === 1 ? " big" : ""}`;
    div.style.animationDelay = `${i * 0.08}s`;
    div.innerHTML = cardHTML(r.card, r.tier, { big: results.length === 1, isNew: r.isNew });
    els.stage.appendChild(div);
  });

  lastResult = results[results.length - 1];
  const rarityOrder = { SSR: 0, SR: 1, R: 2, N: 3 };
  const best = results.reduce((a, b) => (rarityOrder[b.tier] < rarityOrder[a.tier] ? b : a));
  lastShareText = buildShareText(best);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  els.shareRow.style.display = "flex";
  buildShareCard(best);

  updatePityUI();
  renderCollection();
}

function doPull(n) {
  if (!banner) return;
  els.pull1.disabled = els.pull10.disabled = true;
  const results = n === 1 ? [pull(banner)] : pullMany(banner, n);
  showResults(results);
  els.pull1.disabled = els.pull10.disabled = false;
}

els.pull1.addEventListener("click", () => doPull(1));
els.pull10.addEventListener("click", () => doPull(10));

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `simcluster-gacha-${(lastResult?.card.handle || "card").replace(/[^a-z0-9.-]/gi, "_")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "simcluster-gacha.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "simcluster gacha" });
      } catch {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

async function openBanner(rawHandle) {
  const handle = (rawHandle || "").trim().replace(/^@/, "");
  if (!handle) { setStatus("enter a handle first.", true); return; }

  els.openBtn.disabled = true;
  els.pull1.disabled = els.pull10.disabled = true;
  els.bannerSection.classList.remove("show");
  els.stage.innerHTML = "";
  els.shareRow.style.display = "none";
  setStatus(`resolving @${handle}...`);

  try {
    const cluster = await buildCluster(handle, { onStep: (s) => setStatus(s) });
    banner = buildBanner(cluster);

    els.bannerAvatar.src = cluster.self.avatar || "";
    els.bannerWho.textContent = "@" + cluster.self.handle;
    const poolNote = cluster.counts.truncated ? `${cluster.counts.pool}+ cards (capped)` : `${cluster.counts.pool} cards`;
    els.bannerMeta.textContent = `${cluster.kind} · ${poolNote} in the banner`;
    els.pityLimit.textContent = "10";

    els.bannerSection.classList.add("show");
    els.pull1.disabled = els.pull10.disabled = false;
    updatePityUI();
    renderCollection();
    setStatus("");
  } catch (err) {
    setStatus("couldn't build that banner: " + err.message, true);
  } finally {
    els.openBtn.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  openBanner(els.input.value);
});

const sharedHandle = new URLSearchParams(location.search).get("h");
if (sharedHandle) {
  els.input.value = sharedHandle;
  openBanner(sharedHandle);
} else {
  els.input.value = "norvid-studies.bsky.social";
  openBanner("norvid-studies.bsky.social");
}
