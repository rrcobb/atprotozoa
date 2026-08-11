"use strict";

// ============================================================
// honkfeed — a clown-themed rss reader.
// Everything lives in localStorage; the only server involvement is
// /api/fetch, a same-origin proxy that fetches feed XML server-side
// (browsers can't fetch most feed URLs directly, no CORS headers).
// ============================================================

const STORE_KEY = "honkfeed:v1";
const MAX_ITEMS_PER_FEED = 300;

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ---------------- store ----------------

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { feeds: [], read: {}, items: {} };
    const parsed = JSON.parse(raw);
    return {
      feeds: Array.isArray(parsed.feeds) ? parsed.feeds : [],
      read: parsed.read && typeof parsed.read === "object" ? parsed.read : {},
      items: parsed.items && typeof parsed.items === "object" ? parsed.items : {},
    };
  } catch {
    return { feeds: [], read: {}, items: {} };
  }
}

let store = loadStore();
let saveQueued = false;

function save() {
  if (saveQueued) return;
  saveQueued = true;
  queueMicrotask(() => {
    saveQueued = false;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      toast("couldn't save — your browser storage might be full 🎪");
    }
  });
}

// ---------------- feed xml parsing (rss 2.0 + atom, best-effort rdf) ----------------

function localName(tagName) {
  const i = tagName.indexOf(":");
  return (i === -1 ? tagName : tagName.slice(i + 1)).toLowerCase();
}

function children(el, tag) {
  if (!el) return [];
  return Array.from(el.children).filter((c) => localName(c.tagName) === tag);
}

function child(el, tag) {
  return children(el, tag)[0] || null;
}

function text(el, tag) {
  const c = child(el, tag);
  return c ? c.textContent.trim() : "";
}

function atomLink(el) {
  const links = children(el, "link");
  if (!links.length) return "";
  const alt = links.find((l) => {
    const rel = l.getAttribute("rel");
    return !rel || rel === "alternate";
  });
  return (alt || links[0]).getAttribute("href") || "";
}

function parseFeedXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("that didn't parse as xml — is this really a feed url?");
  }
  const root = doc.documentElement;
  if (!root) throw new Error("empty document");
  const rootName = localName(root.tagName);

  if (rootName === "feed") return parseAtom(root);
  const channel = child(root, "channel");
  if (channel) return parseRss(channel);
  // best-effort RDF (RSS 1.0): <rdf:RDF><channel/><item/>...</rdf:RDF>
  if (rootName === "rdf") {
    const rdfChannel = child(root, "channel");
    const items = children(root, "item").map(parseRssItem);
    return {
      title: rdfChannel ? text(rdfChannel, "title") : "untitled feed",
      link: rdfChannel ? text(rdfChannel, "link") : "",
      items,
    };
  }
  throw new Error("unrecognized feed format (not rss or atom)");
}

function parseRssItem(item) {
  const guid = text(item, "guid") || text(item, "link");
  const encoded = child(item, "encoded"); // content:encoded
  const contentHtml = encoded ? encoded.textContent : text(item, "description");
  return {
    title: text(item, "title") || "(untitled)",
    link: text(item, "link"),
    guid,
    pubDate: text(item, "pubdate") || text(item, "date") || text(item, "updated"),
    summary: text(item, "description"),
    contentHtml,
  };
}

function parseRss(channel) {
  return {
    title: text(channel, "title") || "untitled feed",
    link: text(channel, "link"),
    items: children(channel, "item").map(parseRssItem),
  };
}

function parseAtomEntry(entry) {
  const contentEl = child(entry, "content");
  const summaryEl = child(entry, "summary");
  const id = text(entry, "id") || atomLink(entry);
  return {
    title: text(entry, "title") || "(untitled)",
    link: atomLink(entry),
    guid: id,
    pubDate: text(entry, "published") || text(entry, "updated"),
    summary: summaryEl ? summaryEl.textContent.trim() : "",
    contentHtml: contentEl ? contentEl.textContent : summaryEl ? summaryEl.textContent : "",
  };
}

function parseAtom(feedEl) {
  return {
    title: text(feedEl, "title") || "untitled feed",
    link: atomLink(feedEl),
    items: children(feedEl, "entry").map(parseAtomEntry),
  };
}

// ---------------- html sanitizer ----------------
// Feed content is untrusted remote HTML. We parse it with DOMParser (inert,
// scripts never execute), strip anything not on the allowlist, then move the
// surviving nodes (not a re-parsed string) into the live DOM.

