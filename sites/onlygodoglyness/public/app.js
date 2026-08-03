// Only — a social app with exactly one poster. Everything here is read-only
// against the public AppView; there's no login, no writing, nothing to auth.
// The bit is entirely in what the UI pretends the other buttons do.
const API = "https://public.api.bsky.app/xrpc/";
const ACTOR = "godoglyness.bsky.social";
const SITE_URL = "https://onlygodoglyness.bisks.net/";

const els = {
  status: document.getElementById("status"),
  view: document.getElementById("view"),
  viewTitle: document.getElementById("viewTitle"),
  viewSub: document.getElementById("viewSub"),
  nav: document.getElementById("nav"),
  mobileNav: document.getElementById("mobileNav"),
  composer: document.getElementById("composer"),
  composerInput: document.getElementById("composerInput"),
  composerAv: document.getElementById("composerAv"),
  composeBtn: document.getElementById("composeBtn"),
  wtfAv: document.getElementById("wtfAv"),
  wtfName: document.getElementById("wtfName"),
  wtfHandle: document.getElementById("wtfHandle"),
  trendsList: document.getElementById("trendsList"),
  shareBluesky: document.getElementById("shareBluesky"),
  toast: document.getElementById("toast"),
};

async function xrpc(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""));
  if (!res.ok) throw new Error(method + " " + res.status);
  return res.json();
}

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return Math.floor(s) + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 86400 * 30) return Math.floor(s / 86400) + "d";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function esc(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// minimal, dependency-free linkifier for the handful of link/mention shapes
// that actually show up in plain post text — full facet resolution isn't
// worth it for a joke app with one author.
function renderText(text) {
  const escaped = esc(text || "");
  return escaped
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])@([a-zA-Z0-9.-]+)/g, '$1<a href="https://bsky.app/profile/$2" target="_blank" rel="noopener">@$2</a>');
}

let toastTimer = null;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

const NOT_YOU_LINES = [
  "You are not @godoglyness.bsky.social. This action is unavailable.",
  "Only one account on this platform can do that, and it isn't yours.",
  "Access denied: population of eligible users is 1, and you're not it.",
  "This platform has exactly one poster. You're not currently them.",
];
function notYou() {
  toast(NOT_YOU_LINES[Math.floor(Math.random() * NOT_YOU_LINES.length)]);
}

