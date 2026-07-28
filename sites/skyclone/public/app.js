"use strict";

const MOUNT = location.pathname.startsWith("/skyclone") ? "/skyclone" : "";
const SITE_URL = "https://bisks.net/skyclone";
const APPVIEW = "https://public.api.bsky.app";
const DISCOVER_FEED = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot";
const FALLBACK_AVATAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8b98a5"/><circle cx="50" cy="38" r="20" fill="#e1e8ed"/><ellipse cx="50" cy="92" rx="34" ry="30" fill="#e1e8ed"/></svg>'
  );

// ---------- auth (OAuth login -> home timeline) ----------
//
// skyclone is still a read-only viewer for anyone who doesn't log in — this
// just adds an optional real OAuth session (see lib/oauth.js) so a logged-in
// visitor can see their actual home timeline (app.bsky.feed.getTimeline,
// proxied through their own PDS) instead of only the public Discover feed.
// Nothing here ever writes to the user's repo.

let session = null; // { did, handle, pdsUrl, accessJwt, ... } | null
let sessionProfile = null; // { avatar, displayName } for the logged-in user, best-effort
let oauthLib = null;

// post uri -> like/repost record uri, for posts liked/unliked/reposted this
// session. skyclone reads through the public (unauthenticated) AppView, which
// never returns viewer state, so there's no way to know on load whether you'd
// already liked or reposted something elsewhere — this only tracks changes
// made in this tab.
const likedPosts = new Map();
const repostedPosts = new Map();

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
      <p>Real OAuth, straight to your own PDS — skyclone never sees your password. This unlocks your actual home timeline, and lets you catch posts in your web, repost, and reply — all genuine writes to your own repo. It still never follows anyone on your behalf.</p>
      <input id="login-handle" placeholder="yourhandle.bsky.social" autocomplete="off">
      <div class="modal-actions">
        <button type="button" id="login-cancel" class="pill-btn">Cancel</button>
        <button type="button" id="login-go" class="pill-btn primary">Continue</button>
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
      await login(h); // navigates away on success
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
  // public.api.bsky.app sits behind a shared CDN cache that has been observed
  // serving a stale/mismatched response for an identical query string; a
  // cheap cache-busting param forces a fresh fetch so feeds/profiles/threads
  // stay genuinely live.
  url.searchParams.set("_", Date.now().toString(36) + Math.random().toString(36).slice(2));
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) {
    const err = new Error(`${method} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ---------- likes, reposts, replies (real writes to the user's own repo) ----------
//
// Real app.bsky.feed.like / app.bsky.feed.repost / app.bsky.feed.post records,
// created (and for like/repost, deleted) directly on the user's own PDS via
// their DPoP-bound OAuth session (no AppView proxy needed for repo writes).
// Likes and reposts are optimistic UI, reverted on failure. No hearts — a
// click drops the post into a web (🕸️) and it comes back caught (🕷️).

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
  iconEl.classList.remove("like-pop");
  void iconEl.offsetWidth;
  iconEl.classList.add("like-pop");
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
  iconEl.classList.remove("repost-pop");
  void iconEl.offsetWidth;
  iconEl.classList.add("repost-pop");
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

// A real app.bsky.graph.block record, written to the user's own repo (the
// same createRecord/deleteRecord dance as like/repost above). Blocking is a
// real, two-way action on Bluesky, so it gets a confirm() before the write —
// unlike a like or repost, you can't casually undo the social effect.
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
      showToast("Caught in the web — blocked. 🕸️", "spider");
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
      showToast("Unblocked.", "spider");
    }
  } catch (e) {
    btn.classList.toggle("blocking");
    btn.textContent = prevLabel;
    showToast(e.message || "Couldn't update block", "err");
  }
}

// Cosmetic only — banishes a post from view with a curse (catches fire,
// shrivels up, gone). No repo write, no deleteRecord; the post itself is
// untouched, this tab just stops showing it.
const WITCH_LINES = [
  "A witch descends… gone. 🧙",
  "Cursed and cast into the web. 🧙",
  "Poof. The witch got it. 🧙",
  "Banished — the witch was thorough. 🧙",
];
function witchPost(actionEl) {
  const target = actionEl.closest(".post, .thread-focus");
  if (!target || target.classList.contains("hexed")) return;
  target.classList.add("hexed");
  showToast(WITCH_LINES[Math.floor(Math.random() * WITCH_LINES.length)], "spider");
  target.addEventListener(
    "animationend",
    (e) => {
      if (e.target !== target) return;
      const height = target.getBoundingClientRect().height;
      target.style.maxHeight = height + "px";
      target.style.overflow = "hidden";
      requestAnimationFrame(() => target.classList.add("hex-collapse"));
      setTimeout(() => target.remove(), 260);
    },
    { once: true }
  );
}

// A real app.bsky.feed.post record with a reply ref — clicking 💬 opens a
// compose box and posts for real, straight to the user's own PDS. root/parent
// strong refs come off the post being replied to (its own record.reply.root
// if it's itself a reply, else the post is the root).
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
        <button type="button" id="reply-cancel" class="pill-btn">Cancel</button>
        <button type="button" id="reply-go" class="pill-btn primary">Reply</button>
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
          record: {
            $type: "app.bsky.feed.post",
            text,
            reply: { root, parent },
            createdAt: new Date().toISOString(),
          },
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

// A real top-level app.bsky.feed.post — no reply ref, just spun straight
// into the user's own repo from the New Post button.
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
      <h2>🕷️ Spin a post</h2>
      <p>A real app.bsky.feed.post, written straight to your own repo — into the spider internet.</p>
      <textarea id="compose-text" maxlength="300" placeholder="What's caught your eye?" autocomplete="off"></textarea>
      <div class="reply-count-hint" id="compose-chars">300</div>
      <div class="modal-actions">
        <button type="button" id="compose-cancel" class="pill-btn">Cancel</button>
        <button type="button" id="compose-go" class="pill-btn primary">Spin it</button>
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
    status.textContent = "Spinning…";
    try {
      const { dpopFetch } = await oauth();
      const pds = session.pdsUrl.replace(/\/$/, "");
      const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo: session.did,
          collection: "app.bsky.feed.post",
          record: {
            $type: "app.bsky.feed.post",
            text,
            createdAt: new Date().toISOString(),
          },
        }),
      });
      if (!res.ok) throw new Error(`post failed (${res.status})`);
      closeComposeModal();
      showToast("Spun into the web 🕷️", "ok");
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

// ---------- small helpers ----------

function h(strings, ...vals) {
  return strings.reduce((out, s, i) => out + s + (i < vals.length ? vals[i] : ""), "");
}
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
    <span class="like-icon" data-action="like" data-uri="${esc(post.uri)}" data-cid="${esc(post.cid || "")}" title="${liked ? "Caught in your web" : "Catch it in your web"}">${liked ? "🕷️" : "🕸️"}</span>
    <span class="like-count" data-href="${url}/liked-by" data-count="${post.likeCount || 0}">${fmtCount(post.likeCount)}</span>
  </span>`;
}
function repostActionHtml(post, url) {
  const reposted = repostedPosts.has(post.uri);
  const count = (post.repostCount || 0) + (post.quoteCount || 0);
  return `<span class="act repost${reposted ? " reposted" : ""}">
    <span class="repost-icon" data-action="repost" data-uri="${esc(post.uri)}" data-cid="${esc(post.cid || "")}" title="${reposted ? "Shake it off the web" : "Send it back out"}">🪰</span>
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
// Not a real write — nothing is deleted from anyone's repo. A witch just
// curses the post out of *your* view: it catches fire, shrivels up, and the
// DOM node is removed. Refresh (or another visitor) and it's right back.
function witchActionHtml() {
  return `<span class="act witch" data-action="witch" title="Summon a witch">🧙</span>`;
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
  const shareUrl = `${SITE_URL}/profile/${encodeURIComponent(author.handle)}/post/${rkeyOf(post.uri)}`;
  const shareText = `Post by @${author.handle} on skyclone: "${(record.text || "").slice(0, 120)}"`;
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
        ${witchActionHtml()}
        <a class="act share" href="${shareIntent(shareText, shareUrl)}" target="_blank" rel="noopener">↗</a>
      </div>
    </div>
  </article>`;
}

// A feed's reply ref (app.bsky.feed.defs#replyRef) rides alongside `post` on
// the feed item itself, not on the post — its `parent` is a full PostView
// (or a notFound/blocked stub) straight from the AppView, so when it's real
// we can thread the actual parent post inline instead of a bare "replying
// to" link. This is what makes a reply in the timeline read as a thread
// instead of a stray, decontextualized post.
function isRealPostView(p) {
  return !!(p && p.author && p.$type !== "app.bsky.feed.defs#notFoundPost" && p.$type !== "app.bsky.feed.defs#blockedPost");
}

function replyFallbackHtml(replyRef) {
  const parent = replyRef?.parent;
  if (!parent) return "";
  if (parent.$type === "app.bsky.feed.defs#blockedPost") return `<div class="reply-context">🕸️ Replying to a blocked post</div>`;
  return `<div class="reply-context">🕸️ Replying to a post that's unavailable</div>`;
}

// Renders `post`, and if it's a reply with a resolvable parent, threads that
// parent post inline above it (connected by a thread line) instead of just
// linking to who it's replying to.
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
    reasonLine = `<div class="reply-context">🪰 <a href="${profileUrl(reason.by.handle)}" data-link>${esc(reason.by.displayName || reason.by.handle)}</a> reposted</div>`;
  }
  const body = threadedPostHtml(item.post, item.reply);
  return reasonLine ? reasonLine + body.replace('class="post"', 'class="post" style="padding-top:0"') : body;
}

