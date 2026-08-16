// app.js — gonefishin's whole game loop. Reads your pond (lib/bsky.js),
// hooks a catch each cast (lib/feed.js), renders it, and tracks the creel.
// Everything is in-memory for the session — no login, no persistence, no
// backend: this is a frontend-only toy per house style.

import { findPond } from "./lib/bsky.js";
import { castLine, engagement } from "./lib/feed.js";

const AVATAR_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#0e2a3f"/><text x="20" y="26" font-size="18" text-anchor="middle" fill="#3fb6d3">🐟</text></svg>',
  );

const els = {
  handle: document.getElementById("handle"),
  goBtn: document.getElementById("goBtn"),
  startStatus: document.getElementById("startStatus"),
  startErr: document.getElementById("startErr"),
  start: document.getElementById("start"),
  dock: document.getElementById("dock"),
  youAvatar: document.getElementById("youAvatar"),
  youName: document.getElementById("youName"),
  youStats: document.getElementById("youStats"),
  tSmall: document.getElementById("tSmall"),
  tWhopper: document.getElementById("tWhopper"),
  castBtn: document.getElementById("castBtn"),
  castStatus: document.getElementById("castStatus"),
  catchzone: document.getElementById("catchzone"),
  creelList: document.getElementById("creelList"),
  creelEmpty: document.getElementById("creelEmpty"),
  shareRow: document.getElementById("shareRow"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareImg: document.getElementById("shareImg"),
  shareCanvas: document.getElementById("shareCanvas"),
};

const state = {
  pond: null,
  creel: [], // { kind: "small" | "whopper", member, post, score }
  hooked: 0, // whoppers hooked (guessed or not)
  landed: 0, // whoppers landed
  busy: false,
};

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function timeAgo(ms) {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  const units = [
    [31536000, "y"],
    [2592000, "mo"],
    [604800, "w"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [secs, label] of units) {
    if (s >= secs) return `${Math.floor(s / secs)}${label}`;
  }
  return `${s}s`;
}

function postCardHtml(member, entry, { hideCounts } = {}) {
  const post = entry.post;
  const rec = post.record || {};
  const author = post.author || {};
  const avatar = author.avatar || AVATAR_FALLBACK;
  const text = truncate((rec.text || "").trim() || "(no text)", 240);
  const counts = hideCounts
    ? `<span class="hidden-count">❤️ ??</span> <span class="hidden-count">🔁 ??</span> <span class="hidden-count">💬 ??</span>`
    : `<span>❤️ ${post.likeCount || 0}</span> <span>🔁 ${post.repostCount || 0}</span> <span>💬 ${post.replyCount || 0}</span>`;
  return `
    <div class="pauthor">
      <img src="${esc(avatar)}" alt="" onerror="this.src='${AVATAR_FALLBACK}'" />
      <div>
        <div class="pname">${esc(author.displayName || member.displayName)}</div>
        <div class="phandle">@${esc(author.handle || member.handle)} · ${timeAgo(entry.createdMs)}</div>
      </div>
    </div>
    <div class="ptext">${esc(text)}</div>
    <div class="pmeta">${counts}</div>
  `;
}

function renderYou() {
  const p = state.pond;
  els.youAvatar.src = p.profile.avatar || AVATAR_FALLBACK;
  els.youAvatar.onerror = () => (els.youAvatar.src = AVATAR_FALLBACK);
  els.youName.textContent = "@" + p.profile.handle;
  els.youStats.textContent = `fishing ${p.counts.follows} follows · ${p.counts.moots} moots`;
}

function renderTally() {
  const small = state.creel.filter((c) => c.kind === "small").length;
  els.tSmall.textContent = String(small);
  els.tWhopper.textContent = `${state.landed}/${state.hooked}`;
}

function renderCreel() {
  els.creelList.innerHTML = "";
  els.creelEmpty.style.display = state.creel.length ? "none" : "block";
  els.shareRow.style.display = state.creel.length ? "flex" : "none";
  // newest first
  for (let i = state.creel.length - 1; i >= 0; i--) {
    const c = state.creel[i];
    const li = document.createElement("li");
    if (c.kind === "whopper") li.className = "gold";
    const icon = c.kind === "whopper" ? "🐋" : "🐟";
    const snippet = truncate((c.post.record.text || "").trim() || "(no text)", 60);
    li.innerHTML = `<span class="icon">${icon}</span><span class="who">@${esc(c.member.handle)}</span><span class="snippet">${esc(snippet)}</span>`;
    els.creelList.appendChild(li);
  }
}

function renderAll() {
  renderTally();
  renderCreel();
}

async function onCast() {
  if (state.busy) return;
  state.busy = true;
  els.castBtn.disabled = true;
  els.catchzone.innerHTML = "";
  els.castStatus.textContent = "casting a line…";

  let result;
  try {
    result = await castLine(state.pond.pool);
  } catch {
    result = null;
  }

  if (!result) {
    els.castStatus.textContent = "the pond's quiet — recast in a moment.";
    els.castBtn.disabled = false;
    state.busy = false;
    return;
  }

  els.castStatus.textContent = "";
  if (result.type === "smallfish") renderSmallFish(result);
  else renderWhopper(result);

  els.castBtn.disabled = false;
  state.busy = false;
}

function renderSmallFish(result) {
  const flavor = result.member.moot
    ? `🐟 a small one from @${esc(result.member.handle)} — a moot's pond runs deep.`
    : `🐟 a small one from @${esc(result.member.handle)}.`;
  els.catchzone.innerHTML = `
    <p class="catchflavor ${result.member.moot ? "moot" : ""}">${flavor}</p>
    <div class="postcard">${postCardHtml(result.member, result.fish)}</div>
    <p class="catchflavor">below their 90-day median of ${result.median} — reeled in.</p>
  `;
  state.creel.push({ kind: "small", member: result.member, post: result.fish.post });
  renderAll();
}

function renderWhopper(result) {
  state.hooked++;
  const { whopper, decoy, member } = result;
  els.catchzone.innerHTML = `
    <p class="catchflavor big">🌊 something's pulling hard on the line from @${esc(member.handle)}…</p>
    <p class="catchflavor">one of these is an all-time banger. which got more traction — likes + reposts + replies?</p>
    <div class="whopper-vs">
      <div>
        <div class="postcard" id="cardA">${postCardHtml(member, whopper, { hideCounts: true })}</div>
        <button class="pick" data-pick="A">this one 🎣</button>
      </div>
      <div>
        <div class="postcard" id="cardB">${postCardHtml(member, decoy, { hideCounts: true })}</div>
        <button class="pick" data-pick="B">this one 🎣</button>
      </div>
    </div>
    <div id="whopperResult"></div>
  `;
  const buttons = els.catchzone.querySelectorAll("button.pick");
  buttons.forEach((btn) =>
    btn.addEventListener("click", () => resolveWhopper(result, btn.dataset.pick, buttons)),
  );
}

function resolveWhopper(result, pick, buttons) {
  buttons.forEach((b) => (b.disabled = true));
  const { whopper, decoy, member } = result;
  const scoreA = engagement(whopper.post);
  const scoreB = engagement(decoy.post);
  const correct = scoreA >= scoreB ? "A" : "B";
  const landed = pick === correct;

  document.getElementById("cardA").outerHTML = `<div class="postcard${correct === "A" ? " winner" : ""}">${postCardHtml(member, whopper)}</div>`;
  document.getElementById("cardB").outerHTML = `<div class="postcard${correct === "B" ? " winner" : ""}">${postCardHtml(member, decoy)}</div>`;

  const box = document.getElementById("whopperResult");
  if (landed) {
    state.landed++;
    state.creel.push({ kind: "whopper", member, post: whopper.post });
    box.innerHTML = `<p class="verdict landed">LANDED! 🎣🐋 that's a whopper for the creel.</p>`;
  } else {
    box.innerHTML = `<p class="verdict away">it snapped the line — the whopper got away.</p>`;
  }
  renderAll();
}

function buildShareText() {
  const small = state.creel.filter((c) => c.kind === "small").length;
  const p = state.pond.profile;
  const url = "https://gonefishin.bisks.net/";
  let bit = `went fishing in @${p.handle}'s pond on gonefishin 🎣 — ${small} small fish`;
  if (state.hooked) bit += `, ${state.landed}/${state.hooked} whopper${state.hooked === 1 ? "" : "s"} landed`;
  bit += `. ${url}`;
  return bit;
}

function updateShareLink() {
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText());
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(" ");
  let line = "";
  let lines = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lineHeight;
      lines++;
      if (lines >= maxLines - 1) {
        line = line.length ? line + "…" : "";
        break;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function buildShareCard() {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#0d3247");
  grad.addColorStop(1, "#061620");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#eaf6fb";
  ctx.font = "700 56px 'JetBrains Mono', monospace";
  ctx.fillText("gone🎣fishin", 60, 110);

  ctx.fillStyle = "#7fa3b5";
  ctx.font = "24px 'JetBrains Mono', monospace";
  ctx.fillText(`@${state.pond.profile.handle}'s pond`, 60, 155);

  const small = state.creel.filter((c) => c.kind === "small").length;

  ctx.fillStyle = "#3fb6d3";
  ctx.font = "700 130px 'JetBrains Mono', monospace";
  ctx.fillText(String(small), 60, 320);
  ctx.fillStyle = "#eaf6fb";
  ctx.font = "26px 'JetBrains Mono', monospace";
  ctx.fillText("small fish caught 🐟", 60, 365);

  ctx.fillStyle = "#f2b84b";
  ctx.font = "700 130px 'JetBrains Mono', monospace";
  ctx.fillText(`${state.landed}/${state.hooked}`, 60, 500);
  ctx.fillStyle = "#eaf6fb";
  ctx.font = "26px 'JetBrains Mono', monospace";
  ctx.fillText("whoppers landed 🐋", 60, 545);

  ctx.fillStyle = "#7fa3b5";
  ctx.font = "22px 'JetBrains Mono', monospace";
  ctx.fillText("gonefishin.bisks.net", 60, 600);

  return canvas;
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

function onShareImg() {
  const canvas = buildShareCard();
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    if (canShareFiles()) {
      try {
        const file = new File([blob], "gonefishin-haul.png", { type: "image/png" });
        await navigator.share({ files: [file], text: buildShareText(), title: "gonefishin" });
        return;
      } catch {
        // fall through to download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gonefishin-haul.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, "image/png");
}

async function onGo() {
  const raw = els.handle.value.trim();
  if (!raw) {
    els.startErr.textContent = "type a handle first.";
    return;
  }
  els.goBtn.disabled = true;
  els.startErr.textContent = "";
  try {
    const pond = await findPond(raw, { onStep: (s) => (els.startStatus.textContent = s) });
    if (pond.pool.length < 1) {
      els.startErr.textContent = "you don't follow anyone yet — nothing to fish for.";
      els.startStatus.textContent = "";
      els.goBtn.disabled = false;
      return;
    }
    state.pond = pond;
    els.startStatus.textContent = "";
    els.start.style.display = "none";
    els.dock.style.display = "block";
    renderYou();
    renderAll();
    updateShareLink();
  } catch (e) {
    els.startErr.textContent = e && e.message ? e.message : "couldn't cast off — try again.";
  } finally {
    els.goBtn.disabled = false;
  }
}

els.goBtn.addEventListener("click", onGo);
els.handle.addEventListener("keydown", (e) => {
  if (e.key === "Enter") onGo();
});
els.castBtn.addEventListener("click", () => {
  onCast().then(updateShareLink);
});
els.shareImg.addEventListener("click", onShareImg);
