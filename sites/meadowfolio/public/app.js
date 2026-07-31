// meadowfolio — glue script. Profile header + image gallery are live (public
// AppView, anonymous, via lib/feed.js — copied from sites/portfolio).
// Releases + curator picks are static, from ./data.js.

import { getProfile, authorPortfolio } from "./lib/feed.js";
import { HANDLE, DID, RELEASES, PICKS } from "./data.js";

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

// ── gallery: live image sweep of the post history ──────────────────────
async function renderGallery() {
  const status = $("#galleryStatus");
  const grid = $("#gallery");
  try {
    const posts = await authorPortfolio(DID, HANDLE, {
      onStep: (msg) => (status.textContent = msg),
    });
    const images = [];
    for (const post of posts) {
      if (post.kind !== "media") continue;
      for (const m of post.media) {
        if (m.video) continue; // gallery is stills; video posts stay out
        images.push({ thumb: m.thumb, alt: m.alt, url: post.url, createdAt: post.createdAt });
      }
    }
    if (!images.length) {
      status.textContent = "no images found in the recent post history.";
      return;
    }
    status.remove();
    grid.innerHTML = images
      .map(
        (im) => `
        <a class="shot" href="${esc(im.url)}" target="_blank" rel="noopener" title="${esc(im.alt || "")}">
          <img loading="lazy" src="${esc(im.thumb)}" alt="${esc(im.alt || "")}"/>
        </a>`,
      )
      .join("");
    $("#galleryCount").textContent = `${images.length} images, from ${posts.length} posts read`;
  } catch {
    status.textContent = "couldn't load the gallery right now — the AppView might be having a moment.";
  }
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
renderPicks();
renderGallery();
setupShare();