// ---------- generic UI bits ----------

function skeleton(n) {
  return Array.from({ length: n || 5 })
    .map(
      () =>
        `<div class="post"><div class="skel" style="width:42px;height:42px;border-radius:999px"></div>
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

// ---------- shell (nav / layout) ----------

const NAV_ITEMS = [
  { path: "/", label: "Home", icon: "🏠" },
  { path: "/search", label: "Search", icon: "🔎" },
  { path: "/notifications", label: "Notifications", icon: "🔔" },
  { path: "/trending", label: "Trending", icon: "📈" },
  { path: "/feeds", label: "Feeds", icon: "📋" },
  { path: "/about", label: "About", icon: "🕷️" },
];

function isActive(path, itemPath) {
  if (itemPath === "/") return path === "/";
  return path.startsWith(itemPath);
}

function navCtaHtml() {
  if (session) {
    const avatar = sessionProfile?.avatar || FALLBACK_AVATAR;
    const name = sessionProfile?.displayName?.trim() || session.handle;
    return `
      <a class="nav-cta loggedin" href="${profileUrl(session.handle)}" data-link title="${esc(name)} (@${esc(session.handle)})">
        <img class="nav-avatar" src="${esc(avatar)}" alt="">
        <span class="label">@${esc(session.handle)}</span>
      </a>
      <div class="nav-logout" data-action="logout">Log out</div>`;
  }
  return `<div class="nav-cta" data-action="login"><span class="label">Log in with Bluesky</span></div>`;
}

function mobileAuthHtml() {
  if (session) {
    const avatar = sessionProfile?.avatar || FALLBACK_AVATAR;
    return `<span class="mtb-auth">
      <a href="${profileUrl(session.handle)}" data-link><img class="nav-avatar" src="${esc(avatar)}" alt="@${esc(session.handle)}"></a>
      <span class="mtb-logout" data-action="logout">Log out</span>
    </span>`;
  }
  return `<span class="mtb-auth"><span class="mtb-login" data-action="login">Log in</span></span>`;
}

function shellHtml(activePath) {
  const navItem = (item, mobile) => `
    <a class="nav-item ${isActive(activePath, item.path) ? "active" : ""}" href="${MOUNT}${item.path}" data-link>
      <span class="ic">${item.icon}${item.path === "/notifications" ? `<span class="nav-badge" data-badge-for="notifications"></span>` : ""}</span>${mobile ? "" : `<span class="label">${item.label}</span>`}
    </a>`;
  return `
  <div class="mobile-topbar"><span>🕷️ skyclone</span>${mobileAuthHtml()}</div>
  <div class="shell">
    <nav class="nav">
      <a class="nav-logo" href="${MOUNT}/" data-link><span class="wing">🕷️</span><span class="word">skyclone</span></a>
      <div class="nav-items">${NAV_ITEMS.map((i) => navItem(i, false)).join("")}</div>
      <div class="nav-compose" data-action="compose"><span class="ic">🕷️</span><span class="label">New Post</span></div>
      ${navCtaHtml()}
      <div class="nav-spacer"></div>
    </nav>
    <main class="main" id="main"></main>
    <aside class="aside" id="aside"></aside>
  </div>
  <div class="mobile-tabbar">${NAV_ITEMS.map((i) => navItem(i, true)).join("")}</div>
  <div class="compose-fab" data-action="compose" title="New post">🕷️</div>
  `;
}

function asideHtml() {
  return `
  <div class="aside-search">
    <span>🔎</span>
    <input id="aside-q" placeholder="Search skyclone" autocomplete="off">
  </div>
  <div class="aside-card">
    <h2>What is this?</h2>
    <p>skyclone is a fan-made rebuild of the bsky.app web client. Every feed, profile, and thread here is live data pulled straight from Bluesky's public AppView — nothing is faked or cached long-term.</p>
    <p>Browse without an account, or log in with OAuth to see your real home timeline, spin your own posts, catch posts in your web (a real like, no hearts), repost, and reply — genuine writes to your own repo. skyclone never follows for you. Real notifications live in the 🔔 tab — a spider crawls across your screen when a new one comes in. For DMs, use <a class="link" href="https://bsky.app" target="_blank" rel="noopener">bsky.app</a>.</p>
  </div>
  <div class="aside-card" id="aside-feeds"><h2>Popular feeds</h2><p>Loading…</p></div>
  <div class="aside-foot">Built by <a href="https://bsky.app/profile/buildthis.bisks.net" target="_blank" rel="noopener">@buildthis.bisks.net</a> · part of the <a href="https://bisks.net" target="_blank" rel="noopener">atprotozoa</a> experiment garden · <a href="https://github.com/rrcobb/atprotozoa" target="_blank" rel="noopener">source</a></div>
  `;
}

async function fillAside() {
  const q = document.getElementById("aside-q");
  if (q) {
    q.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && q.value.trim()) navigate(`${MOUNT}/search?q=${encodeURIComponent(q.value.trim())}`);
    });
  }
  const box = document.getElementById("aside-feeds");
  if (!box) return;
  try {
    const data = await xrpc("app.bsky.unspecced.getPopularFeedGenerators", { limit: 5 });
    box.innerHTML =
      `<h2>Popular feeds</h2>` +
      data.feeds
        .map(
          (f) => `<a class="aside-feed-item" href="${profileUrl(f.creator.handle)}/feed/${rkeyOf(f.uri)}" data-link>
        <img src="${esc(f.avatar || FALLBACK_AVATAR)}" alt=""><span>${esc(f.displayName)}</span>
      </a>`
        )
        .join("") +
      `<a class="link" style="display:block;margin-top:6px;font-size:13px" href="${MOUNT}/feeds" data-link>See all →</a>`;
  } catch {
    box.innerHTML = `<h2>Popular feeds</h2><p>Couldn't load right now.</p>`;
  }
}

