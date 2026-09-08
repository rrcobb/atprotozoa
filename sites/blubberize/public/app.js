import { renderSeal, tintFor } from "./lib/seal.js";

const PUB = "https://public.api.bsky.app/xrpc";

const $ = (id) => document.getElementById(id);
const els = {
  form: $("searchForm"),
  youInput: $("youInput"),
  targetInput: $("targetInput"),
  genBtn: $("genBtn"),
  status: $("status"),
  resultWrap: $("resultWrap"),
  arena: $("arena"),
  youSlot: $("youSlot"),
  targetSlot: $("targetSlot"),
  youSeal: $("youSeal"),
  targetSeal: $("targetSeal"),
  youLabel: $("youLabel"),
  targetLabel: $("targetLabel"),
  fissionBolt: $("fissionBolt"),
  sYouFollowers: $("sYouFollowers"),
  sTargetFollowers: $("sTargetFollowers"),
  sBlubber: $("sBlubber"),
  fissionBtn: $("fissionBtn"),
  verdict: $("verdict"),
  shareRow: $("shareRow"),
  shareBluesky: $("shareBluesky"),
  shareDownload: $("shareDownload"),
  shareNative: $("shareNative"),
  canvas: $("cardCanvas"),
};

const short = (h) => "@" + String(h || "").replace(/\.bsky\.social$/, "");
const fmt = (n) => Number(n || 0).toLocaleString();

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

async function resolveProfile(raw) {
  const actor = (raw || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!actor) throw new Error("empty handle");
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName || p.handle,
    avatar: p.avatar || "",
    followersCount: p.followersCount || 0,
  };
}

// Real followersCount, sqrt-scaled so a huge account doesn't blow the arena
// out and a tiny one doesn't vanish — a doubling of followers grows the seal
// visibly but not linearly.
function sizeFor(followers, maxFollowers) {
  const MIN = 0.3, MAX = 1;
  if (maxFollowers <= 0) return (MIN + MAX) / 2;
  const t = Math.sqrt(Math.max(0, followers)) / Math.sqrt(maxFollowers);
  return MIN + Math.min(1, t) * (MAX - MIN);
}

let state = null; // { you, target, refMax, fissioned }

function renderSlot(seal, label, slot, profile, followersOverride, refMax, blubberized) {
  const followers = followersOverride ?? profile.followersCount;
  const scale = sizeFor(followers, refMax);
  const px = Math.round(70 + scale * 90);
  seal.style.width = px + "px";
  seal.style.height = px + "px";
  renderSeal(seal, scale, tintFor(profile.did), blubberized);
  label.innerHTML = `<b>${short(profile.handle)}</b> · ${fmt(Math.round(followers))} followers`;
  slot.classList.toggle("blubberized", !!blubberized);
}

function renderPair() {
  const { you, target, refMax, fissioned, youDisplay, targetDisplay } = state;
  renderSlot(els.youSeal, els.youLabel, els.youSlot, you, fissioned ? youDisplay : you.followersCount, refMax, false);
  renderSlot(
    els.targetSeal,
    els.targetLabel,
    els.targetSlot,
    target,
    fissioned ? targetDisplay : target.followersCount,
    refMax,
    fissioned,
  );
}

function buildShareUrl(youHandle, targetHandle) {
  return `https://blubberize.bisks.net/s/${encodeURIComponent(youHandle)}/${encodeURIComponent(targetHandle)}`;
}

function buildShareText() {
  const { you, target } = state;
  const url = buildShareUrl(you.handle, target.handle);
  const prefix = `${short(you.handle)} fissioned half their blubber at ${short(target.handle)} — BLUBBERIZED, unable to post. `;
  const budget = 300 - url.length - 1;
  const text = prefix.length > budget ? prefix.slice(0, Math.max(0, budget - 1)) + "… " : prefix;
  return text + url;
}

function drawShareCard() {
  const { you, target } = state;
  const c = els.canvas;
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0c2138");
  g.addColorStop(1, "#051220");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ff7a5c";
  ctx.font = "800 52px ui-monospace, monospace";
  ctx.fillText("BLUBBERIZED", 60, 110);

  ctx.fillStyle = "#eaf6ff";
  ctx.font = "600 26px ui-monospace, monospace";
  ctx.fillText(`${short(you.handle)} fissioned half their blubber at ${short(target.handle)}`, 60, 160);
  ctx.fillStyle = "#7fa3bf";
  ctx.font = "600 20px ui-monospace, monospace";
  ctx.fillText("unable to post (cosmetically, not really)", 60, 194);

  drawShareSeal(ctx, 300, 420, 130, tintFor(you.did), false, short(you.handle));
  drawShareSeal(ctx, W - 300, 420, 150, tintFor(target.did), true, short(target.handle));

  ctx.fillStyle = "#ffb84d";
  ctx.font = "700 30px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("💥", W / 2, 400);

  ctx.textAlign = "right";
  ctx.fillStyle = "#9fe3ff";
  ctx.font = "700 24px ui-monospace, monospace";
  ctx.fillText("blubberize.bisks.net", W - 56, H - 44);
}

