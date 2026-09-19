// ashcan — renders a real Bluesky post, then lets you press a "delete"
// button that never actually deletes anything: it's a local, cosmetic
// ceremony (catch fire, fall into a burning trash can). Post data is read
// straight from the public AppView; nothing here writes anything, anywhere.
const APPVIEW = "https://public.api.bsky.app";

// The post this was built for: kitto.nekoweb.org's "Counter-petulance:"
// reply in the thread that asked for this site. Hardcoded so the page has
// something to show without a network round-trip to resolve a handle first.
const DEFAULT_AT_URI = "at://did:plc:zgufzyadu3gghypxz4hp5psp/app.bsky.feed.post/3mvtl4opdk22g";

const FALLBACK_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="24" fill="#3a2f24"/></svg>');

const $ = (id) => document.getElementById(id);
const els = {
  theater: $("theater"),
  flameCanvas: $("flame-canvas"),
  status: $("post-status"),
  card: $("post-card"),
  avatar: $("p-avatar"),
  name: $("p-name"),
  handle: $("p-handle"),
  time: $("p-time"),
  text: $("p-text"),
  images: $("p-images"),
  replies: $("p-replies"),
  reposts: $("p-reposts"),
  likes: $("p-likes"),
  deleteBtn: $("delete-btn"),
  trashWrap: $("trash-wrap"),
  trashCan: $("trash-can"),
  aftermath: $("aftermath"),
  restoreBtn: $("restore-btn"),
  shareBluesky: $("share-bluesky"),
  shareDownload: $("share-download"),
  shareCanvas: $("share-canvas"),
  loadForm: $("load-form"),
  postUrl: $("post-url"),
  loadError: $("load-error"),
};

let current = null; // { atUri, post }

// ---------- fetching ----------

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function resolveHandle(handle) {
  const r = await fetch(`${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle.replace(/^@/, ""))}`);
  if (!r.ok) throw new Error("couldn't resolve that handle");
  const d = await r.json();
  return d.did;
}

async function resolveToAtUri(input) {
  const raw = input.trim();
  if (!raw) throw new Error("empty");
  if (raw.startsWith("at://")) return raw;
  let m = null;
  try {
    m = new URL(raw).pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)/);
  } catch {
    m = null;
  }
  if (!m) throw new Error("that doesn't look like a bsky.app post link");
  const actor = decodeURIComponent(m[1]);
  const rkey = m[2];
  const did = actor.startsWith("did:") ? actor : await resolveHandle(actor);
  return `at://${did}/app.bsky.feed.post/${rkey}`;
}

async function fetchPost(atUri) {
  const r = await fetch(`${APPVIEW}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(atUri)}&depth=0&parentHeight=0`);
  if (!r.ok) throw new Error("couldn't load that post");
  const data = await r.json();
  const t = data.thread;
  if (!t || t.notFound || t.blocked) throw new Error("that post is gone, private, or blocked");
  return t.post;
}

// ---------- rendering ----------

