// thumbjack — reads a Bluesky handle's public recent posts and slaps them
// into a shameless, algorithm-bait YouTube thumbnail, drawn entirely on a
// <canvas>. No AI: it's a font, an arrow, a starburst sticker, and bad taste.

import { resolveDid, getProfile, getRecentPosts } from "./lib/atproto.js";

// --- content pools --------------------------------------------------------

// Each frame turns a real (optional) post excerpt `p` and a handle `h`
// ("@name") into an all-caps thumbnail headline. `needsPost` frames are only
// eligible when we actually found a usable recent post to quote.
const FRAMES = [
  { needsPost: true, build: (p, h) => `I CAN'T BELIEVE ${h} SAID "${p}"` },
  { needsPost: true, build: (p, h) => `"${p}" — ${h} (GONE WRONG)` },
  { needsPost: true, build: (p) => `${p}` },
  { needsPost: true, build: (p, h) => `${h} SAID "${p}" AND EVERYONE LOST IT` },
  { needsPost: true, build: (p, h) => `I TRIED WHAT ${h} SAID. IT WORKED?!` },
  { needsPost: true, build: (p, h) => `${h}'S LAST POST BEFORE THE ALGORITHM GOT THEM` },
  { needsPost: true, build: (p, h) => `DOCTORS HATE THIS ONE WEIRD POST FROM ${h}` },
  { needsPost: true, build: (p) => `${p} 😱 NOT CLICKBAIT` },
  { needsPost: false, build: (p, h) => `THE TRUTH ABOUT ${h}` },
  { needsPost: false, build: (p, h) => `${h} JUST SAID THE UNTHINKABLE` },
  { needsPost: false, build: (p, h) => `YOU WON'T BELIEVE WHAT ${h} POSTED` },
  { needsPost: false, build: (p, h) => `${h} HAS ENTERED THEIR FINAL ERA` },
  { needsPost: false, build: (p, h) => `I QUIT BLUESKY BECAUSE OF ${h}` },
  { needsPost: false, build: (p, h) => `${h} IS NOT OKAY` },
  { needsPost: false, build: () => `THE END OF BLUESKY AS WE KNOW IT` },
  { needsPost: false, build: (p, h) => `I FOUND ${h}'S MOST UNHINGED POST` },
  { needsPost: false, build: (p, h) => `WAIT UNTIL YOU SEE WHAT ${h} DID` },
  { needsPost: false, build: (p, h) => `SCIENTISTS ARE STUDYING ${h}` },
  { needsPost: false, build: (p, h) => `${h} BROKE THE TIMELINE WITH ONE POST` },
  { needsPost: false, build: (p, h) => `WHY IS NOBODY TALKING ABOUT ${h}` },
];

const BADGES = [
  "NOT CLICKBAIT", "100% REAL", "MUST SEE", "GONE WRONG", "MIND BLOWN",
  "SHOCKING", "VIRAL", "BREAKING", "UNHINGED", "EMOTIONAL",
  "CERTIFIED BANGER", "NO CAP", "TRENDING NOW", "INSANE",
];

const EMOJIS = ["😱", "🤯", "😭", "👀", "😳", "🔥"];

const THEMES = [
  { bg: ["#ff5b1a", "#c40010"], accent: "#ffe000", textFill: "#ffffff", textStroke: "#000000", badgeBg: "#ffe000", badgeFg: "#1a1200" },
  { bg: ["#fff200", "#ff8a00"], accent: "#e4002b", textFill: "#111111", textStroke: "#ffffff", badgeBg: "#e4002b", badgeFg: "#ffffff" },
  { bg: ["#7b2ff7", "#170047"], accent: "#ff2fbf", textFill: "#ffe000", textStroke: "#000000", badgeBg: "#ff2fbf", badgeFg: "#ffffff" },
  { bg: ["#1a0000", "#7a0000"], accent: "#ff2020", textFill: "#ffffff", textStroke: "#ff2020", badgeBg: "#ff2020", badgeFg: "#ffffff" },
  { bg: ["#ff9d00", "#ff3d00"], accent: "#111111", textFill: "#ffffff", textStroke: "#000000", badgeBg: "#111111", badgeFg: "#ffe000" },
];

// --- dom + state -----------------------------------------------------------

