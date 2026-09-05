import { buildCluster } from "./lib/cluster.js";
import { scanPhrase, postUrl } from "./lib/search.js";

const BATCH_PAGES = 20; // ~2000 posts per "scan further back" click — a batch
// size for UX pacing, not a ceiling: the button keeps the cursor alive and
// there's no cap on how many times it can be pressed.

const els = {
  form: document.getElementById("searchForm"),
  handle: document.getElementById("handle"),
  query: document.getElementById("query"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  results: document.getElementById("results"),
  more: document.getElementById("more"),
  useRef: document.getElementById("useRef"),
  shareLink: document.getElementById("shareLink"),
};

els.useRef.addEventListener("click", () => {
  els.handle.value = "norvid-studies.bsky.social";
  els.handle.focus();
});

let session = null; // { allowed: Set<did>, badge: Map<did,'core'|'adjacent'>, cursor, query, matched }

function setStatus(text, isErr = false) {
  els.status.textContent = text;
  els.status.classList.toggle("err", isErr);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function highlight(text, query) {
  const safe = esc(text);
  const terms = query.trim().split(/\s+/).filter(Boolean).map(esc);
  if (!terms.length) return safe;
  const re = new RegExp(`(${terms.join("|")})`, "ig");
  return safe.replace(re, "<mark>$1</mark>");
}

function timeAgo(iso) {
  const d = new Date(iso).getTime();
  if (!d) return "";
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function renderPost(p, badge, query) {
  const a = p.author || {};
  const div = document.createElement("div");
  div.className = "post";
  div.innerHTML = `
    <img class="avatar" src="${esc(a.avatar || "")}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
    <div class="body">
      <div class="who">
        <a href="https://bsky.app/profile/${esc(a.handle || a.did)}" target="_blank" rel="noopener">${esc(a.displayName || a.handle || "")}</a>
        <span class="handle">@${esc(a.handle || "")}</span>
        <span class="badge ${badge}">${badge}</span>
      </div>
      <div class="text">${highlight(p.text, query)}</div>
      <div class="meta">
        <span>${timeAgo(p.createdAt)}</span>
        <span>♥ ${p.likeCount}</span>
        <span>↻ ${p.repostCount}</span>
        <a href="${postUrl(p.uri)}" target="_blank" rel="noopener">open on bsky ↗</a>
      </div>
    </div>
  `;
  return div;
}

function updateShareLink() {
  if (!session || session.matched === 0) {
    els.shareLink.hidden = true;
    return;
  }
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set("handle", session.handleText);
  url.searchParams.set("q", session.query);
  url.searchParams.set("scope", session.scope);
  const text =
    `searched @${session.handleText}'s simcluster for "${session.query}" ` +
    `and found ${session.matched} post(s) from people they actually know. ` +
    `try it: ${url.toString()}`;
  els.shareLink.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  els.shareLink.hidden = false;
}

async function runScan() {
  const { posts, cursor, exhausted } = await scanPhrase(session.query, {
    cursor: session.cursor,
    maxPages: BATCH_PAGES,
    onPage: (info) => {
      for (const p of info.newPosts) {
        const did = p.author && p.author.did;
        if (!did || !session.allowed.has(did)) continue;
        session.matched++;
        els.results.appendChild(renderPost(p, session.badge.get(did), session.query));
      }
      setStatus(
        `scanned ${info.scanned} bluesky-wide posts (page ${info.page})… ` +
        `${session.matched} match your simcluster so far`,
      );
      updateShareLink();
    },
  });
  session.cursor = cursor;
  session.exhausted = exhausted;

  if (session.matched === 0) {
    setStatus(
      exhausted
        ? `scanned everything searchPosts has for "${session.query}" — none of it came from your simcluster.`
        : `no matches in this batch — try "scan further back", or a different phrase.`,
    );
  } else {
    setStatus(`${session.matched} post(s) from your simcluster match "${session.query}".`);
  }
  els.more.hidden = exhausted;
}

async function startSearch(handleText, query, scope) {
  els.go.disabled = true;
  els.results.innerHTML = "";
  els.more.hidden = true;
  els.shareLink.hidden = true;
  setStatus("resolving @" + handleText.replace(/^@/, "") + "…");

  let cluster;
  try {
    cluster = await buildCluster(handleText, { onStep: setStatus });
  } catch (e) {
    setStatus(`couldn't crawl that handle's graph: ${e.message}`, true);
    els.go.disabled = false;
    return;
  }

  const badge = new Map();
  for (const p of cluster.core) badge.set(p.did, "core");
  if (scope === "all") for (const p of cluster.adjacent) if (!badge.has(p.did)) badge.set(p.did, "adjacent");

  const allowed = new Set(badge.keys());
  if (allowed.size === 0) {
    setStatus("no mutuals found for that handle — nothing to search within.", true);
    els.go.disabled = false;
    return;
  }

  session = {
    allowed,
    badge,
    cursor: "",
    exhausted: false,
    query,
    scope,
    handleText: cluster.handle,
    matched: 0,
  };

  const scopeLabel = scope === "all"
    ? `${cluster.counts.core} core + ${cluster.counts.adjacent} adjacent = ${allowed.size} accounts`
    : `${cluster.counts.core} core accounts (mutuals)`;
  setStatus(`crawled the graph — ${scopeLabel}. searching for "${query}"…`);

  try {
    await runScan();
  } catch (e) {
    setStatus(`search failed: ${e.message}`, true);
  } finally {
    els.go.disabled = false;
  }
}

els.form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const handleText = els.handle.value.trim();
  const query = els.query.value.trim();
  const scope = document.querySelector('input[name="scope"]:checked').value;
  if (!handleText || !query) {
    setStatus("need both a handle and something to search for.", true);
    return;
  }
  startSearch(handleText, query, scope);
});

els.more.addEventListener("click", async () => {
  els.more.disabled = true;
  try {
    await runScan();
  } catch (e) {
    setStatus(`search failed: ${e.message}`, true);
  } finally {
    els.more.disabled = false;
  }
});

// Deep-link: ?handle=&q=&scope= prefills and auto-runs, so a shared search
// link actually reproduces the search instead of landing on a blank form.
(function prefillFromUrl() {
  const p = new URLSearchParams(location.search);
  const handleText = p.get("handle");
  const query = p.get("q");
  const scope = p.get("scope") === "all" ? "all" : "core";
  if (handleText) els.handle.value = handleText;
  if (query) els.query.value = query;
  if (scope === "all") {
    document.querySelector('input[name="scope"][value="all"]').checked = true;
  }
  if (handleText && query) startSearch(handleText, query, scope);
})();