// ---------- header helper ----------

function headerHtml(title, sub, back) {
  return `<div class="main-header"><div class="back-row">
    ${back ? `<span class="back-btn" data-action="back">←</span>` : ""}
    <div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>
  </div></div>`;
}

// ---------- views ----------

const TIMELINE_URI = "timeline"; // sentinel feed id for the logged-in home timeline

async function HomeView(main, params) {
  let tabs = session ? [{ label: "Home", uri: TIMELINE_URI }] : [];
  tabs.push({ label: "Discover", uri: DISCOVER_FEED });
  const activeUri = params.get("feed") || (session ? TIMELINE_URI : DISCOVER_FEED);
  main.innerHTML = headerHtml("Home") + `<div class="feed-tabs" id="feed-tabs"></div><div id="feed-posts">${skeleton(6)}</div>`;
  renderTabs();

  xrpc("app.bsky.unspecced.getPopularFeedGenerators", { limit: 8 })
    .then((data) => {
      const cap = session ? 6 : 5;
      for (const f of data.feeds) {
        if (f.uri === DISCOVER_FEED) continue;
        tabs.push({ label: f.displayName, uri: f.uri });
        if (tabs.length >= cap) break;
      }
      renderTabs();
    })
    .catch(() => {});

  function renderTabs() {
    const box = document.getElementById("feed-tabs");
    if (!box) return;
    box.innerHTML = tabs
      .map(
        (t) =>
          `<div class="feed-tab ${t.uri === activeUri ? "active" : ""}" data-href="${MOUNT}/?feed=${encodeURIComponent(t.uri)}">${esc(t.label)}</div>`
      )
      .join("");
  }

  const box = document.getElementById("feed-posts");
  if (activeUri === TIMELINE_URI) await loadTimeline(box);
  else await loadFeed(activeUri, box);
}