const els = {
  form: document.getElementById("form"),
  handle: document.getElementById("handle"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  result: document.getElementById("result"),
  canvas: document.getElementById("thumb"),
  postPicker: document.getElementById("postPicker"),
  shuffle: document.getElementById("shuffle"),
  download: document.getElementById("download"),
  nativeShare: document.getElementById("nativeShare"),
  shareBluesky: document.getElementById("shareBluesky"),
};

const state = {
  profile: null,
  did: null,
  posts: [],
  postIndex: -1,
  frameIndex: 0,
  themeIndex: 0,
  badge: BADGES[0],
  emoji: EMOJIS[0],
  viewsK: 240,
  avatarImg: null,
};

let lastShareText = "";

// --- font loading ------------------------------------------------------

let fontReadyPromise = Promise.resolve();
if (typeof FontFace !== "undefined") {
  try {
    const anton = new FontFace("Anton", "url(/fonts/Anton-Regular.ttf)");
    fontReadyPromise = anton
      .load()
      .then((f) => document.fonts.add(f))
      .catch(() => {});
  } catch (_) {}
}

// --- small helpers -------------------------------------------------------

function setStatus(msg, isErr) {
  els.status.textContent = msg;
  els.status.classList.toggle("err", !!isErr);
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cleanPostText(t) {
  return t
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateForTitle(t, max = 110) {
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function dedupeCandidates(rawPosts) {
  const cleaned = rawPosts
    .map(cleanPostText)
    .filter((t) => t.length >= 6 && t.length <= 220 && /[a-zA-Z]/.test(t));
  return Array.from(new Set(cleaned)).slice(0, 40);
}

function pickFrameIndex(hasPost) {
  const allowed = FRAMES.map((_, i) => i).filter((i) => hasPost || !FRAMES[i].needsPost);
  return choice(allowed);
}

function loadImg(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrapAndDrawCentered(ctx, text, cx, cy, maxWidth, lineHeight) {
  const lines = wrapText(ctx, text, maxWidth);
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
}

function fitTitleText(ctx, text, maxWidth, maxHeight) {
  let fontPx = 112;
  const minPx = 30;
  let best = null;
  while (fontPx >= minPx) {
    ctx.font = `400 ${fontPx}px Anton, Impact, sans-serif`;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = fontPx * 1.04;
    best = { fontPx, lines, lineHeight };
    if (lines.length * lineHeight <= maxHeight && lines.length <= 6) return best;
    fontPx -= 3;
  }
  return best;
}

// --- drawing ---------------------------------------------------------------

function drawRays(ctx, cx, cy, count, theme) {
  ctx.save();
  ctx.translate(cx, cy);
  const R = 1000;
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = ((i + 0.5) / count) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a0, a1);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
    ctx.fill();
  }
  ctx.restore();
}

function drawBigAvatar(ctx, cx, cy, R, img, profile, theme) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.05);
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.beginPath();
  ctx.arc(0, 0, R + 16, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 10;
  ctx.strokeStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(0, 0, R + 16, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    ctx.filter = "saturate(1.7) contrast(1.15) brightness(1.02)";
    ctx.drawImage(img, -R, -R, R * 2, R * 2);
    ctx.filter = "none";
  } else {
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${R}px ui-sans-serif, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const initial = (profile?.displayName || profile?.handle || "?").trim().charAt(0).toUpperCase();
    ctx.fillText(initial, 0, 10);
  }
  ctx.restore();
  ctx.restore();
}

function drawReactionCam(ctx, cx, cy, R, img, emoji) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.12);
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.beginPath();
  ctx.arc(0, 0, R + 10, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#ff2020";
  ctx.beginPath();
  ctx.arc(0, 0, R + 10, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    ctx.filter = "saturate(2) contrast(1.3) brightness(0.95)";
    ctx.drawImage(img, -R, -R, R * 2, R * 2);
    ctx.filter = "none";
  } else {
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(-R, -R, R * 2, R * 2);
  }
  ctx.restore();
  ctx.restore();

  ctx.save();
  ctx.translate(cx + R * 0.55, cy + R * 0.55);
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#000";
  ctx.stroke();
  ctx.font = '34px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 1, 3);
  ctx.restore();
}

function drawBurstBadge(ctx, cx, cy, R, spikes, theme, text) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.22);
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  for (let i = 0; i < spikes; i++) {
    ctx.save();
    ctx.rotate((i / spikes) * Math.PI * 2);
    roundRectPath(ctx, -R * 0.19, -R, R * 0.38, R * 1.05, R * 0.08);
    ctx.fillStyle = theme.badgeBg;
    ctx.fill();
    ctx.restore();
  }
  ctx.shadowColor = "transparent";
  for (let i = 0; i < spikes; i++) {
    ctx.save();
    ctx.rotate((i / spikes) * Math.PI * 2);
    roundRectPath(ctx, -R * 0.19, -R, R * 0.38, R * 1.05, R * 0.08);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = theme.badgeFg;
  ctx.font = `900 ${Math.round(R * 0.24)}px Anton, Impact, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  wrapAndDrawCentered(ctx, text, 0, 0, R * 1.3, Math.round(R * 0.26));
  ctx.restore();
}

function drawArrow(ctx, x, y, angleRad, length, theme) {
  const headW = length * 0.55;
  const shaftW = length * 0.26;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);
  ctx.beginPath();
  ctx.moveTo(0, -shaftW / 2);
  ctx.lineTo(length * 0.6, -shaftW / 2);
  ctx.lineTo(length * 0.6, -headW / 2);
  ctx.lineTo(length, 0);
  ctx.lineTo(length * 0.6, headW / 2);
  ctx.lineTo(length * 0.6, shaftW / 2);
  ctx.lineTo(0, shaftW / 2);
  ctx.closePath();
  ctx.fillStyle = theme.accent;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#000";
  ctx.stroke();
  ctx.restore();
}

function drawSubscribeButton(ctx, x, y) {
  ctx.save();
  roundRectPath(ctx, x, y, 190, 54, 8);
  ctx.fillStyle = "#ff0000";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#000";
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `800 22px ui-sans-serif, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🔔 SUBSCRIBE", x + 95, y + 29);
  ctx.restore();
}

