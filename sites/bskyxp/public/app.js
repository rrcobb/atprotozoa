"use strict";

// bskyxp — a real, working Bluesky client, skinned entirely as a
// Windows-XP-era "Bluesky Social" desktop launcher (silver Luna window,
// garish clip-art icons, the works). Every feed/profile/thread/search is
// live data from Bluesky's public AppView (public.api.bsky.app); logging in
// is real atproto OAuth (PKCE + DPoP) straight to your own PDS (see
// lib/oauth.js) and every write — post, reply, like, repost, block — is a
// genuine record on your own repo. Adapted from sites/skyclone's plumbing;
// see that site for the (rather more spider-themed) sibling.

const MOUNT = "";
const SITE_URL = "https://bskyxp.bisks.net/";
const APPVIEW = "https://public.api.bsky.app";
const DISCOVER_FEED = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot";
const SAVED_KEY = "bskyxp:saved-posts";
const FALLBACK_AVATAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8b98a5"/><circle cx="50" cy="38" r="20" fill="#e1e8ed"/><ellipse cx="50" cy="92" rx="34" ry="30" fill="#e1e8ed"/></svg>'
  );

// ---------- auth (real OAuth login -> home timeline + real writes) ----------

let session = null; // { did, handle, pdsUrl, accessJwt, ... } | null
let sessionProfile = null;
let oauthLib = null;

async function oauth() {
  if (!oauthLib) oauthLib = await import(`${MOUNT}/lib/oauth.js`);
  return oauthLib;
}

async function loadSessionProfile() {
  if (!session) {
    sessionProfile = null;
    return;
  }
  try {
    sessionProfile = await xrpc("app.bsky.actor.getProfile", { actor: session.did });
  } catch {
    sessionProfile = null;
  }
}

function showToast(msg, kind) {
  const t = document.createElement("div");
  t.className = "toast" + (kind ? " " + kind : "");
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 4000);
}

function openLoginModal() {
  if (document.getElementById("login-modal")) return;
  const box = document.createElement("div");
  box.id = "login-modal";
  box.className = "modal-overlay";
  box.innerHTML = `
    <div class="modal">
      <h2>Log in with Bluesky</h2>
      <p>Real OAuth, straight to your own PDS — bskyxp never sees your password. Unlocks your real Following Feed, and lets you post, reply, repost, and like for real, straight to your own repo.</p>
      <input id="login-handle" placeholder="yourhandle.bsky.social" autocomplete="off">
      <div class="modal-actions">
        <button type="button" id="login-cancel" class="xp-btn-3d">Cancel</button>
        <button type="button" id="login-go" class="xp-btn-3d primary">Continue</button>
      </div>
      <div class="modal-status" id="login-status"></div>
    </div>`;
  document.body.appendChild(box);
  const input = document.getElementById("login-handle");
  input.focus();
  if (window.attachHandleTypeahead) window.attachHandleTypeahead(input);
  box.addEventListener("click", (e) => {
    if (e.target === box) closeLoginModal();
  });
  document.getElementById("login-cancel").onclick = closeLoginModal;
  const go = document.getElementById("login-go");
  const status = document.getElementById("login-status");
  const submit = async () => {
    const h = input.value.trim().replace(/^@/, "");
    if (!h) return;
    go.disabled = true;
    status.textContent = "Redirecting to your PDS…";
    try {
      const { login } = await oauth();
      await login(h);
    } catch (e) {
      status.textContent = e.message || String(e);
      go.disabled = false;
    }
  };
  go.onclick = submit;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}
function closeLoginModal() {
  document.getElementById("login-modal")?.remove();
}

async function logout() {
  const { clearSession } = await oauth();
  await clearSession();
  session = null;
  sessionProfile = null;
  unreadCount = null;
  const home = `${MOUNT}/`;
  if (location.pathname + location.search !== home) history.replaceState({}, "", home);
  render();
  window.scrollTo(0, 0);
}

// ---------- API ----------

