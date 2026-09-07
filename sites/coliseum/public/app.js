import { resolveInput, getThread, flattenThread, pickGladiators, assignTeam } from "./lib/atproto.js";

const SITE_URL = "https://coliseum.bisks.net/";
const $ = (sel) => document.querySelector(sel);

const els = {
  input: $("#input"),
  go: $("#go"),
  status: $("#status"),
  result: $("#result"),
  ringmaster: $("#ringmaster"),
  scoreALabel: $("#score-a-label"),
  scoreBLabel: $("#score-b-label"),
  barA: $("#bar-a"),
  barB: $("#bar-b"),
  crowdCount: $("#crowd-count"),
  captainA: $("#captain-a"),
  captainB: $("#captain-b"),
  crowdA: $("#crowd-a"),
  crowdB: $("#crowd-b"),
  crowdNeutral: $("#crowd-neutral"),
  neutralLabel: $("#neutral-label"),
  detail: $("#detail"),
  shareCanvas: $("#share-canvas"),
  shareBsky: $("#share-bsky"),
  shareNative: $("#share-native"),
  shareDownload: $("#share-download"),
  viewOriginal: $("#view-original"),
};

function esc(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(s, max) {
  if (!s || s.length <= max) return s || "";
  return s.slice(0, max - 1).trimEnd() + "…";
}

function postUrl(node) {
  const rkey = node.uri.split("/").pop();
  return `https://bsky.app/profile/${node.author.handle}/post/${rkey}`;
}

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function avatarEl(author, size) {
  const img = document.createElement("img");
  img.width = size;
  img.height = size;
  img.style.width = size + "px";
  img.style.height = size + "px";
  img.alt = "@" + author.handle;
  if (author.avatar) {
    img.src = author.avatar;
  } else {
    img.remove();
    const div = document.createElement("div");
    div.className = "chip fallback";
    div.style.width = size + "px";
    div.style.height = size + "px";
    div.textContent = (author.displayName || author.handle || "?").slice(0, 1).toUpperCase();
    return div;
  }
  return img;
}

// --- secret handle prefill (standing order, added 2026-08-28) --------------
const secretSpan = document.getElementById("secret-o");
if (secretSpan) {
  secretSpan.addEventListener("click", () => {
    els.input.value = "@cee.wtf";
    els.input.dispatchEvent(new Event("input", { bubbles: true }));
    els.input.dispatchEvent(new Event("change", { bubbles: true }));
    els.input.focus();
  });
}

let lastState = null; // { root, gladiators, groups, scoreA, scoreB, totalCrowd, resolved }

function renderRingmaster(root, resolved) {
  els.ringmaster.innerHTML = "";
  els.ringmaster.appendChild(avatarEl(root.author, 44));
  const body = document.createElement("div");
  const who = document.createElement("div");
  who.className = "who";
  who.textContent = "@" + root.author.handle;
  body.appendChild(who);
  const txt = document.createElement("div");
  txt.className = "txt";
  txt.textContent = truncate(root.text, 260);
  body.appendChild(txt);
  const meta = document.createElement("div");
  meta.className = "meta";
  const found = resolved.chosen ? ` · found as their liveliest post (${resolved.replyCount} replies)` : "";
  meta.textContent = `❤️ ${root.likeCount} · 🔁 ${root.repostCount} · 💬 ${root.replyCount}${found}`;
  body.appendChild(meta);
  els.ringmaster.appendChild(body);
}

function chipSize(node, maxLike) {
  const t = maxLike > 0 ? Math.sqrt((node.likeCount || 0) / maxLike) : 0;
  return Math.round(20 + t * 20); // 20px..40px
}

function renderCrowd(container, nodes, maxLike, side) {
  container.innerHTML = "";
  for (const node of nodes) {
    const size = chipSize(node, maxLike);
    const el = avatarEl(node.author, size);
    el.classList.add("chip");
    el.title = "@" + node.author.handle;
    el.addEventListener("click", () => showDetail(node, side));
    container.appendChild(el);
  }
}

function renderCaptain(container, node, side) {
  container.innerHTML = "";
  if (!node) {
    container.classList.add("empty");
    container.textContent = side === "a" ? "no gladiator yet." : "awaiting a challenger.";
    return;
  }
  container.classList.remove("empty");
  container.appendChild(avatarEl(node.author, 60));
  const handle = document.createElement("div");
  handle.className = "handle";
  handle.textContent = "@" + node.author.handle;
  container.appendChild(handle);
  const score = document.createElement("div");
  score.className = "score";
  score.textContent = `❤️ ${node.likeCount} · 💬 ${node.replyCount}`;
  container.appendChild(score);
}

function showDetail(node, side) {
  els.detail.style.display = "flex";
  els.detail.innerHTML = "";
  els.detail.appendChild(avatarEl(node.author, 44));
  const body = document.createElement("div");
  const who = document.createElement("div");
  who.innerHTML = `<span class="who">@${esc(node.author.handle)}</span>`;
  const tag = document.createElement("span");
  tag.className = `side-tag ${side}`;
  tag.textContent = side === "a" ? "team a" : side === "b" ? "team b" : "neutral";
  who.appendChild(tag);
  body.appendChild(who);
  const txt = document.createElement("div");
  txt.className = "txt";
  txt.textContent = node.text;
  body.appendChild(txt);
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `❤️ ${node.likeCount} · 🔁 ${node.repostCount} · 💬 ${node.replyCount} · <a href="${postUrl(
    node
  )}" target="_blank" rel="noopener">view on bsky ↗</a>`;
  body.appendChild(meta);
  els.detail.appendChild(body);
  els.detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buildShareText(root, gladiators, scoreA, scoreB, crowdCount, shareUrl) {
  if (gladiators.a && gladiators.b) {
    const pctA = Math.round((scoreA / (scoreA + scoreB || 1)) * 100);
    const pctB = 100 - pctA;
    return truncate(
      `🏛 the coliseum: @${gladiators.a.author.handle} (${pctA}%) vs @${gladiators.b.author.handle} (${pctB}%) ` +
        `under @${root.author.handle}'s post, ${crowdCount} in the stands. ${shareUrl}`,
      300
    );
  }
  if (gladiators.a) {
    return truncate(
      `🏛 @${gladiators.a.author.handle} is alone on the floor under @${root.author.handle}'s post, waiting for a challenger. ${shareUrl}`,
      300
    );
  }
  return truncate(`🏛 the coliseum is empty over @${root.author.handle}'s post — nobody's shown up to fight yet. ${shareUrl}`, 300);
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

async function buildShareCard(root, gladiators, scoreA, scoreB, crowdCount) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width,
    H = canvas.height;
  const mono = "ui-monospace, monospace";

  const [avA, avB] = await Promise.all([
    loadImg(gladiators.a?.author.avatar),
    loadImg(gladiators.b?.author.avatar),
  ]);

  ctx.fillStyle = "#120c08";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, W * 0.7);
  glow.addColorStop(0, "#3a2c1e");
  glow.addColorStop(1, "rgba(18,12,8,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#e0b84f";
  ctx.font = `800 54px ${mono}`;
  ctx.fillText("🏛 coliseum", W / 2, 90);

  ctx.fillStyle = "#b3a08a";
  ctx.font = `400 20px ${mono}`;
  ctx.fillText(`under @${root.author.handle}'s post`, W / 2, 128);

  const floorX = 120,
    floorY = 170,
    floorW = W - 240,
    floorH = 300;
  ctx.fillStyle = "#caa872";
  ctx.beginPath();
  ctx.ellipse(W / 2, floorY + floorH / 2, floorW / 2, floorH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  function drawSide(node, avatar, cx, color) {
    if (!node) {
      ctx.fillStyle = "#3a2c18";
      ctx.font = `700 22px ${mono}`;
      ctx.fillText("— empty —", cx, floorY + floorH / 2);
      return;
    }
    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, floorY + floorH / 2 - 40, 46, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, cx - 46, floorY + floorH / 2 - 86, 92, 92);
      ctx.restore();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, floorY + floorH / 2 - 40, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#241a0c";
    ctx.font = `700 22px ${mono}`;
    ctx.fillText("@" + node.author.handle, cx, floorY + floorH / 2 + 40);
    ctx.font = `400 17px ${mono}`;
    ctx.fillText(`❤️ ${node.likeCount}`, cx, floorY + floorH / 2 + 68);
  }

  drawSide(gladiators.a, avA, W / 2 - 220, "#4fb8e0");
  drawSide(gladiators.b, avB, W / 2 + 220, "#e05f5f");

  ctx.fillStyle = "#241a0c";
  ctx.font = `800 34px ${mono}`;
  ctx.fillText("VS", W / 2, floorY + floorH / 2 - 30);

  const total = scoreA + scoreB || 1;
  const pctA = Math.round((scoreA / total) * 100);
  const barY = floorY + floorH + 60,
    barX = 120,
    barW = W - 240,
    barH = 22;
  ctx.fillStyle = "#e05f5f";
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = "#4fb8e0";
  ctx.fillRect(barX, barY, (barW * pctA) / 100, barH);

  ctx.fillStyle = "#f3e9da";
  ctx.font = `700 20px ${mono}`;
  ctx.fillText(`${crowdCount} in the stands`, W / 2, barY + 60);

  ctx.fillStyle = "#e0b84f";
  ctx.font = `700 22px ${mono}`;
  ctx.fillText("coliseum.bisks.net", W / 2, H - 30);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}

async function render(root, gladiators, all, resolved) {
  renderRingmaster(root, resolved);

  const spectators = all.filter((n) => n.uri !== gladiators.a?.uri && n.uri !== gladiators.b?.uri);
  const groups = { a: [], b: [], neutral: [] };
  for (const node of spectators) {
    groups[assignTeam(node, gladiators)].push(node);
  }
  groups.a.sort((x, y) => y.score - x.score);
  groups.b.sort((x, y) => y.score - x.score);
  groups.neutral.sort((x, y) => y.score - x.score);

  const maxLike = Math.max(1, ...all.map((n) => n.likeCount || 0));

  renderCaptain(els.captainA, gladiators.a, "a");
  renderCaptain(els.captainB, gladiators.b, "b");
  renderCrowd(els.crowdA, groups.a, maxLike, "a");
  renderCrowd(els.crowdB, groups.b, maxLike, "b");
  renderCrowd(els.crowdNeutral, groups.neutral, maxLike, "neutral");
  els.neutralLabel.textContent = groups.neutral.length ? "the rest of the crowd" : "";

  const scoreA = (gladiators.a?.score || 0) + groups.a.reduce((s, n) => s + n.score, 0);
  const scoreB = (gladiators.b?.score || 0) + groups.b.reduce((s, n) => s + n.score, 0);
  const total = scoreA + scoreB;
  const pctA = total ? Math.round((scoreA / total) * 100) : 50;
  els.barA.style.width = pctA + "%";
  els.barB.style.width = 100 - pctA + "%";
  els.scoreALabel.textContent = gladiators.a ? `@${gladiators.a.author.handle} — ${pctA}%` : "—";
  els.scoreBLabel.textContent = gladiators.b ? `${100 - pctA}% — @${gladiators.b.author.handle}` : "—";

  const crowdCount = all.length;
  els.crowdCount.textContent = crowdCount ? `🎭 ${crowdCount} in the stands` : "🦗 nobody's shown up yet.";

  els.detail.style.display = "none";
  els.viewOriginal.href = postUrl(root);

  const shareUrl = SITE_URL + "s/" + encodeURIComponent(resolved.uri);
  const shareText = buildShareText(root, gladiators, scoreA, scoreB, crowdCount, shareUrl);
  els.shareBsky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  await buildShareCard(root, gladiators, scoreA, scoreB, crowdCount);
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    els.shareDownload.href = URL.createObjectURL(blob);
  }, "image/png");

  if (canShareFiles()) {
    els.shareNative.style.display = "";
    els.shareNative.onclick = () => {
      els.shareCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "coliseum.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: shareText, title: "coliseum" });
        } catch (_) {}
      }, "image/png");
    };
  }

  lastState = { root, gladiators, groups, scoreA, scoreB, crowdCount, resolved };
  els.result.style.display = "";
}

async function run() {
  const raw = els.input.value.trim();
  if (!raw) return setStatus("paste a post link or a handle first.", true);

  els.go.disabled = true;
  els.result.style.display = "none";
  setStatus("descending into the arena…");

  try {
    const resolved = await resolveInput(raw);
    setStatus("counting the crowd…");
    const thread = await getThread(resolved.uri);
    const { root, topLevel, all } = flattenThread(thread);
    const gladiators = pickGladiators(topLevel);
    setStatus("");
    await render(root, gladiators, all, resolved);
  } catch (e) {
    setStatus(e.message || String(e), true);
  } finally {
    els.go.disabled = false;
  }
}

els.go.addEventListener("click", run);
els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") run();
});

// Deep link: /?post=<at-uri-or-url>, or the shared /s/<encoded-at-uri> URL
// the Worker renders with personalized OG tags — either way, pre-fill and
// auto-run so a shared link drops you straight into the same brawl.
const shareMatch = location.pathname.match(/^\/s\/([^/]+)\/?$/);
const params = new URLSearchParams(location.search);
const pre = shareMatch ? decodeURIComponent(shareMatch[1]) : params.get("post") || params.get("actor");
if (pre) {
  els.input.value = pre;
  run();
}
