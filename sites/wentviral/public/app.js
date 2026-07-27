// wentviral — a fake Bluesky compose box. Nothing here is a real post: the
// whole "getting a ton of replies/likes/reposts/quotes" pile-on is a pure
// function of (post text, post timestamp), both encoded in the permalink
// URL. There is no server-side state and no account — the sim is a seeded
// PRNG driven off the code in the URL plus however much real wall-clock
// time has passed since the encoded timestamp, so a reload (or someone else
// opening a shared link) reproduces the exact same growing thread with no
// backend at all. See src/index.ts for the server-side twin of the curve
// math (used only to stamp live-ish OG preview text).

const MOUNT = "/wentviral";
const FAKE_TLD = ".viral.fake";

// ---------- tiny utils ----------

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function nowSec() {
  return Math.floor(Date.now() / 1000);
}
function fmtCount(n) {
  n = Math.max(0, Math.floor(n));
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  if (n < 1000000) return Math.round(n / 1000) + "K";
  return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
}
function fmtAgo(sec) {
  sec = Math.max(0, Math.floor(sec));
  if (sec < 5) return "now";
  if (sec < 60) return sec + "s";
  if (sec < 3600) return Math.floor(sec / 60) + "m";
  if (sec < 86400) return Math.floor(sec / 3600) + "h";
  if (sec < 7 * 86400) return Math.floor(sec / 86400) + "d";
  return new Date(Date.now() - sec * 1000).toLocaleDateString();
}
function truncate(s, n) {
  s = s.trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
function slugify(s) {
  const slug = String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
  return slug || "you";
}
let toastTimer = null;
function toast(msg, cls) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "toast show" + (cls ? " " + cls : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- seeded PRNG ----------

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function randInt(rng, min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}

// ---------- word banks (fake reply personas) ----------

const ADJ = [
  "feral", "unhinged", "normal", "cursed", "tired", "local", "professional",
  "certified", "part-time", "itinerant", "chronically-online", "gremlin-brained",
  "raccoon-coded", "late-stage", "freelance", "unemployed", "haunted",
  "wifi-adjacent", "extremely-normal", "off-brand", "discount", "budget",
];
const NOUN = [
  "shrimp", "goblin", "raccoon", "moth", "modem", "group-chat", "gremlin",
  "kernel-panic", "doomscroller", "lurker", "malfunction", "houseplant",
  "printer", "possum", "group-admin", "npc", "menace", "himbo", "cryptid",
  "guy", "girlboss", "wizard", "intern", "landlord", "ghost",
];
const AVATAR_COLORS = [
  "#ff5d8f", "#ffb84f", "#6fc3ff", "#7ee787", "#c792ea", "#ff8a5b",
  "#5ad1e6", "#f6d365", "#a685e2", "#65d6ad", "#ff7a90", "#8fd3ff",
];

function genPersona(rng) {
  const adj = pick(rng, ADJ);
  const noun = pick(rng, NOUN);
  const num = rng() < 0.3 ? String(randInt(rng, 1, 999)) : "";
  const slug = (adj + noun + num).replace(/-/g, "");
  const name = adj[0].toUpperCase() + adj.slice(1).replace(/-/g, " ") + " " + noun[0].toUpperCase() + noun.slice(1).replace(/-/g, " ");
  const color = pick(rng, AVATAR_COLORS);
  const initials = (adj[0] + noun[0]).toUpperCase();
  return { name, handle: slug + FAKE_TLD, color, initials };
}

// ---------- reaction templates ----------

const BAIT_WORDS = [
  "bluesky", "twitter", "elon", " ai ", "algorithm", "nft", "crypto",
  "cursed", "unhinged", "hot take", "discourse", "ratio", "main character",
  "delete this", "touch grass", "cheugy", "opinion", "controversial",
];

const REPLY_TEMPLATES = [
  () => "wait this is unhinged 💀",
  () => "no because this is SO real",
  (c) => `"${c.word}" is doing a lot of work in this post ngl`,
  () => "the way I gasped",
  () => "sir this is a Wendy's",
  () => "screenshotting this for later",
  () => "not me reading this three times",
  (c) => `${c.word}?? in THIS economy??`,
  () => "the replies are going to be unbearable and I'm here for it",
  () => "delete this immediately (I mean that with love)",
  () => "this you? 👀",
  () => "certified main character moment",
  () => "why is this so accurate though",
  () => "I felt this in my chest",
  () => "the algorithm truly understood the assignment today",
  () => "hot take but this is actually correct",
  () => "counterpoint: no",
  () => "adding this to the group chat immediately",
  () => "the confidence on this post is unmatched",
  () => "sir. SIR.",
  () => "I have so many questions",
  () => "the audacity, honestly? respect",
  () => "this reads like it was written at 3am and I mean that as a compliment",
  () => "not the whole timeline agreeing with this",
  () => "posting this in 4 different servers rn",
  (c) => `everyone needs to see the "${c.word}" part specifically`,
  () => "ok but does anyone else think about this daily now",
  () => "the reply guys are going to have a field day",
  () => "this belongs in a museum",
  () => "actually unwell about this post",
  () => "🔥🔥 great post! check my bio for a free crypto guide",
  () => "This. This is the tweet.",
  () => "Following for more content like this 🙌",
  () => "reported this to my group chat, we are unwell",
  () => "the way this is going to live in my head rent free",
];

const QUOTE_TEMPLATES = [
  () => "the way this lives in my head now",
  () => "everyone needs to see this",
  () => "I need everyone I know to read this",
  (c) => `"${c.word}" and I felt that`,
  () => "sending this to the group chat and logging off",
  () => "this is the post of the year, sorry to everyone else who posted",
  () => "quote posting because the reply section isn't enough",
  () => "he's so real for this",
  () => "screenshotting before it gets deleted",
  () => "the discourse this is about to cause",
  () => "not me agreeing with a stranger on main",
  () => "this is why I still have this app",
  () => "unreasonably normal about this post",
  () => "adding this to the pile of things I think about at 2am",
  () => "the timeline needed this today",
];

function templateCtx(text, rng) {
  const words = text.split(/\s+/).map((w) => w.replace(/[^\w'-]/g, "")).filter((w) => w.length > 3);
  return { word: words.length ? pick(rng, words) : "this" };
}

// ---------- persona (you) ----------

function getPersona() {
  try {
    const raw = localStorage.getItem("wentviral.persona");
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { name: "" };
}
function savePersona(p) {
  try { localStorage.setItem("wentviral.persona", JSON.stringify(p)); } catch (_) {}
}
function personaAvatar(name) {
  const rng = mulberry32(hashSeed("persona:" + name));
  const color = pick(rng, AVATAR_COLORS);
  const initials = name.trim() ? name.trim().slice(0, 2).toUpperCase() : "YO";
  return { color, initials };
}

// ---------- encode / decode permalink ----------

function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlDecode(str) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return decodeURIComponent(escape(atob(b64)));
}
function encodePost(payload) {
  return b64urlEncode(JSON.stringify(payload));
}
function decodePost(code) {
  try {
    const o = JSON.parse(b64urlDecode(code));
    if (typeof o.t !== "string" || typeof o.c !== "number" || !o.t.trim()) return null;
    return { t: o.t, c: o.c, n: typeof o.n === "string" ? o.n : "" };
  } catch (_) {
    return null;
  }
}

// ---------- simulation model ----------
// Everything below is a pure function of (text, createdAt, elapsedSeconds) —
// no mutable simulation state, so reload / share / revisit-a-week-later all
// just reevaluate at a different `t`.

function computeMultiplier(text) {
  let m = 1;
  const emojiMatches = text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
  m += Math.min(1, (emojiMatches ? emojiMatches.length : 0) * 0.15);
  if (text.length > 180) m += 0.5;
  const letters = text.replace(/[^a-zA-Z]/g, "");
  const upper = text.replace(/[^A-Z]/g, "");
  if (letters.length > 10 && upper.length / letters.length > 0.4) m += 0.4;
  const lower = " " + text.toLowerCase() + " ";
  for (const w of BAIT_WORDS) if (lower.includes(w)) m += 0.25;
  const rng = mulberry32(hashSeed("spice:" + text));
  m += rng() * 0.6;
  return Math.max(0.5, Math.min(3.5, m));
}

function buildSim(payload) {
  const seed = hashSeed(payload.c + "|" + payload.t);
  const rng = mulberry32(seed);
  const mult = computeMultiplier(payload.t);
  const targets = {
    likes: Math.round(randInt(rng, 700, 5000) * mult),
    reposts: Math.round(randInt(rng, 150, 900) * mult),
    quotes: Math.round(randInt(rng, 20, 220) * mult),
    replies: Math.round(randInt(rng, 30, 420) * mult),
  };
  const tau = { likes: 50, reposts: 110, quotes: 170, replies: 90 };

  function genEvents(n, evTau, cap) {
    const count = Math.min(n, cap);
    const events = [];
    for (let i = 0; i < count; i++) {
      const t = -evTau * Math.log(1 - rng() * 0.995);
      events.push(t);
    }
    events.sort((a, b) => a - b);
    return events;
  }
  const replyTimes = genEvents(targets.replies, 45, 50);
  const quoteTimes = genEvents(targets.quotes, 90, 20);

  const replies = replyTimes.map((t) => {
    const persona = genPersona(rng);
    const ctx = templateCtx(payload.t, rng);
    return {
      ...persona,
      t,
      text: pick(rng, REPLY_TEMPLATES)(ctx),
      likes: randInt(rng, 0, 60),
      replies: rng() < 0.25 ? randInt(rng, 1, 4) : 0,
      badge: rng() < 0.12,
    };
  });
  const quotes = quoteTimes.map((t) => {
    const persona = genPersona(rng);
    const ctx = templateCtx(payload.t, rng);
    return {
      ...persona,
      t,
      text: pick(rng, QUOTE_TEMPLATES)(ctx),
      likes: randInt(rng, 5, 300),
      reposts: randInt(rng, 0, 60),
    };
  });

  return { mult, targets, tau, replies, quotes };
}

function countAt(target, tau, t) {
  if (t <= 0) return 0;
  const base = target * (1 - Math.exp(-t / tau));
  const trickle = Math.floor(t / 600) * Math.max(1, Math.round(target * 0.003));
  return Math.floor(base + trickle);
}

// ---------- own (local-only) interaction state ----------

function ownKey(code) {
  return "wentviral.you." + code;
}
function getOwnState(code) {
  try {
    const raw = localStorage.getItem(ownKey(code));
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { liked: false, reposted: false, replies: [] };
}
function saveOwnState(code, state) {
  try { localStorage.setItem(ownKey(code), JSON.stringify(state)); } catch (_) {}
}

// ---------- nav ----------

const NAV_ITEMS = [
  { label: "Home", icon: "🏠", href: MOUNT + "/" },
  { label: "Search", icon: "🔎", toast: "search isn't part of the simulation" },
  { label: "Notifications", icon: "🔔", toast: "no real notifications here — everything's on the post page" },
  { label: "About", icon: "🚀", toast: "wentviral: write a fake post, watch fake people lose it. built by @buildthis.bisks.net" },
];
function renderNav() {
  const el = document.getElementById("nav-items");
  if (!el) return;
  el.innerHTML = NAV_ITEMS.map((item, i) =>
    item.href
      ? `<a class="nav-item active" href="${esc(item.href)}"><span class="ic">${item.icon}</span><span class="label">${esc(item.label)}</span></a>`
      : `<div class="nav-item" data-toast-idx="${i}"><span class="ic">${item.icon}</span><span class="label">${esc(item.label)}</span></div>`
  ).join("");
  el.querySelectorAll("[data-toast-idx]").forEach((n) => {
    n.addEventListener("click", () => toast(NAV_ITEMS[Number(n.dataset.toastIdx)].toast));
  });
}
function asideHtml() {
  return `
  <div class="aside-card">
    <h2>What is this?</h2>
    <p>wentviral is a fake Bluesky compose box. Write a post, hit send, and the page simulates a whole timeline reacting to it — replies, reposts, quote posts, likes, all generated in your browser by a seeded random model.</p>
    <p>Nothing is written to Bluesky, nobody outside this tab can see it, and the "people" replying don't exist. Share the link anyway — it decodes deterministically, so whoever opens it sees the same fake pile-on, grown a little further by however long it's been.</p>
  </div>
  <div class="aside-foot">Part of the <a href="https://bisks.net" target="_blank" rel="noopener">atprotozoa</a> experiment garden. Built by <a href="https://bsky.app/profile/buildthis.bisks.net" target="_blank" rel="noopener">@buildthis.bisks.net</a>.</div>`;
}

// ---------- compose view ----------

function renderCompose() {
  document.getElementById("main").innerHTML = `
    <div class="main-header"><h1>Home</h1><div class="sub">Write whatever you want. Watch it blow up.</div></div>
    <div class="composer">
      <div id="c-avatar"></div>
      <div class="composer-body">
        <div class="composer-persona">
          posting as <input id="c-name" maxlength="24" placeholder="You"><span class="ph" id="c-handle-preview"></span>
        </div>
        <textarea id="c-text" maxlength="600" placeholder="What's happening?"></textarea>
        <div class="composer-foot">
          <span class="char-count" id="c-count">0 / 300</span>
          <button class="post-btn" id="c-submit" disabled>Post</button>
        </div>
      </div>
    </div>
    <div class="composer-hint">Nothing here posts to real Bluesky. This writes nowhere — it just encodes your text into a link and fakes the rest.</div>
  `;
  document.getElementById("aside").innerHTML = asideHtml();
  renderNav();

  const persona = getPersona();
  const nameInput = document.getElementById("c-name");
  const handlePreview = document.getElementById("c-handle-preview");
  const textArea = document.getElementById("c-text");
  const countEl = document.getElementById("c-count");
  const submitBtn = document.getElementById("c-submit");
  const avatarEl = document.getElementById("c-avatar");

  function refreshAvatar() {
    const name = nameInput.value.trim() || "You";
    const a = personaAvatar(name);
    avatarEl.innerHTML = `<div class="avatar-gen" style="background:${a.color}">${esc(a.initials)}</div>`;
    handlePreview.textContent = "@" + slugify(name) + FAKE_TLD;
  }
  nameInput.value = persona.name || "";
  refreshAvatar();
  nameInput.addEventListener("input", () => {
    refreshAvatar();
    savePersona({ name: nameInput.value });
  });

  function refreshCount() {
    const len = [...textArea.value].length;
    countEl.textContent = len + " / 300";
    countEl.classList.toggle("over", len > 300);
    submitBtn.disabled = len === 0 || len > 300;
  }
  textArea.addEventListener("input", refreshCount);
  refreshCount();

  submitBtn.addEventListener("click", () => {
    const text = textArea.value.trim();
    if (!text) return;
    const name = nameInput.value.trim();
    const payload = { t: text, c: Date.now(), n: name };
    const code = encodePost(payload);
    location.href = MOUNT + "/p/" + code;
  });
}

// ---------- thread view ----------

let liveTimer = null;

function renderThread(code) {
  clearInterval(liveTimer);
  const payload = decodePost(code);
  if (!payload) {
    document.getElementById("main").innerHTML = `
      <div class="main-header"><div class="back-row"><a class="back-btn" href="${MOUNT}/">←</a><h1>Post</h1></div></div>
      ${`<div class="center-msg"><h2>That link's broken</h2><p>Couldn't decode a post out of that URL.</p></div>`}
    `;
    document.getElementById("aside").innerHTML = asideHtml();
    renderNav();
    return;
  }

  const sim = buildSim(payload);
  const createdSec = Math.floor(payload.c / 1000);
  const name = payload.n.trim() || "You";
  const handle = slugify(name) + FAKE_TLD;
  const avatar = personaAvatar(name);
  const own = getOwnState(code);
  const shareUrl = location.origin + MOUNT + "/p/" + code;

  document.getElementById("main").innerHTML = `
    <div class="main-header"><div class="back-row"><a class="back-btn" href="${MOUNT}/">←</a><h1>Post</h1></div></div>
    <div class="thread-focus">
      <div class="post-head-full">
        <div class="avatar-gen" style="background:${avatar.color}">${esc(avatar.initials)}</div>
        <div>
          <div class="post-name">${esc(name)}</div>
          <div class="post-handle">@${esc(handle)}</div>
        </div>
      </div>
      <div class="post-text">${esc(payload.t)}</div>
      <div class="thread-time" id="t-time"></div>
      <div class="stat-row" id="t-stats"></div>
      <div class="post-actions">
        <div class="act reply clickable" data-action="focus-reply"><span class="icon">💬</span><span id="a-replies"></span></div>
        <div class="act repost clickable" data-action="toggle-repost" id="a-repost-wrap"><span class="icon" id="a-repost-icon">🔁</span><span id="a-reposts"></span></div>
        <div class="act like clickable" data-action="toggle-like" id="a-like-wrap"><span class="icon" id="a-like-icon">❤️</span><span id="a-likes"></span></div>
      </div>
    </div>
    <div class="share-bar">
      <a class="pill-btn primary" id="share-bsky" target="_blank" rel="noopener">🦋 share to Bluesky</a>
      <button class="pill-btn" id="copy-link">🔗 copy link</button>
      <a class="pill-btn" href="${MOUNT}/">✍️ write your own</a>
    </div>
    <div class="tabs">
      <div class="tab active" data-tab="replies">Replies</div>
      <div class="tab" data-tab="quotes">Quotes</div>
    </div>
    <div id="pane-replies">
      <div id="own-replies"></div>
      <div class="composer" style="border-bottom:1px solid var(--border)">
        <div class="avatar-gen" style="background:${avatar.color};width:32px;height:32px;font-size:12px">${esc(avatar.initials)}</div>
        <div class="composer-body">
          <textarea id="own-reply-text" style="min-height:44px;font-size:15px" maxlength="300" placeholder="Reply as yourself…"></textarea>
          <div class="composer-foot"><button class="post-btn" id="own-reply-btn">Reply</button></div>
        </div>
      </div>
      <div id="replies-list"></div>
      <div class="more-note" id="replies-more" style="display:none"></div>
    </div>
    <div id="pane-quotes" style="display:none">
      <div id="quotes-list"></div>
      <div class="more-note" id="quotes-more" style="display:none"></div>
    </div>
  `;
  document.getElementById("aside").innerHTML = asideHtml();
  document.getElementById("share-bsky").href =
    "https://bsky.app/intent/compose?text=" +
    encodeURIComponent(`my post just hit ${fmtCount(countAt(sim.targets.likes, sim.tau.likes, Math.max(1, nowSec() - createdSec)))} fake likes on wentviral 👀\n\n${shareUrl}`);
  renderNav();

  // ---- tabs ----
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const which = tab.dataset.tab;
      document.getElementById("pane-replies").style.display = which === "replies" ? "" : "none";
      document.getElementById("pane-quotes").style.display = which === "quotes" ? "" : "none";
    });
  });

  document.getElementById("copy-link").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast("link copied");
    } catch (_) {
      toast("couldn't copy — copy it from the address bar");
    }
  });
  document.getElementById("a-like-wrap").addEventListener("click", () => {
    own.liked = !own.liked;
    saveOwnState(code, own);
    document.getElementById("a-like-icon").classList.add("pop");
    setTimeout(() => document.getElementById("a-like-icon").classList.remove("pop"), 400);
    updateLive();
  });
  document.getElementById("a-repost-wrap").addEventListener("click", () => {
    own.reposted = !own.reposted;
    saveOwnState(code, own);
    document.getElementById("a-repost-icon").classList.add("pop");
    setTimeout(() => document.getElementById("a-repost-icon").classList.remove("pop"), 400);
    updateLive();
  });
  document.querySelector('[data-action="focus-reply"]').addEventListener("click", () => {
    document.getElementById("own-reply-text").focus();
  });
  document.getElementById("own-reply-btn").addEventListener("click", () => {
    const ta = document.getElementById("own-reply-text");
    const text = ta.value.trim();
    if (!text) return;
    own.replies.push({ text, t: nowSec() - createdSec });
    saveOwnState(code, own);
    ta.value = "";
    renderOwnReplies();
    updateLive();
    toast("reply added");
  });

  function renderOwnReplies() {
    const wrap = document.getElementById("own-replies");
    wrap.innerHTML = own.replies
      .map(
        (r) => `<div class="post" style="border-left:3px solid var(--accent)">
          <div class="avatar-gen" style="background:${avatar.color}">${esc(avatar.initials)}</div>
          <div class="post-body">
            <div class="post-head"><span class="post-name">${esc(name)}</span><span class="post-handle">@${esc(handle)}</span><span class="post-dot">·</span><span class="post-time">${fmtAgo(nowSec() - (createdSec + r.t))}</span><span class="blowup-badge">you</span></div>
            <div class="post-text">${esc(r.text)}</div>
          </div>
        </div>`
      )
      .join("");
  }
  renderOwnReplies();

  // ---- live simulation ticking ----
  let repliesRevealed = 0;
  let quotesRevealed = 0;
  const repliesListEl = document.getElementById("replies-list");
  const quotesListEl = document.getElementById("quotes-list");

  function replyCardHtml(ev) {
    return `<div class="post">
      <div class="avatar-gen" style="background:${ev.color}">${esc(ev.initials)}</div>
      <div class="post-body">
        <div class="post-head">
          <span class="post-name">${esc(ev.name)}</span><span class="post-handle">@${esc(ev.handle)}</span><span class="post-dot">·</span>
          <span class="post-time">${fmtAgo(nowSec() - (createdSec + ev.t))}</span>
          ${ev.badge ? '<span class="blowup-badge">🔥 blowing up</span>' : ""}
        </div>
        <div class="post-text">${esc(ev.text)}</div>
        <div class="post-actions">
          <div class="act reply"><span class="icon">💬</span><span>${ev.replies}</span></div>
          <div class="act repost"><span class="icon">🔁</span><span>0</span></div>
          <div class="act like"><span class="icon">❤️</span><span>${fmtCount(ev.likes)}</span></div>
        </div>
      </div>
    </div>`;
  }
  function quoteCardHtml(ev) {
    return `<div class="post">
      <div class="avatar-gen" style="background:${ev.color}">${esc(ev.initials)}</div>
      <div class="post-body">
        <div class="post-head">
          <span class="post-name">${esc(ev.name)}</span><span class="post-handle">@${esc(ev.handle)}</span><span class="post-dot">·</span>
          <span class="post-time">${fmtAgo(nowSec() - (createdSec + ev.t))}</span>
        </div>
        <div class="post-text">${esc(ev.text)}</div>
        <div class="quote">
          <div class="quote-head"><div class="avatar-gen sm" style="background:${avatar.color}">${esc(avatar.initials)}</div><b>${esc(name)}</b><span class="post-handle">@${esc(handle)}</span></div>
          <div class="quote-text">${esc(truncate(payload.t, 140))}</div>
        </div>
        <div class="post-actions">
          <div class="act repost"><span class="icon">🔁</span><span>${ev.reposts}</span></div>
          <div class="act like"><span class="icon">❤️</span><span>${fmtCount(ev.likes)}</span></div>
        </div>
      </div>
    </div>`;
  }

  function updateLive() {
    const t = Math.max(0, nowSec() - createdSec);
    document.getElementById("t-time").textContent = fmtAgo(t) + " ago" + (t < 5 ? " · just posted" : "");
    const likes = countAt(sim.targets.likes, sim.tau.likes, t) + (own.liked ? 1 : 0);
    const reposts = countAt(sim.targets.reposts, sim.tau.reposts, t) + (own.reposted ? 1 : 0);
    const quoteCount = countAt(sim.targets.quotes, sim.tau.quotes, t);
    const replyCount = countAt(sim.targets.replies, sim.tau.replies, t) + own.replies.length;

    document.getElementById("t-stats").innerHTML =
      `<span><b>${fmtCount(replyCount)}</b> replies</span>` +
      `<span><b>${fmtCount(reposts)}</b> reposts</span>` +
      `<span><b>${fmtCount(quoteCount)}</b> quotes</span>` +
      `<span><b>${fmtCount(likes)}</b> likes</span>`;
    document.getElementById("a-replies").textContent = fmtCount(replyCount);
    document.getElementById("a-reposts").textContent = fmtCount(reposts);
    document.getElementById("a-likes").textContent = fmtCount(likes);
    document.getElementById("a-repost-wrap").classList.toggle("reposted", own.reposted);
    document.getElementById("a-like-wrap").classList.toggle("liked", own.liked);

    while (repliesRevealed < sim.replies.length && sim.replies[repliesRevealed].t <= t) {
      repliesListEl.insertAdjacentHTML("beforeend", replyCardHtml(sim.replies[repliesRevealed]));
      repliesRevealed++;
    }
    while (quotesRevealed < sim.quotes.length && sim.quotes[quotesRevealed].t <= t) {
      quotesListEl.insertAdjacentHTML("beforeend", quoteCardHtml(sim.quotes[quotesRevealed]));
      quotesRevealed++;
    }
    const repliesMore = document.getElementById("replies-more");
    if (repliesRevealed >= sim.replies.length && replyCount > repliesRevealed) {
      repliesMore.style.display = "";
      repliesMore.innerHTML = `<b>+${fmtCount(replyCount - repliesRevealed)}</b> more replies flooding in`;
    }
    const quotesMore = document.getElementById("quotes-more");
    if (quotesRevealed >= sim.quotes.length && quoteCount > quotesRevealed) {
      quotesMore.style.display = "";
      quotesMore.innerHTML = `<b>+${fmtCount(quoteCount - quotesRevealed)}</b> more quote posts out there`;
    }
  }

  updateLive();
  liveTimer = setInterval(updateLive, 2000);
}

// ---------- routing ----------

function route() {
  const path = location.pathname.slice(MOUNT.length) || "/";
  const m = path.match(/^\/p\/([^/]+)\/?$/);
  if (m) renderThread(m[1]);
  else renderCompose();
}

route();