async function xrpc(method, params) {
  const url = new URL(`${APPVIEW}/xrpc/${method}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  url.searchParams.set("_", Date.now().toString(36) + Math.random().toString(36).slice(2));
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) {
    const err = new Error(`${method} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ---------- likes, reposts, replies, posts, blocks (real writes to your own repo) ----------

const likedPosts = new Map(); // post uri -> like record uri, for posts liked/unliked this session
const repostedPosts = new Map();

async function toggleLike(iconEl) {
  if (!session) {
    openLoginModal();
    return;
  }
  const wrap = iconEl.closest(".act.like");
  const countEl = wrap.querySelector(".like-count");
  const uri = iconEl.getAttribute("data-uri");
  const cid = iconEl.getAttribute("data-cid");
  const wasLiked = wrap.classList.contains("liked");
  const base = Number(countEl.getAttribute("data-count") || 0);

  wrap.classList.toggle("liked");
  const newCount = wasLiked ? Math.max(0, base - 1) : base + 1;
  countEl.setAttribute("data-count", newCount);
  countEl.textContent = fmtCount(newCount);

  try {
    const { dpopFetch } = await oauth();
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
      const data = await res.json();
      likedPosts.set(uri, data.uri);
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
    wrap.classList.toggle("liked");
    countEl.setAttribute("data-count", base);
    countEl.textContent = fmtCount(base);
    showToast(e.message || "Couldn't update like", "err");
  }
}

async function toggleRepost(iconEl) {
  if (!session) {
    openLoginModal();
    return;
  }
  const wrap = iconEl.closest(".act.repost");
  const countEl = wrap.querySelector(".repost-count");
  const uri = iconEl.getAttribute("data-uri");
  const cid = iconEl.getAttribute("data-cid");
  const wasReposted = wrap.classList.contains("reposted");
  const base = Number(countEl.getAttribute("data-count") || 0);

  wrap.classList.toggle("reposted");
  const newCount = wasReposted ? Math.max(0, base - 1) : base + 1;
  countEl.setAttribute("data-count", newCount);
  countEl.textContent = fmtCount(newCount);

  try {
    const { dpopFetch } = await oauth();
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
      const data = await res.json();
      repostedPosts.set(uri, data.uri);
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
    wrap.classList.toggle("reposted");
    countEl.setAttribute("data-count", base);
    countEl.textContent = fmtCount(base);
    showToast(e.message || "Couldn't update repost", "err");
  }
}

async function toggleBlock(btn) {
  if (!session) {
    openLoginModal();
    return;
  }
  const did = btn.getAttribute("data-did");
  if (did === session.did) return;
  const wasBlocking = btn.classList.contains("blocking");
  if (!wasBlocking && !confirm("Block this account? They won't be able to find your posts, reply to you, or mention you — and you won't see theirs.")) {
    return;
  }
  const prevLabel = btn.textContent;
  const prevUri = btn.getAttribute("data-block-uri") || "";

  btn.classList.toggle("blocking");
  btn.textContent = wasBlocking ? "Block" : "Blocked";

  try {
    const { dpopFetch } = await oauth();
    const pds = session.pdsUrl.replace(/\/$/, "");
    if (!wasBlocking) {
      const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo: session.did,
          collection: "app.bsky.graph.block",
          record: { $type: "app.bsky.graph.block", subject: did, createdAt: new Date().toISOString() },
        }),
      });
      if (!res.ok) throw new Error(`block failed (${res.status})`);
      const data = await res.json();
      btn.setAttribute("data-block-uri", data.uri);
      showToast("Blocked", "ok");
    } else {
      if (prevUri) {
        const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.deleteRecord`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo: session.did, collection: "app.bsky.graph.block", rkey: rkeyOf(prevUri) }),
        });
        if (!res.ok) throw new Error(`unblock failed (${res.status})`);
      }
      btn.setAttribute("data-block-uri", "");
      showToast("Unblocked", "ok");
    }
  } catch (e) {
    btn.classList.toggle("blocking");
    btn.textContent = prevLabel;
    showToast(e.message || "Couldn't update block", "err");
  }
}

function openReplyModal(trigger) {
  if (!session) {
    openLoginModal();
    return;
  }
  if (document.getElementById("reply-modal")) return;
  const parent = { uri: trigger.getAttribute("data-uri"), cid: trigger.getAttribute("data-cid") };
  const root = {
    uri: trigger.getAttribute("data-root-uri") || parent.uri,
    cid: trigger.getAttribute("data-root-cid") || parent.cid,
  };
  const toHandle = trigger.getAttribute("data-author") || "";
  const countEl = trigger.querySelector(".reply-count");

  const box = document.createElement("div");
  box.id = "reply-modal";
  box.className = "modal-overlay";
  box.innerHTML = `
    <div class="modal">
      <h2>Reply${toHandle ? ` to @${esc(toHandle)}` : ""}</h2>
      <p>A real app.bsky.feed.post, written straight to your own repo.</p>
      <textarea id="reply-text" maxlength="300" placeholder="Say something…" autocomplete="off"></textarea>
      <div class="reply-count-hint" id="reply-chars">300</div>
      <div class="modal-actions">
        <button type="button" id="reply-cancel" class="xp-btn-3d">Cancel</button>
        <button type="button" id="reply-go" class="xp-btn-3d primary">Reply</button>
      </div>
      <div class="modal-status" id="reply-status"></div>
    </div>`;
  document.body.appendChild(box);
  const input = document.getElementById("reply-text");
  const chars = document.getElementById("reply-chars");
  input.focus();
  input.addEventListener("input", () => {
    chars.textContent = String(300 - input.value.length);
  });
  box.addEventListener("click", (e) => {
    if (e.target === box) closeReplyModal();
  });
  document.getElementById("reply-cancel").onclick = closeReplyModal;
  const go = document.getElementById("reply-go");
  const status = document.getElementById("reply-status");
  const submit = async () => {
    const text = input.value.trim();
    if (!text) return;
    go.disabled = true;
    status.textContent = "Posting…";
    try {
      const { dpopFetch } = await oauth();
      const pds = session.pdsUrl.replace(/\/$/, "");
      const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo: session.did,
          collection: "app.bsky.feed.post",
          record: { $type: "app.bsky.feed.post", text, reply: { root, parent }, createdAt: new Date().toISOString() },
        }),
      });
      if (!res.ok) throw new Error(`reply failed (${res.status})`);
      closeReplyModal();
      if (countEl) {
        const n = Number(countEl.getAttribute("data-count") || 0) + 1;
        countEl.setAttribute("data-count", n);
        countEl.textContent = fmtCount(n);
      }
      showToast("Reply posted", "ok");
    } catch (e) {
      status.textContent = e.message || String(e);
      go.disabled = false;
    }
  };
  go.onclick = submit;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  });
}
function closeReplyModal() {
  document.getElementById("reply-modal")?.remove();
}

function openComposeModal() {
  if (!session) {
    openLoginModal();
    return;
  }
  if (document.getElementById("compose-modal")) return;
  const box = document.createElement("div");
  box.id = "compose-modal";
  box.className = "modal-overlay";
  box.innerHTML = `
    <div class="modal">
      <h2>New Post</h2>
      <p>A real app.bsky.feed.post, written straight to your own repo.</p>
      <textarea id="compose-text" maxlength="300" placeholder="What's happening?" autocomplete="off"></textarea>
      <div class="reply-count-hint" id="compose-chars">300</div>
      <div class="modal-actions">
        <button type="button" id="compose-cancel" class="xp-btn-3d">Cancel</button>
        <button type="button" id="compose-go" class="xp-btn-3d primary">Post</button>
      </div>
      <div class="modal-status" id="compose-status"></div>
    </div>`;
  document.body.appendChild(box);
  const input = document.getElementById("compose-text");
  const chars = document.getElementById("compose-chars");
  input.focus();
  input.addEventListener("input", () => {
    chars.textContent = String(300 - input.value.length);
  });
  box.addEventListener("click", (e) => {
    if (e.target === box) closeComposeModal();
  });
  document.getElementById("compose-cancel").onclick = closeComposeModal;
  const go = document.getElementById("compose-go");
  const status = document.getElementById("compose-status");
  const submit = async () => {
    const text = input.value.trim();
    if (!text) return;
    go.disabled = true;
    status.textContent = "Posting…";
    try {
      const { dpopFetch } = await oauth();
      const pds = session.pdsUrl.replace(/\/$/, "");
      const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo: session.did,
          collection: "app.bsky.feed.post",
          record: { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString() },
        }),
      });
      if (!res.ok) throw new Error(`post failed (${res.status})`);
      closeComposeModal();
      showToast("Posted", "ok");
    } catch (e) {
      status.textContent = e.message || String(e);
      go.disabled = false;
    }
  };
  go.onclick = submit;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  });
}
function closeComposeModal() {
  document.getElementById("compose-modal")?.remove();
}

function openCloseJokeModal() {
  if (document.getElementById("close-modal")) return;
  const box = document.createElement("div");
  box.id = "close-modal";
  box.className = "modal-overlay";
  box.innerHTML = `
    <div class="modal">
      <h2>Bluesky Social</h2>
      <p>You can't close the sky.</p>
      <div class="modal-actions">
        <button type="button" id="close-joke-ok" class="xp-btn-3d primary">OK</button>
      </div>
    </div>`;
  document.body.appendChild(box);
  box.addEventListener("click", (e) => {
    if (e.target === box) box.remove();
  });
  document.getElementById("close-joke-ok").onclick = () => box.remove();
}

// ---------- saved posts (local bookmarks — not written to your repo) ----------
//
// Bluesky's lexicon has no "save"/bookmark collection, so this is a purely
// client-side feature: the full PostView is stashed in localStorage (this
// browser only) when you tap 💾, and the Saved Posts page just re-renders
// those cached views. Nothing here ever touches your repo.

function getSavedPosts() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
  } catch {
    return [];
  }
}
function setSavedPosts(arr) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(arr.slice(0, 300)));
  } catch {}
}
function isSaved(uri) {
  return getSavedPosts().some((p) => p.uri === uri);
}
function toggleSave(iconEl) {
  const wrap = iconEl.closest(".act.save");
  const uri = iconEl.getAttribute("data-uri");
  const saved = getSavedPosts();
  const idx = saved.findIndex((p) => p.uri === uri);
  if (idx >= 0) {
    saved.splice(idx, 1);
    wrap.classList.remove("saved");
    showToast("Removed from Saved Posts", "ok");
  } else {
    try {
      const post = JSON.parse(decodeURIComponent(iconEl.getAttribute("data-post") || ""));
      saved.unshift(post);
      wrap.classList.add("saved");
      showToast("Saved", "ok");
    } catch {
      showToast("Couldn't save this post", "err");
      return;
    }
  }
  setSavedPosts(saved);
}

// ---------- small helpers ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function rkeyOf(uri) {
  return (uri || "").split("/").pop();
}
function profileUrl(handle) {
  return `${MOUNT}/profile/${encodeURIComponent(handle)}`;
}
function postUrl(handle, uri) {
  return `${profileUrl(handle)}/post/${encodeURIComponent(rkeyOf(uri))}`;
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
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
function isSensitive(post) {
  const vals = (post.labels || []).map((l) => l.val);
  return vals.some((v) => ["porn", "sexual", "nudity", "graphic-media"].includes(v));
}
function shareIntent(text, url) {
  return "https://bsky.app/intent/compose?text=" + encodeURIComponent(`${text}\n\n${url}`);
}

function likeActionHtml(post, url) {
  const liked = likedPosts.has(post.uri);
  return `<span class="act like${liked ? " liked" : ""}">
    <span class="like-icon" data-action="like" data-uri="${esc(post.uri)}" data-cid="${esc(post.cid || "")}" title="${liked ? "Unlike" : "Like"}">${liked ? "❤️" : "🤍"}</span>
    <span class="like-count" data-href="${url}/liked-by" data-count="${post.likeCount || 0}">${fmtCount(post.likeCount)}</span>
  </span>`;
}
function repostActionHtml(post, url) {
  const reposted = repostedPosts.has(post.uri);
  const count = (post.repostCount || 0) + (post.quoteCount || 0);
  return `<span class="act repost${reposted ? " reposted" : ""}">
    <span class="repost-icon" data-action="repost" data-uri="${esc(post.uri)}" data-cid="${esc(post.cid || "")}" title="${reposted ? "Undo repost" : "Repost"}">🔁</span>
    <span class="repost-count" data-href="${url}/reposted-by" data-count="${count}">${fmtCount(count)}</span>
  </span>`;
}
function replyActionHtml(post) {
  const reply = post.record?.reply;
  const rootUri = reply?.root?.uri || post.uri;
  const rootCid = reply?.root?.cid || post.cid || "";
  return `<span class="act reply" data-action="reply" data-uri="${esc(post.uri)}" data-cid="${esc(post.cid || "")}" data-root-uri="${esc(rootUri)}" data-root-cid="${esc(rootCid)}" data-author="${esc(post.author?.handle || "")}" title="Reply">
    💬 <span class="reply-count" data-count="${post.replyCount || 0}">${fmtCount(post.replyCount)}</span>
  </span>`;
}
function saveActionHtml(post) {
  const saved = isSaved(post.uri);
  return `<span class="act save${saved ? " saved" : ""}">
    <span class="save-icon" data-action="save" data-uri="${esc(post.uri)}" data-post="${encodeURIComponent(JSON.stringify(post))}" title="${saved ? "Remove from Saved Posts" : "Save this post"}">💾</span>
  </span>`;
}
function shareActionHtml(shareText, shareUrl) {
  return `<a class="act share" href="${shareIntent(shareText, shareUrl)}" target="_blank" rel="noopener" title="Share">📤</a>`;
}

// ---------- rich text ----------

function richText(text, facets) {
  text = text || "";
  if (!facets || !facets.length) return esc(text).replace(/\n/g, "<br>");
  const bytes = new TextEncoder().encode(text);
  const dec = new TextDecoder();
  const sorted = [...facets]
    .filter((f) => f.index && f.index.byteEnd > f.index.byteStart)
    .sort((a, b) => a.index.byteStart - b.index.byteStart);
  let out = "";
  let cursor = 0;
  for (const f of sorted) {
    const { byteStart, byteEnd } = f.index;
    if (byteStart < cursor || byteEnd > bytes.length) continue;
    out += esc(dec.decode(bytes.slice(cursor, byteStart)));
    const segment = dec.decode(bytes.slice(byteStart, byteEnd));
    const feat = (f.features || [])[0] || {};
    if (feat.$type === "app.bsky.richtext.facet#link") {
      out += `<a href="${esc(feat.uri)}" target="_blank" rel="noopener noreferrer nofollow" class="rt-link">${esc(segment)}</a>`;
    } else if (feat.$type === "app.bsky.richtext.facet#mention" && segment.startsWith("@")) {
      out += `<a href="${profileUrl(segment.slice(1))}" data-link class="rt-mention">${esc(segment)}</a>`;
    } else if (feat.$type === "app.bsky.richtext.facet#tag") {
      out += `<a href="${MOUNT}/search?q=${encodeURIComponent("#" + feat.tag)}" data-link class="rt-tag">${esc(segment)}</a>`;
    } else {
      out += esc(segment);
    }
    cursor = byteEnd;
  }
  out += esc(dec.decode(bytes.slice(cursor)));
  return out.replace(/\n/g, "<br>");
}