function fmtCount(n) {
  n = n || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function relTime(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 365) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / (86400 * 365))}y`;
}

function renderImages(post) {
  const embed = post.embed || {};
  const imgs = embed.images || embed.media?.images || [];
  els.images.innerHTML = "";
  if (!imgs.length) {
    els.images.hidden = true;
    return;
  }
  els.images.hidden = false;
  els.images.className = `p-images count-${Math.min(imgs.length, 4)}`;
  for (const im of imgs) {
    const img = document.createElement("img");
    img.src = im.thumb || im.fullsize || "";
    img.alt = im.alt || "";
    img.loading = "lazy";
    els.images.appendChild(img);
  }
}

function renderPost(post) {
  const author = post.author || {};
  const record = post.record || {};
  els.avatar.src = author.avatar || FALLBACK_AVATAR;
  els.avatar.onerror = () => { els.avatar.onerror = null; els.avatar.src = FALLBACK_AVATAR; };
  els.name.textContent = author.displayName || author.handle || "someone";
  els.handle.textContent = "@" + (author.handle || "unknown");
  els.time.textContent = relTime(record.createdAt || post.indexedAt);
  els.text.innerHTML = esc(record.text || "").replace(/\n/g, "<br>");
  renderImages(post);
  els.replies.textContent = `💬 ${fmtCount(post.replyCount)}`;
  els.reposts.textContent = `🔁 ${fmtCount(post.repostCount)}`;
  els.likes.textContent = `♥ ${fmtCount(post.likeCount)}`;
  els.card.hidden = false;
  els.deleteBtn.hidden = false;
  els.deleteBtn.disabled = false;
  els.deleteBtn.textContent = "delete";
}

function resetVisualState() {
  els.card.classList.remove("ignite", "falling");
  els.card.style.removeProperty("--fall-x");
  els.card.style.removeProperty("--fall-y");
  els.trashCan.classList.remove("hit", "smolder");
  els.trashWrap.classList.remove("smoldering");
  els.aftermath.hidden = true;
}

function showStatus(msg) {
  els.status.textContent = msg;
  els.status.hidden = !msg;
}

function showLoadError(msg) {
  els.loadError.textContent = msg;
  els.loadError.hidden = !msg;
}

// ---------- load flow ----------

async function loadAndShow(rawInput) {
  showStatus("loading…");
  els.card.hidden = true;
  els.deleteBtn.hidden = true;
  try {
    const atUri = await resolveToAtUri(rawInput);
    const post = await fetchPost(atUri);
    current = { atUri, post };
    renderPost(post);
    resetVisualState();
    showStatus("");
    return true;
  } catch (e) {
    showStatus("");
    return false;
  }
}

async function init() {
  const params = new URLSearchParams(location.search);
  const q = params.get("post");
  let ok = false;
  if (q) ok = await loadAndShow(q);
  if (!ok) {
    const ok2 = await loadAndShow(DEFAULT_AT_URI);
    if (q && ok2) showLoadError("couldn't load that link — showing the default post instead.");
    if (!ok2) showStatus("couldn't load a post right now. try pasting a link below.");
  }
}

els.loadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const val = els.postUrl.value.trim();
  if (!val) return;
  showLoadError("");
  const ok = await loadAndShow(val);
  if (!ok) {
    showLoadError("couldn't load that — check the link and try again.");
  } else {
    const url = new URL(location.href);
    url.searchParams.set("post", val);
    history.replaceState(null, "", url);
    els.postUrl.value = "";
  }
});

// ---------- flame particles ----------

let flameCtx = null;

function sizeCanvas() {
  const r = els.theater.getBoundingClientRect();
  els.flameCanvas.width = r.width;
  els.flameCanvas.height = r.height;
  if (!flameCtx) flameCtx = els.flameCanvas.getContext("2d");
}

function theaterOffset() {
  return els.theater.getBoundingClientRect();
}

function burstFlames({ x, y, spread, durationMs, rate }) {
  sizeCanvas();
  const ctx = flameCtx;
  const W = els.flameCanvas.width, H = els.flameCanvas.height;
  let particles = [];
  const start = performance.now();
  let spawning = true;

  function spawn() {
    for (let i = 0; i < rate; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + Math.random() * 6,
        vx: (Math.random() - 0.5) * 0.9,
        vy: -1.3 - Math.random() * 1.8,
        life: 0,
        maxLife: 32 + Math.random() * 30,
        size: 5 + Math.random() * 9,
        hue: 16 + Math.random() * 40,
        smoke: false,
      });
    }
    if (Math.random() < 0.3) {
      particles.push({
        x: x + (Math.random() - 0.5) * spread * 1.3,
        y: y - 4,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -0.6 - Math.random() * 1.0,
        life: 0,
        maxLife: 70 + Math.random() * 50,
        size: 1.5 + Math.random() * 2.5,
        hue: 0,
        smoke: true,
      });
    }
  }

  function step(now) {
    if (spawning && now - start > durationMs) spawning = false;
    if (spawning) spawn();
    ctx.clearRect(0, 0, W, H);
    particles = particles.filter((p) => p.life < p.maxLife);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= p.smoke ? -0.005 : 0.012;
      p.life++;
      const t = p.life / p.maxLife;
      const alpha = Math.max(0, 1 - t);
      const size = Math.max(0, p.size * (1 - t * 0.6));
      ctx.beginPath();
      ctx.fillStyle = p.smoke ? `hsla(0,0%,62%,${alpha * 0.35})` : `hsla(${p.hue},95%,${55 - t * 25}%,${alpha})`;
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    if (spawning || particles.length) requestAnimationFrame(step);
    else ctx.clearRect(0, 0, W, H);
  }
  requestAnimationFrame(step);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- the delete ceremony ----------

els.deleteBtn.addEventListener("click", async () => {
  if (!current) return;
  els.deleteBtn.disabled = true;
  els.deleteBtn.textContent = "…";

  const theaterRect = theaterOffset();
  const cardRect = els.card.getBoundingClientRect();
  const canRect = els.trashCan.getBoundingClientRect();

  els.card.classList.add("ignite");
  burstFlames({
    x: cardRect.left + cardRect.width / 2 - theaterRect.left,
    y: cardRect.bottom - theaterRect.top,
    spread: cardRect.width * 0.4,
    durationMs: 900,
    rate: 3,
  });
  await sleep(650);

  const dx = canRect.left + canRect.width / 2 - (cardRect.left + cardRect.width / 2);
  const dy = canRect.top + canRect.height * 0.2 - cardRect.top;
  els.card.style.setProperty("--fall-x", `${dx}px`);
  els.card.style.setProperty("--fall-y", `${dy}px`);
  // ignite's "shake" keyframe animates transform too, and a running CSS
  // Animation keeps overriding a plain transform property — drop it before
  // falling's transform transition takes over, or the fall never visibly plays.
  els.card.classList.remove("ignite");
  els.card.classList.add("falling");
  await sleep(750);

  els.card.hidden = true;
  els.card.classList.remove("ignite", "falling");
  els.trashCan.classList.add("hit");
  burstFlames({
    x: canRect.left + canRect.width / 2 - theaterRect.left,
    y: canRect.top + canRect.height * 0.3 - theaterRect.top,
    spread: canRect.width * 0.5,
    durationMs: 1000,
    rate: 4,
  });
  await sleep(300);
  els.trashCan.classList.remove("hit");
  els.trashCan.classList.add("smolder");
  els.trashWrap.classList.add("smoldering");

  await sleep(450);
  showAftermath();
});

els.restoreBtn.addEventListener("click", () => {
  resetVisualState();
  els.card.hidden = false;
  els.deleteBtn.hidden = false;
  els.deleteBtn.disabled = false;
  els.deleteBtn.textContent = "delete";
});

// ---------- aftermath / sharing ----------

function siteUrl() {
  const u = new URL("https://ashcan.bisks.net/");
  if (current?.atUri) u.searchParams.set("post", current.atUri);
  return u.toString();
}

function buildShareText() {
  const text = `gave a post the delete button bluesky forgot to build. ${siteUrl()}`;
  return text.length <= 300 ? text : text.slice(0, 296) + "…";
}

function showAftermath() {
  els.aftermath.hidden = false;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText());
  drawShareCard();
}

function drawShareCard() {
  const ctx = els.shareCanvas.getContext("2d");
  const W = els.shareCanvas.width, H = els.shareCanvas.height;

  const bg = ctx.createRadialGradient(W * 0.5, -H * 0.1, 0, W * 0.5, H * 0.5, W * 0.7);
  bg.addColorStop(0, "#2a1608");
  bg.addColorStop(1, "#0b0908");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#f2ece2";
  ctx.font = "800 76px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("ashcan", 70, 160);

  ctx.fillStyle = "#a89686";
  ctx.font = "500 26px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("gave a post the delete button", 70, 220);
  ctx.fillText("bluesky forgot to build.", 70, 256);

  ctx.fillStyle = "#ff7a3d";
  ctx.font = "700 26px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("ashcan.bisks.net", 70, 560);

  // a little trash can with a flame, over on the right
  const cx = 900, cy = 380;
  const flame = ctx.createRadialGradient(cx, cy - 60, 5, cx, cy - 60, 90);
  flame.addColorStop(0, "#ffdca0");
  flame.addColorStop(0.4, "#ff8a3d");
  flame.addColorStop(1, "rgba(192,57,43,0)");
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 60, 90, 100, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2b2e33";
  ctx.beginPath();
  ctx.moveTo(cx - 90, cy - 30);
  ctx.lineTo(cx - 75, cy + 150);
  ctx.quadraticCurveTo(cx - 70, cy + 165, cx - 55, cy + 165);
  ctx.lineTo(cx + 55, cy + 165);
  ctx.quadraticCurveTo(cx + 70, cy + 165, cx + 75, cy + 150);
  ctx.lineTo(cx + 90, cy - 30);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#3a3f46";
  ctx.fillRect(cx - 110, cy - 55, 220, 26);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  const probe = new File([""], "probe.png", { type: "image/png" });
  return navigator.canShare({ files: [probe] });
}

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    if (canShareFiles()) {
      const file = new File([blob], "ashcan.png", { type: "image/png" });
      navigator.share({ files: [file], text: buildShareText(), title: "ashcan" }).catch(() => {});
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ashcan.png";
    a.click();
  });
});

init();
