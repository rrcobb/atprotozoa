// brennanswedding — a wedding guest book for brennan.computer (getting
// married 2026-09-19, per @dave.9000ish.uk's ask). Three moving parts:
//
// 1. His real live profile, fetched from the public AppView.
// 2. "In his own words" — a handful of apropos quotes pulled out of his
//    *entire* posting history, scored by keyword instead of sampling his
//    last N posts. The scoring itself runs once, at build time
//    (build-quotes.js, one com.atproto.sync.getRepo CAR download), and the
//    picks are baked into data/quotes.json — @dave.9000ish.uk, after the
//    first version downloaded and re-scored the CAR in every visitor's
//    browser: "you don't need to download the car everytime. the posts
//    you've picked are fine." Per notes/40-new-site-playbook.md's
//    no-arbitrary-caps rule this is still a full read of everything, just
//    once rather than once per visit — the curation choice was always in
//    which handful to *display*, never in how much got read.
// 3. A real, shared guestbook: well-wishes are ordinary Bluesky posts tagged
//    #brennanswedding, read back with app.bsky.feed.searchPosts. No backend
//    of ours — the AppView's search index *is* the guestbook, so it's shared
//    across every visitor's browser for real, not just localStorage.

import { getProfile } from "./lib/identity.js";

const HANDLE = "brennan.computer";
const HASHTAG = "#brennanswedding";
const WEDDING_DATE = "2026-09-19"; // the Saturday named in the ask

function esc(s) {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- profile -------------------------------------------------------------

async function loadProfile() {
  const msg = document.getElementById("profileMsg");
  try {
    const p = await getProfile(HANDLE);
    document.getElementById("pfAvatar").src = p.avatar || "";
    document.getElementById("pfName").textContent = p.displayName || ("@" + p.handle);
    document.getElementById("pfHandle").textContent = "@" + p.handle;
    document.getElementById("pfBio").textContent = p.description || "";
    document.getElementById("pfFollowers").textContent = (p.followersCount ?? "–").toLocaleString?.() ?? p.followersCount;
    document.getElementById("pfFollows").textContent = (p.followsCount ?? "–").toLocaleString?.() ?? p.followsCount;
    document.getElementById("pfPosts").textContent = (p.postsCount ?? "–").toLocaleString?.() ?? p.postsCount;
    document.getElementById("profile").style.display = "flex";
    msg.style.display = "none";
  } catch (e) {
    msg.textContent = "couldn't load his live profile right now — he's still really getting married, promise.";
  }
}

// ---- countdown -------------------------------------------------------------

function dayFloor(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function renderCountdown() {
  const el = document.getElementById("countdown");
  const sub = document.getElementById("countdownSub");
  const wedding = dayFloor(new Date(WEDDING_DATE + "T00:00:00"));
  const today = dayFloor(new Date());
  const days = Math.round((wedding - today) / 86400000);

  if (days > 1) {
    el.textContent = `${days} days to go`;
    sub.textContent = `brennan.computer marries this Saturday, ${wedding.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.`;
  } else if (days === 1) {
    el.textContent = "tomorrow 💍";
    sub.textContent = "get your well-wishes in before he's busy getting married.";
  } else if (days === 0) {
    el.textContent = "today's the day 💍";
    sub.textContent = "he's getting married right about now. leave something below.";
  } else {
    el.textContent = "married! 🎉";
    sub.textContent = `he tied the knot on ${wedding.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}. the guestbook's still open.`;
  }
}

// ---- in his own words ------------------------------------------------------

// The picks themselves live in data/quotes.json, baked by build-quotes.js
// from one com.atproto.sync.getRepo CAR download of his whole repo — see
// that script for the scoring (three keyword tiers weighted by how directly
// a hit relates to the occasion) and the git history for the tuning pass
// that got there.

function quoteHTML(q) {
  return `
    <li class="quote">
      <p class="text">${esc(q.text)}</p>
      <div class="meta"><a href="${q.url}" target="_blank" rel="noopener">— @${HANDLE}, from the archive</a></div>
    </li>`;
}

async function loadQuotes() {
  const status = document.getElementById("quotesStatus");
  const list = document.getElementById("quotesList");
  try {
    const res = await fetch("data/quotes.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    if (!data.picked || !data.picked.length) {
      status.textContent = `read all ${data.totalPosts.toLocaleString()} of his posts and he's never once mentioned love, magic, or marriage in so many words — so here's his own bio instead:`;
      list.innerHTML = `<li class="quote"><p class="text">${esc(data.fallbackBio || document.getElementById("pfBio").textContent || "unlicensed back alley alchemy")}</p><div class="meta">— @${HANDLE}'s profile</div></li>`;
      return;
    }

    status.textContent = `dug out of ${data.totalPosts.toLocaleString()} posts, read in one repo CAR download:`;
    list.innerHTML = data.picked.map(quoteHTML).join("");
  } catch (e) {
    status.textContent = "couldn't load his archived quotes right now — try refreshing in a bit.";
  }
}

// ---- guestbook -------------------------------------------------------------

const SEARCH = "https://api.bsky.app/xrpc"; // public.api.bsky.app 403s searchPosts; api.bsky.app serves it open, unauthenticated (notes/history/trigrams-reply-and-quiver.md)

async function searchGet(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return await r.json();
      const soft = r.status === 429 || r.status === 403 || r.status >= 500;
      if (!soft) return null;
      await new Promise((res) => setTimeout(res, 500 * (i + 1)));
    } catch {
      await new Promise((res) => setTimeout(res, 500 * (i + 1)));
    }
  }
  return null;
}