// ---------- embeds ----------

function imagesEmbed(images, sensitive) {
  const n = Math.min(images.length, 4);
  const cover = sensitive ? "sensitive-cover" : "";
  return `<div class="embed"><div class="imgs n${n}">${images
    .slice(0, 4)
    .map((img) => `<div class="${cover}"><img src="${esc(img.thumb)}" alt="${esc(img.alt || "")}" loading="lazy"></div>`)
    .join("")}</div></div>`;
}
function externalEmbed(ext) {
  let domain = "";
  try {
    domain = new URL(ext.uri).hostname.replace(/^www\./, "");
  } catch {}
  return `<div class="embed"><a class="ext-card" href="${esc(ext.uri)}" target="_blank" rel="noopener noreferrer">
    ${ext.thumb ? `<img src="${esc(ext.thumb)}" alt="" loading="lazy">` : ""}
    <div class="ext-body">
      <div class="ext-domain">${esc(domain)}</div>
      <div class="ext-title">${esc(ext.title || ext.uri)}</div>
      ${ext.description ? `<div class="ext-desc">${esc(ext.description)}</div>` : ""}
    </div>
  </a></div>`;
}
let videoSeq = 0;
function videoEmbed(v) {
  const id = "vid-" + ++videoSeq;
  return `<div class="embed"><div class="video-embed" id="${id}" data-playlist="${esc(v.playlist || "")}" data-action="play-video">
    ${v.thumbnail ? `<img src="${esc(v.thumbnail)}" alt="">` : ""}
    <div class="play">▶</div>
  </div></div>`;
}
function playVideo(box) {
  const src = box.getAttribute("data-playlist");
  if (!src) return;
  box.removeAttribute("data-action");
  const video = document.createElement("video");
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  box.innerHTML = "";
  box.appendChild(video);
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = src;
    return;
  }
  if (window.Hls && window.Hls.isSupported()) {
    attachHls(video, src);
    return;
  }
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";
  s.onload = () => attachHls(video, src);
  s.onerror = () => {
    box.innerHTML = `<div class="err-box">Couldn't load video player</div>`;
  };
  document.head.appendChild(s);
}
function attachHls(video, src) {
  if (window.Hls && window.Hls.isSupported()) {
    const hls = new window.Hls();
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
  } else {
    video.src = src;
  }
}
function quoteRecordEmbed(rec) {
  if (!rec) return "";
  const t = rec.$type;
  if (t === "app.bsky.embed.record#viewNotFound") {
    return `<div class="embed"><div class="quote"><div class="quote-missing">Deleted post</div></div></div>`;
  }
  if (t === "app.bsky.embed.record#viewBlocked") {
    return `<div class="embed"><div class="quote"><div class="quote-missing">Blocked post</div></div></div>`;
  }
  if (t === "app.bsky.embed.record#viewRecord") {
    const author = rec.author;
    const text = rec.value?.text || "";
    return `<div class="embed"><div class="quote" data-href="${postUrl(author.handle, rec.uri)}">
      <div class="quote-head">
        <img src="${esc(author.avatar || FALLBACK_AVATAR)}" alt="">
        <b>${esc(author.displayName || author.handle)}</b>
        <span class="post-handle">@${esc(author.handle)}</span>
      </div>
      ${text ? `<div class="quote-text">${richText(text, rec.value?.facets)}</div>` : ""}
    </div></div>`;
  }
  if (t === "app.bsky.feed.defs#generatorView") {
    return `<div class="embed"><div class="quote" data-href="${profileUrl(rec.creator.handle)}/feed/${rkeyOf(rec.uri)}">
      <div class="quote-head"><img src="${esc(rec.avatar || FALLBACK_AVATAR)}" alt=""><b>📋 ${esc(rec.displayName)}</b></div>
      <div class="quote-text">${esc(rec.description || "")}</div>
    </div></div>`;
  }
  return `<div class="embed"><div class="quote"><div class="quote-missing">Embedded content</div></div></div>`;
}
function renderEmbed(embed, sensitive) {
  if (!embed) return "";
  switch (embed.$type) {
    case "app.bsky.embed.images#view":
      return imagesEmbed(embed.images, sensitive);
    case "app.bsky.embed.external#view":
      return externalEmbed(embed.external);
    case "app.bsky.embed.video#view":
      return videoEmbed(embed);
    case "app.bsky.embed.record#view":
      return quoteRecordEmbed(embed.record);
    case "app.bsky.embed.recordWithMedia#view": {
      const media = embed.media;
      let mediaHtml = "";
      if (media?.$type === "app.bsky.embed.images#view") mediaHtml = imagesEmbed(media.images, sensitive);
      else if (media?.$type === "app.bsky.embed.external#view") mediaHtml = externalEmbed(media.external);
      else if (media?.$type === "app.bsky.embed.video#view") mediaHtml = videoEmbed(media);
      return mediaHtml + quoteRecordEmbed(embed.record.record || embed.record);
    }
    default:
      return "";
  }
}

// ---------- post card ----------

function verifyBadge(author) {
  return author.verification?.verifiedStatus === "valid" ? ` <span class="verify-badge" title="Verified">✔</span>` : "";
}

function postCard(post, opts) {
  opts = opts || {};
  const author = post.author;
  const record = post.record || {};
  const url = postUrl(author.handle, post.uri);
  const shareUrl = `${SITE_URL}profile/${encodeURIComponent(author.handle)}/post/${rkeyOf(post.uri)}`;
  const shareText = `Post by @${author.handle} on Bluesky: "${(record.text || "").slice(0, 120)}"`;
  return `<article class="post" data-href="${url}">
    <a class="post-avatar" href="${profileUrl(author.handle)}" data-link>
      <img src="${esc(author.avatar || FALLBACK_AVATAR)}" alt="">
    </a>
    <div class="post-body">
      <div class="post-head">
        <a class="post-name" href="${profileUrl(author.handle)}" data-link>${esc(author.displayName || author.handle)}</a>${verifyBadge(author)}
        <a class="post-handle" href="${profileUrl(author.handle)}" data-link>@${esc(author.handle)}</a>
        <span class="post-dot">·</span>
        <span class="post-time">${relTime(record.createdAt || post.indexedAt)}</span>
      </div>
      <div class="post-text">${richText(record.text, record.facets)}</div>
      ${renderEmbed(post.embed, isSensitive(post))}
      <div class="post-actions">
        ${replyActionHtml(post)}
        ${repostActionHtml(post, url)}
        ${likeActionHtml(post, url)}
        ${saveActionHtml(post)}
        ${shareActionHtml(shareText, shareUrl)}
      </div>
    </div>
  </article>`;
}