const ALLOWED_TAGS = new Set([
  "A", "P", "B", "STRONG", "I", "EM", "U", "S", "DEL", "MARK", "SMALL",
  "SUB", "SUP", "UL", "OL", "LI", "BLOCKQUOTE", "CODE", "PRE",
  "H1", "H2", "H3", "H4", "H5", "H6", "BR", "HR", "SPAN", "DIV",
  "IMG", "FIGURE", "FIGCAPTION", "TABLE", "THEAD", "TBODY", "TFOOT",
  "TR", "TD", "TH", "DL", "DT", "DD",
]);
const ALLOWED_ATTRS = { A: ["href"], IMG: ["src", "alt"] };

function cleanNode(el) {
  for (const child of Array.from(el.children)) {
    if (!ALLOWED_TAGS.has(child.tagName)) {
      child.remove();
      continue;
    }
    const allowed = ALLOWED_ATTRS[child.tagName] || [];
    for (const attr of Array.from(child.attributes)) {
      if (!allowed.includes(attr.name.toLowerCase())) child.removeAttribute(attr.name);
    }
    if (child.tagName === "A") {
      const href = child.getAttribute("href") || "";
      if (!/^https?:|^mailto:/i.test(href)) child.removeAttribute("href");
      child.setAttribute("target", "_blank");
      child.setAttribute("rel", "noopener noreferrer nofollow");
    }
    if (child.tagName === "IMG") {
      const src = child.getAttribute("src") || "";
      if (!/^https?:|^data:image\//i.test(src)) {
        child.remove();
        continue;
      }
      child.setAttribute("loading", "lazy");
    }
    cleanNode(child);
  }
}

function renderSanitized(container, html) {
  container.textContent = "";
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  cleanNode(doc.body);
  while (doc.body.firstChild) container.appendChild(doc.body.firstChild);
}

function plainSnippet(html, maxLen) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const s = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
}

// ---------------- fetching ----------------

async function fetchFeed(url) {
  const res = await fetch("/api/fetch?url=" + encodeURIComponent(url));
  if (!res.ok) {
    let msg = "feed server said no (" + res.status + ")";
    try {
      const body = await res.json();
      if (body && body.error) msg = body.error;
    } catch {
      /* not json, keep default message */
    }
    throw new Error(msg);
  }
  const xmlText = await res.text();
  return parseFeedXml(xmlText);
}

function itemId(feedId, parsed) {
  const key = parsed.guid || parsed.link || hashStr(parsed.title + "|" + parsed.pubDate);
  return feedId + "::" + hashStr(key);
}

async function refreshFeed(feed) {
  try {
    const parsed = await fetchFeed(feed.url);
    if (!feed.name && parsed.title) feed.title = parsed.title;
    else feed.title = feed.title || parsed.title || feed.url;

    const existing = store.items[feed.id] || [];
    const byId = new Map(existing.map((i) => [i.id, i]));
    for (const raw of parsed.items) {
      const id = itemId(feed.id, raw);
      byId.set(id, {
        id,
        feedId: feed.id,
        title: raw.title,
        link: raw.link,
        pubDate: raw.pubDate || "",
        pubTime: raw.pubDate ? Date.parse(raw.pubDate) || 0 : 0,
        summary: raw.summary,
        contentHtml: raw.contentHtml,
      });
    }
    const merged = Array.from(byId.values())
      .sort((a, b) => b.pubTime - a.pubTime)
      .slice(0, MAX_ITEMS_PER_FEED);
    store.items[feed.id] = merged;

    feed.error = null;
    feed.lastFetchedAt = Date.now();
    return { ok: true, newCount: parsed.items.length };
  } catch (e) {
    feed.error = e.message || String(e);
    return { ok: false, error: feed.error };
  } finally {
    save();
  }
}

// ---------------- feed CRUD ----------------

function normalizeUrl(url) {
  return url.trim();
}

function findFeedByUrl(url) {
  const n = normalizeUrl(url);
  return store.feeds.find((f) => f.url === n);
}

async function addFeed(url, name) {
  const n = normalizeUrl(url);
  if (findFeedByUrl(n)) throw new Error("that feed's already in the troupe");
  const feed = {
    id: uid(),
    url: n,
    name: name ? name.trim() : "",
    title: name ? name.trim() : n,
    addedAt: Date.now(),
    lastFetchedAt: null,
    error: null,
  };
  store.feeds.push(feed);
  store.items[feed.id] = [];
  save();
  const result = await refreshFeed(feed);
  save();
  render();
  return { feed, result };
}