function drawShareSeal(ctx, cx, cy, r, color, blubberized, label) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fillStyle = blubberized ? "#ffb84d" : color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.85, r * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = blubberized ? "#ffb84d" : color;
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "#eaf6ff";
  ctx.font = "700 22px ui-monospace, monospace";
  ctx.fillText(label, cx, cy + r + 40);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const test = new File([new Uint8Array([1])], "t.png", { type: "image/png" });
    return navigator.canShare({ files: [test] });
  } catch {
    return false;
  }
}

function wireShare() {
  const shareText = buildShareText();
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  els.shareRow.style.display = "flex";
  drawShareCard();
  if (canShareFiles()) els.shareNative.style.display = "inline-block";

  els.shareDownload.onclick = () => {
    els.canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "blubberized.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  };

  els.shareNative.onclick = () => {
    drawShareCard();
    els.canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "blubberized.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: shareText, title: "blubberize" });
      } catch {}
    }, "image/png");
  };
}

function doFission() {
  if (!state || state.fissioned) return;
  const { you, target } = state;
  const half = you.followersCount / 2;
  state.youDisplay = you.followersCount - half;
  state.targetDisplay = target.followersCount + half;

  const bolt = els.fissionBolt;
  const arenaRect = els.arena.getBoundingClientRect();
  const youRect = els.youSeal.getBoundingClientRect();
  const targetRect = els.targetSeal.getBoundingClientRect();
  const x1 = youRect.left + youRect.width / 2 - arenaRect.left;
  const x2 = targetRect.left + targetRect.width / 2 - arenaRect.left;
  bolt.style.left = Math.min(x1, x2) + "px";
  bolt.style.width = Math.abs(x2 - x1) + "px";
  bolt.classList.remove("go");
  void bolt.offsetWidth; // restart animation
  bolt.classList.add("go");

  els.fissionBtn.disabled = true;
  els.fissionBtn.textContent = "fissioning…";

  setTimeout(() => {
    state.fissioned = true;
    renderPair();
    els.fissionBtn.textContent = "💥 fissioned";
    els.verdict.style.display = "block";
    els.verdict.textContent = `${short(you.handle)} projectiled ${fmt(Math.round(half))} blubber at ${short(target.handle)} — BLUBBERIZED, unable to post. (it's a bit; the account can still post fine.)`;
    wireShare();
  }, 650);
}

els.fissionBtn.addEventListener("click", doFission);

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const youRaw = els.youInput.value.trim();
  const targetRaw = els.targetInput.value.trim();
  if (!youRaw || !targetRaw) {
    setStatus("need both a handle for you and a target.", true);
    return;
  }
  els.genBtn.disabled = true;
  els.fissionBtn.disabled = false;
  els.fissionBtn.textContent = "💥 FISSION";
  els.verdict.style.display = "none";
  els.shareRow.style.display = "none";
  setStatus(`resolving @${youRaw.replace(/^@/, "")} and @${targetRaw.replace(/^@/, "")}…`);
  try {
    const [you, target] = await Promise.all([resolveProfile(youRaw), resolveProfile(targetRaw)]);
    const refMax = Math.max(you.followersCount, target.followersCount, 1);
    state = { you, target, refMax, fissioned: false, youDisplay: you.followersCount, targetDisplay: target.followersCount };
    renderPair();
    els.sYouFollowers.textContent = fmt(you.followersCount);
    els.sTargetFollowers.textContent = fmt(target.followersCount);
    els.sBlubber.textContent = fmt(Math.round(you.followersCount / 2));
    els.resultWrap.classList.add("show");
    setStatus("both seals surfaced. hit FISSION when ready.");
    els.resultWrap.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    setStatus(
      err && err.status === 400
        ? "couldn't find one of those handles. check the spelling?"
        : "couldn't load one of those — " + (err.message || "try again") + ".",
      true,
    );
  } finally {
    els.genBtn.disabled = false;
  }
});

const params = new URLSearchParams(location.search);
const pathMatch = location.pathname.match(/^\/s\/([^/]+)\/([^/]+)\/?$/);
const initialYou = params.get("you") || (pathMatch && decodeURIComponent(pathMatch[1])) || "";
const initialTarget = params.get("target") || (pathMatch && decodeURIComponent(pathMatch[2])) || "";
if (initialYou) els.youInput.value = initialYou;
if (initialTarget) els.targetInput.value = initialTarget;
if (initialYou && initialTarget) els.form.requestSubmit();
