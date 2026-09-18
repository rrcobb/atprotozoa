// brennanswedding — a wedding guest book for brennan.computer (getting
// married 2026-09-19, per @dave.9000ish.uk's ask). Three moving parts:
//
// 1. His real live profile, fetched from the public AppView.
// 2. "In his own words" — a handful of apropos quotes pulled out of his
//    *entire* posting history via one com.atproto.sync.getRepo CAR download
//    (lib/car.js), scored by keyword instead of sampling his last N posts.
//    Per notes/40-new-site-playbook.md's no-arbitrary-caps rule: this reads
//    everything once, then picks the best handful to *display* — that's a
//    curation choice, not a data cap.
// 3. A real, shared guestbook: well-wishes are ordinary Bluesky posts tagged
//    #brennanswedding, read back with app.bsky.feed.searchPosts. No backend
//    of ours — the AppView's search index *is* the guestbook, so it's shared
//    across every visitor's browser for real, not just localStorage.

import { resolveDid, resolvePds, getProfile } from "./lib/identity.js";
import { fetchRepoRecordsWithKeys } from "./lib/car.js";

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

// Three tiers, weighted by how directly a hit relates to the occasion.
// Word lists were tuned against his actual repo (see git history for the
// tuning pass): early drafts scored on "propose"/"engaged"/"aisle"/"i do"
// and mostly surfaced unrelated tech-talk ("request for proposal", "user
// engagement", grocery aisles) — those got dropped in favor of words that
// are unambiguous even out of context.
//
// STRONG hits (weight 3) are unambiguously about weddings. VOICE hits
// (weight 2) echo his own bio ("a world of magic and vibrance") — a post
// can be apropos without ever mentioning marriage. WARM hits (weight 1) are
// generic warmth, kept as a low-weight tiebreaker rather than a primary
// signal since "love"/"together" show up in all kinds of unrelated posts.
const STRONG_WORDS = [
  "wedding", "married", "marriage", "marry", "marrying", "fiance", "fiancé",
  "fiancee", "fiancée", "vow", "vows", "bride", "groom", "honeymoon", "altar",
  "tie the knot", "best man", "maid of honor",
];
const VOICE_WORDS = [
  "magic", "magical", "alchemy", "alchemical", "vibrance", "vibrant",
  "cosmic", "transform", "transformed", "eternal",
];
const WARM_WORDS = ["love", "forever", "soulmate", "together", "promise", "commitment", "spark"];

function scorePost(text) {
  const t = text.toLowerCase();
  let score = 0;
  for (const w of STRONG_WORDS) if (new RegExp(`\\b${w}\\b`).test(t)) score += 3;
  for (const w of VOICE_WORDS) if (new RegExp(`\\b${w}\\b`).test(t)) score += 2;
  for (const w of WARM_WORDS) if (new RegExp(`\\b${w}\\b`).test(t)) score += 1;
  return score;
}

const QUOTES_TO_SHOW = 6; // a curated highlight reel, not a cap on what got read — the whole repo is downloaded first

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
    status.textContent = "resolving @" + HANDLE + " ...";
    const did = await resolveDid(HANDLE);
    const pds = await resolvePds(did);
    if (!pds) throw new Error("couldn't find his PDS");

    const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post", (m) => {
      status.textContent = m;
    });

    const candidates = [];
    for (const r of records) {
      const v = r.value;
      const text = (v.text || "").trim();
      if (!text || text.length < 6 || text.length > 240) continue;
      if (v.reply) continue; // standalone posts only — a reply quoted alone loses its context
      if (/https?:\/\/|\.(com|net|org|io)\b/i.test(text)) continue; // link-share posts don't quote well on their own
      const score = scorePost(text);
      if (score <= 0) continue;
      const rkey = r.uri.split("/").pop();
      candidates.push({
        text,
        score,
        createdAt: v.createdAt ? Date.parse(v.createdAt) : 0,
        url: `https://bsky.app/profile/${HANDLE}/post/${rkey}`,
      });
    }

    candidates.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);
    const picked = candidates.slice(0, QUOTES_TO_SHOW);

    if (!picked.length) {
      status.textContent = `read all ${records.length.toLocaleString()} of his posts and he's never once mentioned love, magic, or marriage in so many words — so here's his own bio instead:`;
      list.innerHTML = `<li class="quote"><p class="text">${esc(document.getElementById("pfBio").textContent || "unlicensed back alley alchemy")}</p><div class="meta">— @${HANDLE}'s profile</div></li>`;
      return;
    }

    status.textContent = `dug out of ${records.length.toLocaleString()} posts, downloaded in one repo CAR:`;
    list.innerHTML = picked.map(quoteHTML).join("");
  } catch (e) {
    status.textContent = "couldn't download his repo CAR right now — try refreshing in a bit.";
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
