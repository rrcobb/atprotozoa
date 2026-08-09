"use strict";
// app.js — Bluesky 95's real client wiring: OAuth login, the public AppView
// for read-only browsing, and authenticated writes/reads proxied through the
// signed-in visitor's own PDS. The desktop/window chrome lives in index.html;
// this file is the part that actually talks to Bluesky.
import { login, completeLoginIfCallback, getSession, clearSession, dpopFetch } from "./lib/oauth.js";

const APPVIEW = "https://public.api.bsky.app";
const DISCOVER_FEED = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot";
const FALLBACK_AVATAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#008080"/><circle cx="50" cy="38" r="20" fill="#c0c0c0"/><ellipse cx="50" cy="92" rx="34" ry="30" fill="#c0c0c0"/></svg>'
  );

let session = null; // { did, handle, pdsUrl, accessJwt, ... } | null
let unreadCount = null;
const likedPosts = new Map(); // post uri -> like record uri, this tab only
const repostedPosts = new Map();
let composeReply = null; // { root, parent, handle } | null, set by the 💬 icon on a post row

// ---------- generic helpers ----------

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function rkeyOf(uri) {
  return (uri || "").split("/").pop();
}
function fmtCount(n) {
  n = n || 0;
  if (n < 1000) return String(n);
  if (n < 1000000) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, "") + "K";
  return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
}
function relTime(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 0 || diff < 60) return "now";
  if (diff < 3600) return Math.floor(diff / 60) + "m";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + "d";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function xrpc(method, params) {
  const url = new URL(`${APPVIEW}/xrpc/${method}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${method} failed (${res.status})`);
  return res.json();
}

// ---------- boot: restore session or run the OAuth callback ----------

async function boot() {
  try {
    const callbackSession = await completeLoginIfCallback();
    if (callbackSession) session = callbackSession;
  } catch (e) {
    console.error(e);
    setLogonStatus(e.message || String(e));
  }
  if (!session) session = await getSession().catch(() => null);
  updateAccountUI();
  if (session) {
    hideLogon();
    pollUnread();
    setInterval(pollUnread, 45000);
  }
  tick();
  setInterval(tick, 15000);
}

// ---------- logon screen (the "win95 login screen" the site was asked for) ----------

function showLogon(message) {
  document.getElementById("logon-screen").hidden = false;
  setLogonStatus(message || "");
  document.getElementById("logon-handle").focus();
}
function hideLogon() {
  document.getElementById("logon-screen").hidden = true;
}
function setLogonStatus(msg) {
  document.getElementById("logon-status").textContent = msg || "";
}
async function submitLogon() {
  const handle = document.getElementById("logon-handle").value.trim().replace(/^@/, "");
  if (!handle) {
    setLogonStatus("Type a handle first.");
    return;
  }
  setLogonStatus("Contacting network… (redirecting to your PDS)");
  document.getElementById("logon-ok").disabled = true;
  try {
    await login(handle); // navigates away on success
  } catch (e) {
    setLogonStatus(e.message || String(e));
    document.getElementById("logon-ok").disabled = false;
  }
}
async function logOut() {
  await clearSession();
  session = null;
  unreadCount = null;
  updateAccountUI();
  closeDialog();
  document.getElementById("feed-window").hidden = true;
}

function updateAccountUI() {
  const cell = document.getElementById("account-cell");
  cell.textContent = session ? `👤 @${session.handle}` : "👤 Not signed in";
  updateBadge();
}
function updateBadge() {
  const b = document.getElementById("unread-badge");
  if (unreadCount && unreadCount > 0) {
    b.hidden = false;
    b.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  } else {
    b.hidden = true;
  }
}

