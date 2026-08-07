// SkeetIn — Bluesky's public AppView, reskinned as a LinkedIn feed. No auth,
// no writes: every fetch below hits the public read-only AppView mirror, so
// nothing a visitor clicks here posts, follows, or likes anything for real.
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
    toast: document.getElementById("toast"),
  };

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
        <span class="rcount" onclick='${openBsky}'>${fmt(post.likeCount)}</span>
      </div>
      <div class="post-actions">
        <button onclick='${openBsky}'>${REACT_ICONS.like} Like</button>
        <button onclick='${openBsky}'>${REACT_ICONS.comment} Comment${post.replyCount ? " · " + fmt(post.replyCount) : ""}</button>
        <button onclick='${openBsky}'>${REACT_ICONS.repost} Repost${post.repostCount ? " · " + fmt(post.repostCount) : ""}</button>
        <button onclick='${openBsky}'>${REACT_ICONS.send} Send</button>
      </div>
    </div>`;
  }

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
      els.composerAvatar.src = profile.avatar || "";
      els.meAvatar.src = profile.avatar || "";

      await loadAuthorFeed(did, true);
      renderSuggestions(did);
    } catch (err) {
      toast("Couldn't find @" + handle + " — check the spelling?");
    }
  }

  // ---------- wiring ----------
  els.composerBtn.addEventListener("click", () => {
    toast("SkeetIn is read-only — draft your actual post on Bluesky ↗");
    window.open("https://bsky.app/intent/compose", "_blank", "noopener");
  });
  els.meNav.addEventListener("click", () => toast("You don't have a SkeetIn account. Nobody does. This isn't real."));

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
  function boot() {
    const path = location.pathname.match(/^\/s\/([^/]+)\/?$/);
    const qs = new URLSearchParams(location.search);
    const handle = path ? path[1] : qs.get("u");
    if (handle) {
      loadProfile(handle);
    } else {
      els.feedRoot.innerHTML = "";
      loadWhatsHot(true);
      renderSuggestions(null, WHATS_HOT_DID);
    }
  }
  boot();
})();
