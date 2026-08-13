// giftlinks front end — renders the browser-owned Jetstream/AppView index and
// filters the current tab's rolling list client-side.
import { GiftIndex } from "./gift-index.js";
const dot = document.getElementById("dot");
const statusText = document.getElementById("statusText");
const trackingText = document.getElementById("trackingText");
const empty = document.getElementById("empty");
const cardsEl = document.getElementById("cards");
const countLine = document.getElementById("countLine");
const shareLink = document.getElementById("shareLink");
const searchInput = document.getElementById("search");
const sourceFilter = document.getElementById("sourceFilter");

let lastData = null;
let sourcesRendered = false;

function esc(s) {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function timeAgo(ms) {
  if (!ms) return "";
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  const units = [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]];
  for (const [u, secs] of units) {
    const v = Math.floor(s / secs);
    if (v >= 1) return v + u + " ago";
  }
  return "just now";
}

function postUrl(handle, rkey) {
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

function cardHTML(a) {
  const thumb = a.thumb
    ? `<div class="thumb"><img src="${esc(a.thumb)}" alt="" referrerpolicy="no-referrer" loading="lazy" /></div>`
    : `<div class="thumb empty-thumb">no image</div>`;
  return `
    <li class="card">
      ${thumb}
      <div class="body">
        <span class="badge">${esc(a.sourceName)}</span>
        <p class="title"><a href="${esc(a.articleUrl)}" target="_blank" rel="noopener">${esc(a.title) || esc(a.articleUrl)}</a></p>
        ${a.description ? `<p class="desc">${esc(a.description)}</p>` : ""}
        <div class="hostname">${esc(a.hostname)}</div>
        <div class="meta">
          ${a.avatar ? `<img class="avatar" src="${esc(a.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy" />` : ""}
          <a class="who" href="https://bsky.app/profile/${esc(a.handle)}" target="_blank" rel="noopener">@${esc(a.handle)}</a>
          <span>${timeAgo(a.sharedAt)}</span>
          <a class="perma" href="${postUrl(a.handle, a.rkey)}" target="_blank" rel="noopener">post ↗</a>
        </div>
      </div>
    </li>`;
}

function populateSources(sources) {
  if (sourcesRendered || !sources || !sources.length) return;
  for (const s of sources) {
    const opt = document.createElement("option");
    opt.value = s.key;
    opt.textContent = s.name;
    sourceFilter.appendChild(opt);
  }
  sourcesRendered = true;
}

function matchesSearch(a, q) {
  if (!q) return true;
  const hay = `${a.title} ${a.description} ${a.handle} ${a.displayName} ${a.hostname}`.toLowerCase();
  return hay.includes(q);
}

function renderList() {
  if (!lastData) return;
  const q = searchInput.value.trim().toLowerCase();
  const srcKey = sourceFilter.value;
  const filtered = lastData.articles.filter(
    (a) => (!srcKey || a.sourceKey === srcKey) && matchesSearch(a, q),
  );

  countLine.textContent = filtered.length
    ? `showing ${filtered.length} of ${lastData.articles.length} link${lastData.articles.length === 1 ? "" : "s"} from the last ${lastData.windowHours || 24}h in this browser`
    : "";

  if (!filtered.length) {
    empty.style.display = "";
    empty.textContent = lastData.articles.length
      ? "No links match that search/filter."
      : "Nothing here yet. This tab only sees links shared after it connects, confirmed a few minutes after posting — check back shortly, or once someone shares a gift link.";
    cardsEl.innerHTML = "";
    return;
  }
  empty.style.display = "none";
  cardsEl.innerHTML = filtered.map(cardHTML).join("");
}

function render(data) {
  lastData = data;
  populateSources(data.sources);
  trackingText.textContent = `tracking ${data.count || 0} gift link${data.count === 1 ? "" : "s"}, last ${data.windowHours || 24}h in this browser`;
  renderList();
}

searchInput.addEventListener("input", renderList);
sourceFilter.addEventListener("change", renderList);

const giftIndex = new GiftIndex({
  onUpdate(data) {
    dot.classList.toggle("live", data.connected);
    statusText.textContent = data.connected
      ? data.processing
        ? "live · checking recent links…"
        : "live in this browser"
      : data.error || "firehose reconnecting…";
    render(data);
  },
});

giftIndex.start();