function openAccountDialog() {
  if (session) {
    document.getElementById("dialog-title").textContent = "Account";
    document.getElementById("dialog-icon").textContent = "👤";
    document.getElementById("dialog-message").textContent =
      `Signed in as @${session.handle}\n\nYour session is a real atproto OAuth grant (PKCE + DPoP), straight to your own PDS. Bluesky 95 never sees your password.`;
    const buttons = document.getElementById("dialog-buttons");
    buttons.innerHTML = `<button class="win-btn" id="dialog-logout">Log Off</button><button class="win-btn" onclick="closeDialog()">Close</button>`;
    document.getElementById("dialog-overlay").hidden = false;
    document.getElementById("dialog-logout").onclick = logOut;
  } else {
    showLogon("Sign in to view your account.");
  }
}

// Shown wherever a real write/read needs a session and there isn't one.
function requireLogin(reason) {
  if (session) return true;
  showLogon(reason || "You must log on to Bluesky 95 to do that.");
  return false;
}

// ---------- likes / reposts (real writes to the signed-in visitor's own repo) ----------

async function toggleLike(el) {
  if (!requireLogin("Log on to catch a post in your web.")) return;
  const wrap = el.closest(".prow-act.like");
  const countEl = wrap.querySelector(".prow-count");
  const uri = el.getAttribute("data-uri");
  const cid = el.getAttribute("data-cid");
  const wasLiked = wrap.classList.contains("on");
  const base = Number(countEl.getAttribute("data-count") || 0);

  wrap.classList.toggle("on");
  el.textContent = wasLiked ? "🕸️" : "🕷️";
  const newCount = wasLiked ? Math.max(0, base - 1) : base + 1;
  countEl.setAttribute("data-count", newCount);
  countEl.textContent = fmtCount(newCount);

  try {
    const pds = session.pdsUrl.replace(/\/$/, "");
    if (!wasLiked) {
      const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo: session.did,
          collection: "app.bsky.feed.like",
          record: { $type: "app.bsky.feed.like", subject: { uri, cid }, createdAt: new Date().toISOString() },
        }),
      });
      if (!res.ok) throw new Error(`like failed (${res.status})`);
      likedPosts.set(uri, (await res.json()).uri);
    } else {
      const likeUri = likedPosts.get(uri);
      if (likeUri) {
        const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.deleteRecord`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.like", rkey: rkeyOf(likeUri) }),
        });
        if (!res.ok) throw new Error(`unlike failed (${res.status})`);
      }
      likedPosts.delete(uri);
    }
  } catch (e) {
    wrap.classList.toggle("on");
    el.textContent = wasLiked ? "🕷️" : "🕸️";
    countEl.setAttribute("data-count", base);
    countEl.textContent = fmtCount(base);
    winAlert("Like failed", "❌", e.message || String(e));
  }
}

async function toggleRepost(el) {
  if (!requireLogin("Log on to send a post back out.")) return;
  const wrap = el.closest(".prow-act.repost");
  const countEl = wrap.querySelector(".prow-count");
  const uri = el.getAttribute("data-uri");
  const cid = el.getAttribute("data-cid");
  const wasReposted = wrap.classList.contains("on");
  const base = Number(countEl.getAttribute("data-count") || 0);

  wrap.classList.toggle("on");
  const newCount = wasReposted ? Math.max(0, base - 1) : base + 1;
  countEl.setAttribute("data-count", newCount);
  countEl.textContent = fmtCount(newCount);

  try {
    const pds = session.pdsUrl.replace(/\/$/, "");
    if (!wasReposted) {
      const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo: session.did,
          collection: "app.bsky.feed.repost",
          record: { $type: "app.bsky.feed.repost", subject: { uri, cid }, createdAt: new Date().toISOString() },
        }),
      });
      if (!res.ok) throw new Error(`repost failed (${res.status})`);
      repostedPosts.set(uri, (await res.json()).uri);
    } else {
      const repostUri = repostedPosts.get(uri);
      if (repostUri) {
        const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.deleteRecord`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.repost", rkey: rkeyOf(repostUri) }),
        });
        if (!res.ok) throw new Error(`undo repost failed (${res.status})`);
      }
      repostedPosts.delete(uri);
    }
  } catch (e) {
    wrap.classList.toggle("on");
    countEl.setAttribute("data-count", base);
    countEl.textContent = fmtCount(base);
    winAlert("Repost failed", "❌", e.message || String(e));
  }
}

