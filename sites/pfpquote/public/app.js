const API = "https://public.api.bsky.app/xrpc/";
const $ = (id) => document.getElementById(id);
const SIZE = 1024;
const BUBBLE_H = SIZE / 5; // the bubble lives in the lower fifth

let avatarImg = null;
let profile = null;
let tainted = false;

if (window.attachHandleTypeahead) window.attachHandleTypeahead($("handle"));

function status(msg, info) {
  const s = $("status");
  s.hidden = !msg;
  s.textContent = msg || "";
  s.className = info ? "info" : "";
}

async function xrpc(method, params) {
  const r = await fetch(API + method + "?" + new URLSearchParams(params));
  if (!r.ok) throw new Error(method + " " + r.status);
  return r.json();
}

function loadImage(url, cors) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed"));
    img.src = url;
  });
}

function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of text.split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
      else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function render() {
  const c = $("canvas"), ctx = c.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, SIZE, SIZE);
  if (avatarImg) {
    // cover-fit the avatar into the square
    const s = Math.max(SIZE / avatarImg.width, SIZE / avatarImg.height);
    const w = avatarImg.width * s, h = avatarImg.height * s;
    ctx.drawImage(avatarImg, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  }
  const text = $("quote").value.trim();
  if (!text) return;

  // Bubble box fills the lower fifth with a margin; text shrinks to fit it.
  const pad = 16, bx = pad, bw = SIZE - pad * 2;
  const bh = BUBBLE_H - pad * 2, by = SIZE - BUBBLE_H + pad;
  const inner = 22, maxW = bw - inner * 2, maxH = bh - inner * 2;
  let fs = 44, lines;
  for (; fs >= 12; fs -= 2) {
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    lines = wrap(ctx, text, maxW);
    if (lines.length * fs * 1.2 <= maxH) break;
  }
  // Only reached below the minimum font size; trim with an ellipsis so it still fits.
  const maxLines = Math.max(1, Math.floor(maxH / (fs * 1.2)));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = last + "…";
  }

  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 5;
  roundRect(ctx, bx, by, bw, bh, 34);
  // tail pointing up toward the face, from the bubble's top edge
  const tx = SIZE * 0.3;
  ctx.moveTo(tx, by + 2);
  ctx.lineTo(tx + 34, by - 46);
  ctx.lineTo(tx + 74, by + 2);
  ctx.fill();
  ctx.stroke();
  // cover the stroke segment where the tail joins the box
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(tx + 3, by);
  ctx.lineTo(tx + 34, by - 43);
  ctx.lineTo(tx + 71, by);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(tx + 3, by - 2, 68, 5);

  ctx.fillStyle = "#111";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  const lh = fs * 1.2, y0 = by + bh / 2 - (lines.length * lh) / 2 + lh / 2;
  lines.forEach((l, i) => ctx.fillText(l, bx + inner, y0 + i * lh));

  const intent = `@${profile.handle} ${text}`.slice(0, 250);
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(intent + "\n\nmade with https://pfpquote.bisks.net/");
}

async function latestPost(actor) {
  // limit=1: only the newest top-level post is wanted as the default quote.
  const d = await xrpc("app.bsky.feed.getAuthorFeed", { actor, limit: 1, filter: "posts_no_replies" });
  const p = d.feed && d.feed[0] && d.feed[0].post;
  return p && p.record && p.record.text ? p.record.text : "";
}

async function go(raw) {
  const handle = raw.trim().replace(/^@/, "");
  if (!handle) return;
  status("Looking up @" + handle + "…", true);
  $("stage").hidden = true;
  try {
    profile = await xrpc("app.bsky.actor.getProfile", { actor: handle });
    if (!profile.avatar) throw new Error("@" + profile.handle + " has no avatar set.");
    const full = profile.avatar.replace("/avatar_thumbnail/", "/avatar/");
    tainted = false;
    try { avatarImg = await loadImage(full, true); }
    catch { avatarImg = await loadImage(full, false); tainted = true; }
    $("quote").value = (await latestPost(profile.did).catch(() => "")) || "…";
    $("stage").hidden = false;
    status(tainted ? "Preview works, but this avatar host blocks canvas export, so download is unavailable." : "");
    render();
  } catch (e) {
    status(e.message && /400|404/.test(e.message) ? "Couldn't find that handle." : e.message || "Something went wrong.");
  }
}

$("form").addEventListener("submit", (e) => { e.preventDefault(); go($("handle").value); });
$("quote").addEventListener("input", () => profile && render());
$("latest").addEventListener("click", async () => {
  if (!profile) return;
  const t = await latestPost(profile.did).catch(() => "");
  if (t) { $("quote").value = t; render(); }
});
$("download").addEventListener("click", () => {
  try {
    $("canvas").toBlob((b) => {
      if (!b) return status("Canvas export is blocked for this avatar.");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `${profile.handle}-quote.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  } catch { status("Canvas export is blocked for this avatar."); }
});