function isRealPostView(p) {
  return !!(p && p.author && p.$type !== "app.bsky.feed.defs#notFoundPost" && p.$type !== "app.bsky.feed.defs#blockedPost");
}
function replyFallbackHtml(replyRef) {
  const parent = replyRef?.parent;
  if (!parent) return "";
  if (parent.$type === "app.bsky.feed.defs#blockedPost") return `<div class="reply-context">Replying to a blocked post</div>`;
  return `<div class="reply-context">Replying to a post that's unavailable</div>`;
}
function threadedPostHtml(post, replyRef, opts) {
  const parent = replyRef?.parent;
  if (isRealPostView(parent)) {
    return `<div class="thread-group"><div class="thread-parent feed-thread-parent">${postCard(parent)}</div>${postCard(post, opts)}</div>`;
  }
  return replyFallbackHtml(replyRef) + postCard(post, opts);
}
function feedItemHtml(item) {
  const reason = item.reason;
  let reasonLine = "";
  if (reason?.$type === "app.bsky.feed.defs#reasonRepost") {
    reasonLine = `<div class="reply-context">🔁 <a href="${profileUrl(reason.by.handle)}" data-link>${esc(reason.by.displayName || reason.by.handle)}</a> reposted</div>`;
  }
  const body = threadedPostHtml(item.post, item.reply);
  return reasonLine ? reasonLine + body.replace('class="post"', 'class="post" style="padding-top:0"') : body;
}

// ---------- generic UI bits ----------

function skeleton(n) {
  return Array.from({ length: n || 5 })
    .map(
      () =>
        `<div class="post"><div class="skel" style="width:42px;height:42px;border-radius:4px"></div>
      <div class="post-body"><div class="skel" style="width:40%;height:14px;margin-bottom:8px"></div>
      <div class="skel" style="width:90%;height:14px;margin-bottom:6px"></div>
      <div class="skel" style="width:60%;height:14px"></div></div></div>`
    )
    .join("");
}
function errorBox(msg, retryHref) {
  return `<div class="err-box">${esc(msg)}${retryHref ? ` — <a href="${retryHref}" data-link style="text-decoration:underline">try again</a>` : ""}</div>`;
}
function loadMoreBtn(label) {
  return `<div class="load-more" data-action="more">${esc(label || "Show more")}</div>`;
}
function centerMsg(title, body) {
  return `<div class="center-msg"><h2>${esc(title)}</h2><p>${body || ""}</p></div>`;
}
function headerHtml(title, sub, back) {
  return `<div class="main-header"><div class="back-row">
    ${back ? `<span class="back-btn" data-action="back">◀</span>` : ""}
    <div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>
  </div></div>`;
}

// ---------- Launcher (the "/" home screen) ----------

const LAUNCHER = {
  explore: [
    { icon: "💿", label: "Home Feed", href: "/timeline" },
    { icon: "🧑‍🔬", label: "Search Bluesky", href: "/search" },
  ],
  timeline: {
    title: "Your Timeline",
    items: [
      { icon: "🕴️", label: "Following Feed", href: "/timeline" },
      { icon: "🦞", label: "Discover Posts", href: "/discover" },
      { icon: "🐄", label: "Custom Feeds", href: "/feeds" },
    ],
  },
  connect: {
    title: "Post & Connect",
    items: [
      { icon: "🐙", label: "New Post", action: "compose" },
      { icon: "👩‍💼", label: "Reply", action: "goto-reply" },
      { icon: "🦥", label: "Repost", action: "goto-repost" },
      { icon: "🍅", label: "Save Post", href: "/saved" },
      { icon: "🐟", label: "Share Post", action: "goto-share" },
    ],
  },
  discover: {
    title: "Discover",
    items: [
      { icon: "🕺", label: "Trending Topics", href: "/trending" },
      { icon: "🧑‍💼", label: "Popular Posts", href: "/popular" },
    ],
  },
  notifications: [
    { icon: "👩‍💻", label: "All", href: "/notifications" },
    { icon: "🚗", label: "Mentions", href: "/notifications?tab=mentions" },
  ],
};

function iconTile(item) {
  const attr = item.href ? `data-href="${MOUNT}${item.href}"` : `data-action="${item.action}"`;
  return `<div class="icon-tile" ${attr}>
    <div class="glyph">${item.icon}</div>
    <div class="caption">${esc(item.label)}</div>
  </div>`;
}

function HomeLauncherView(main) {
  main.innerHTML = `
    <div class="xp-launcher">
      <div class="col col-explore">
        <div class="section-title c-explore">• Explore</div>
        <div class="icon-rail">${LAUNCHER.explore.map(iconTile).join("")}</div>
      </div>
      <div class="col col-main">
        <div class="launcher-section">
          <div class="section-title c-timeline">• ${esc(LAUNCHER.timeline.title)}</div>
          <div class="icon-grid">${LAUNCHER.timeline.items.map(iconTile).join("")}</div>
        </div>
        <hr class="section-rule">
        <div class="launcher-section">
          <div class="section-title c-connect">• ${esc(LAUNCHER.connect.title)}</div>
          <div class="icon-grid">${LAUNCHER.connect.items.map(iconTile).join("")}</div>
        </div>
        <hr class="section-rule">
        <div class="launcher-section">
          <div class="section-title c-discover">• ${esc(LAUNCHER.discover.title)}</div>
          <div class="icon-grid">${LAUNCHER.discover.items.map(iconTile).join("")}</div>
        </div>
      </div>
      <div class="col col-notif">
        <div class="section-title c-notif">• Notifications<span class="nav-badge" data-badge-for="notifications"></span></div>
        <div class="icon-rail">${LAUNCHER.notifications.map(iconTile).join("")}</div>
      </div>
    </div>`;
}

// ---------- shell (window chrome / toolbar) ----------

function navAuthHtml() {
  if (session) {
    const avatar = sessionProfile?.avatar || FALLBACK_AVATAR;
    return `
      <div class="xp-tool-btn xp-auth" data-href="${profileUrl(session.handle)}" title="@${esc(session.handle)}">
        <img class="xp-avatar" src="${esc(avatar)}" alt=""><span>@${esc(session.handle)}</span>
      </div>
      <div class="xp-tool-btn" data-action="logout">Log out</div>`;
  }
  return `<div class="xp-tool-btn xp-login" data-action="login">Log in with Bluesky</div>`;
}

function shellHtml(path) {
  return `
  <div class="xp-desktop">
    <div class="xp-window">
      <div class="xp-titlebar">
        <span class="xp-title"><span class="xp-app-icon">🦋</span> Bluesky Social</span>
        <span class="xp-winbtns">
          <span class="xp-winbtn" data-action="win-min" title="Minimize">_</span>
          <span class="xp-winbtn" data-action="win-max" title="Maximize">▢</span>
          <span class="xp-winbtn xp-winbtn-close" data-action="win-close" title="Close">✕</span>
        </span>
      </div>
      <div class="xp-toolbar">
        <div class="xp-tool-btn ${path === "/" ? "active" : ""}" data-href="${MOUNT}/">🏠 Launcher</div>
        <div class="xp-tool-btn" data-href="${MOUNT}/search">🔎 Search</div>
        <div class="xp-tool-btn" data-href="${MOUNT}/notifications">🔔 Notifications<span class="nav-badge" data-badge-for="notifications"></span></div>
        <div class="xp-tool-btn" data-action="compose">🖊 New Post</div>
        <div class="xp-toolbar-spacer"></div>
        ${navAuthHtml()}
      </div>
      <div class="xp-body" id="main"></div>
      <div class="xp-statusbar">Bluesky Social — not affiliated with Bluesky PBC · <a href="${MOUNT}/about" data-link>About</a> · part of <a href="https://bisks.net" target="_blank" rel="noopener">atprotozoa</a></div>
    </div>
  </div>`;
}

function updateNavBadge(count) {
  document.querySelectorAll('[data-badge-for="notifications"]').forEach((el) => {
    el.textContent = count > 0 ? (count > 99 ? "99+" : String(count)) : "";
    el.classList.toggle("show", count > 0);
  });
}

// ---------- views ----------