function startReply(el) {
  if (!requireLogin("Log on to reply.")) return;
  composeReply = {
    root: { uri: el.getAttribute("data-root-uri"), cid: el.getAttribute("data-root-cid") },
    parent: { uri: el.getAttribute("data-uri"), cid: el.getAttribute("data-cid") },
    handle: el.getAttribute("data-author"),
  };
  window.openCompose("reply");
}

// ---------- feed row rendering ----------

function postRowHtml(post) {
  const author = post.author || {};
  const text = post.record?.text || "";
  const liked = likedPosts.has(post.uri);
  const reposted = repostedPosts.has(post.uri);
  const reply = post.record?.reply;
  const rootUri = reply?.root?.uri || post.uri;
  const rootCid = reply?.root?.cid || post.cid || "";
  const img = post.embed?.images?.[0]?.thumb || post.embed?.media?.images?.[0]?.thumb;
  return `<div class="prow outset">
    <img class="prow-avatar" src="${esc(author.avatar || FALLBACK_AVATAR)}" alt="" />
    <div class="prow-body">
      <div class="prow-head">
        <span class="prow-name">${esc(author.displayName || author.handle || "unknown")}</span>
        <span class="prow-handle">@${esc(author.handle || "")}</span>
        <span class="prow-time">${relTime(post.indexedAt)}</span>
      </div>
      <div class="prow-text">${esc(text)}</div>
      ${img ? `<img class="prow-img" src="${esc(img)}" alt="" loading="lazy" />` : ""}
      <div class="prow-acts">
        <span class="prow-act like${liked ? " on" : ""}">
          <span class="prow-icon" onclick="toggleLike(this)" data-uri="${esc(post.uri)}" data-cid="${esc(post.cid || "")}">${liked ? "🕷️" : "🕸️"}</span>
          <span class="prow-count" data-count="${post.likeCount || 0}">${fmtCount(post.likeCount)}</span>
        </span>
        <span class="prow-act repost${reposted ? " on" : ""}">
          <span class="prow-icon" onclick="toggleRepost(this)" data-uri="${esc(post.uri)}" data-cid="${esc(post.cid || "")}">🪰</span>
          <span class="prow-count" data-count="${(post.repostCount || 0) + (post.quoteCount || 0)}">${fmtCount((post.repostCount || 0) + (post.quoteCount || 0))}</span>
        </span>
        <span class="prow-act reply">
          <span class="prow-icon" onclick="startReply(this)" data-uri="${esc(post.uri)}" data-cid="${esc(post.cid || "")}" data-root-uri="${esc(rootUri)}" data-root-cid="${esc(rootCid)}" data-author="${esc(author.handle || "")}">💬</span>
          <span class="prow-count" data-count="${post.replyCount || 0}">${fmtCount(post.replyCount)}</span>
        </span>
      </div>
    </div>
  </div>`;
}

function loadMoreRow() {
  return `<button class="win-btn feed-more" onclick="loadMoreFeed()">Show more</button>`;
}
function feedMsg(text) {
  return `<div class="feed-msg">${esc(text)}</div>`;
}
function signInMsg(text) {
  return `<div class="feed-msg">${esc(text)}<br><br><button class="win-btn" onclick="showLogon()">Log On</button></div>`;
}

// ---------- feed window state machine ----------
// One reusable window; `mode` decides what loadFeedWindow() fetches.

let fw = { mode: null, cursor: null, feedUri: null, q: null };

const FEED_TITLES = {
  home: ["🏠", "Home Feed"],
  following: ["👥", "Following Feed"],
  discover: ["🧭", "Discover Feeds"],
  feed: ["📋", "Feed"],
  trending: ["📈", "Trending Topics"],
  search: ["🔍", "Search Bluesky"],
  notifications: ["🔔", "Notifications"],
  mentions: ["📣", "Mentions"],
};

