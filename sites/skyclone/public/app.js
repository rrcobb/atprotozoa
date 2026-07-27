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
  const replyCtx =
    opts.showReplyContext && post.reply?.parent && !post.reply.parent.notFound
      ? `<div class="reply-context">Replying to <a href="${profileUrl(post.reply.parent.author?.handle || "")}" data-link>@${esc(post.reply.parent.author?.handle || "")}</a></div>`
      : "";
  return `<article class="post" data-href="${url}">
    <a class="post-avatar" href="${profileUrl(author.handle)}" data-link>
      <img src="${esc(author.avatar || FALLBACK_AVATAR)}" alt="">
    </a>
    <div class="post-body">
      ${replyCtx}
      <div class="post-head">
        <a class="post-name" href="${profileUrl(author.handle)}" data-link>${esc(author.displayName || author.handle)}</a>${verifyBadge(author)}
        <a class="post-handle" href="${profileUrl(author.handle)}" data-link>@${esc(author.handle)}</a>
        <span class="post-dot">·</span>
        <span class="post-time">${relTime(record.createdAt || post.indexedAt)}</span>
      </div>
      <div class="post-text">${richText(record.text, record.facets)}</div>
      ${renderEmbed(post.embed, isSensitive(post))}
      <div class="post-actions">
        <span class="act reply">💬 <span>${fmtCount(post.replyCount)}</span></span>
        <span class="act repost" data-href="${url}/reposted-by">🔁 <span>${fmtCount((post.repostCount || 0) + (post.quoteCount || 0))}</span></span>
        <span class="act like" data-href="${url}/liked-by">🤍 <span>${fmtCount(post.likeCount)}</span></span>
        <a class="act share" href="${shareIntent(shareText, shareUrl)}" target="_blank" rel="noopener">↗</a>
      </div>
    </div>
  </article>`;
}

function feedItemHtml(item) {
  const reason = item.reason;
  let reasonLine = "";
  if (reason?.$type === "app.bsky.feed.defs#reasonRepost") {
    reasonLine = `<div class="reply-context">🔁 <a href="${profileUrl(reason.by.handle)}" data-link>${esc(reason.by.displayName || reason.by.handle)}</a> reposted</div>`;
  }
  return reasonLine ? reasonLine + postCard(item.post, { showReplyContext: true }).replace('class="post"', 'class="post" style="padding-top:0"') : postCard(item.post, { showReplyContext: true });
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
  { path: "/trending", label: "Trending", icon: "📈" },
  { path: "/feeds", label: "Feeds", icon: "📋" },
  { path: "/about", label: "About", icon: "🦋" },
];

function isActive(path, itemPath) {
  if (itemPath === "/") return path === "/";
  return path.startsWith(itemPath);
}