async function TimelineView(main) {
  main.innerHTML = headerHtml("Following Feed") + `<div id="feed-posts">${skeleton(6)}</div>`;
  await loadTimeline(document.getElementById("feed-posts"));
}
async function loadTimeline(box, cursor) {
  if (!session) {
    box.innerHTML = centerMsg(
      "Not signed in",
      `Log in with Bluesky (top toolbar) to see your real Following Feed. In the meantime, try <a class="rt-link" data-link href="${MOUNT}/discover">Discover Posts</a>.`
    );
    return;
  }
  try {
    const { dpopFetch } = await oauth();
    const url = new URL(`${session.pdsUrl.replace(/\/$/, "")}/xrpc/app.bsky.feed.getTimeline`);
    url.searchParams.set("limit", "25");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await dpopFetch(session, url.toString(), {
      headers: { accept: "application/json", "atproto-proxy": "did:web:api.bsky.app#bsky_appview" },
    });
    if (!res.ok) throw new Error(`getTimeline failed (${res.status})`);
    const data = await res.json();
    if (!cursor) box.innerHTML = "";
    else box.querySelector(".load-more")?.remove();
    box.insertAdjacentHTML(
      "beforeend",
      data.feed.map(feedItemHtml).join("") || centerMsg("Nothing here yet", "Follow some people on Bluesky and they'll show up here.")
    );
    if (data.cursor && data.feed.length) {
      box.insertAdjacentHTML("beforeend", loadMoreBtn());
      box.querySelector(".load-more").onclick = (e) => {
        e.target.textContent = "Loading…";
        loadTimeline(box, data.cursor);
      };
    }
  } catch (e) {
    box.innerHTML = errorBox("Couldn't load your timeline (" + e.message + ")", location.pathname + location.search);
  }
}

async function DiscoverView(main) {
  main.innerHTML = headerHtml("Discover Posts", "Bluesky's public algorithmic feed") + `<div id="feed-posts">${skeleton(6)}</div>`;
  await loadFeed(DISCOVER_FEED, document.getElementById("feed-posts"));
}
async function loadFeed(feedUri, box, cursor) {
  try {
    const data = await xrpc("app.bsky.feed.getFeed", { feed: feedUri, limit: 25, cursor });
    if (!cursor) box.innerHTML = "";
    else box.querySelector(".load-more")?.remove();
    box.insertAdjacentHTML("beforeend", data.feed.map(feedItemHtml).join("") || centerMsg("Nothing here yet"));
    if (data.cursor && data.feed.length) {
      box.insertAdjacentHTML("beforeend", loadMoreBtn());
      box.querySelector(".load-more").onclick = (e) => {
        e.target.textContent = "Loading…";
        loadFeed(feedUri, box, data.cursor);
      };
    }
  } catch (e) {
    box.innerHTML = errorBox("Couldn't load this feed (" + e.message + ")", location.pathname + location.search);
  }
}

async function CustomFeedsView(main) {
  main.innerHTML = headerHtml("Custom Feeds", "Popular custom feeds, live from Bluesky") + skeleton(6);
  try {
    const data = await xrpc("app.bsky.unspecced.getPopularFeedGenerators", { limit: 40 });
    main.innerHTML =
      headerHtml("Custom Feeds", "Popular custom feeds, live from Bluesky") +
      data.feeds
        .map(
          (f) => `<div class="card-row" data-href="${profileUrl(f.creator.handle)}/feed/${rkeyOf(f.uri)}">
        <img src="${esc(f.avatar || FALLBACK_AVATAR)}" alt="">
        <div class="cr-body">
          <div class="cr-title">${esc(f.displayName)}</div>
          <div class="cr-sub">by @${esc(f.creator.handle)} · ${fmtCount(f.likeCount)} likes</div>
          <div class="cr-desc">${esc(f.description || "")}</div>
        </div>
      </div>`
        )
        .join("");
  } catch (e) {
    main.innerHTML = headerHtml("Custom Feeds") + errorBox("Couldn't load feeds (" + e.message + ")");
  }
}

async function CustomFeedView(main, params, args) {
  const { handle, rkey } = args;
  main.innerHTML = headerHtml("Feed", "", true) + skeleton(6);
  try {
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: handle });
    const uri = `at://${profile.did}/app.bsky.feed.generator/${rkey}`;
    const gen = await xrpc("app.bsky.feed.getFeedGenerator", { feed: uri });
    const info = gen.view;
    main.innerHTML =
      headerHtml(info.displayName, `by @${info.creator.handle}`, true) +
      `<div style="padding:12px 16px;border-bottom:1px solid var(--border)">
        <img src="${esc(info.avatar || FALLBACK_AVATAR)}" style="width:56px;height:56px" alt="">
        <p style="color:var(--text-dim);font-size:14px;margin-top:8px">${esc(info.description || "")}</p>
        <p style="color:var(--text-dimmer);font-size:13px">${fmtCount(info.likeCount)} likes</p>
      </div>
      <div id="feed-posts">${skeleton(6)}</div>`;
    await loadFeed(uri, document.getElementById("feed-posts"));
  } catch (e) {
    main.innerHTML = headerHtml("Feed", "", true) + errorBox("Couldn't load this feed (" + e.message + ")");
  }
}

async function TrendingView(main) {
  main.innerHTML = headerHtml("Trending Topics", "What people are talking about right now") + skeleton(8);
  try {
    const data = await xrpc("app.bsky.unspecced.getTrendingTopics", { limit: 24 });
    const row = (t) => `<div class="card-row" data-href="${MOUNT}${t.link}">
      <div class="cr-body"><div class="cr-title">${esc(t.topic)}</div></div>
    </div>`;
    let out = "";
    if (data.topics?.length) out += `<div class="section-label">Trending topics</div>` + data.topics.map(row).join("");
    if (data.suggested?.length) out += `<div class="section-label">Suggested feeds</div>` + data.suggested.map(row).join("");
    main.innerHTML = headerHtml("Trending Topics", "What people are talking about right now") + (out || centerMsg("Nothing trending right now"));
  } catch (e) {
    main.innerHTML = headerHtml("Trending Topics") + errorBox("Couldn't load trending topics (" + e.message + ")");
  }
}

// Popular Posts: no single "top posts" AppView endpoint, so this pulls
// Bluesky's current trending topics and runs a top-sorted search on each,
// merging and re-sorting the results by like count. Falls back to the
// Discover algorithmic feed if trending topics can't be loaded.
async function PopularView(main) {
  main.innerHTML = headerHtml("Popular Posts", "The most-liked posts on today's trending topics") + skeleton(8);
  const box = () => document.getElementById("popular-posts");
  try {
    const trending = await xrpc("app.bsky.unspecced.getTrendingTopics", { limit: 6 });
    const topics = (trending.topics || []).slice(0, 6);
    if (!topics.length) throw new Error("no trending topics right now");
    const results = await Promise.all(
      topics.map((t) => xrpc("app.bsky.feed.searchPosts", { q: t.topic, sort: "top", limit: 8 }).catch(() => ({ posts: [] })))
    );
    let posts = results.flatMap((r) => r.posts || []);
    const seen = new Set();
    posts = posts.filter((p) => (seen.has(p.uri) ? false : (seen.add(p.uri), true)));
    posts.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
    posts = posts.slice(0, 25);
    main.innerHTML =
      headerHtml("Popular Posts", "The most-liked posts on today's trending topics") +
      `<div id="popular-posts">${posts.map((p) => postCard(p)).join("") || centerMsg("Nothing popular right now")}</div>`;
  } catch (e) {
    main.innerHTML = headerHtml("Popular Posts", "Trending topics unavailable — showing Discover instead") + `<div id="popular-posts">${skeleton(6)}</div>`;
    await loadFeed(DISCOVER_FEED, document.getElementById("popular-posts"));
  }
}

async function SavedView(main) {
  const saved = getSavedPosts();
  main.innerHTML =
    headerHtml("Saved Posts", "Saved on this device only — never written to your repo") +
    (saved.length ? saved.map((p) => postCard(p)).join("") : centerMsg("Nothing saved yet", "Tap 💾 on any post to keep it here."));
}