function openFeedWindow(mode, opts) {
  fw = { mode, cursor: null, feedUri: opts?.feedUri || null, q: opts?.q || null };
  const [icon, title] = FEED_TITLES[mode] || ["🦋", "Bluesky"];
  document.getElementById("feed-title").textContent = `${icon} ${opts?.titleOverride || title}`;
  document.getElementById("feed-window").hidden = false;
  document.getElementById("feed-search-bar").hidden = mode !== "search";
  if (mode === "search") {
    const input = document.getElementById("feed-search-input");
    input.value = opts?.q || "";
    setTimeout(() => input.focus(), 0);
  }
  const list = document.getElementById("feed-list");
  list.innerHTML = `<div class="feed-msg">Loading…</div>`;
  loadFeedWindow();
}
function closeFeedWindow() {
  document.getElementById("feed-window").hidden = true;
}

async function loadFeedWindow(more) {
  const list = document.getElementById("feed-list");
  if (!more) list.innerHTML = `<div class="feed-msg">Loading…</div>`;
  else list.querySelector(".feed-more")?.remove();
  try {
    if (fw.mode === "home") return renderPostsPage(list, more, () => xrpc("app.bsky.feed.getFeed", { feed: DISCOVER_FEED, limit: 25, cursor: fw.cursor }));
    if (fw.mode === "feed") return renderPostsPage(list, more, () => xrpc("app.bsky.feed.getFeed", { feed: fw.feedUri, limit: 25, cursor: fw.cursor }));
    if (fw.mode === "search") return renderPostsPage(list, more, () => xrpc("app.bsky.feed.searchPosts", { q: fw.q, limit: 25, cursor: fw.cursor }), "posts");
    if (fw.mode === "following") {
      if (!session) {
        list.innerHTML = signInMsg("Not signed in.");
        return;
      }
      const url = new URL(`${session.pdsUrl.replace(/\/$/, "")}/xrpc/app.bsky.feed.getTimeline`);
      url.searchParams.set("limit", "25");
      if (fw.cursor) url.searchParams.set("cursor", fw.cursor);
      const res = await dpopFetch(session, url.toString(), { headers: { accept: "application/json", "atproto-proxy": "did:web:api.bsky.app#bsky_appview" } });
      if (!res.ok) throw new Error(`getTimeline failed (${res.status})`);
      const data = await res.json();
      return renderPostsPage(list, more, async () => data);
    }
    if (fw.mode === "trending") {
      const data = await xrpc("app.bsky.unspecced.getTrendingTopics", { limit: 25 });
      const topics = data.topics || [];
      list.innerHTML = topics.length
        ? topics.map(() => `<div class="prow outset trow"><div class="prow-body"><div class="prow-name prow-topic"></div><div class="prow-text prow-topic-desc"></div></div></div>`).join("")
        : feedMsg("No trending topics right now.");
      // Filled via textContent (not template-interpolated into the HTML
      // attribute/markup) so a topic name containing quotes can't break out
      // of an inline onclick= string — see click listener below instead.
      list.querySelectorAll(".trow").forEach((el, i) => {
        const t = topics[i];
        el.querySelector(".prow-topic").textContent = `📈 ${t.displayName || t.topic}`;
        el.querySelector(".prow-topic-desc").textContent = t.description || "";
        el.addEventListener("click", () => openFeedWindow("search", { q: t.topic }));
      });
      return;
    }
    if (fw.mode === "discover") {
      const data = await xrpc("app.bsky.unspecced.getPopularFeedGenerators", { limit: 30 });
      const feeds = data.feeds || [];
      list.innerHTML = feeds.length
        ? feeds.map((f) => `<div class="prow outset trow"><img class="prow-avatar" src="${esc(f.avatar || FALLBACK_AVATAR)}" alt=""><div class="prow-body"><div class="prow-name">🎛️ ${esc(f.displayName)}</div><div class="prow-text">${esc(f.description || "by @" + (f.creator?.handle || ""))}</div></div></div>`).join("")
        : feedMsg("No feeds found.");
      // Click handlers attached after the fact (not inlined as onclick=)
      // since displayName/uri can contain quote characters that would
      // otherwise break out of an HTML attribute.
      list.querySelectorAll(".trow").forEach((el, i) => {
        const f = feeds[i];
        el.addEventListener("click", () => openFeedWindow("feed", { feedUri: f.uri, titleOverride: f.displayName }));
      });
      return;
    }
    if (fw.mode === "notifications" || fw.mode === "mentions") {
      if (!session) {
        list.innerHTML = signInMsg("Not signed in.");
        return;
      }
      const pds = session.pdsUrl.replace(/\/$/, "");
      const url = new URL(`${pds}/xrpc/app.bsky.notification.listNotifications`);
      url.searchParams.set("limit", "40");
      if (fw.cursor) url.searchParams.set("cursor", fw.cursor);
      const res = await dpopFetch(session, url.toString(), { headers: { accept: "application/json", "atproto-proxy": "did:web:api.bsky.app#bsky_appview" } });
      if (!res.ok) throw new Error(`listNotifications failed (${res.status})`);
      const data = await res.json();
      let notifs = data.notifications || [];
      if (fw.mode === "mentions") notifs = notifs.filter((n) => n.reason === "mention" || n.reason === "reply");
      const rows = notifs.map(notifRowHtml).join("");
      if (!more) list.innerHTML = rows || feedMsg("Nothing here yet.");
      else list.insertAdjacentHTML("beforeend", rows);
      if (data.cursor && notifs.length) {
        fw.cursor = data.cursor;
        list.insertAdjacentHTML("beforeend", loadMoreRow());
      }
      if (fw.mode === "notifications") markNotificationsSeen();
      return;
    }
  } catch (e) {
    list.innerHTML = feedMsg("Couldn't load this (" + e.message + ").");
  }
}
window.loadMoreFeed = () => loadFeedWindow(true);