// Real getTimeline for a logged-in visitor — proxied through their own PDS to
// the AppView (same DPoP-bound session lib/oauth.js sets up), so it reflects
// their actual follows, not the public Discover feed.
async function loadTimeline(box, cursor) {
  if (!session) {
    box.innerHTML = centerMsg("Not signed in", "Log in with Bluesky (top of the nav) to see your real home timeline.");
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

// ---------- notifications (real, from your own repo's notification feed) ----------
//
// app.bsky.notification.listNotifications, proxied through the user's own PDS
// the same way getTimeline is — no server-side storage, just a live fetch.
// A lightweight poll (see pollNotifications) watches app.bsky.notification.getUnreadCount
// in the background; when it climbs, a spider crawls across the screen. AHH!

const NOTIF_META = {
  like: { icon: "🕸️", verb: "caught your post in their web" },
  repost: { icon: "🪰", verb: "let your post loose again" },
  quote: { icon: "🪰", verb: "quoted your post" },
  follow: { icon: "🕷️", verb: "spun a thread to you" },
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

async function NotificationsView(main) {
  if (!session) {
    main.innerHTML = headerHtml("Notifications") + centerMsg("Not signed in", "Log in with Bluesky (top of the nav) to see your real notifications.");
    return;
  }
  main.innerHTML = headerHtml("Notifications", "", false) + `<div id="notif-list">${skeleton(6)}</div>`;
  await loadNotifications(document.getElementById("notif-list"));
  markNotificationsSeen();
}

async function loadNotifications(box, cursor) {
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
    if (!cursor) box.innerHTML = "";
    else box.querySelector(".load-more")?.remove();
    box.insertAdjacentHTML(
      "beforeend",
      data.notifications.map(notificationRow).join("") ||
        centerMsg("Nothing yet", "When someone catches a post in their web, reposts it, follows you, or replies, it'll show up here.")
    );
    if (data.cursor && data.notifications.length) {
      box.insertAdjacentHTML("beforeend", loadMoreBtn());
      box.querySelector(".load-more").onclick = (e) => {
        e.target.textContent = "Loading…";
        loadNotifications(box, data.cursor);
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

// null until the first successful poll, so we never spider-scare someone
// over notifications that were already sitting there before this tab opened.
let unreadCount = null;

function updateNavBadge(count) {
  document.querySelectorAll('[data-badge-for="notifications"]').forEach((el) => {
    el.textContent = count > 0 ? (count > 99 ? "99+" : String(count)) : "";
    el.classList.toggle("show", count > 0);
  });
}

function spawnCrawlingSpider(delay) {
  setTimeout(() => {
    const el = document.createElement("div");
    el.className = "spider-crawler";
    el.textContent = "🕷️";
    el.style.top = (8 + Math.random() * 76) + "vh";
    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
    setTimeout(() => el.remove(), 6000);
  }, delay || 0);
}

function crawlSpiders(n) {
  showToast(n > 1 ? `AHH! SPIDERS! 🕷️ ×${n}` : "AHH! SPIDER! 🕷️", "spider");
  for (let i = 0; i < n; i++) spawnCrawlingSpider(i * 500);
}

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
    const count = data.count || 0;
    if (unreadCount !== null && count > unreadCount) crawlSpiders(Math.min(count - unreadCount, 3));
    unreadCount = count;
    updateNavBadge(count);
  } catch {}
}

async function TrendingView(main) {
  main.innerHTML = headerHtml("Trending", "What people are talking about right now") + skeleton(8);
  try {
    const data = await xrpc("app.bsky.unspecced.getTrendingTopics", { limit: 24 });
    const row = (t) => `<div class="card-row" data-href="${MOUNT}${t.link}">
      <div class="cr-body"><div class="cr-title">${esc(t.topic)}</div></div>
    </div>`;
    let out = "";
    if (data.topics?.length) out += `<div class="section-label">Trending topics</div>` + data.topics.map(row).join("");
    if (data.suggested?.length) out += `<div class="section-label">Suggested feeds</div>` + data.suggested.map(row).join("");
    main.innerHTML = headerHtml("Trending", "What people are talking about right now") + (out || centerMsg("Nothing trending right now"));
  } catch (e) {
    main.innerHTML = headerHtml("Trending") + errorBox("Couldn't load trending topics (" + e.message + ")");
  }
}

async function FeedsView(main) {
  main.innerHTML = headerHtml("Feeds", "Popular custom feeds, live from Bluesky") + skeleton(6);
  try {
    const data = await xrpc("app.bsky.unspecced.getPopularFeedGenerators", { limit: 40 });
    main.innerHTML =
      headerHtml("Feeds", "Popular custom feeds, live from Bluesky") +
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
    main.innerHTML = headerHtml("Feeds") + errorBox("Couldn't load feeds (" + e.message + ")");
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
        <img src="${esc(info.avatar || FALLBACK_AVATAR)}" style="width:56px;height:56px;border-radius:14px" alt="">
        <p style="color:var(--text-dim);font-size:14px;margin-top:8px">${esc(info.description || "")}</p>
        <p style="color:var(--text-dimmer);font-size:13px">🕷️ ${fmtCount(info.likeCount)} likes</p>
      </div>
      <div id="feed-posts">${skeleton(6)}</div>`;
    await loadFeed(uri, document.getElementById("feed-posts"));
  } catch (e) {
    main.innerHTML = headerHtml("Feed", "", true) + errorBox("Couldn't load this feed (" + e.message + ")");
  }
}

const PROFILE_TABS = [
  { key: "posts", label: "Posts", filter: "posts_and_author_threads" },
  { key: "replies", label: "Replies", filter: "posts_with_replies" },
  { key: "media", label: "Media", filter: "posts_with_media" },
];

async function ProfileView(main, params, args) {
  const handle = args.handle;
  const activeTab = params.get("tab") || "posts";
  main.innerHTML = headerHtml(handle, "", true) + `<div class="skel" style="height:150px"></div>` + skeleton(4);
  let profile;
  try {
    profile = await xrpc("app.bsky.actor.getProfile", { actor: handle });
  } catch (e) {
    main.innerHTML = headerHtml(handle, "", true) + centerMsg("This account doesn't exist", "No account was found for @" + esc(handle) + " on Bluesky.");
    return;
  }
  const shareText = `${profile.displayName || profile.handle} (@${profile.handle}) on skyclone`;
  const shareUrl = `${SITE_URL}/profile/${encodeURIComponent(profile.handle)}`;
  const isSelf = session && session.did === profile.did;
  const blockUri = profile.viewer?.blocking || "";
  const blockBtnHtml = isSelf
    ? ""
    : `<span class="pill-btn danger${blockUri ? " blocking" : ""}" data-action="block" data-did="${esc(profile.did)}" data-block-uri="${esc(blockUri)}">${blockUri ? "Blocked" : "Block"}</span>`;

  main.innerHTML =
    headerHtml(profile.displayName || `@${profile.handle}`, `${fmtCount(profile.postsCount)} posts`, true) +
    `<div class="profile-banner" style="${profile.banner ? `background-image:url('${esc(profile.banner)}')` : ""}"></div>
    <div class="profile-head">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <img class="profile-avatar" src="${esc(profile.avatar || FALLBACK_AVATAR)}" alt="">
        <div style="display:flex;gap:8px;margin-top:10px">
          <a class="pill-btn" href="${shareIntent(shareText, shareUrl)}" target="_blank" rel="noopener">Share ↗</a>
          <a class="pill-btn" href="https://bsky.app/profile/${esc(profile.handle)}" target="_blank" rel="noopener">Open in Bluesky</a>
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
  await followListView(main, args.handle, "follows", "Following", "app.bsky.graph.getFollows", "follows");
}
async function FollowersView(main, params, args) {
  await followListView(main, args.handle, "followers", "Followers", "app.bsky.graph.getFollowers", "followers");
}
async function followListView(main, handle, tabKey, title, method, field) {
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
    let parents = "";
    let p = thread.parent;
    const chain = [];
    while (p && p.$type === "app.bsky.feed.defs#threadViewPost") {
      chain.unshift(p);
      p = p.parent;
    }
    parents = chain.map((c) => `<div class="thread-parent">${postCard(c.post)}</div>`).join("");

    const focus = thread.post;
    const shareText = `${focus.author.displayName || focus.author.handle} (@${focus.author.handle}) on skyclone: "${(focus.record.text || "").slice(0, 100)}"`;
    const shareUrl = `${SITE_URL}/profile/${encodeURIComponent(focus.author.handle)}/post/${rkeyOf(focus.uri)}`;
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
        ${witchActionHtml()}
        <a class="act share" href="${shareIntent(shareText, shareUrl)}" target="_blank" rel="noopener">↗ Share</a>
      </div>
    </div>`;

    const replies = (thread.replies || []).filter((r) => r.$type === "app.bsky.feed.defs#threadViewPost");
    const repliesHtml = replies.length
      ? `<div class="section-label">Replies</div>` + replies.map((r) => renderReplyNode(r, 0)).join("")
      : "";

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
    headerHtml("Search") +
    `<div class="search-box"><div class="search-input-wrap">🔎<input id="search-input" placeholder="Search people" value="${esc(q)}" autocomplete="off"></div></div>` +
    `<div id="search-results">${q ? skeleton(4) : centerMsg("Search Bluesky", "Find people by name or handle.")}</div>`;

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
      box.innerHTML = centerMsg("Search Bluesky", "Find people by name or handle.");
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
    headerHtml("About skyclone") +
    `<div style="padding:16px;font-size:15px;line-height:1.6">
      <p><b>skyclone</b> is an unofficial rebuild of the bsky.app web client — the home feed, profiles, threads, feed discovery, search, and notifications, all wired to Bluesky's live public AppView (<code>public.api.bsky.app</code>) instead of a database of its own.</p>
      <p>No account is required to browse. Logging in is optional and uses real atproto OAuth (PKCE + DPoP) straight to your own PDS — skyclone never sees your password — and unlocks your actual home timeline (<code>app.bsky.feed.getTimeline</code>, proxied through your PDS). Every byte you see (posts, likes, follower counts, avatars) is fetched fresh from Bluesky at request time; nothing is stored server-side. Interactions are real writes to your own repo, straight to your PDS, no AppView proxy: catching a post in your web is a genuine <code>app.bsky.feed.like</code> (drawn as a spider, not a heart), 🪰 is a genuine <code>app.bsky.feed.repost</code> (a fly, loosed back into the web), and 💬 opens a compose box that writes a genuine <code>app.bsky.feed.post</code> with a real reply ref. skyclone still never follows anyone or touches your DMs for you.</p>
      <p>Notifications (🔔) are real too — a genuine <code>app.bsky.notification.listNotifications</code> call through your own PDS. skyclone quietly polls for new ones in the background, and when one lands, a spider crawls across your screen. AHH!</p>
      <p>For DMs or the full posting experience, you still want the real <a class="rt-link" href="https://bsky.app" target="_blank" rel="noopener">bsky.app</a> — this is a for-fun exercise in the atproto ecosystem, not a replacement.</p>
      <p>Not affiliated with or endorsed by Bluesky PBC. Built as part of <a class="rt-link" href="https://bisks.net" target="_blank" rel="noopener">atprotozoa</a>, a garden of tiny atproto experiments — <a class="rt-link" href="https://github.com/rrcobb/atprotozoa" target="_blank" rel="noopener">source on GitHub</a>.</p>
    </div>`;
}

function NotFoundView(main) {
  main.innerHTML = headerHtml("Not found") + centerMsg("Nothing here", "That page doesn't exist in skyclone.");
}

// ---------- router ----------

const ROUTES = [
  { pattern: "/", view: HomeView },
  { pattern: "/feeds", view: FeedsView },
  { pattern: "/search", view: SearchView },
  { pattern: "/notifications", view: NotificationsView },
  { pattern: "/trending", view: TrendingView },
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
  document.getElementById("aside").innerHTML = asideHtml();
  fillAside();
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
  const replyTrigger = e.target.closest("[data-action='reply']");
  if (replyTrigger) {
    e.stopPropagation();
    openReplyModal(replyTrigger);
    return;
  }
  const witchIcon = e.target.closest("[data-action='witch']");
  if (witchIcon) {
    e.stopPropagation();
    witchPost(witchIcon);
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
  if (e.key === "Escape" && document.getElementById("login-modal")) {
    closeLoginModal();
    return;
  }
  if (e.key === "Escape" && document.getElementById("reply-modal")) {
    closeReplyModal();
    return;
  }
  if (e.key === "Escape" && document.getElementById("compose-modal")) {
    closeComposeModal();
    return;
  }
  const box = document.getElementById("lightbox");
  if (!box || !box.classList.contains("open")) return;
  if (e.key === "Escape") box.classList.remove("open");
  else if (e.key === "ArrowLeft") lbShow(-1);
  else if (e.key === "ArrowRight") lbShow(1);
});

// ---------- boot ----------
//
// Complete an in-flight OAuth callback (if this load is the PDS redirecting
// back with ?code&state), or restore a previously-logged-in session, before
// the first render — so a returning visitor lands straight on their real
// home timeline instead of flashing the logged-out Discover feed first.

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