function shellHtml(activePath) {
  const navItem = (item, mobile) => `
    <a class="nav-item ${isActive(activePath, item.path) ? "active" : ""}" href="${MOUNT}${item.path}" data-link>
      <span class="ic">${item.icon}</span>${mobile ? "" : `<span class="label">${item.label}</span>`}
    </a>`;
  return `
  <div class="mobile-topbar">🦋 skyclone</div>
  <div class="shell">
    <nav class="nav">
      <a class="nav-logo" href="${MOUNT}/" data-link><span class="wing">🦋</span><span class="word">skyclone</span></a>
      <div class="nav-items">${NAV_ITEMS.map((i) => navItem(i, false)).join("")}</div>
      <a class="nav-cta" href="https://bsky.app" target="_blank" rel="noopener"><span class="label">Open real Bluesky ↗</span></a>
      <div class="nav-spacer"></div>
      <div class="nav-foot">Unofficial fan clone. Not affiliated with Bluesky PBC. Live public data, read-only, no login.<br><a href="https://bisks.net" target="_blank" rel="noopener">bisks.net</a></div>
    </nav>
    <main class="main" id="main"></main>
    <aside class="aside" id="aside"></aside>
  </div>
  <div class="mobile-tabbar">${NAV_ITEMS.map((i) => navItem(i, true)).join("")}</div>
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
    <p>skyclone is a fan-made, read-only rebuild of the bsky.app web client. Every feed, profile, and thread here is live data pulled straight from Bluesky's public AppView — nothing is faked or cached long-term.</p>
    <p>No login, no posting, no tracking. For the real thing (posting, notifications, your own timeline) use <a class="link" href="https://bsky.app" target="_blank" rel="noopener">bsky.app</a>.</p>
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

async function HomeView(main, params) {
  let tabs = [{ label: "Discover", uri: DISCOVER_FEED }];
  const activeUri = params.get("feed") || DISCOVER_FEED;
  main.innerHTML = headerHtml("Home") + `<div class="feed-tabs" id="feed-tabs"></div><div id="feed-posts">${skeleton(6)}</div>`;
  renderTabs();

  xrpc("app.bsky.unspecced.getPopularFeedGenerators", { limit: 8 })
    .then((data) => {
      for (const f of data.feeds) {
        if (f.uri === DISCOVER_FEED) continue;
        tabs.push({ label: f.displayName, uri: f.uri });
        if (tabs.length >= 5) break;
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

  await loadFeed(activeUri, document.getElementById("feed-posts"));
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
        <p style="color:var(--text-dimmer);font-size:13px">❤ ${fmtCount(info.likeCount)} likes</p>
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

  main.innerHTML =
    headerHtml(profile.displayName || `@${profile.handle}`, `${fmtCount(profile.postsCount)} posts`, true) +
    `<div class="profile-banner" style="${profile.banner ? `background-image:url('${esc(profile.banner)}')` : ""}"></div>
    <div class="profile-head">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <img class="profile-avatar" src="${esc(profile.avatar || FALLBACK_AVATAR)}" alt="">
        <div style="display:flex;gap:8px;margin-top:10px">
          <a class="pill-btn" href="${shareIntent(shareText, shareUrl)}" target="_blank" rel="noopener">Share ↗</a>
          <a class="pill-btn primary" href="https://bsky.app/profile/${esc(profile.handle)}" target="_blank" rel="noopener">Open in Bluesky</a>
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
    box.insertAdjacentHTML("beforeend", data.feed.map((it) => postCard(it.post, { showReplyContext: filter === "posts_with_replies" })).join("") || centerMsg("Nothing here yet"));
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
        <span class="act reply">💬 <span>${fmtCount(focus.replyCount)}</span></span>
        <span class="act repost" data-href="${postUrl(focus.author.handle, focus.uri)}/reposted-by">🔁 <span>${fmtCount((focus.repostCount || 0) + (focus.quoteCount || 0))}</span></span>
        <span class="act like" data-href="${postUrl(focus.author.handle, focus.uri)}/liked-by">🤍 <span>${fmtCount(focus.likeCount)}</span></span>
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
      <p><b>skyclone</b> is an unofficial, read-only rebuild of the bsky.app web client — the home feed, profiles, threads, feed discovery, and search, all wired to Bluesky's live public AppView (<code>public.api.bsky.app</code>) instead of a database of its own.</p>
      <p>There's no login here and never will be — this is a viewer, not a client. Every byte you see (posts, likes, follower counts, avatars) is fetched fresh from Bluesky at request time. Nothing is stored, scraped, or replayed.</p>
      <p>For posting, notifications, DMs, or your personal Following feed, you still want the real <a class="rt-link" href="https://bsky.app" target="_blank" rel="noopener">bsky.app</a> — this is a for-fun exercise in the atproto ecosystem, not a replacement.</p>
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
  const box = document.getElementById("lightbox");
  if (!box || !box.classList.contains("open")) return;
  if (e.key === "Escape") box.classList.remove("open");
  else if (e.key === "ArrowLeft") lbShow(-1);
  else if (e.key === "ArrowRight") lbShow(1);
});

render();