function drawStats(ctx, x, y, viewsK) {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 26px ui-sans-serif, Arial, sans-serif`;
  const text = `👁 ${(viewsK / 10).toFixed(1)}M views · 🔥 trending`;
  const w = ctx.measureText(text).width + 28;
  roundRectPath(ctx, x, y - 32, w, 42, 8);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x + 14, y - 4);
  ctx.restore();
}

function drawTitle(ctx, title, box, theme) {
  const { x, y, w, h } = box;
  const fit = fitTitleText(ctx, title, w, h);
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  const startY = y + (h - fit.lines.length * fit.lineHeight) / 2 + fit.fontPx * 0.78;
  ctx.font = `400 ${fit.fontPx}px Anton, Impact, sans-serif`;
  fit.lines.forEach((line, i) => {
    const ly = startY + i * fit.lineHeight;
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.lineWidth = Math.max(6, fit.fontPx * 0.16);
    ctx.strokeStyle = theme.textStroke;
    ctx.strokeText(line, x, ly);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = theme.textFill;
    ctx.fillText(line, x, ly);
  });
  ctx.restore();
}

function drawWatermark(ctx, handleText) {
  ctx.save();
  ctx.font = `700 22px ui-sans-serif, Arial, sans-serif`;
  const text = `${handleText} · thumbjack.bisks.net`;
  const w = ctx.measureText(text).width + 24;
  roundRectPath(ctx, 24, 720 - 24 - 38, w, 38, 8);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 24 + 12, 720 - 24 - 38 / 2 + 1);
  ctx.restore();
}

function composeTitle() {
  const frame = FRAMES[state.frameIndex];
  const handleAt = "@" + (state.profile?.handle || "them");
  const postText = state.postIndex >= 0 && state.posts[state.postIndex]
    ? truncateForTitle(state.posts[state.postIndex])
    : "";
  const title = frame.build(postText, handleAt);
  return title.replace(/\s+/g, " ").trim().toUpperCase();
}

async function renderThumb() {
  await fontReadyPromise;
  const ctx = els.canvas.getContext("2d");
  const W = 1280, H = 720;
  const theme = THEMES[state.themeIndex];

  ctx.clearRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, theme.bg[0]);
  grad.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const avatarCX = 950, avatarCY = 370, avatarR = 250;
  drawRays(ctx, avatarCX, avatarCY, 26, theme);
  drawBigAvatar(ctx, avatarCX, avatarCY, avatarR, state.avatarImg, state.profile, theme);
  drawArrow(ctx, 560, 640, -0.7, 190, theme);
  drawReactionCam(ctx, 690, 590, 92, state.avatarImg, state.emoji);
  drawBurstBadge(ctx, 740, 110, 92, 10, theme, state.badge);
  drawSubscribeButton(ctx, W - 214, H - 84);
  drawStats(ctx, W - 360, 58, state.viewsK);

  const title = composeTitle();
  drawTitle(ctx, title, { x: 56, y: 70, w: 560, h: 520 }, theme);
  drawWatermark(ctx, "@" + (state.profile?.handle || "?"));

  updateSharing(title);
}

function buildShareText(title) {
  const who = state.profile?.handle ? "@" + state.profile.handle : "them";
  const base = `thumbjack turned ${who}'s posts into "${title}" — the worst YouTube thumbnail imaginable.`;
  const url = "\n\nmake your own → https://thumbjack.bisks.net/";
  let text = base + url;
  if (text.length > 300) text = base.slice(0, 300 - url.length - 1).trimEnd() + "…" + url;
  return text;
}

