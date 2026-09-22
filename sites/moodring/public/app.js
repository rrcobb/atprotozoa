import { resolveDid, getProfile, getLastTenPosts } from "./lib/atproto.js";
import { analyzeMood } from "./lib/mood.js";

const els = {
  form: document.getElementById("ringForm"),
  input: document.getElementById("handleInput"),
  btn: document.getElementById("ringBtn"),
  status: document.getElementById("status"),
  card: document.getElementById("card"),
  avatar: document.getElementById("avatar"),
  handleOut: document.getElementById("handleOut"),
  didOut: document.getElementById("didOut"),
  moodLabel: document.getElementById("moodLabel"),
  swatchName: document.getElementById("swatchName"),
  moodBlurb: document.getElementById("moodBlurb"),
  valenceFill: document.getElementById("valenceFill"),
  intensityFill: document.getElementById("intensityFill"),
  swatchRow: document.getElementById("swatchRow"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  shareCanvas: document.getElementById("shareCanvas"),
};

function setStatus(msg, isErr) {
  els.status.textContent = msg;
  els.status.classList.toggle("err", !!isErr);
}

function cleanHandle(raw) {
  return (raw || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split(/[/\s]/)[0];
}

const READ_STEPS = ["resolving identity...", "reading app.bsky.feed.post records...", "reading the room..."];

let lastShareText = "";

async function read(rawHandle) {
  const handle = cleanHandle(rawHandle);
  if (!handle) {
    setStatus("enter a handle first.", true);
    return;
  }

  els.btn.disabled = true;
  els.card.classList.remove("show");
  let step = 0;
  setStatus(READ_STEPS[0]);
  const stepTimer = setInterval(() => {
    step = Math.min(step + 1, READ_STEPS.length - 1);
    setStatus(READ_STEPS[step]);
  }, 450);

  try {
    const did = await resolveDid(handle);
    const [profile, posts] = await Promise.all([getProfile(did), getLastTenPosts(did)]);
    const texts = posts.map((p) => ({
      text: p.record?.text || "",
      uri: p.uri,
      createdAt: p.record?.createdAt,
    }));
    const mood = analyzeMood(texts);
    if (!mood) throw new Error(`@${profile.handle} hasn't posted anything readable yet.`);

    render({ profile, did, mood });
    setStatus(mood.postCount < 10 ? `read ${mood.postCount} post(s) — fewer than 10 in their recent history.` : "");
  } catch (err) {
    setStatus("couldn't read that ring: " + err.message, true);
  } finally {
    clearInterval(stepTimer);
    els.btn.disabled = false;
  }
}

function applyRingColors(mood) {
  const root = document.documentElement;
  const c1 = mood.color;
  const c2 = `hsl(${Math.round(mood.hue + 42)} ${mood.sat}% ${Math.min(mood.light + 14, 88)}%)`;
  const c3 = `hsl(${Math.round(mood.hue - 42)} ${mood.sat}% ${Math.max(mood.light - 10, 12)}%)`;
  root.style.setProperty("--c1", c1);
  root.style.setProperty("--c2", c2);
  root.style.setProperty("--c3", c3);
}

function render({ profile, did, mood }) {
  els.avatar.src = profile.avatar || "";
  els.avatar.style.visibility = profile.avatar ? "visible" : "hidden";
  els.handleOut.textContent = "@" + profile.handle;
  els.didOut.textContent = did;

  applyRingColors(mood);
  els.moodLabel.textContent = mood.label;
  els.swatchName.textContent = mood.swatch;
  els.moodBlurb.textContent = mood.blurb;

  els.valenceFill.style.width = Math.round(((mood.valence + 1) / 2) * 100) + "%";
  els.intensityFill.style.width = Math.round(mood.intensity * 100) + "%";

  els.swatchRow.innerHTML = "";
  for (const p of [...mood.perPost].reverse()) {
    const dot = document.createElement("div");
    dot.className = "swatch";
    dot.style.background = p.color;
    dot.title = p.text ? (p.text.length > 140 ? p.text.slice(0, 137) + "..." : p.text) : "(no text)";
    els.swatchRow.appendChild(dot);
  }

  els.card.classList.add("show");

  lastShareText = buildShareText({ profile, mood });
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  buildShareCard({ profile, mood });
}

function buildShareText({ profile, mood }) {
  const url = `https://moodring.bisks.net/s/${encodeURIComponent(profile.handle)}`;
  let text = `moodring read @${profile.handle}'s last 10 posts as ${mood.label} (${mood.swatch}). ${url}`;
  if (text.length > 295) text = text.slice(0, 292) + "... " + url;
  return text;
}

let avatarImgCache = null;
async function loadImage(src) {
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function buildShareCard({ profile, mood }) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width,
    H = canvas.height;
  const mono = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';

  avatarImgCache = await loadImage(profile.avatar);

  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W * 0.18, -40, 0, W * 0.18, -40, 480);
  g1.addColorStop(0, "#241a3a");
  g1.addColorStop(1, "rgba(10,10,15,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  const cx = 180,
    cy = H / 2,
    r = 120;
  const hue = mood.hue;
  let ring;
  if (ctx.createConicGradient) {
    ring = ctx.createConicGradient(0, cx, cy);
    ring.addColorStop(0, mood.color);
    ring.addColorStop(0.33, `hsl(${Math.round(hue + 42)} ${mood.sat}% ${Math.min(mood.light + 14, 88)}%)`);
    ring.addColorStop(0.66, `hsl(${Math.round(hue - 42)} ${mood.sat}% ${Math.max(mood.light - 10, 12)}%)`);
    ring.addColorStop(1, mood.color);
  } else {
    ring = mood.color; // older browsers: flat ring color beats no ring
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 16;
  ctx.strokeStyle = ring;
  ctx.stroke();

  if (avatarImgCache) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 16, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImgCache, cx - (r - 16), cy - (r - 16), (r - 16) * 2, (r - 16) * 2);
    ctx.restore();
  }

  ctx.textAlign = "left";
  ctx.fillStyle = mood.color;
  ctx.font = `800 40px ${mono}`;
  ctx.fillText("moodring", 400, 110);

  ctx.fillStyle = "#f0eef7";
  ctx.font = `700 24px ${mono}`;
  ctx.fillText("@" + profile.handle, 400, 152);

  ctx.font = `800 56px ${mono}`;
  ctx.fillStyle = mood.color;
  ctx.fillText(mood.label, 400, 232);

  ctx.font = `18px ${mono}`;
  ctx.fillStyle = "#8d89a3";
  ctx.fillText(mood.swatch + " · last 10 posts", 400, 266);

  ctx.font = `italic 19px ${mono}`;
  ctx.fillStyle = "#f0eef7";
  const words = mood.blurb.split(" ");
  let line = "",
    y = 320;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > 700 && line) {
      ctx.fillText(line, 400, y);
      line = w;
      y += 27;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, 400, y);

  ctx.font = `700 20px ${mono}`;
  ctx.fillStyle = mood.color;
  ctx.fillText("moodring.bisks.net", 400, H - 56);
}

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const who = (els.handleOut.textContent || "card").replace(/[^a-z0-9.-]/gi, "_");
    a.download = "moodring-" + who + ".png";
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
      const who = (els.handleOut.textContent || "card").replace(/[^a-z0-9.-]/gi, "_");
      const file = new File([blob], "moodring-" + who + ".png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "moodring" });
      } catch (_) {}
    }, "image/png");
  });
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  read(els.input.value);
});

const pathHandle = (location.pathname.match(/^\/s\/([^/]+)\/?$/) || [])[1];
const sharedHandle = new URLSearchParams(location.search).get("h") || (pathHandle && decodeURIComponent(pathHandle));
if (sharedHandle) {
  els.input.value = sharedHandle;
  read(sharedHandle);
}