const NOTIF_META = {
  like: { icon: "❤️", verb: "liked your post" },
  repost: { icon: "🔁", verb: "reposted your post" },
  quote: { icon: "🔁", verb: "quoted your post" },
  follow: { icon: "👤", verb: "followed you" },
  mention: { icon: "💬", verb: "mentioned you" },
  reply: { icon: "💬", verb: "replied to you" },
};
function notifHref(n) {
  if (n.reason === "follow") return profileUrl(n.author.handle);
  if (n.reason === "like" || n.reason === "repost") {
    const rkey = rkeyOf(n.reasonSubject || "");
    return rkey ? `${profileUrl(session.handle)}/post/${encodeURIComponent(rkey)}` : profileUrl(n.author.handle);
  }
  return n.uri ? postUrl(n.author.handle, n.uri) : profileUrl(n.author.handle);
}
function notificationRow(n) {
  const meta = NOTIF_META[n.reason] || { icon: "🔔", verb: n.reason };
  const author = n.author;
  const text = n.record?.text;
  return `<div class="card-row notif${n.isRead ? "" : " unread"}" data-href="${notifHref(n)}">
    <a href="${profileUrl(author.handle)}" data-link><img src="${esc(author.avatar || FALLBACK_AVATAR)}" alt=""></a>
    <div class="cr-body">
      <div class="cr-title">${meta.icon} <a href="${profileUrl(author.handle)}" data-link>${esc(author.displayName || author.handle)}</a> ${esc(meta.verb)}</div>
      ${text ? `<div class="cr-desc">${esc(text.slice(0, 140))}</div>` : ""}
      <div class="cr-sub">${relTime(n.indexedAt)}</div>
    </div>
  </div>`;
}
async function NotificationsView(main, params) {
  const mentionsOnly = params.get("tab") === "mentions";
  if (!session) {
    main.innerHTML = headerHtml("Notifications") + centerMsg("Not signed in", "Log in with Bluesky (top toolbar) to see your real notifications.");
    return;
  }
  main.innerHTML =
    headerHtml("Notifications") +
    `<div class="feed-tabs">
      <div class="feed-tab ${!mentionsOnly ? "active" : ""}" data-href="${MOUNT}/notifications">All</div>
      <div class="feed-tab ${mentionsOnly ? "active" : ""}" data-href="${MOUNT}/notifications?tab=mentions">Mentions</div>
    </div>
    <div id="notif-list">${skeleton(6)}</div>`;
  await loadNotifications(document.getElementById("notif-list"), null, mentionsOnly);
  markNotificationsSeen();
}
async function loadNotifications(box, cursor, mentionsOnly) {
  try {
    const { dpopFetch } = await oauth();
    const pds = session.pdsUrl.replace(/\/$/, "");
    const url = new URL(`${pds}/xrpc/app.bsky.notification.listNotifications`);
    url.searchParams.set("limit", "30");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await dpopFetch(session, url.toString(), {
      headers: { accept: "application/json", "atproto-proxy": "did:web:api.bsky.app#bsky_appview" },
    });
    if (!res.ok) throw new Error(`listNotifications failed (${res.status})`);
    const data = await res.json();
    const list = mentionsOnly ? data.notifications.filter((n) => n.reason === "mention") : data.notifications;
    if (!cursor) box.innerHTML = "";
    else box.querySelector(".load-more")?.remove();
    box.insertAdjacentHTML(
      "beforeend",
      list.map(notificationRow).join("") ||
        (cursor ? "" : centerMsg("Nothing yet", mentionsOnly ? "No mentions yet." : "Likes, reposts, follows, and replies show up here."))
    );
    if (data.cursor && data.notifications.length) {
      box.insertAdjacentHTML("beforeend", loadMoreBtn());
      box.querySelector(".load-more").onclick = (e) => {
        e.target.textContent = "Loading…";
        loadNotifications(box, data.cursor, mentionsOnly);
      };
    }
  } catch (e) {
    box.innerHTML = errorBox("Couldn't load notifications (" + e.message + ")");
  }
}
async function markNotificationsSeen() {
  try {
    const { dpopFetch } = await oauth();
    const pds = session.pdsUrl.replace(/\/$/, "");
    await dpopFetch(session, `${pds}/xrpc/app.bsky.notification.updateSeen`, {
      method: "POST",
      headers: { "content-type": "application/json", "atproto-proxy": "did:web:api.bsky.app#bsky_appview" },
      body: JSON.stringify({ seenAt: new Date().toISOString() }),
    });
    unreadCount = 0;
    updateNavBadge(0);
  } catch {}
}
let unreadCount = null;
async function pollNotifications() {
  if (!session) {
    unreadCount = null;
    updateNavBadge(0);
    return;
  }
  try {
    const { dpopFetch } = await oauth();
    const pds = session.pdsUrl.replace(/\/$/, "");
    const res = await dpopFetch(session, `${pds}/xrpc/app.bsky.notification.getUnreadCount`, {
      headers: { accept: "application/json", "atproto-proxy": "did:web:api.bsky.app#bsky_appview" },
    });
    if (!res.ok) return;
    const data = await res.json();
    unreadCount = data.count || 0;
    updateNavBadge(unreadCount);
  } catch {}
}

const PROFILE_TABS = [
  { key: "posts", label: "Posts", filter: "posts_and_author_threads" },
  { key: "replies", label: "Replies", filter: "posts_with_replies" },
  { key: "media", label: "Media", filter: "posts_with_media" },
];
async function ProfileView(main, params, args) {
  const handle = args.handle;
  const activeTab = params.get("tab") || "posts";
  main.innerHTML = headerHtml(handle, "", true) + `<div class="skel" style="height:120px"></div>` + skeleton(4);
  let profile;
  try {
    profile = await xrpc("app.bsky.actor.getProfile", { actor: handle });
  } catch (e) {
    main.innerHTML = headerHtml(handle, "", true) + centerMsg("This account doesn't exist", "No account was found for @" + esc(handle) + " on Bluesky.");
    return;
  }
  const shareText = `${profile.displayName || profile.handle} (@${profile.handle}) on Bluesky`;
  const shareUrl = `${SITE_URL}profile/${encodeURIComponent(profile.handle)}`;
  const isSelf = session && session.did === profile.did;
  const blockUri = profile.viewer?.blocking || "";
  const blockBtnHtml = isSelf
    ? ""
    : `<span class="xp-btn-3d danger${blockUri ? " blocking" : ""}" data-action="block" data-did="${esc(profile.did)}" data-block-uri="${esc(blockUri)}">${blockUri ? "Blocked" : "Block"}</span>`;

  main.innerHTML =
    headerHtml(profile.displayName || `@${profile.handle}`, `${fmtCount(profile.postsCount)} posts`, true) +
    `<div class="profile-banner" style="${profile.banner ? `background-image:url('${esc(profile.banner)}')` : ""}"></div>
    <div class="profile-head">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <img class="profile-avatar" src="${esc(profile.avatar || FALLBACK_AVATAR)}" alt="">
        <div style="display:flex;gap:8px;margin-top:10px">
          <a class="xp-btn-3d" href="${shareIntent(shareText, shareUrl)}" target="_blank" rel="noopener">Share</a>
          <a class="xp-btn-3d" href="https://bsky.app/profile/${esc(profile.handle)}" target="_blank" rel="noopener">Open in Bluesky</a>
          ${blockBtnHtml}
        </div>
      </div>
      <div class="profile-name">${esc(profile.displayName || profile.handle)}${verifyBadge(profile)}</div>
      <div class="profile-handle">@${esc(profile.handle)}${profile.viewer?.followedBy ? ` <span class="profile-follow-badge">Follows you</span>` : ""}</div>
      ${profile.description ? `<div class="profile-bio">${richText(profile.description)}</div>` : ""}
      <div class="profile-stats">
        <a href="${profileUrl(profile.handle)}/follows" data-link><b>${fmtCount(profile.followsCount)}</b> Following</a>
        <a href="${profileUrl(profile.handle)}/followers" data-link><b>${fmtCount(profile.followersCount)}</b> Followers</a>
        <span><b>${fmtCount(profile.postsCount)}</b> Posts</span>
      </div>
    </div>
    <div class="tabs">${PROFILE_TABS.map((t) => `<div class="tab ${t.key === activeTab ? "active" : ""}" data-href="${profileUrl(profile.handle)}?tab=${t.key}">${t.label}</div>`).join("")}</div>
    <div id="feed-posts">${skeleton(5)}</div>`;

  const tab = PROFILE_TABS.find((t) => t.key === activeTab) || PROFILE_TABS[0];
  await loadAuthorFeed(profile.did, tab.filter, document.getElementById("feed-posts"));
}
async function loadAuthorFeed(actor, filter, box, cursor) {
  try {
    const data = await xrpc("app.bsky.feed.getAuthorFeed", { actor, filter, limit: 25, cursor });
    if (!cursor) box.innerHTML = "";
    else box.querySelector(".load-more")?.remove();
    box.insertAdjacentHTML(
      "beforeend",
      data.feed.map((it) => (filter === "posts_with_replies" ? threadedPostHtml(it.post, it.reply) : postCard(it.post))).join("") || centerMsg("Nothing here yet")
    );
    if (data.cursor && data.feed.length) {
      box.insertAdjacentHTML("beforeend", loadMoreBtn());
      box.querySelector(".load-more").onclick = (e) => {
        e.target.textContent = "Loading…";
        loadAuthorFeed(actor, filter, box, data.cursor);
      };
    }
  } catch (e) {
    box.innerHTML = errorBox("Couldn't load posts (" + e.message + ")");
  }
}