function updateSharing(title) {
  lastShareText = buildShareText(title);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
}

// --- post picker -----------------------------------------------------------

function populatePostPicker() {
  els.postPicker.innerHTML = "";
  const none = document.createElement("option");
  none.value = "-1";
  none.textContent = state.posts.length ? "(no specific post — vibes only)" : "(no recent posts found)";
  els.postPicker.appendChild(none);
  state.posts.forEach((p, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = "“" + truncateForTitle(p, 60) + "”";
    els.postPicker.appendChild(opt);
  });
  els.postPicker.value = String(state.postIndex);
}

// --- main flow ---------------------------------------------------------

async function generate(handleRaw) {
  const handle = (handleRaw || "").trim();
  if (!handle) {
    setStatus("type a handle first.", true);
    return;
  }

  els.go.disabled = true;
  els.result.classList.remove("show");
  setStatus(`looking up ${handle}...`);

  try {
    const did = await resolveDid(handle);
    const profile = await getProfile(did);
    setStatus("reading recent posts...");
    const rawPosts = await getRecentPosts(did, 2);
    const candidates = dedupeCandidates(rawPosts);

    state.profile = profile;
    state.did = did;
    state.posts = candidates;
    state.postIndex = candidates.length ? Math.floor(Math.random() * candidates.length) : -1;
    state.frameIndex = pickFrameIndex(state.postIndex >= 0);
    state.themeIndex = Math.floor(Math.random() * THEMES.length);
    state.badge = choice(BADGES);
    state.emoji = choice(EMOJIS);
    state.viewsK = Math.floor(Math.random() * 900 + 80);
    state.avatarImg = await loadImg(profile.avatar);

    populatePostPicker();
    await renderThumb();
    els.result.classList.add("show");
    setStatus("");
  } catch (err) {
    setStatus("couldn't build that: " + err.message, true);
  } finally {
    els.go.disabled = false;
  }
}

// --- events ------------------------------------------------------------

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  generate(els.handle.value);
});

document.querySelectorAll(".examples button[data-h]").forEach((b) => {
  b.addEventListener("click", () => {
    els.handle.value = b.dataset.h;
    generate(b.dataset.h);
  });
});

els.postPicker.addEventListener("change", () => {
  state.postIndex = parseInt(els.postPicker.value, 10);
  if (state.postIndex < 0 && FRAMES[state.frameIndex].needsPost) {
    state.frameIndex = pickFrameIndex(false);
  }
  renderThumb();
});

els.shuffle.addEventListener("click", () => {
  if (!state.profile) return;
  if (state.posts.length && Math.random() < 0.6) {
    state.postIndex = Math.floor(Math.random() * state.posts.length);
    els.postPicker.value = String(state.postIndex);
  }
  state.frameIndex = pickFrameIndex(state.postIndex >= 0);
  state.themeIndex = Math.floor(Math.random() * THEMES.length);
  state.badge = choice(BADGES);
  state.emoji = choice(EMOJIS);
  state.viewsK = Math.floor(Math.random() * 900 + 80);
  renderThumb();
});

els.download.addEventListener("click", () => {
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const who = (state.profile?.handle || "thumb").replace(/[^a-z0-9.-]/gi, "_");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "thumbjack-" + who + ".png";
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
  els.nativeShare.style.display = "";
  els.nativeShare.addEventListener("click", () => {
    els.canvas.toBlob(async (blob) => {
      if (!blob) return;
      const who = (state.profile?.handle || "thumb").replace(/[^a-z0-9.-]/gi, "_");
      const file = new File([blob], "thumbjack-" + who + ".png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "thumbjack" });
      } catch (_) {
        // cancelled or unsupported mid-flow — no-op
      }
    }, "image/png");
  });
}
