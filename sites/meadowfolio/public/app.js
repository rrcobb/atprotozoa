// meadowfolio — glue script. Profile header + image gallery are live (public
// AppView, anonymous, via lib/feed.js — copied from sites/portfolio).
// Releases, buildthis requests, and dreamnet are also live (recomputed on
// every page load, no baked snapshot); only curator picks stay static, from
// ./data.js.

import { getProfile, createPortfolioPager, MAX_FEED_PAGES } from "./lib/feed.js";
import { HANDLE, DID, PICKS, DREAMNET_OVERRIDES } from "./data.js";

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

// ── requests: every buildthis site built for this account, live ───────────
// Reads buildthis.bisks.net/logs.json — the same public, CORS-open event log
// westmeadow.bisks.net reads — filters to this account, dedupes by built
// name (an edit re-ships the same name; keep the latest outcome), and pulls
// a one-line description the same way buildthis's own /directory does: the
// builder's BUILD_NOTE (recovered from replyText by stripping the fixed
// "built it 🎉 — <url> / (give the deploy a minute...)" template), falling
// back to the original request text. Copied rather than shared (house
// style) from entryDescription()/canonicalUrl() in
// sites/buildthis/src/index.ts and sites/westmeadow/src/index.ts.
const LOGS_SOURCE = "https://buildthis.bisks.net/logs.json";
const REPLY_TEMPLATE_MARKER = "built it 🎉";

// Every site moved to its own `<name>.bisks.net` subdomain 2026-07-31; these
// two are the still-path-mounted exceptions (see notes/20-deploy.md).
const PATH_MOUNTED = { apex: "bisks.net", games: "bisks.net/games" };

function fallbackUrl(builtName) {
  const site = builtName.split("/")[0];
  const rest = builtName.slice(site.length); // "" or "/sub/path..."
  const pathMount = PATH_MOUNTED[site];
  return pathMount ? `https://${pathMount}${rest}` : `https://${site}.bisks.net${rest}`;
}

// Old events (pre-2026-07-31) stored a `bisks.net/<name>` path url — normalize
// those to the site's own subdomain rather than trusting the stored value.
function canonicalUrl(builtName, stored) {
  if (!stored) return fallbackUrl(builtName);
  const m = stored.match(/^https:\/\/bisks\.net\/(?:games\/)?([a-z0-9-]+)(\/.*)?$/i);
  if (!m) return stored;
  const [, site, rest] = m;
  if (PATH_MOUNTED[site]) return stored;
  return `https://${site}.bisks.net${rest || "/"}`;
}

function entryDescription(text, replyText) {
  const reply = (replyText || "").trim();
  if (reply) {
    const idx = reply.indexOf(REPLY_TEMPLATE_MARKER);
    const note = idx === -1 ? reply : reply.slice(0, idx).trim();
    if (note) return note;
  }
  return (text || "").trim();
}

function hostLabel(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    return path ? `${u.host}${path}` : u.host;
  } catch {
    return url;
  }
}

async function renderRequests() {
  const el = $("#requests");
  const count = $("#requestsCount");
  const status = $("#requestsStatus");
  let requests;
  try {
    const res = await fetch(`${LOGS_SOURCE}?limit=500`);
    if (!res.ok) throw new Error(`logs source returned ${res.status}`);
    const { events } = await res.json();
    const byName = new Map();
    for (const e of events || []) {
      if ((e.authorHandle || "").toLowerCase() !== HANDLE.toLowerCase()) continue;
      if (e.outcome?.status !== "success" || !e.outcome.builtName) continue;
      const entry = {
        name: e.outcome.builtName,
        url: canonicalUrl(e.outcome.builtName, e.outcome.url),
        blurb: entryDescription(e.text, e.outcome.replyText),
        at: e.outcome.at,
      };
      const prev = byName.get(entry.name);
      if (!prev || prev.at < entry.at) byName.set(entry.name, entry);
    }
    requests = [...byName.values()].sort((a, b) => (a.at < b.at ? 1 : -1));
  } catch {
    if (status) status.textContent = "couldn't load the requests list right now — the log might be having a moment.";
    return;
  }
  if (status) status.remove();
  if (count) count.textContent = `(${requests.length})`;
  if (!requests.length) {
    el.innerHTML = `<p class="status">nothing shipped yet.</p>`;
    return;
  }
  el.innerHTML = requests
    .map(
      (r) => `
      <a class="release" href="${esc(r.url)}" target="_blank" rel="noopener">
        <div class="release-title">${esc(r.name.replace(/-/g, " "))}</div>
        <div class="release-host">${esc(hostLabel(r.url))}</div>
        ${r.blurb ? `<div class="release-blurb">${esc(r.blurb)}</div>` : ""}
      </a>`,
    )
    .join("");
}