function editFeed(id, { url, name }) {
  const feed = store.feeds.find((f) => f.id === id);
  if (!feed) return;
  let urlChanged = false;
  if (typeof url === "string" && url.trim() && url.trim() !== feed.url) {
    feed.url = normalizeUrl(url);
    urlChanged = true;
  }
  if (typeof name === "string") {
    feed.name = name.trim();
    if (feed.name) feed.title = feed.name;
  }
  save();
  if (urlChanged) {
    refreshFeed(feed).then(() => {
      save();
      render();
    });
  }
  render();
}

function deleteFeed(id) {
  store.feeds = store.feeds.filter((f) => f.id !== id);
  const items = store.items[id] || [];
  for (const item of items) delete store.read[item.id];
  delete store.items[id];
  if (state.activeFeedId === id) state.activeFeedId = null;
  save();
  render();
}

// ---------------- opml / json import-export ----------------

function exportOpml() {
  const esc = (s) =>
    String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const outlines = store.feeds
    .map(
      (f) =>
        `    <outline type="rss" text="${esc(f.title || f.url)}" title="${esc(f.title || f.url)}" xmlUrl="${esc(f.url)}"/>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>honkfeed export</title>
  </head>
  <body>
${outlines}
  </body>
</opml>
`;
}

function exportJson() {
  return JSON.stringify(
    {
      honkfeed: 1,
      exportedAt: new Date().toISOString(),
      feeds: store.feeds.map((f) => ({ url: f.url, title: f.title, name: f.name })),
    },
    null,
    2
  );
}

function downloadFile(filename, contents, mime) {
  const blob = new Blob([contents], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function extractOpmlOutlines(doc) {
  const outlines = Array.from(doc.getElementsByTagName("outline"));
  return outlines
    .filter((o) => o.getAttribute("xmlUrl"))
    .map((o) => ({
      url: o.getAttribute("xmlUrl"),
      title: o.getAttribute("title") || o.getAttribute("text") || "",
    }));
}

async function importFromFile(file) {
  const text = await file.text();
  const isJson = /\.json$/i.test(file.name) || text.trim().startsWith("{");
  let candidates = [];

  if (isJson) {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.feeds || [];
      candidates = list
        .filter((f) => f && f.url)
        .map((f) => ({ url: f.url, title: f.title || f.name || "" }));
    } catch {
      throw new Error("that json didn't parse — expected a honkfeed export or a list of feeds");
    }
  } else {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("that opml file didn't parse as xml");
    candidates = extractOpmlOutlines(doc);
  }

  if (!candidates.length) throw new Error("no feed urls found in that file");

  let added = 0;
  let skipped = 0;
  for (const c of candidates) {
    if (findFeedByUrl(c.url)) {
      skipped++;
      continue;
    }
    try {
      await addFeed(c.url, c.title);
      added++;
    } catch {
      skipped++;
    }
  }
  return { added, skipped, total: candidates.length };
}

// ---------------- ui state ----------------

const state = {
  activeFeedId: null, // null = "every ring" (all feeds)
  activeItemId: null,
  editingFeedId: null,
};

const els = {};
function cacheEls() {
  const ids = [
    "feed-list", "feed-empty", "article-list", "article-empty", "loading-state",
    "stage-title", "stage-count", "reader", "reader-body", "reader-close",
    "honk-all-btn", "add-feed-btn", "import-btn", "import-file", "export-btn",
    "mark-all-read-btn", "feed-modal", "feed-form", "feed-modal-title",
    "feed-modal-close", "feed-url-input", "feed-name-input", "feed-form-error",
    "feed-form-submit", "toast",
  ];
  for (const id of ids) els[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(id);
}

let toastTimer = null;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

function fmtDate(pubTimeOrDateStr) {
  const t = typeof pubTimeOrDateStr === "number" ? pubTimeOrDateStr : Date.parse(pubTimeOrDateStr);
  if (!t) return "";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function allItemsSorted() {
  const feedIds = state.activeFeedId ? [state.activeFeedId] : store.feeds.map((f) => f.id);
  const out = [];
  for (const fid of feedIds) out.push(...(store.items[fid] || []));
  out.sort((a, b) => b.pubTime - a.pubTime);
  return out;
}

function unreadCount(feedId) {
  const items = store.items[feedId] || [];
  return items.reduce((n, it) => n + (store.read[it.id] ? 0 : 1), 0);
}

// ---------------- rendering ----------------

function render() {
  renderFeedList();
  renderArticleList();
}

function renderFeedList() {
  const list = els.feedList;
  list.textContent = "";
  els.feedEmpty.hidden = store.feeds.length > 0;

  const allRow = document.createElement("li");
  allRow.className = "feed-row" + (state.activeFeedId === null ? " active" : "");
  allRow.innerHTML = `<span class="nose-dot">🎪</span><span class="feed-name">every ring</span>`;
  allRow.addEventListener("click", () => {
    state.activeFeedId = null;
    render();
  });
  list.appendChild(allRow);

  for (const feed of store.feeds) {
    const row = document.createElement("li");
    row.className = "feed-row" + (state.activeFeedId === feed.id ? " active" : "") + (feed.error ? " errored" : "");
    const unread = unreadCount(feed.id);
    row.innerHTML = `
      <span class="nose-dot" title="${feed.error ? "this feed is honking an error" : "healthy"}">${feed.error ? "😵" : "🤡"}</span>
      <span class="feed-name">${escapeHtml(feed.title || feed.url)}</span>
      ${unread ? `<span class="unread-badge">${unread}</span>` : ""}
      <span class="feed-actions">
        <button data-act="edit" title="edit">✏️</button>
        <button data-act="delete" title="delete">🗑️</button>
      </span>
    `;
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-act]")) return;
      state.activeFeedId = feed.id;
      render();
    });
    row.querySelector('[data-act="edit"]').addEventListener("click", (e) => {
      e.stopPropagation();
      openFeedModal(feed.id);
    });
    row.querySelector('[data-act="delete"]').addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`fire "${feed.title || feed.url}" from the troupe?`)) deleteFeed(feed.id);
    });
    list.appendChild(row);
  }
}