// Every well-wish is a real post tagged #brennanswedding — the guestbook is
// however many of those exist, no upper bound. Pages to exhaustion rather
// than stopping at a fixed page count.
async function fetchGuestbookEntries() {
  const out = [];
  let cursor = "";
  for (;;) {
    const u = new URL(SEARCH + "/app.bsky.feed.searchPosts");
    u.searchParams.set("q", HASHTAG);
    u.searchParams.set("sort", "latest");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await searchGet(u.toString());
    if (!d) break;
    const posts = d.posts || [];
    for (const p of posts) {
      const text = (p.record && p.record.text) || "";
      // Secondary relevance filter: the hashtag alone could in principle
      // collide with an unrelated use elsewhere, so also require the post to
      // actually say his name — cheap insurance against noise, not a data cap.
      if (!/brennan/i.test(text)) continue;
      out.push({
        uri: p.uri,
        text,
        createdAt: (p.record && p.record.createdAt) || p.indexedAt,
        author: p.author || {},
      });
    }
    cursor = d.cursor;
    if (!cursor || !posts.length) break;
  }
  out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return out;
}

function timeAgo(iso) {
  const ms = Date.parse(iso);
  if (!ms) return "";
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  const units = [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]];
  for (const [u, secs] of units) {
    const v = Math.floor(s / secs);
    if (v >= 1) return v + u + " ago";
  }
  return "just now";
}

function postUrl(uri, handle) {
  const rkey = String(uri).split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

function entryHTML(e) {
  const who = e.author.handle ? "@" + e.author.handle : "someone";
  const link = e.author.handle ? postUrl(e.uri, e.author.handle) : "#";
  const avatar = e.author.avatar
    ? `<img class="gbAvatar" src="${esc(e.author.avatar)}" alt="" />`
    : `<div class="gbAvatar gbAvatarBlank"></div>`;
  return `
    <li class="note">
      ${avatar}
      <div class="noteBody">
        <p class="text">${esc(e.text)}</p>
        <div class="meta"><a href="${link}" target="_blank" rel="noopener">${esc(e.author.displayName || who)}</a> · ${timeAgo(e.createdAt)}</div>
      </div>
    </li>`;
}

async function pollGuestbook() {
  const status = document.getElementById("gbStatus");
  const empty = document.getElementById("gbEmpty");
  const list = document.getElementById("gbList");
  try {
    const entries = await fetchGuestbookEntries();
    if (!entries.length) {
      status.textContent = "no well-wishes yet";
      empty.style.display = "";
      list.innerHTML = "";
      return;
    }
    status.textContent = `${entries.length} well-wish${entries.length === 1 ? "" : "es"} so far`;
    empty.style.display = "none";
    list.innerHTML = entries.map(entryHTML).join("");
  } catch {
    status.textContent = "couldn't load the guestbook right now — try again shortly.";
  }
}

// ---- compose form ----------------------------------------------------------

function wireComposeForm() {
  const textInput = document.getElementById("wishInput");
  const btn = document.getElementById("composeBtn");
  const msg = document.getElementById("composeMsg");

  btn.addEventListener("click", () => {
    const msgText = textInput.value.trim();
    if (!msgText) {
      msg.textContent = "write something first";
      return;
    }
    const full = `${msgText}\n\n@${HANDLE} ${HASHTAG}`;
    const url = "https://bsky.app/intent/compose?text=" + encodeURIComponent(full);
    window.open(url, "_blank", "noopener");
    msg.textContent = "posted? it'll show up below within a minute or so.";
  });
}

// ---- boot -------------------------------------------------------------

loadProfile();
renderCountdown();
loadQuotes();
wireComposeForm();
pollGuestbook();
setInterval(pollGuestbook, 20000);