// ── releases + dreamnet ─────────────────────────────────────────────────────
// "releases" merges two live sources:
//  1. fromthewestmeadow.com's own landing page ("Featured Tools"), proxied
//     through /api/releases (see src/index.ts — the page has no CORS headers,
//     so the browser can't read it directly). This is the ground truth for
//     her older tools: some of them (e.g. self.fromthewestmeadow.com) were
//     never actually linked in a Bluesky post, so no amount of feed-scanning
//     finds them — only her own site lists them, in oldest-first order.
//  2. A pass over the post history for any *.fromthewestmeadow.com link the
//     landing page DOESN'T list yet — how a brand-new release (dreamnet,
//     cancelled) shows up here before she's gotten around to updating that
//     page. Sorted newest-first and prepended, since anything found this way
//     is safely newer than everything on the (rarely-touched) landing page.
// "dreamnet" = every individual dreamnet.fromthewestmeadow.com link from that
// same pass, not deduped by host (each dream is its own card).
//
// Asks for replies too (posts_with_replies, unlike the gallery's no-replies
// pager) — at least one release announcement
// (compass.fromthewestmeadow.com) was itself posted as a reply, and would be
// silently dropped otherwise. Also checks for a bare "host.fromthewestmeadow.com"
// mention in the post text even without a clickable embed — that's how
// emoji.fromthewestmeadow.com was originally announced.
const DREAMNET_HOST = "dreamnet.fromthewestmeadow.com";
const DOMAIN_SUFFIX = ".fromthewestmeadow.com";
const DOMAIN_TEXT_RE = /\b([a-z0-9-]+)\.fromthewestmeadow\.com\b/i;

function linkHost(uri) {
  try {
    return new URL(uri).host;
  } catch {
    return "";
  }
}

function dreamId(uri) {
  try {
    return new URL(uri).searchParams.get("dream") || "";
  } catch {
    return "";
  }
}

async function fetchLandingReleases() {
  try {
    const res = await fetch("/api/releases");
    if (!res.ok) return [];
    const { releases } = await res.json();
    return Array.isArray(releases) ? releases : [];
  } catch {
    return [];
  }
}

