// meadowfolio — glue script. Profile header + image gallery are live (public
// AppView, anonymous, via lib/feed.js — copied from sites/portfolio).
// Releases + curator picks are static, from ./data.js.

import { getProfile, createPortfolioPager, MAX_FEED_PAGES } from "./lib/feed.js";
import { HANDLE, DID, RELEASES, REQUESTS, PICKS } from "./data.js";

const $ = (sel) => document.querySelector(sel);

function permalink(rkey) {
  return `https://bsky.app/profile/${HANDLE}/post/${rkey}`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── profile header ──────────────────────────────────────────────────────
async function renderProfile() {
  try {
    const p = await getProfile(DID);
    $("#avatar").src = p.avatar || "";
    $("#avatar").alt = p.displayName;
    $("#displayName").textContent = p.displayName;
    $("#displayName").href = `https://bsky.app/profile/${p.handle}`;
    $("#handle").textContent = "@" + p.handle;
    $("#handle").href = `https://bsky.app/profile/${p.handle}`;
    $("#postsCount").textContent = p.postsCount.toLocaleString();
    if (p.description) $("#bio").textContent = p.description;
    $("#profile").classList.remove("loading");
  } catch {
    $("#profile").classList.add("err");
  }
}

// ── releases ─────────────────────────────────────────────────────────────
function renderReleases() {
  const el = $("#releases");
  el.innerHTML = RELEASES.map(
    (r) => `
      <a class="release" href="https://${esc(r.host)}" target="_blank" rel="noopener">
        <div class="release-title">${esc(r.title)}</div>
        <div class="release-host">${esc(r.host)}</div>
        <div class="release-blurb">${esc(r.blurb)}</div>
      </a>`,
  ).join("");
}

// ── requests: every buildthis site built for this account ─────────────────
function renderRequests() {
  const el = $("#requests");
  const count = $("#requestsCount");
  if (count) count.textContent = `(${REQUESTS.length})`;
  el.innerHTML = REQUESTS.map(
    (r) => `
      <a class="release" href="${esc(r.url)}" target="_blank" rel="noopener">
        <div class="release-title">${esc(r.title)}</div>
        <div class="release-host">${esc(r.name)}.bisks.net</div>
        <div class="release-blurb">${esc(r.blurb)}</div>
      </a>`,
  ).join("");
}

// ── dreamnet: every dreamnet.fromthewestmeadow.com link posted, live ───────
// Pages the same public AppView post history as the gallery (createPortfolioPager),
// but looks for posts whose embed is an external link card pointing at
// DREAMNET_HOST — that embed already carries Bluesky's own unfurled card data
// (title/description/thumb), which is exactly the "embed card" asked for.
// Stops paging once posts get older than DreamNet's own release date, since
// no dreamnet link could exist before the tool did.
const DREAMNET_HOST = "dreamnet.fromthewestmeadow.com";
const DREAMNET_LAUNCH =
  RELEASES.find((r) => r.host === DREAMNET_HOST)?.date || "2026-07-16";

function linkHost(uri) {
  try {
    return new URL(uri).host;
  } catch {
    return "";
  }
}

async function renderDreamnet() {
  const el = $("#dreamnet");
  const status = $("#dreamnetStatus");
  const seen = new Set();
  const cards = [];
  try {
    const pager = createPortfolioPager(DID, HANDLE);
    for (let i = 0; i < MAX_FEED_PAGES; i++) {
      const { posts, done } = await pager.next();
      let pastLaunch = false;
      for (const post of posts) {
        if (post.createdAt && post.createdAt < DREAMNET_LAUNCH) {
          pastLaunch = true;
          continue;
        }
        if (post.kind !== "link" || !post.link) continue;
        if (linkHost(post.link.uri) !== DREAMNET_HOST) continue;
        if (seen.has(post.link.uri)) continue;
        seen.add(post.link.uri);
        cards.push({ ...post.link, postUrl: post.url, date: post.createdAt });
      }
      if (done || pastLaunch) break;
    }
  } catch {
    if (status) status.textContent = "couldn't load DreamNet links right now — the AppView might be having a moment.";
    return;
  }
  if (!cards.length) {
    if (status) status.textContent = "no DreamNet links found (yet).";
    return;
  }
  cards.sort((a, b) => (a.date < b.date ? 1 : -1));
  if (status) status.remove();
  const count = $("#dreamnetCount");
  if (count) count.textContent = `(${cards.length})`;
  el.innerHTML = cards
    .map(
      (c) => `
      <a class="dreamnet-card" href="${esc(c.uri)}" target="_blank" rel="noopener">
        ${c.thumb ? `<img class="dreamnet-thumb" loading="lazy" src="${esc(c.thumb)}" alt=""/>` : ""}
        <div class="dreamnet-body">
          <div class="dreamnet-title">${esc(c.title)}</div>
          ${c.description ? `<div class="dreamnet-desc">${esc(c.description)}</div>` : ""}
          <div class="dreamnet-host">${esc(DREAMNET_HOST)}</div>
        </div>
      </a>`,
    )
    .join("");
}

// ── curator picks ────────────────────────────────────────────────────────
function renderPicks() {
  const el = $("#picks");
  el.innerHTML = PICKS.map((p) => {
    const img = p.image
      ? `<a class="pick-img" href="${permalink(p.rkey)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(p.image)}" alt=""/></a>`
      : "";
    return `
      <figure class="pick">
        ${img}
        <blockquote><a href="${permalink(p.rkey)}" target="_blank" rel="noopener">${esc(p.text)}</a></blockquote>
        <figcaption>
          <span class="pick-note">— buildthis: ${esc(p.note)}</span>
          <span class="pick-date">${esc(p.date)}</span>
        </figcaption>
      </figure>`;
  }).join("");
}

// ── gallery: live image sweep of the post history, paged in horizontally ───
// (newest on the left) and loaded further as you scroll toward the right —
// only the first few pages load up front, the rest streams in on demand.
const GALLERY_INITIAL_PAGES = 3;
let galleryPager = null;
let galleryLoading = false;
let galleryDone = false;
let galleryPostCount = 0;
let galleryImageCount = 0;

function appendImages(posts) {
  const grid = $("#gallery");
  const html = [];
  for (const post of posts) {
    if (post.kind !== "media") continue;
    for (const m of post.media) {
      if (m.video) continue; // gallery is stills; video posts stay out
      galleryImageCount++;
      html.push(`
        <a class="shot" href="${esc(post.url)}" target="_blank" rel="noopener" title="${esc(m.alt || "")}">
          <img loading="lazy" src="${esc(m.thumb)}" alt="${esc(m.alt || "")}"/>
        </a>`);
    }
  }
  if (html.length) grid.insertAdjacentHTML("beforeend", html.join(""));
  galleryPostCount += posts.length;
}

function updateGalleryStatus() {
  const status = $("#galleryStatus");
  const count = $("#galleryCount");
  count.textContent = galleryImageCount
    ? `${galleryImageCount} images, from ${galleryPostCount} posts read`
    : "";
  if (!status) return;
  if (galleryDone && galleryImageCount) {
    status.remove();
  } else if (galleryDone) {
    status.textContent = "no images found in the post history.";
  } else {
    status.textContent = galleryImageCount
      ? `${galleryImageCount} images so far — scroll right for more`
      : `fetching posts… (${galleryPostCount} so far)`;
  }
}

// Fetch one more page and fold it in. Returns true once the account's full
// history has been read (no more pages left).
async function loadMoreGallery() {
  if (galleryDone || galleryLoading || !galleryPager) return galleryDone;
  galleryLoading = true;
  const { posts, done } = await galleryPager.next();
  appendImages(posts);
  galleryDone = done;
  updateGalleryStatus();
  galleryLoading = false;
  return galleryDone;
}

async function renderGallery() {
  const status = $("#galleryStatus");
  try {
    galleryPager = createPortfolioPager(DID, HANDLE);
    for (let i = 0; i < GALLERY_INITIAL_PAGES && !galleryDone; i++) {
      await loadMoreGallery();
    }
    setupGalleryAutoLoad();
  } catch {
    if (status) status.textContent = "couldn't load the gallery right now — the AppView might be having a moment.";
  }
}

// Keep loading further pages while the gallery is scrolled near its right
// (older) edge, so the strip effectively grows as you get to the end of it.
function setupGalleryAutoLoad() {
  const gallery = $("#gallery");
  gallery.addEventListener("scroll", () => {
    if (galleryDone || galleryLoading) return;
    const remaining = gallery.scrollWidth - (gallery.scrollLeft + gallery.clientWidth);
    if (remaining < gallery.clientWidth) loadMoreGallery();
  });
}

// ── gallery nav: snap left to newest / snap right to first (oldest) images ─
function setupGalleryNav() {
  const gallery = $("#gallery");
  const toLeft = () => gallery.scrollTo({ left: 0, behavior: "smooth" });
  // Jumping to the oldest images means reading the rest of the history
  // first (it may not all be loaded yet), then snapping to the true end.
  const toRight = async () => {
    while (!galleryDone) {
      gallery.scrollTo({ left: gallery.scrollWidth, behavior: "auto" });
      await loadMoreGallery();
    }
    gallery.scrollTo({ left: gallery.scrollWidth, behavior: "smooth" });
  };
  $("#galleryToTop").addEventListener("click", toLeft);
  $("#galleryToTopBottom").addEventListener("click", toLeft);
  $("#galleryToBottom").addEventListener("click", toRight);
  $("#galleryToBottomTop").addEventListener("click", toRight);
}

// ── share ─────────────────────────────────────────────────────────────────
function setupShare() {
  const url = "https://meadowfolio.bisks.net/";
  const text = `my portfolio, built by @buildthis.bisks.net: best posts, the software I've shipped on fromthewestmeadow.com, and a gallery buildthis curated from reading my whole feed. ${url}`;
  $("#shareBluesky").href =
    "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

renderProfile();
renderReleases();
renderRequests();
renderDreamnet();
renderPicks();
renderGallery();
setupGalleryNav();
setupShare();