async function renderPostsPage(list, more, fetcher, key) {
  const data = await fetcher();
  const items = key ? data[key] : data.feed;
  const posts = key ? items : (items || []).map((it) => it.post);
  const rows = (posts || []).map(postRowHtml).join("");
  if (!more) list.innerHTML = rows || feedMsg("Nothing here yet.");
  else list.insertAdjacentHTML("beforeend", rows);
  if (data.cursor && posts && posts.length) {
    fw.cursor = data.cursor;
    list.insertAdjacentHTML("beforeend", loadMoreRow());
  }
}

const NOTIF_META = {
  like: { icon: "🕸️", verb: "caught your post in their web" },
  repost: { icon: "🪰", verb: "sent your post back out" },
  quote: { icon: "🪰", verb: "quoted your post" },
  follow: { icon: "🕷️", verb: "spun a thread to you (followed)" },
  mention: { icon: "💬", verb: "mentioned you" },
  reply: { icon: "💬", verb: "replied to you" },
};
function notifRowHtml(n) {
  const meta = NOTIF_META[n.reason] || { icon: "🔔", verb: n.reason };
  const author = n.author || {};
  const text = n.record?.text;
  return `<div class="prow outset${n.isRead ? "" : " unread"}">
    <img class="prow-avatar" src="${esc(author.avatar || FALLBACK_AVATAR)}" alt="" />
    <div class="prow-body">
      <div class="prow-head"><span class="prow-name">${meta.icon} ${esc(author.displayName || author.handle)}</span><span class="prow-time">${relTime(n.indexedAt)}</span></div>
      <div class="prow-text">${esc(meta.verb)}${text ? `: "${esc(text.slice(0, 140))}"` : ""}</div>
    </div>
  </div>`;
}
async function markNotificationsSeen() {
  if (!session) return;
  try {
    const pds = session.pdsUrl.replace(/\/$/, "");
    await dpopFetch(session, `${pds}/xrpc/app.bsky.notification.updateSeen`, {
      method: "POST",
      headers: { "content-type": "application/json", "atproto-proxy": "did:web:api.bsky.app#bsky_appview" },
      body: JSON.stringify({ seenAt: new Date().toISOString() }),
    });
    unreadCount = 0;
    updateBadge();
  } catch {}
}
async function pollUnread() {
  if (!session) return;
  try {
    const pds = session.pdsUrl.replace(/\/$/, "");
    const res = await dpopFetch(session, `${pds}/xrpc/app.bsky.notification.getUnreadCount`, {
      headers: { accept: "application/json", "atproto-proxy": "did:web:api.bsky.app#bsky_appview" },
    });
    if (res.ok) {
      unreadCount = (await res.json()).count || 0;
      updateBadge();
    }
  } catch {}
}

