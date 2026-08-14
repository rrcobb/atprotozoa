// SkeetIn — Bluesky's public AppView, reskinned as a LinkedIn feed. Browsing
// (anyone's Skeeting Career, What's Hot) hits the public read-only AppView
// mirror and needs no account. Sign in with real atproto OAuth (see
// lib/oauth.js, copied from sites/skyclone) and three things become real,
// genuine writes to your own PDS: My Feed (app.bsky.feed.getTimeline, proxied
// through your own PDS), Start a post (app.bsky.feed.post), and Endorse
// (app.bsky.feed.like, create+delete). Comment/Repost/Send still just open
// the real post on Bluesky — @antiali.as's ask was login + feed + posting +
// liking, not a full write surface.
(function () {
  "use strict";

  const API = "https://public.api.bsky.app/xrpc/";
  const WHATS_HOT = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot";
  const WHATS_HOT_DID = "did:plc:z72i7hdynmk6r22z27h6tvur";

  const els = {
    search: document.getElementById("search"),
    pfCard: document.getElementById("pfCard"),
    pfBanner: document.getElementById("pfBanner"),
    pfAvatar: document.getElementById("pfAvatar"),
    pfName: document.getElementById("pfName"),
    pfHeadline: document.getElementById("pfHeadline"),
    pfFollows: document.getElementById("pfFollows"),
    pfFollowers: document.getElementById("pfFollowers"),
    pfPosts: document.getElementById("pfPosts"),
    pfViewers: document.getElementById("pfViewers"),
    pfBskyLink: document.getElementById("pfBskyLink"),
    feedRoot: document.getElementById("feedRoot"),
    suggestCard: document.getElementById("suggestCard"),
    suggestSub: document.getElementById("suggestSub"),
    suggestList: document.getElementById("suggestList"),
    newsList: document.getElementById("newsList"),
    composerAvatar: document.getElementById("composerAvatar"),
    composerBtn: document.getElementById("composerBtn"),
    meAvatar: document.getElementById("meAvatar"),
    meNav: document.getElementById("meNav"),
    meTopBadge: document.getElementById("meTopBadge"),
    meLabelPlain: document.getElementById("meLabelPlain"),
    toast: document.getElementById("toast"),
    // SkeetIn Top℠
    pfViewersLocked: document.getElementById("pfViewersLocked"),
    pfUpgradeBtn: document.getElementById("pfUpgradeBtn"),
    promoUpgradeBtn: document.getElementById("promoUpgradeBtn"),
    promoTopCard: document.getElementById("promoTopCard"),
    boostUpsellBtn: document.getElementById("boostUpsellBtn"),
    topModal: document.getElementById("topModal"),
    topModalClose: document.getElementById("topModalClose"),
    modalSubscribeBtn: document.getElementById("modalSubscribeBtn"),
    // SkeetIn Corvid
    corvidNavCount: document.getElementById("corvidNavCount"),
    pfCorvidBadge: document.getElementById("pfCorvidBadge"),
    // real login
    sessionStrip: document.getElementById("sessionStrip"),
    feedTabs: document.getElementById("feedTabs"),
  };

  // ---------- real login (atproto OAuth) ----------
  let session = null; // { did, handle, pdsUrl, accessJwt, ... } | null — see lib/oauth.js
  let sessionProfile = null; // { avatar, displayName, ... } for the logged-in user, best-effort
  let oauthLib = null;
  // post uri -> like record uri, for posts Endorsed/un-Endorsed this session. The
  // public AppView never returns viewer state, so there's no way to know on load
  // whether a post was already liked elsewhere — same limitation as skyclone.
  const likedPosts = new Map();

  async function oauth() {
    if (!oauthLib) oauthLib = await import("/lib/oauth.js");
    return oauthLib;
  }

  // ---------- tiny utils ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }

  function cleanHandle(raw) {
    let h = decodeURIComponent(raw || "").trim().replace(/^@/, "");
    const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
    if (m) h = m[1];
    return h;
  }

  async function xrpc(method, params) {
    const qs = new URLSearchParams(params || {}).toString();
    const res = await fetch(API + method + (qs ? "?" + qs : ""));
    if (!res.ok) throw new Error(method + " " + res.status);
    return res.json();
  }

  function timeAgo(iso) {
    const s = Math.max(0, (Date.parse(new Date().toISOString()) - Date.parse(iso)) / 1000);
    if (s < 60) return Math.floor(s) + "s";
    const m = s / 60; if (m < 60) return Math.floor(m) + "m";
    const h = m / 60; if (h < 24) return Math.floor(h) + "h";
    const d = h / 24; if (d < 30) return Math.floor(d) + "d";
    const mo = d / 30; if (mo < 12) return Math.floor(mo) + "mo";
    return Math.floor(mo / 12) + "y";
  }

  // deterministic fake corporate title, so the same handle always reads the
  // same way in one session — LinkedIn always shows a headline under a name,
  // and the public AppView doesn't hand back bios on lightweight author refs.
  const TITLES = [
    "Senior Vibes Engineer", "Head of Posting", "Chief Skeeting Officer", "VP of Replies",
    "Director of Ratio Prevention", "Growth Lead, Timeline", "Principal Lurker",
    "Staff Reply-Guy", "Community Doomscroller", "Notifications Architect",
    "Head of Quote-Tweets", "Firehose Wrangler", "Feed Algorithm Whisperer",
    "Chief Vibes Officer", "Engagement Farmer", "Rate-Limit Survivor",
    "Senior Screenshot Analyst", "VP, Thirst Trap Relations", "Blocklist Curator",
  ];
  const COMPANIES = [
    "Bluesky PBC", "Self-Employed", "Firehose Industries", "Stealth Startup",
    "Freelance", "AT Protocol Inc.", "Jetstream Logistics", "Rate Limit Ventures",
    "Timeline Capital", "Quote-Post Holdings", "Notifications LLC",
  ];
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function jobTitleFor(handle) {
    const h = hashStr(handle);
    return TITLES[h % TITLES.length] + " at " + COMPANIES[(h >> 3) % COMPANIES.length];
  }

  // ---------- SkeetIn Top℠ (premium upsell satire, 100% client-side) ----------
  // No account system exists here (see meNav's own tooltip: "nobody has a
  // SkeetIn account"), so "subscribing" is just a localStorage flag that
  // flips on some cosmetic gold trim and a fake "who viewed this profile"
  // reveal. It's free forever because charging for it would require a
  // payment processor this playground doesn't have and a product that isn't
  // real — the bit IS that it's free.
  const TOP_KEY = "skeetin_top_member";
  const FAKE_VIEWER_ROLES = [
    "A recruiter from a company that doesn't exist",
    "Someone from Firehose Industries, allegedly",
    "A fellow SkeetIn Corvid holder",
    "Your former Chief Vibes Officer",
    "A bot, almost certainly",
    "Someone who un-viewed immediately after",
  ];
  function isTopMember() {
    try { return localStorage.getItem(TOP_KEY) === "1"; } catch (_) { return false; }
  }
  function setTopMember(on) {
    try { localStorage.setItem(TOP_KEY, on ? "1" : "0"); } catch (_) {}
  }
  function fakeViewersFor(did) {
    const h = hashStr(did || "anon");
    const picks = [];
    for (let i = 0; i < 3; i++) picks.push(FAKE_VIEWER_ROLES[(h + i * 7) % FAKE_VIEWER_ROLES.length]);
    return picks;
  }
  function renderProfileViewers(did) {
    if (!isTopMember()) {
      els.pfViewersLocked.innerHTML =
        `🔒 SkeetIn Top℠ members can see who's been checking out this profile
         <button class="top-upsell-btn" id="pfUpgradeBtn">✦ Try SkeetIn Top℠</button>`;
      document.getElementById("pfUpgradeBtn").addEventListener("click", openTopModal);
      return;
    }
    const viewers = fakeViewersFor(did);
    els.pfViewersLocked.innerHTML =
      `<div class="unlocked-list">${viewers
        .map((v) => `<div class="viewer-row"><img alt="" /> ${esc(v)}</div>`)
        .join("")}</div>
       <div style="font-size:10.5px;color:var(--li-text3);margin-top:4px;">
         SkeetIn Top℠ doesn't track real views — this is generated for comedic effect.
       </div>`;
  }
  function applyTopUiState() {
    const on = isTopMember();
    els.meAvatar.classList.toggle("top-ring", on);
    els.composerAvatar.classList.toggle("top-ring", on);
    els.meTopBadge.style.display = on ? "" : "none";
    els.meLabelPlain.style.display = on ? "none" : "";
    if (els.promoTopCard) {
      els.promoTopCard.querySelector(".card-title").textContent = on
        ? "✦ You're SkeetIn Top℠"
        : "✦ SkeetIn Top℠";
      const cta = els.promoTopCard.querySelector(".promo-cta");
      if (cta) cta.textContent = on ? "You're already subscribed" : "Try SkeetIn Top℠ free";
    }
  }
  function openTopModal() {
    if (isTopMember()) {
      toast("You're already SkeetIn Top℠ — there's nothing more to unlock, this was never real.");
      return;
    }
    els.topModal.classList.remove("hidden");
  }
  function closeTopModal() {
    els.topModal.classList.add("hidden");
  }
  els.topModalClose.addEventListener("click", closeTopModal);
  els.topModal.addEventListener("click", (e) => {
    if (e.target === els.topModal) closeTopModal();
  });
  els.modalSubscribeBtn.addEventListener("click", () => {
    setTopMember(true);
    applyTopUiState();
    closeTopModal();
    toast("🎉 Welcome to SkeetIn Top℠. Nothing changed, but $0.00/mo feels great, doesn't it?");
    if (currentActor) renderProfileViewers(currentActor);
  });
  els.pfUpgradeBtn.addEventListener("click", openTopModal);
  els.promoUpgradeBtn.addEventListener("click", openTopModal);
  els.boostUpsellBtn.addEventListener("click", () => {
    if (isTopMember()) {
      toast("Boosted! (Narrator: it was not boosted. SkeetIn can't post, like, or boost anything.)");
    } else {
      openTopModal();
    }
  });

  // ---------- SkeetIn Corvid (local browser-only demo) -------------------------
  async function refreshCorvidNavCount() {
    const rows = JSON.parse(localStorage.getItem("skeetin:corvid") || "[]");
    els.corvidNavCount.textContent = `${fmt(Math.max(0, 500 - rows.length))} local left`;
  }
  async function renderCorvidBadge(did) {
    els.pfCorvidBadge.innerHTML = "";
    const entry = JSON.parse(localStorage.getItem("skeetin:corvid") || "[]").find((row) => row.did === did);
    if (entry) els.pfCorvidBadge.innerHTML = `<span class="corvid-badge" title="Local browser-only badge">🐦‍⬛ Corvid #${String(entry.number).padStart(3, "0")}</span>`;
  }

  // ---------- rich text (facets use UTF-8 byte offsets, not JS string indices) ----------
  function renderRichText(text, facets) {
    if (!facets || !facets.length) return esc(text).replace(/\n/g, "<br>");
    const bytes = new TextEncoder().encode(text);
    const sorted = facets
      .filter((f) => f.index && typeof f.index.byteStart === "number")
      .sort((a, b) => a.index.byteStart - b.index.byteStart);
    const dec = new TextDecoder();
    let out = "";
    let cursor = 0;
    for (const f of sorted) {
      const { byteStart, byteEnd } = f.index;
      if (byteStart < cursor || byteEnd > bytes.length || byteStart > byteEnd) continue;
      out += esc(dec.decode(bytes.slice(cursor, byteStart)));
      const seg = esc(dec.decode(bytes.slice(byteStart, byteEnd)));
      const feat = (f.features || [])[0] || {};
      if (feat.$type === "app.bsky.richtext.facet#link") {
        out += `<a href="${esc(feat.uri)}" target="_blank" rel="noopener">${seg}</a>`;
      } else if (feat.$type === "app.bsky.richtext.facet#mention") {
        out += `<a href="https://bsky.app/profile/${esc(feat.did)}" target="_blank" rel="noopener">${seg}</a>`;
      } else if (feat.$type === "app.bsky.richtext.facet#tag") {
        out += `<span style="color:var(--li-blue);font-weight:600;">${seg}</span>`;
      } else {
        out += seg;
      }
      cursor = byteEnd;
    }
    out += esc(dec.decode(bytes.slice(cursor)));
    return out.replace(/\n/g, "<br>");
  }

  function renderEmbed(embed) {
    if (!embed) return "";
    if (embed.$type === "app.bsky.embed.recordWithMedia#view") return renderEmbed(embed.media);
    if (embed.$type === "app.bsky.embed.images#view" && embed.images && embed.images.length) {
      const n = Math.min(embed.images.length, 4);
      return `<div class="post-media n${n}">` +
        embed.images.slice(0, 4).map((img) =>
          `<a href="${esc(img.fullsize)}" target="_blank" rel="noopener"><img src="${esc(img.thumb)}" alt="${esc(img.alt || "")}" loading="lazy" /></a>`
        ).join("") + `</div>`;
    }
    if (embed.$type === "app.bsky.embed.external#view" && embed.external) {
      const ext = embed.external;
      return `<a class="post-media n1" style="text-decoration:none;color:inherit;" href="${esc(ext.uri)}" target="_blank" rel="noopener">
        <div class="post-media n1">
          ${ext.thumb ? `<img src="${esc(ext.thumb)}" alt="" loading="lazy" />` : ""}
        </div>
        <div style="padding:10px 16px;border-top:1px solid var(--li-border);">
          <div style="font-size:11px;color:var(--li-text3);text-transform:uppercase;">${esc(safeHost(ext.uri))}</div>
          <div style="font-weight:600;font-size:14px;margin-top:2px;">${esc(ext.title || ext.uri)}</div>
          ${ext.description ? `<div style="font-size:12.5px;color:var(--li-text2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${esc(ext.description)}</div>` : ""}
        </div>
      </a>`;
    }
    return "";
  }

  function safeHost(u) {
    try { return new URL(u).hostname; } catch (_) { return u; }
  }

  function postBskyUrl(post) {
    const rkey = (post.uri || "").split("/").pop();
    return `https://bsky.app/profile/${post.author.handle}/post/${rkey}`;
  }

  const REACT_ICONS = {
    like: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 10v11H3V10h4zm4 11h8a2 2 0 0 0 2-2l1-7a2 2 0 0 0-2-2h-5.5l1-4.5A1.5 1.5 0 0 0 12.6 5L7 10.5V21h4z"/></svg>`,
    comment: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    repost: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  };

  function renderPost(post) {
    const a = post.author;
    const rec = post.record || {};
    const headline = jobTitleFor(a.handle);
    const url = postBskyUrl(post);
    const openBsky = `window.open(${JSON.stringify(url)}, "_blank", "noopener")`;
    const endorsed = likedPosts.has(post.uri);
    return `
    <div class="card post">
      <div class="post-head">
        <a href="${esc(url)}" target="_blank" rel="noopener"><img class="avatar" src="${esc(a.avatar || "")}" alt="" onerror="this.style.visibility='hidden'" /></a>
        <div class="post-who">
          <div class="post-name">${esc(a.displayName || a.handle)} <span class="deg">• 1st</span></div>
          <div class="post-headline">${esc(headline)}</div>
          <div class="post-meta">${timeAgo(rec.createdAt || post.indexedAt)} • 🌐</div>
        </div>
        <button class="post-more" onclick='${openBsky}' title="View on Bluesky">&hellip;</button>
      </div>
      <div class="post-text">${renderRichText(rec.text || "", rec.facets)}</div>
      ${renderEmbed(post.embed)}
      <div class="reaction-summary">
        <span class="glyphs"><span class="g-like">👍</span><span class="g-love">❤</span><span class="g-clap">👏</span></span>
        <span class="rcount" data-count="${post.likeCount || 0}" onclick='${openBsky}'>${fmt(post.likeCount)}</span>
      </div>
      <div class="post-actions">
        <button class="like-btn${endorsed ? " endorsed" : ""}" data-action="endorse" data-uri="${esc(post.uri)}" data-cid="${esc(post.cid || "")}">${REACT_ICONS.like} ${endorsed ? "Endorsed" : "Like"}</button>
        <button onclick='${openBsky}'>${REACT_ICONS.comment} Comment${post.replyCount ? " · " + fmt(post.replyCount) : ""}</button>
        <button onclick='${openBsky}'>${REACT_ICONS.repost} Repost${post.repostCount ? " · " + fmt(post.repostCount) : ""}</button>
        <button onclick='${openBsky}'>${REACT_ICONS.send} Send</button>
      </div>
    </div>`;
  }

  // A real app.bsky.feed.like record, created (and deleted, to un-Endorse)
  // directly on the user's own PDS via their DPoP-bound OAuth session — no
  // AppView proxy needed for repo writes, same pattern as skyclone's toggleLike.
  async function toggleEndorse(btn) {
    if (!session) {
      openLoginModal();
      return;
    }
    const uri = btn.getAttribute("data-uri");
    const cid = btn.getAttribute("data-cid");
    const wasEndorsed = likedPosts.has(uri);
    const postEl = btn.closest(".post");
    const countEl = postEl ? postEl.querySelector(".rcount") : null;
    const base = countEl ? Number(countEl.getAttribute("data-count") || 0) : 0;

    btn.classList.toggle("endorsed", !wasEndorsed);
    btn.innerHTML = `${REACT_ICONS.like} ${wasEndorsed ? "Like" : "Endorsed"}`;
    if (countEl) {
      const next = wasEndorsed ? Math.max(0, base - 1) : base + 1;
      countEl.setAttribute("data-count", next);
      countEl.textContent = fmt(next);
    }

    try {
      const { dpopFetch } = await oauth();
      const pds = session.pdsUrl.replace(/\/$/, "");
      if (!wasEndorsed) {
        const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.createRecord`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repo: session.did,
            collection: "app.bsky.feed.like",
            record: { $type: "app.bsky.feed.like", subject: { uri, cid }, createdAt: new Date().toISOString() },
          }),
        });
        if (!res.ok) throw new Error(`endorse failed (${res.status})`);
        const data = await res.json();
        likedPosts.set(uri, data.uri);
        toast("👍 Endorsed");
      } else {
        const likeUri = likedPosts.get(uri);
        if (likeUri) {
          const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.deleteRecord`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.like", rkey: likeUri.split("/").pop() }),
          });
          if (!res.ok) throw new Error(`un-endorse failed (${res.status})`);
        }
        likedPosts.delete(uri);
      }
    } catch (e) {
      btn.classList.toggle("endorsed", wasEndorsed);
      btn.innerHTML = `${REACT_ICONS.like} ${wasEndorsed ? "Endorsed" : "Like"}`;
      if (countEl) {
        countEl.setAttribute("data-count", base);
        countEl.textContent = fmt(base);
      }
      toast(e.message || "Couldn't update Endorsement");
    }
  }
  els.feedRoot.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='endorse']");
    if (btn) toggleEndorse(btn);
  });

  function fmt(n) {
    n = n || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }

  function emptyState() {
    return `<div class="card empty-state">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <h2>Search a handle to view their Skeeting Career</h2>
      <p>Any Bluesky handle works. Their real posts, reskinned as a professional feed.</p>
    </div>`;
  }

  // ---------- state ----------
  let currentCursor = null;
  let currentActor = null; // did or handle currently loaded, or null for the default feed

  async function renderMoreButton(loader) {
    const btn = document.createElement("button");
    btn.className = "loadmore";
    btn.textContent = "Show more posts";
    btn.onclick = async () => {
      btn.textContent = "Loading…";
      btn.disabled = true;
      try {
        await loader(btn);
      } catch (_) {
        btn.textContent = "Couldn't load more";
      }
    };
    els.feedRoot.appendChild(btn);
    return btn;
  }

  async function loadAuthorFeed(actorDid, replace) {
    if (replace) {
      els.feedRoot.innerHTML = "";
      currentCursor = null;
    }
    const data = await xrpc("app.bsky.feed.getAuthorFeed", {
      actor: actorDid, limit: "20", filter: "posts_no_replies",
      ...(currentCursor ? { cursor: currentCursor } : {}),
    });
    currentCursor = data.cursor || null;
    const old = els.feedRoot.querySelector(".loadmore");
    if (old) old.remove();
    if (!data.feed || !data.feed.length) {
      if (replace) els.feedRoot.innerHTML = `<div class="card empty-state"><h2>No posts (yet)</h2><p>This account hasn't skeeted anything postable.</p></div>`;
      return;
    }
    const wrap = document.createElement("div");
    wrap.innerHTML = data.feed.map((f) => renderPost(f.post)).join("");
    els.feedRoot.appendChild(wrap);
    updateNews(data.feed);
    if (currentCursor) {
      renderMoreButton(async () => { await loadAuthorFeed(actorDid, false); });
    }
  }

  async function loadWhatsHot(replace) {
    if (replace) {
      els.feedRoot.innerHTML = "";
      currentCursor = null;
    }
    try {
      const data = await xrpc("app.bsky.feed.getFeed", {
        feed: WHATS_HOT, limit: "20",
        ...(currentCursor ? { cursor: currentCursor } : {}),
      });
      currentCursor = data.cursor || null;
      const old = els.feedRoot.querySelector(".loadmore");
      if (old) old.remove();
      const wrap = document.createElement("div");
      wrap.innerHTML = (data.feed || []).map((f) => renderPost(f.post)).join("");
      els.feedRoot.appendChild(wrap);
      updateNews(data.feed || []);
      if (currentCursor) renderMoreButton(async () => { await loadWhatsHot(false); });
    } catch (_) {
      if (replace) els.feedRoot.innerHTML = emptyState();
    }
  }

  function updateNews(feedItems) {
    const tally = {};
    for (const f of feedItems) {
      const facets = f.post && f.post.record && f.post.record.facets;
      if (!facets) continue;
      for (const facet of facets) {
        for (const feat of facet.features || []) {
          if (feat.$type === "app.bsky.richtext.facet#tag" && feat.tag) {
            tally[feat.tag] = (tally[feat.tag] || 0) + 1;
          }
        }
      }
    }
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!top.length) {
      els.newsList.innerHTML = STATIC_NEWS.map(
        (n) => `<div class="news-row"><b>${esc(n[0])}</b><span>${esc(n[1])}</span></div>`
      ).join("");
      return;
    }
    els.newsList.innerHTML = top.map(
      ([tag, count]) => `<div class="news-row"><b>#${esc(tag)}</b><span>${count} skeeter${count === 1 ? "" : "s"} discussing this</span></div>`
    ).join("");
  }

  const STATIC_NEWS = [
    ["Layoffs at Firehose Industries", "1,204 readers"],
    ["\"Synergy\" makes a comeback", "890 readers"],
    ["Return-to-timeline mandate announced", "2,301 readers"],
    ["Block button usage at all-time high", "554 readers"],
    ["Local skeeter posts, feels brave", "12 readers"],
  ];

  async function renderSuggestions(actorDid, fallbackDid) {
    try {
      const data = await xrpc("app.bsky.graph.getFollows", { actor: actorDid || fallbackDid, limit: "5" });
      const list = (data.follows || []).slice(0, 5);
      if (!list.length) { els.suggestCard.style.display = "none"; return; }
      els.suggestSub.textContent = actorDid ? "People this account follows" : "People to add to your network";
      els.suggestList.innerHTML = list.map((p) => `
        <div class="suggest-row">
          <img src="${esc(p.avatar || "")}" alt="" onerror="this.style.visibility='hidden'" />
          <div style="min-width:0;flex:1;">
            <div class="suggest-name">${esc(p.displayName || p.handle)}</div>
            <div class="suggest-headline">${esc(jobTitleFor(p.handle))}</div>
            <button class="follow-btn" data-handle="${esc(p.handle)}">+ Follow</button>
          </div>
        </div>`).join("");
      els.suggestCard.style.display = "";
      [...els.suggestList.querySelectorAll(".follow-btn")].forEach((btn) => {
        btn.addEventListener("click", () => loadProfile(btn.dataset.handle));
      });
    } catch (_) {
      els.suggestCard.style.display = "none";
    }
  }

  async function loadProfile(rawHandle) {
    const handle = cleanHandle(rawHandle);
    if (!handle) return;
    els.search.value = "";
    toast("Loading @" + handle + "…");
    try {
      let did;
      if (handle.startsWith("did:")) did = handle;
      else did = (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;

      const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
      currentActor = did;
      renderFeedTabs();
      history.pushState({}, "", "/?u=" + encodeURIComponent(profile.handle));
      document.title = "SkeetIn: " + (profile.displayName || profile.handle);

      els.pfCard.style.display = "";
      els.pfBanner.style.background = profile.banner
        ? `url(${JSON.stringify(profile.banner).slice(1, -1)}) center/cover`
        : "linear-gradient(135deg, #a3d0ff, #0a66c2)";
      els.pfAvatar.src = profile.avatar || "";
      els.pfName.textContent = profile.displayName || profile.handle;
      els.pfHeadline.textContent = (profile.description || "Open to work. (Not really — this is Bluesky.)").split("\n")[0].slice(0, 120);
      els.pfFollows.textContent = fmt(profile.followsCount);
      els.pfFollowers.textContent = fmt(profile.followersCount);
      els.pfPosts.textContent = fmt(profile.postsCount);
      els.pfViewers.textContent = fmt(3 + (hashStr(did) % 900));
      els.pfBskyLink.href = "https://bsky.app/profile/" + profile.handle;
      // The "Me" avatar mirrors whoever's Skeeting Career you're viewing —
      // satire ("this is you, hypothetically") for a logged-out visitor. Once
      // real login is active it must stay the real signed-in user, since
      // Start a post / Endorse genuinely write as that account, not whoever's
      // profile happens to be open.
      if (!session) {
        els.composerAvatar.src = profile.avatar || "";
        els.meAvatar.src = profile.avatar || "";
      }

      renderProfileViewers(did);
      renderCorvidBadge(did);

      await loadAuthorFeed(did, true);
      renderSuggestions(did);
    } catch (err) {
      toast("Couldn't find @" + handle + " — check the spelling?");
    }
  }

  // ---------- login modal ----------
  function openLoginModal() {
    if (document.getElementById("loginModal")) return;
    const box = document.createElement("div");
    box.id = "loginModal";
    box.className = "modal-veil";
    box.innerHTML = `
      <div class="modal-box">
        <button class="modal-close" id="loginModalClose" aria-label="Close">&times;</button>
        <h2>Sign in with Bluesky</h2>
        <div class="modal-sub">Real atproto OAuth, straight to your own PDS — SkeetIn never sees your password.
          This unlocks your real My Feed (Connections' updates), and lets you actually Start a post and Endorse —
          genuine writes to your own repo. SkeetIn still can't follow, repost, or DM for you.</div>
        <input id="loginHandle" type="text" placeholder="yourhandle.bsky.social" autocomplete="off" />
        <div class="modal-actions">
          <button type="button" class="pill-btn" id="loginCancel">Cancel</button>
          <button type="button" class="pill-btn primary" id="loginGo">Continue</button>
        </div>
        <div class="modal-status" id="loginStatus"></div>
      </div>`;
    document.body.appendChild(box);
    const input = document.getElementById("loginHandle");
    input.focus();
    if (window.attachHandleTypeahead) window.attachHandleTypeahead(input);
    box.addEventListener("click", (e) => { if (e.target === box) closeLoginModal(); });
    document.getElementById("loginModalClose").onclick = closeLoginModal;
    document.getElementById("loginCancel").onclick = closeLoginModal;
    const go = document.getElementById("loginGo");
    const status = document.getElementById("loginStatus");
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
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }
  function closeLoginModal() {
    document.getElementById("loginModal")?.remove();
  }

  async function logout() {
    const { clearSession } = await oauth();
    await clearSession();
    session = null;
    sessionProfile = null;
    likedPosts.clear();
    renderMeNav();
    renderSessionStrip();
    toast("Signed out");
    if (!currentActor) {
      feedTab = "discover";
      renderFeedTabs();
      loadActiveFeed(true);
    }
  }

  // ---------- compose modal (real app.bsky.feed.post) ----------
  function openComposeModal() {
    if (!session) {
      openLoginModal();
      return;
    }
    if (document.getElementById("composeModal")) return;
    const box = document.createElement("div");
    box.id = "composeModal";
    box.className = "modal-veil";
    box.innerHTML = `
      <div class="modal-box">
        <button class="modal-close" id="composeModalClose" aria-label="Close">&times;</button>
        <h2>Start a post</h2>
        <div class="modal-sub">Posting as @${esc(session.handle)} — a real app.bsky.feed.post, written straight to your own repo.</div>
        <textarea id="composeText" maxlength="300" placeholder="What do you want to talk about?" autocomplete="off"></textarea>
        <div class="modal-char-count" id="composeChars">300</div>
        <div class="modal-actions">
          <button type="button" class="pill-btn" id="composeCancel">Cancel</button>
          <button type="button" class="pill-btn primary" id="composeGo">Post</button>
        </div>
        <div class="modal-status" id="composeStatus"></div>
      </div>`;
    document.body.appendChild(box);
    const input = document.getElementById("composeText");
    const chars = document.getElementById("composeChars");
    input.focus();
    input.addEventListener("input", () => { chars.textContent = String(300 - input.value.length); });
    box.addEventListener("click", (e) => { if (e.target === box) closeComposeModal(); });
    document.getElementById("composeModalClose").onclick = closeComposeModal;
    document.getElementById("composeCancel").onclick = closeComposeModal;
    const go = document.getElementById("composeGo");
    const status = document.getElementById("composeStatus");
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
        toast("Posted to your Skeeting Career 🎉");
        if (!currentActor && feedTab === "timeline") loadActiveFeed(true);
      } catch (e) {
        status.textContent = e.message || String(e);
        go.disabled = false;
      }
    };
    go.onclick = submit;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); });
  }
  function closeComposeModal() {
    document.getElementById("composeModal")?.remove();
  }

  function renderMeNav() {
    if (session) {
      const avatar = (sessionProfile && sessionProfile.avatar) || "";
      els.meAvatar.src = avatar;
      els.composerAvatar.src = avatar;
      els.meNav.title = `Signed in as @${session.handle} — view your profile`;
    } else {
      els.meAvatar.src = "";
      els.composerAvatar.src = "";
      els.meNav.title = "Sign in with your real Bluesky account";
    }
  }

  function renderSessionStrip() {
    if (!els.sessionStrip) return;
    if (session) {
      els.sessionStrip.style.display = "flex";
      els.sessionStrip.innerHTML =
        `🟢 Signed in as <b>@${esc(session.handle)}</b> — posts and Endorsements are real.
         <button type="button" id="signOutBtn">Sign out</button>`;
      document.getElementById("signOutBtn").addEventListener("click", logout);
    } else {
      els.sessionStrip.style.display = "none";
      els.sessionStrip.innerHTML = "";
    }
  }

  // ---------- feed tabs (My Feed / What's Hot) ----------
  let feedTab = "discover"; // "timeline" | "discover" — meaningful only when no profile is loaded

  function renderFeedTabs() {
    if (!els.feedTabs) return;
    if (currentActor) {
      els.feedTabs.style.display = "none";
      els.feedTabs.innerHTML = "";
      return;
    }
    els.feedTabs.style.display = "flex";
    els.feedTabs.innerHTML = `
      <div class="feed-tab${feedTab === "timeline" ? " active" : ""}" data-tab="timeline">🏠 My Feed</div>
      <div class="feed-tab${feedTab === "discover" ? " active" : ""}" data-tab="discover">🔥 What's Hot</div>`;
    [...els.feedTabs.querySelectorAll(".feed-tab")].forEach((t) => {
      t.addEventListener("click", () => {
        const tab = t.getAttribute("data-tab");
        if (tab === feedTab) return;
        if (tab === "timeline" && !session) {
          openLoginModal();
          return;
        }
        feedTab = tab;
        renderFeedTabs();
        loadActiveFeed(true);
      });
    });
  }

  async function loadActiveFeed(replace) {
    if (feedTab === "timeline") await loadTimeline(replace);
    else await loadWhatsHot(replace);
  }

  // Real getTimeline for a logged-in visitor — proxied through their own PDS to
  // the AppView (the DPoP-bound session lib/oauth.js sets up), so My Feed
  // reflects their actual Connections (follows), not the public What's Hot feed.
  async function loadTimeline(replace) {
    if (!session) {
      feedTab = "discover";
      renderFeedTabs();
      return loadWhatsHot(replace);
    }
    if (replace) {
      els.feedRoot.innerHTML = "";
      currentCursor = null;
    }
    try {
      const { dpopFetch } = await oauth();
      const url = new URL(`${session.pdsUrl.replace(/\/$/, "")}/xrpc/app.bsky.feed.getTimeline`);
      url.searchParams.set("limit", "20");
      if (currentCursor) url.searchParams.set("cursor", currentCursor);
      const res = await dpopFetch(session, url.toString(), {
        headers: { accept: "application/json", "atproto-proxy": "did:web:api.bsky.app#bsky_appview" },
      });
      if (!res.ok) throw new Error(`getTimeline failed (${res.status})`);
      const data = await res.json();
      currentCursor = data.cursor || null;
      const old = els.feedRoot.querySelector(".loadmore");
      if (old) old.remove();
      if (!data.feed || !data.feed.length) {
        if (replace) els.feedRoot.innerHTML = `<div class="card empty-state"><h2>Nothing here yet</h2><p>Connect with people on Bluesky and their skeets will show up in My Feed.</p></div>`;
        return;
      }
      const wrap = document.createElement("div");
      wrap.innerHTML = data.feed.map((f) => renderPost(f.post)).join("");
      els.feedRoot.appendChild(wrap);
      updateNews(data.feed);
      if (currentCursor) renderMoreButton(async () => { await loadTimeline(false); });
    } catch (e) {
      if (replace) els.feedRoot.innerHTML = `<div class="card empty-state"><h2>Couldn't load My Feed</h2><p>${esc(e.message || String(e))}</p></div>`;
    }
  }

  // ---------- wiring ----------
  els.composerBtn.addEventListener("click", () => {
    if (!session) {
      openLoginModal();
      return;
    }
    openComposeModal();
  });
  els.meNav.addEventListener("click", () => {
    if (!session) {
      openLoginModal();
      return;
    }
    loadProfile(session.handle);
  });

  [...document.querySelectorAll(".chip")].forEach((chip) => {
    chip.addEventListener("click", () => loadProfile(chip.dataset.handle));
  });

  if (window.attachHandleTypeahead) {
    attachHandleTypeahead(els.search, { onSelect: (actor) => loadProfile(actor.handle) });
  }
  els.search.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && els.search.value.trim()) loadProfile(els.search.value);
  });

  // ---------- boot ----------
  // Complete an in-flight OAuth callback (if this load is the PDS redirecting
  // back with ?code&state), or restore a previously-logged-in session, before
  // the first render — so a returning signed-in visitor lands on their real
  // My Feed instead of flashing the logged-out What's Hot feed first.
  async function boot() {
    applyTopUiState();
    refreshCorvidNavCount();

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
    if (session) {
      try {
        sessionProfile = await xrpc("app.bsky.actor.getProfile", { actor: session.did });
      } catch (_) {
        sessionProfile = null;
      }
    }
    renderMeNav();
    renderSessionStrip();
    if (freshLogin) toast(`Signed in as @${freshLogin.handle}`);
    if (bootError) toast(bootError);

    const path = location.pathname.match(/^\/s\/([^/]+)\/?$/);
    const qs = new URLSearchParams(location.search);
    const handle = path ? path[1] : qs.get("u");
    if (handle) {
      loadProfile(handle);
    } else {
      feedTab = session ? "timeline" : "discover";
      renderFeedTabs();
      els.feedRoot.innerHTML = "";
      loadActiveFeed(true);
      renderSuggestions(null, WHATS_HOT_DID);
    }
  }
  boot();
})();