function actorRow(a) {
  return `<div class="card-row actor" data-href="${profileUrl(a.handle)}">
    <img src="${esc(a.avatar || FALLBACK_AVATAR)}" alt="">
    <div class="cr-body">
      <div class="cr-title">${esc(a.displayName || a.handle)}${verifyBadge(a)}</div>
      <div class="cr-sub">@${esc(a.handle)}</div>
      ${a.description ? `<div class="cr-desc">${esc((a.description || "").slice(0, 140))}</div>` : ""}
    </div>
  </div>`;
}
async function FollowsView(main, params, args) {
  await followListView(main, args.handle, "Following", "app.bsky.graph.getFollows", "follows");
}
async function FollowersView(main, params, args) {
  await followListView(main, args.handle, "Followers", "app.bsky.graph.getFollowers", "followers");
}
async function followListView(main, handle, title, method, field) {
  main.innerHTML = headerHtml(title, `@${handle}`, true) + skeleton(6);
  try {
    const data = await xrpc(method, { actor: handle, limit: 40 });
    main.innerHTML = headerHtml(title, `@${handle}`, true) + (data[field].map(actorRow).join("") || centerMsg("Nobody here yet"));
  } catch (e) {
    main.innerHTML = headerHtml(title, `@${handle}`, true) + errorBox("Couldn't load this list (" + e.message + ")");
  }
}
async function LikedByView(main, params, args) {
  await postActorListView(main, args.handle, args.rkey, "Liked by", "app.bsky.feed.getLikes", "likes", (l) => l.actor);
}
async function RepostedByView(main, params, args) {
  await postActorListView(main, args.handle, args.rkey, "Reposted by", "app.bsky.feed.getRepostedBy", "repostedBy", (a) => a);
}
async function postActorListView(main, handle, rkey, title, method, field, unwrap) {
  main.innerHTML = headerHtml(title, "", true) + skeleton(6);
  try {
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: handle });
    const uri = `at://${profile.did}/app.bsky.feed.post/${rkey}`;
    const data = await xrpc(method, { uri, limit: 40 });
    const actors = (data[field] || []).map(unwrap);
    main.innerHTML = headerHtml(title, "", true) + (actors.length ? actors.map(actorRow).join("") : centerMsg("Nobody yet"));
  } catch (e) {
    main.innerHTML = headerHtml(title, "", true) + errorBox("Couldn't load this list (" + e.message + ")");
  }
}

async function ThreadView(main, params, args) {
  const { handle, rkey } = args;
  main.innerHTML = headerHtml("Post", "", true) + skeleton(3);
  try {
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: handle });
    const uri = `at://${profile.did}/app.bsky.feed.post/${rkey}`;
    const data = await xrpc("app.bsky.feed.getPostThread", { uri, depth: 12, parentHeight: 10 });
    const thread = data.thread;
    if (thread.$type !== "app.bsky.feed.defs#threadViewPost") {
      main.innerHTML = headerHtml("Post", "", true) + centerMsg("Post unavailable", "It may have been deleted, or the author blocks viewers.");
      return;
    }
    let p = thread.parent;
    const chain = [];
    while (p && p.$type === "app.bsky.feed.defs#threadViewPost") {
      chain.unshift(p);
      p = p.parent;
    }
    const parents = chain.map((c) => `<div class="thread-parent">${postCard(c.post)}</div>`).join("");

    const focus = thread.post;
    const shareText = `${focus.author.displayName || focus.author.handle} (@${focus.author.handle}) on Bluesky: "${(focus.record.text || "").slice(0, 100)}"`;
    const shareUrl = `${SITE_URL}profile/${encodeURIComponent(focus.author.handle)}/post/${rkeyOf(focus.uri)}`;
    const focusHtml = `<div class="thread-focus">
      <div class="post-head-full">
        <a href="${profileUrl(focus.author.handle)}" data-link><img src="${esc(focus.author.avatar || FALLBACK_AVATAR)}" alt=""></a>
        <div>
          <div><b>${esc(focus.author.displayName || focus.author.handle)}</b>${verifyBadge(focus.author)}</div>
          <div class="post-handle">@${esc(focus.author.handle)}</div>
        </div>
      </div>
      <div class="post-text">${richText(focus.record.text, focus.record.facets)}</div>
      ${renderEmbed(focus.embed, isSensitive(focus))}
      <div class="thread-time">${new Date(focus.record.createdAt).toLocaleString()}</div>
      <div class="post-actions">
        ${replyActionHtml(focus)}
        ${repostActionHtml(focus, postUrl(focus.author.handle, focus.uri))}
        ${likeActionHtml(focus, postUrl(focus.author.handle, focus.uri))}
        ${saveActionHtml(focus)}
        ${shareActionHtml(shareText, shareUrl)}
      </div>
    </div>`;

    const replies = (thread.replies || []).filter((r) => r.$type === "app.bsky.feed.defs#threadViewPost");
    const repliesHtml = replies.length ? `<div class="section-label">Replies</div>` + replies.map((r) => renderReplyNode(r, 0)).join("") : "";

    main.innerHTML = headerHtml("Post", "", true) + parents + focusHtml + repliesHtml;
  } catch (e) {
    main.innerHTML = headerHtml("Post", "", true) + errorBox("Couldn't load this post (" + e.message + ")");
  }
}
function renderReplyNode(node, depth) {
  const card = postCard(node.post);
  const wrapped = depth > 0 && depth < 3 ? `<div class="reply-indent">${card}</div>` : card;
  const children = (node.replies || [])
    .filter((r) => r.$type === "app.bsky.feed.defs#threadViewPost")
    .slice(0, 10)
    .map((r) => renderReplyNode(r, depth + 1))
    .join("");
  return wrapped + children;
}

async function SearchView(main, params) {
  const q = params.get("q") || "";
  main.innerHTML =
    headerHtml("Search Bluesky") +
    `<div class="search-box"><div class="search-input-wrap">🔎<input id="search-input" placeholder="Search people and posts" value="${esc(q)}" autocomplete="off"></div></div>` +
    `<div id="search-results">${q ? skeleton(4) : centerMsg("Search Bluesky", "Find people and posts.")}</div>`;

  const input = document.getElementById("search-input");
  let t;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const val = input.value.trim();
      navigate(`${MOUNT}/search?q=${encodeURIComponent(val)}`, { replace: true, skipRender: true });
      runSearch(val);
    }, 350);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(t);
      runSearch(input.value.trim());
    }
  });
  if (q) await runSearch(q);

  async function runSearch(query) {
    const box = document.getElementById("search-results");
    if (!box) return;
    if (!query) {
      box.innerHTML = centerMsg("Search Bluesky", "Find people and posts.");
      return;
    }
    box.innerHTML = skeleton(4);
    try {
      const actors = await xrpc("app.bsky.actor.searchActors", { q: query, limit: 20 });
      let out = "";
      out += `<div class="section-label">People</div>`;
      out += actors.actors.length ? actors.actors.map(actorRow).join("") : centerMsg("No people found");
      out += `<div class="section-label">Posts</div>`;
      try {
        const posts = await xrpc("app.bsky.feed.searchPosts", { q: query, limit: 20 });
        out += posts.posts.length ? posts.posts.map((p) => postCard(p)).join("") : centerMsg("No posts found");
      } catch {
        out += centerMsg("Post search unavailable", "Bluesky's public post search is rate-limited right now — people search still works.");
      }
      box.innerHTML = out;
    } catch (e) {
      box.innerHTML = errorBox("Search failed (" + e.message + ")");
    }
  }
}

function AboutView(main) {
  main.innerHTML =
    headerHtml("About Bluesky Social") +
    `<div style="padding:16px;font-size:14.5px;line-height:1.6">
      <p><b>bskyxp</b> is a real, working Bluesky client, skinned entirely as a Windows-XP-era desktop launcher — requested by @vibecode.rodeo off a screenshot of exactly this UI.</p>
      <p>No account is required to browse — Discover Posts, Custom Feeds, Trending Topics, Popular Posts, Search, and every profile/thread are all live data straight from Bluesky's public AppView (<code>public.api.bsky.app</code>).</p>
      <p>Logging in is optional and uses real atproto OAuth (PKCE + DPoP) straight to your own PDS — this site never sees your password. It unlocks your real Following Feed and real notifications, and every action you take — posting, replying, liking, reposting, blocking — is a genuine write to your own repo, no different from doing it on bsky.app itself.</p>
      <p>💾 Save Post is the one exception: Bluesky's lexicon has no bookmark collection, so saved posts are kept in this browser's local storage only — nothing is written to your repo.</p>
      <p>For DMs, use the real <a class="rt-link" href="https://bsky.app" target="_blank" rel="noopener">bsky.app</a> — this is a for-fun exercise in the atproto ecosystem, not a replacement. Not affiliated with or endorsed by Bluesky PBC. Built as part of <a class="rt-link" href="https://bisks.net" target="_blank" rel="noopener">atprotozoa</a>, a garden of tiny atproto experiments.</p>
    </div>`;
}

function NotFoundView(main) {
  main.innerHTML = headerHtml("Not found") + centerMsg("Nothing here", "That page doesn't exist.");
}