async function scanDomainAndDreamnet() {
  const releaseByHost = new Map();
  const dreamnetSeen = new Set();
  const dreamnetCards = [];
  let incomplete = false;
  const pager = createPortfolioPager(DID, HANDLE, { filter: "posts_with_replies" });
  for (let i = 0; i < MAX_FEED_PAGES; i++) {
    const { posts, done, error } = await pager.next();
    if (error) incomplete = true;
    for (const post of posts) {
      let host = null;
      let cardTitle = null;
      let cardBlurb = null;
      let isCard = false;
      if (post.kind === "link" && post.link) {
        const h = linkHost(post.link.uri);
        if (h.endsWith(DOMAIN_SUFFIX)) {
          host = h;
          cardTitle = post.link.title;
          cardBlurb = post.link.description;
          isCard = true;
        }
      }
      if (!host) {
        const m = DOMAIN_TEXT_RE.exec(post.text || "");
        if (m) host = `${m[1].toLowerCase()}.fromthewestmeadow.com`;
      }
      if (host) {
        const date = post.createdAt || "";
        const existing = releaseByHost.get(host);
        if (!existing) {
          releaseByHost.set(host, {
            host,
            date,
            cardDate: isCard ? date : null,
            title: isCard ? cardTitle || host : host,
            blurb: isCard ? cardBlurb || "" : post.text || "",
          });
        } else {
          if (date && date < existing.date) existing.date = date;
          // Prefer the EARLIEST card (not just the first one this scan hits —
          // pages come back newest-first, so a host linked many times, like
          // dreamnet, would otherwise show whichever individual link the scan
          // saw first instead of the tool's actual launch announcement).
          if (isCard && (existing.cardDate === null || date < existing.cardDate)) {
            existing.title = cardTitle || host;
            existing.blurb = cardBlurb || "";
            existing.cardDate = date;
          }
        }
      }

      if (post.kind === "link" && post.link && linkHost(post.link.uri) === DREAMNET_HOST) {
        if (!dreamnetSeen.has(post.link.uri)) {
          dreamnetSeen.add(post.link.uri);
          const card = { ...post.link, postUrl: post.url, date: post.createdAt };
          // dreamnet.fromthewestmeadow.com sets its real per-dream title/description
          // client-side, which Bluesky's unfurler never sees — patch in a manually
          // recovered card for the specific dreams that got stuck with the
          // generic site-wide one (see DREAMNET_OVERRIDES in data.js).
          const override = DREAMNET_OVERRIDES[dreamId(post.link.uri)];
          if (override) {
            card.title = override.title;
            card.description = override.description;
          }
          dreamnetCards.push(card);
        }
      }
    }
    if (done) break;
  }
  const found = [...releaseByHost.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  dreamnetCards.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { found, dreamnetCards, incomplete };
}

async function renderDomainSections() {
  const releasesEl = $("#releases");
  const releasesStatus = $("#releasesStatus");
  const releasesCount = $("#releasesCount");
  const dreamnetEl = $("#dreamnet");
  const dreamnetStatus = $("#dreamnetStatus");
  const dreamnetCount = $("#dreamnetCount");

  let landing = [];
  let found = [];
  let dreamnetCards = [];
  let incomplete = false;
  try {
    [landing, { found, dreamnetCards, incomplete }] = await Promise.all([fetchLandingReleases(), scanDomainAndDreamnet()]);
  } catch {
    if (releasesStatus) releasesStatus.textContent = "couldn't load the releases list right now — the AppView might be having a moment.";
    if (dreamnetStatus) dreamnetStatus.textContent = "couldn't load DreamNet links right now — the AppView might be having a moment.";
    return;
  }
  // A page-scan error mid-history (the AppView hiccuping, not the account
  // actually running out of posts) stops the scan early — flag it so a
  // short list reads as "might be incomplete" rather than "that's everything".
  const incompleteNote = incomplete ? " — the AppView had a hiccup partway through, this list may be incomplete" : "";

  const landingHosts = new Set(landing.map((r) => r.host));
  const extra = found.filter((r) => !landingHosts.has(r.host));
  const releases = [
    ...extra.map((r) => ({ host: r.host, title: r.title, blurb: r.blurb })),
    ...[...landing].reverse(),
  ];

  if (releasesCount) releasesCount.textContent = `(${releases.length} shipped on fromthewestmeadow.com${incompleteNote})`;
  if (!releases.length) {
    if (releasesStatus) releasesStatus.textContent = `no fromthewestmeadow.com releases found (yet).${incompleteNote}`;
  } else {
    if (releasesStatus) releasesStatus.remove();
    releasesEl.innerHTML = releases
      .map(
        (r) => `
        <a class="release" href="https://${esc(r.host)}" target="_blank" rel="noopener">
          <div class="release-title">${esc(r.title)}</div>
          <div class="release-host">${esc(r.host)}</div>
          ${r.blurb ? `<div class="release-blurb">${esc(r.blurb)}</div>` : ""}
        </a>`,
      )
      .join("");
  }

  if (!dreamnetCards.length) {
    if (dreamnetStatus) dreamnetStatus.textContent = `no DreamNet links found (yet).${incompleteNote}`;
    return;
  }
  if (dreamnetStatus) dreamnetStatus.remove();
  if (dreamnetCount) dreamnetCount.textContent = `(${dreamnetCards.length}${incompleteNote})`;
  dreamnetEl.innerHTML = dreamnetCards
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
let galleryError = false;

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
  if (galleryDone && galleryError) {
    // Stopped early because the AppView kept failing, not because the
    // account's history actually ran out — say so instead of implying
    // "that's every image" (see loadMoreGallery / createPortfolioPager).
    status.textContent = galleryImageCount
      ? `${galleryImageCount} images — stopped early after the AppView kept failing, there may be more.`
      : "couldn't load the gallery right now — the AppView kept failing.";
  } else if (galleryDone && galleryImageCount) {
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
  const { posts, done, error } = await galleryPager.next();
  appendImages(posts);
  galleryDone = done;
  if (error) galleryError = true;
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
renderRequests();
renderDomainSections();
renderPicks();
renderGallery();
setupGalleryNav();
setupShare();