const STOPWORDS = new Set([
  "this","that","with","from","have","just","your","about","there","their",
  "what","when","where","which","would","could","should","been","were",
  "into","over","under","then","than","some","such","only","also","like",
  "will","really","still","even","much","very","them","they","been","being",
  "here","http","https","www"
]);
function computeTrends(posts) {
  const counts = new Map();
  for (const text of posts) {
    const words = (text || "").toLowerCase().match(/[a-z][a-z']{3,}/g) || [];
    const seen = new Set();
    for (const w of words) {
      if (STOPWORDS.has(w) || seen.has(w)) continue;
      seen.add(w);
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

function postPermalink(handle, uri) {
  const rkey = (uri || "").split("/").pop();
  return "https://bsky.app/profile/" + handle + "/post/" + rkey;
}

function renderPost(item, profile) {
  const post = item.post;
  const record = post.record || {};
  const author = post.author || profile;
  const isReply = !!record.reply;
  const link = postPermalink(author.handle, post.uri);
  const shareText =
    '"' + (record.text || "").slice(0, 180) + '" — the only post you\'ll ever see from the only user on Only. ' +
    link;

  const wrap = document.createElement("article");
  wrap.className = "post";
  wrap.innerHTML =
    '<img class="av" src="' + esc(author.avatar || "") + '" alt="" />' +
    '<div class="post-body">' +
      (isReply ? '<div class="post-reply-tag">replying to themselves — there\'s no one else</div>' : "") +
      '<div class="post-meta">' +
        '<span class="name">' + esc(author.displayName || author.handle) + "</span>" +
        '<span class="handle">@' + esc(author.handle) + "</span>" +
        '<span class="dot">·</span>' +
        '<span class="time">' + timeAgo(record.createdAt || post.indexedAt) + "</span>" +
      "</div>" +
      '<div class="post-text">' + renderText(record.text) + "</div>" +
      '<div class="post-actions">' +
        '<button class="reply" title="reply">💬 ' + (post.replyCount || 0) + "</button>" +
        '<button class="repost" title="repost">🔁 ' + (post.repostCount || 0) + "</button>" +
        '<button class="like" title="like">♡ ' + (post.likeCount || 0) + "</button>" +
        '<a class="share" href="https://bsky.app/intent/compose?text=' + encodeURIComponent(shareText) + '" target="_blank" rel="noopener" title="share on Bluesky">⇪ share</a>' +
      "</div>" +
    "</div>";
  wrap.querySelector(".reply").addEventListener("click", notYou);
  wrap.querySelector(".repost").addEventListener("click", notYou);
  wrap.querySelector(".like").addEventListener("click", notYou);
  return wrap;
}

let state = { profile: null, feedItems: [], view: "home" };

function renderHome() {
  els.view.innerHTML = "";
  if (!state.feedItems.length) {
    els.view.innerHTML = '<div class="empty"><div class="big">·</div>the one user hasn\'t posted anything recently.</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const item of state.feedItems) frag.appendChild(renderPost(item, state.profile));
  els.view.appendChild(frag);
}

function renderNotifications() {
  const p = state.profile;
  const recent = state.feedItems[0];
  const snippet = recent ? esc((recent.post.record.text || "").slice(0, 60)) : "their last post";
  els.view.innerHTML =
    '<div class="empty">' +
      '<div class="big">♡</div>' +
      "You have no notifications.<br />There is only one user on this platform, and they don't need to notify you of anything." +
    "</div>" +
    '<div class="pop-note">' +
      "The only notification this app could ever generate truthfully: " +
      "<b>@" + esc(p ? p.handle : ACTOR) + "</b> posted “" + snippet + "…”, and you found out by refreshing, like everyone else." +
    "</div>";
}

function renderMessages() {
  els.view.innerHTML =
    '<div class="empty">' +
      '<div class="big">✉</div>' +
      "1 conversation." +
    "</div>" +
    '<div class="pop-note">' +
      "It's with @" + esc(ACTOR) + ". They haven't opened it. They don't know it exists. " +
      "Messaging requires an account, and there's only one of those, and it isn't yours." +
    "</div>";
}

function renderProfile() {
  const p = state.profile;
  if (!p) {
    els.view.innerHTML = '<div class="empty">loading the entire userbase…</div>';
    return;
  }
  const banner = p.banner ? 'background-image:url(' + esc(p.banner) + ')' : "";
  els.view.innerHTML =
    '<div class="profile-banner" style="' + banner + '"></div>' +
    '<div class="profile-head">' +
      '<img class="av" src="' + esc(p.avatar || "") + '" alt="" />' +
      "<h2>" + esc(p.displayName || p.handle) + "</h2>" +
      '<div class="handle">@' + esc(p.handle) + "</div>" +
    "</div>" +
    (p.description ? '<div class="profile-bio">' + renderText(p.description) + "</div>" : "") +
    '<div class="profile-stats">' +
      "<span><b>" + (p.postsCount ?? "—") + "</b> posts</span>" +
      "<span><b>" + (p.followersCount ?? "—") + "</b> spectators</span>" +
      "<span><b>0</b> other users</span>" +
    "</div>" +
    '<div class="pop-note">' +
      "This is the only profile that can exist on Only. Population: 1 poster, " +
      (p.followersCount ?? "some number of") + " people watching from the outside. " +
      "The real @" + esc(p.handle) + " lives on Bluesky proper — this is just the one place where they're the whole platform." +
    "</div>";
}

const RENDERERS = { home: renderHome, notifications: renderNotifications, messages: renderMessages, profile: renderProfile };
const TITLES = {
  home: ["Home", "You're seeing everything, because there's only one thing to see."],
  notifications: ["Notifications", "Nothing to report. There's nobody else to report on."],
  messages: ["Messages", "Direct messages, mostly hypothetical."],
  profile: ["Profile", "The only account on the platform."],
};

function setView(name) {
  state.view = name;
  els.viewTitle.textContent = TITLES[name][0];
  els.viewSub.textContent = TITLES[name][1];
  els.composer.style.display = name === "home" ? "" : "none";
  document.querySelectorAll(".nav button, .mobile-nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  RENDERERS[name]();
}

els.nav.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (btn) setView(btn.dataset.view);
});
els.mobileNav.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (btn) setView(btn.dataset.view);
});

els.composerInput.addEventListener("focus", () => {
  els.composer.classList.remove("shake");
  void els.composer.offsetWidth;
  els.composer.classList.add("shake");
  notYou();
  els.composerInput.blur();
});
els.composeBtn.addEventListener("click", notYou);

async function boot() {
  els.shareBluesky.href =
    "https://bsky.app/intent/compose?text=" +
    encodeURIComponent(
      "found a social network with exactly one (1) poster, @godoglyness.bsky.social. everyone else just watches. " + SITE_URL
    );

  try {
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: ACTOR });
    state.profile = profile;
    els.composerAv.src = profile.avatar || "";
    els.wtfAv.src = profile.avatar || "";
    els.wtfName.textContent = profile.displayName || profile.handle;
    els.wtfHandle.textContent = "@" + profile.handle;

    const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: ACTOR, limit: "40", filter: "posts_with_replies" });
    // getAuthorFeed can include reposts of *other* people's posts (item.reason)
    // and, in principle, embedded posts by other authors — both would put a
    // second poster on screen, which is the one thing this app promises never
    // happens. Keep only godoglyness's own, non-reposted posts.
    state.feedItems = (feed.feed || []).filter(
      (i) => i.post && i.post.record && !i.reason && i.post.author && i.post.author.handle === ACTOR
    );

    els.status.style.display = "none";

    const texts = state.feedItems.map((i) => i.post.record.text).filter(Boolean);
    const trends = computeTrends(texts);
    els.trendsList.innerHTML = trends.length
      ? trends.map(([w, n]) => (
          '<div class="trend"><div class="cat">Population 1 · Worldwide</div>' +
          '<div class="tag">#' + esc(w) + '</div><div class="ct">' + n + " posts · 1 poster</div></div>"
        )).join("")
      : '<div class="trend"><div class="cat">Population 1 · Worldwide</div><div class="tag">nothing trending</div><div class="ct">one user isn’t enough to make a trend</div></div>';

    setView("home");
  } catch (err) {
    els.status.textContent = "couldn't load the userbase: " + err.message;
    els.status.classList.add("err");
  }
}

boot();

const pathView = (location.pathname.match(/^\/(notifications|messages|profile)\/?$/) || [])[1];
if (pathView) {
  // deferred until boot() resolves so profile/feed data is ready
  const check = setInterval(() => {
    if (state.profile) {
      clearInterval(check);
      setView(pathView);
    }
  }, 100);
}