// ---------- router ----------

const ROUTES = [
  { pattern: "/", view: HomeLauncherView },
  { pattern: "/timeline", view: TimelineView },
  { pattern: "/discover", view: DiscoverView },
  { pattern: "/feeds", view: CustomFeedsView },
  { pattern: "/search", view: SearchView },
  { pattern: "/notifications", view: NotificationsView },
  { pattern: "/trending", view: TrendingView },
  { pattern: "/popular", view: PopularView },
  { pattern: "/saved", view: SavedView },
  { pattern: "/about", view: AboutView },
  { pattern: "/profile/:handle/post/:rkey/liked-by", view: LikedByView },
  { pattern: "/profile/:handle/post/:rkey/reposted-by", view: RepostedByView },
  { pattern: "/profile/:handle/post/:rkey", view: ThreadView },
  { pattern: "/profile/:handle/follows", view: FollowsView },
  { pattern: "/profile/:handle/followers", view: FollowersView },
  { pattern: "/profile/:handle/feed/:rkey", view: CustomFeedView },
  { pattern: "/profile/:handle", view: ProfileView },
];

function matchRoute(path) {
  for (const r of ROUTES) {
    const names = [];
    const re = new RegExp(
      "^" +
        r.pattern.replace(/:[^/]+/g, (m) => {
          names.push(m.slice(1));
          return "([^/]+)";
        }) +
        "$"
    );
    const m = path.match(re);
    if (m) {
      const args = {};
      names.forEach((n, i) => (args[n] = decodeURIComponent(m[i + 1])));
      return { view: r.view, args };
    }
  }
  return null;
}

let currentRenderToken = 0;

async function render() {
  const token = ++currentRenderToken;
  const path = location.pathname.slice(MOUNT.length) || "/";
  const params = new URLSearchParams(location.search);
  document.getElementById("app").innerHTML = shellHtml(path);
  updateNavBadge(unreadCount || 0);
  const main = document.getElementById("main");
  const match = matchRoute(path);
  try {
    if (match) await match.view(main, params, match.args);
    else NotFoundView(main);
  } catch (e) {
    if (token === currentRenderToken) main.innerHTML = headerHtml("Something broke") + errorBox(e.message || String(e));
  }
}

function navigate(href, opts) {
  opts = opts || {};
  const current = location.pathname + location.search;
  if (href === current) return;
  if (opts.replace) history.replaceState({}, "", href);
  else history.pushState({}, "", href);
  if (!opts.skipRender) {
    render();
    window.scrollTo(0, 0);
  }
}
window.addEventListener("popstate", render);

document.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (link) {
    if (link.hasAttribute("data-link")) {
      e.preventDefault();
      navigate(link.getAttribute("href"));
    }
    return;
  }
  if (e.target.closest("[data-action='win-close']")) {
    e.stopPropagation();
    openCloseJokeModal();
    return;
  }
  if (e.target.closest("[data-action='win-min']")) {
    e.stopPropagation();
    document.querySelector(".xp-window")?.classList.toggle("minimized");
    return;
  }
  if (e.target.closest("[data-action='win-max']")) {
    e.stopPropagation();
    document.querySelector(".xp-window")?.classList.toggle("maxed");
    return;
  }
  const win = document.querySelector(".xp-window");
  if (win && win.classList.contains("minimized") && e.target.closest(".xp-titlebar")) {
    win.classList.remove("minimized");
    return;
  }
  if (e.target.closest("[data-action='login']")) {
    openLoginModal();
    return;
  }
  if (e.target.closest("[data-action='logout']")) {
    logout();
    return;
  }
  if (e.target.closest("[data-action='compose']")) {
    openComposeModal();
    return;
  }
  if (e.target.closest("[data-action='goto-reply']")) {
    navigate(`${MOUNT}/timeline`);
    showToast("Tap 💬 on any post below to reply", "ok");
    return;
  }
  if (e.target.closest("[data-action='goto-repost']")) {
    navigate(`${MOUNT}/timeline`);
    showToast("Tap 🔁 on any post below to repost", "ok");
    return;
  }
  if (e.target.closest("[data-action='goto-share']")) {
    navigate(`${MOUNT}/timeline`);
    showToast("Tap 📤 on any post below to share it", "ok");
    return;
  }
  const likeIcon = e.target.closest("[data-action='like']");
  if (likeIcon) {
    e.stopPropagation();
    toggleLike(likeIcon);
    return;
  }
  const repostIcon = e.target.closest("[data-action='repost']");
  if (repostIcon) {
    e.stopPropagation();
    toggleRepost(repostIcon);
    return;
  }
  const saveIcon = e.target.closest("[data-action='save']");
  if (saveIcon) {
    e.stopPropagation();
    toggleSave(saveIcon);
    return;
  }
  const replyTrigger = e.target.closest("[data-action='reply']");
  if (replyTrigger) {
    e.stopPropagation();
    openReplyModal(replyTrigger);
    return;
  }
  const blockBtn = e.target.closest("[data-action='block']");
  if (blockBtn) {
    e.stopPropagation();
    toggleBlock(blockBtn);
    return;
  }
  const cover = e.target.closest(".sensitive-cover");
  if (cover) {
    e.stopPropagation();
    cover.classList.remove("sensitive-cover");
    return;
  }
  const videoBox = e.target.closest("[data-action='play-video']");
  if (videoBox) {
    e.stopPropagation();
    playVideo(videoBox);
    return;
  }
  if (e.target.closest(".video-embed")) {
    e.stopPropagation();
    return;
  }
  if (e.target.tagName === "IMG" && e.target.closest(".imgs")) {
    e.stopPropagation();
    const imgs = [...e.target.closest(".imgs").querySelectorAll("img")].map((i) => i.src);
    openLightbox(imgs, imgs.indexOf(e.target.src));
    return;
  }
  if (e.target.closest("[data-action='back']")) {
    history.back();
    return;
  }
  const card = e.target.closest("[data-href]");
  if (card) navigate(card.getAttribute("data-href"));
});

let lightboxImgs = [];
let lightboxIdx = 0;
function openLightbox(imgs, idx) {
  lightboxImgs = imgs && imgs.length ? imgs : [imgs];
  lightboxIdx = idx || 0;
  let box = document.getElementById("lightbox");
  if (!box) {
    box = document.createElement("div");
    box.id = "lightbox";
    box.className = "lightbox";
    box.innerHTML = `<span class="lb-close" data-action="lb-close">✕</span>
      <span class="lb-nav lb-prev" data-action="lb-prev">‹</span>
      <img>
      <span class="lb-nav lb-next" data-action="lb-next">›</span>`;
    box.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]")?.getAttribute("data-action");
      if (action === "lb-prev") { e.stopPropagation(); lbShow(-1); return; }
      if (action === "lb-next") { e.stopPropagation(); lbShow(1); return; }
      box.classList.remove("open");
    });
    document.body.appendChild(box);
  }
  lbRender();
  box.classList.add("open");
}
function lbShow(delta) {
  lightboxIdx = (lightboxIdx + delta + lightboxImgs.length) % lightboxImgs.length;
  lbRender();
}
function lbRender() {
  const box = document.getElementById("lightbox");
  if (!box) return;
  box.querySelector("img").src = lightboxImgs[lightboxIdx];
  const multi = lightboxImgs.length > 1;
  box.querySelector(".lb-prev").style.display = multi ? "" : "none";
  box.querySelector(".lb-next").style.display = multi ? "" : "none";
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.getElementById("login-modal")) { closeLoginModal(); return; }
  if (e.key === "Escape" && document.getElementById("reply-modal")) { closeReplyModal(); return; }
  if (e.key === "Escape" && document.getElementById("compose-modal")) { closeComposeModal(); return; }
  if (e.key === "Escape" && document.getElementById("close-modal")) { document.getElementById("close-modal").remove(); return; }
  const box = document.getElementById("lightbox");
  if (!box || !box.classList.contains("open")) return;
  if (e.key === "Escape") box.classList.remove("open");
  else if (e.key === "ArrowLeft") lbShow(-1);
  else if (e.key === "ArrowRight") lbShow(1);
});

// ---------- boot ----------

async function boot() {
  let bootError = null;
  let freshLogin = null;
  try {
    const { completeLoginIfCallback, getSession } = await oauth();
    freshLogin = await completeLoginIfCallback();
    session = freshLogin || (await getSession());
  } catch (e) {
    bootError = e.message || String(e);
    session = null;
  }
  await loadSessionProfile();
  render();
  if (freshLogin) showToast(`Logged in as @${freshLogin.handle}`, "ok");
  if (bootError) showToast(bootError, "err");
  pollNotifications();
  setInterval(pollNotifications, 20000);
}

boot();