function renderArticleList() {
  const items = allItemsSorted();
  els.articleList.textContent = "";
  els.articleEmpty.hidden = items.length > 0 || store.feeds.length === 0;
  els.stageTitle.textContent = state.activeFeedId
    ? (store.feeds.find((f) => f.id === state.activeFeedId) || {}).title || "this ring"
    : "every ring";
  els.stageCount.textContent = items.length ? `${items.length} act${items.length === 1 ? "" : "s"}` : "";

  for (const item of items) {
    const feed = store.feeds.find((f) => f.id === item.feedId);
    const card = document.createElement("article");
    card.className = "article-card" + (store.read[item.id] ? "" : " unread");
    card.innerHTML = `
      <p class="article-title">${escapeHtml(item.title)}</p>
      <p class="article-meta"><span>${escapeHtml(feed ? feed.title : "")}</span><span>${fmtDate(item.pubTime)}</span></p>
      <p class="article-snippet">${escapeHtml(plainSnippet(item.contentHtml || item.summary, 180))}</p>
    `;
    card.addEventListener("click", () => openReader(item.id));
    els.articleList.appendChild(card);
  }
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function openReader(id) {
  const feed = store.feeds.find((f) => (store.items[f.id] || []).some((i) => i.id === id));
  const item = feed ? (store.items[feed.id] || []).find((i) => i.id === id) : null;
  if (!item) return;
  store.read[id] = true;
  save();
  state.activeItemId = id;

  els.readerBody.innerHTML = `
    <h1></h1>
    <div class="reader-meta"><span class="reader-feed"></span><span class="reader-date"></span></div>
    <div class="reader-content"></div>
  `;
  els.readerBody.querySelector("h1").textContent = item.title;
  els.readerBody.querySelector(".reader-feed").textContent = feed ? feed.title : "";
  els.readerBody.querySelector(".reader-date").textContent = fmtDate(item.pubTime);
  renderSanitized(els.readerBody.querySelector(".reader-content"), item.contentHtml || item.summary || "(no content)");
  if (item.link) {
    const a = document.createElement("a");
    a.className = "reader-original-link";
    a.href = item.link;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "🎟 read the original";
    els.readerBody.appendChild(a);
  }

  els.reader.hidden = false;
  renderArticleList(); // to flip the unread flag on the card
  renderFeedList(); // to update the unread badge
}

function closeReader() {
  els.reader.hidden = true;
  state.activeItemId = null;
}

// ---------------- feed modal ----------------

function openFeedModal(feedId) {
  state.editingFeedId = feedId || null;
  const feed = feedId ? store.feeds.find((f) => f.id === feedId) : null;
  els.feedModalTitle.textContent = feed ? "✂️ retrain this feed" : "🎪 recruit a feed";
  els.feedFormSubmit.textContent = feed ? "save changes" : "add to the troupe";
  els.feedUrlInput.value = feed ? feed.url : "";
  els.feedNameInput.value = feed ? feed.name : "";
  els.feedFormError.hidden = true;
  els.feedModal.hidden = false;
  els.feedUrlInput.focus();
}

function closeFeedModal() {
  els.feedModal.hidden = true;
  state.editingFeedId = null;
}

async function handleFeedFormSubmit(e) {
  e.preventDefault();
  const url = els.feedUrlInput.value.trim();
  const name = els.feedNameInput.value.trim();
  els.feedFormError.hidden = true;
  els.feedFormSubmit.disabled = true;
  els.feedFormSubmit.textContent = "juggling…";
  try {
    if (state.editingFeedId) {
      editFeed(state.editingFeedId, { url, name });
      toast("updated 🎭");
    } else {
      const { result } = await addFeed(url, name);
      toast(result.ok ? "recruited! 🎪" : `added, but this feed's a bit shy: ${result.error}`);
    }
    closeFeedModal();
  } catch (err) {
    els.feedFormError.textContent = err.message || String(err);
    els.feedFormError.hidden = false;
  } finally {
    els.feedFormSubmit.disabled = false;
  }
}

// ---------------- honk all / mark all read ----------------

async function honkAll() {
  if (!store.feeds.length) {
    toast("recruit a feed first 🎪");
    return;
  }
  els.honkAllBtn.classList.add("honking");
  els.loadingState.hidden = false;
  let ok = 0;
  let failed = 0;
  await Promise.all(
    store.feeds.map(async (feed) => {
      const res = await refreshFeed(feed);
      if (res.ok) ok++;
      else failed++;
    })
  );
  save();
  render();
  els.loadingState.hidden = true;
  setTimeout(() => els.honkAllBtn.classList.remove("honking"), 400);
  toast(failed ? `honked ${ok} feed${ok === 1 ? "" : "s"}, ${failed} didn't honk back 😵` : `honked all ${ok} feeds! 📯`);
}

function markAllRead() {
  const items = allItemsSorted();
  if (!items.length) return;
  for (const item of items) store.read[item.id] = true;
  save();
  render();
  toast("shh, the whole tent is asleep now 🙈");
}

// ---------------- wiring ----------------

function wire() {
  els.honkAllBtn.addEventListener("click", honkAll);
  els.addFeedBtn.addEventListener("click", () => openFeedModal(null));
  els.markAllReadBtn.addEventListener("click", markAllRead);

  els.feedModalClose.addEventListener("click", closeFeedModal);
  els.feedModal.addEventListener("click", (e) => {
    if (e.target === els.feedModal) closeFeedModal();
  });
  els.feedForm.addEventListener("submit", handleFeedFormSubmit);

  els.readerClose.addEventListener("click", closeReader);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!els.reader.hidden) closeReader();
    else if (!els.feedModal.hidden) closeFeedModal();
  });

  els.exportBtn.addEventListener("click", () => {
    if (!store.feeds.length) {
      toast("nothing to export yet 🎪");
      return;
    }
    downloadFile("honkfeed-feeds.opml", exportOpml(), "text/x-opml");
    setTimeout(() => downloadFile("honkfeed-feeds.json", exportJson(), "application/json"), 300);
    toast("packed up the tent — opml + json downloaded 🎁");
  });

  els.importBtn.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", async () => {
    const file = els.importFile.files[0];
    els.importFile.value = "";
    if (!file) return;
    try {
      toast("unpacking the crate…");
      const { added, skipped } = await importFromFile(file);
      render();
      toast(`recruited ${added} feed${added === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""} 🎩`);
    } catch (err) {
      toast(err.message || "couldn't import that file");
    }
  });
}

// ---------------- boot ----------------

function boot() {
  cacheEls();
  wire();
  render();
  if (store.feeds.length) {
    honkAll();
  }
}

document.addEventListener("DOMContentLoaded", boot);