function submitSearch() {
  const q = document.getElementById("feed-search-input").value.trim();
  if (!q) return;
  openFeedWindow("search", { q });
}

// ---------- compose (real app.bsky.feed.post writes) ----------

function openCompose(mode) {
  if (!requireLogin("Log on to post to Bluesky.")) return;
  window.closeFileMenu?.();
  const win = document.getElementById("compose-window");
  win.hidden = false;
  const titleEl = document.getElementById("compose-title");
  const text = document.getElementById("compose-text");
  if (mode === "reply" && composeReply) {
    titleEl.textContent = `💬 Reply to @${composeReply.handle} - Notepad`;
    text.value = "";
  } else if (mode === "share") {
    composeReply = null;
    titleEl.textContent = "📤 Share Post - Notepad";
    text.value = "the leaked Bluesky 95 redesign is real now — a functional client with real posts, likes, and reposts: " + SITE_URL;
  } else {
    composeReply = null;
    titleEl.textContent = "📝 New Post - Notepad";
    text.value = "";
  }
  updateComposeCount();
  text.focus();
}
function closeCompose() {
  document.getElementById("compose-window").hidden = true;
  composeReply = null;
}
function updateComposeCount() {
  document.getElementById("compose-count").textContent = String(document.getElementById("compose-text").value.length);
}
async function sendCompose() {
  const text = document.getElementById("compose-text").value.trim();
  if (!text) return;
  if (!requireLogin("Log on to post to Bluesky.")) return;
  const btn = document.getElementById("compose-send");
  btn.disabled = true;
  btn.textContent = "Posting…";
  try {
    const pds = session.pdsUrl.replace(/\/$/, "");
    const record = { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString() };
    if (composeReply) record.reply = { root: composeReply.root, parent: composeReply.parent };
    const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
    });
    if (!res.ok) throw new Error(`post failed (${res.status})`);
    closeCompose();
    winAlert("Posted", "✅", "Your post is live on Bluesky.");
  } catch (e) {
    winAlert("Post failed", "❌", e.message || String(e));
  } finally {
    btn.disabled = false;
    btn.textContent = "Post to Bluesky";
  }
}

function winAlert(title, icon, message) {
  document.getElementById("dialog-title").textContent = title;
  document.getElementById("dialog-icon").textContent = icon;
  document.getElementById("dialog-message").textContent = message;
  document.getElementById("dialog-buttons").innerHTML = `<button class="win-btn" onclick="closeDialog()">OK</button>`;
  document.getElementById("dialog-overlay").hidden = false;
}

// ---------- clock (unchanged behavior, kept here so app.js owns all client logic) ----------
function tick() {
  const now = new Date();
  let h = now.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const m = String(now.getMinutes()).padStart(2, "0");
  document.getElementById("clock").textContent = h + ":" + m + " " + ampm;
}

const SITE_URL = "https://bsky95.bisks.net/";

// ---------- expose to inline onclick= handlers in index.html ----------
Object.assign(window, {
  openFeedWindow,
  closeFeedWindow,
  submitSearch,
  toggleLike,
  toggleRepost,
  startReply,
  openCompose,
  closeCompose,
  updateComposeCount,
  sendCompose,
  submitLogon,
  showLogon,
  hideLogon,
  openAccountDialog,
  logOut,
  winAlert,
});

document.addEventListener("DOMContentLoaded", boot);
