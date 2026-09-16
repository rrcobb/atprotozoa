// relegation — sign in, then:
//   1. bulk-download the signed-in account's whole post history (one CAR)
//   2. tally every like + direct reply anyone has ever given those posts
//      (lib/engagement.js — getLikes + Cerulea backlinks, exhausted to the
//      end of the cursor, no page cap)
//   3. map that tally against moots (mutual follows) for the relegation
//      boards, and against non-mutual followers for the promotion board
//
// No writes anywhere — OAuth scope is bare `atproto` (see lib/oauth.js).

import { login, getSession, clearSession, completeLoginIfCallback } from "./lib/oauth.js";
import { resolveGraph, fetchOwnPosts, scanEngagement } from "./lib/engagement.js";

const SITE_URL = "https://relegation.bisks.net/";
const BOARD_SIZE = 15; // how many rows each board shows — a display choice (favstar/innercircle-style "top N"), not a data-completeness cap: every moot and every non-mutual follower is scanned regardless of board size.

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function cleanHandle(raw) {
  let h = (raw || "").trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

const TINTS = ["#1a5fd0", "#1f8a4c", "#d81e6a", "#e0a400", "#8e44ad", "#c0392b", "#0f9b9b", "#e2711d"];
function tintFor(did) {
  let h = 0;
  for (const c of did || "x") h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return TINTS[h % TINTS.length];
}
function avaStyle(p) {
  return p.avatar ? `background-image:url('${esc(p.avatar)}')` : `background:${tintFor(p.did)}`;
}

const els = {
  signinBar: document.getElementById("signinBar"),
  msg: document.getElementById("msg"),
  runbar: document.getElementById("runbar"),
  runBtn: document.getElementById("runBtn"),
  progress: document.getElementById("progress"),
  barFill: document.getElementById("barFill"),
  barLabel: document.getElementById("barLabel"),
  results: document.getElementById("results"),
  summary: document.getElementById("summary"),
  leastLikesList: document.getElementById("leastLikesList"),
  leastRepliesList: document.getElementById("leastRepliesList"),
  promoteList: document.getElementById("promoteList"),
};

let session = null;

function setMsg(text, kind) {
  els.msg.textContent = text || "";
  els.msg.className = "msg" + (kind ? " " + kind : "");
}

function renderSignin() {
  if (session) {
    els.signinBar.innerHTML = `
      <span class="who">signed in as <b>@${esc(session.handle)}</b></span>
      <button class="ghost" id="signOut" type="button">sign out</button>
    `;
    document.getElementById("signOut").addEventListener("click", async () => {
      await clearSession();
      session = null;
      els.runbar.classList.remove("on");
      els.results.classList.remove("on");
      renderSignin();
      setMsg("");
    });
    els.runbar.classList.add("on");
    return;
  }
  els.signinBar.innerHTML = `
    <input id="loginHandle" type="text" placeholder="your handle to sign in" autocomplete="off" autocapitalize="off" spellcheck="false" />
    <button id="signIn" type="button">sign in</button>
    <span class="signin-err" id="signinErr"></span>
  `;
  document.getElementById("signIn").addEventListener("click", async () => {
    const h = cleanHandle(document.getElementById("loginHandle").value);
    const err = document.getElementById("signinErr");
    if (!h) { err.textContent = "enter your handle first."; return; }
    err.textContent = "";
    try {
      await login(h);
    } catch (e) {
      err.textContent = e.message;
    }
  });
  els.runbar.classList.remove("on");
}

function renderRow(rank, profile, countLabel, zoneClass) {
  const row = document.createElement("div");
  row.className = "lb-row" + (zoneClass ? " " + zoneClass : "");
  const name = profile.displayName && profile.displayName !== profile.handle ? esc(profile.displayName) : "";
  row.innerHTML = `
    <div class="rank">${rank}</div>
    <div class="ava" style="${avaStyle(profile)}"></div>
    <div class="who">
      <a href="https://bsky.app/profile/${encodeURIComponent(profile.handle)}" target="_blank" rel="noopener">@${esc(profile.handle)}</a>
      ${name ? `<span class="name">${name}</span>` : ""}
    </div>
    <div class="count">${countLabel}</div>
  `;
  return row;
}

function renderBoard(el, entries, kind, zoneClass) {
  el.innerHTML = "";
  if (!entries.length) {
    el.innerHTML = `<div class="empty">nothing to show here.</div>`;
    return;
  }
  entries.forEach((entry, i) => {
    const label =
      kind === "likes"
        ? `<b>${entry.likes}</b> ${entry.likes === 1 ? "like" : "likes"}`
        : kind === "replies"
        ? `<b>${entry.replies}</b> ${entry.replies === 1 ? "reply" : "replies"}`
        : `<b>${entry.likes}</b> likes · <b>${entry.replies}</b> replies`;
    el.appendChild(renderRow(i + 1, entry, label, zoneClass));
  });
}

// /summary/<handle>/<moots>/<candidates> — a distinct, shareable URL per
// result (same trick as sites/innercircle's src/index.ts): the Worker formats
// personalized OG tags straight from the path segments, no server-side
// recompute of the (expensive) scan.
function shareUrlFor(stats) {
  return `${SITE_URL}summary/${encodeURIComponent(stats.handle)}/${stats.moots}/${stats.candidates}`;
}

function setShare(stats, worst, best) {
  const summaryEl = els.summary.querySelector("#shareBtn");
  if (!summaryEl) return;
  const bits = [];
  if (worst) bits.push(`@${worst.handle} is bottom of my relegation zone`);
  if (best) bits.push(`@${best.handle} deserves a call-up`);
  const text =
    (bits.length ? bits.join(" — ") + ". " : "") +
    `ran my mutuals through relegation.bisks.net\n\n${shareUrlFor(stats)}`;
  summaryEl.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

function renderSummary(stats, worst, best) {
  els.summary.innerHTML = `
    <div class="stat"><div class="num">${stats.posts}</div><div class="lbl">posts scanned</div></div>
    <div class="stat"><div class="num">${stats.moots}</div><div class="lbl">moots</div></div>
    <div class="stat"><div class="num">${stats.candidates}</div><div class="lbl">non-mutual followers</div></div>
    <a class="sharebtn" id="shareBtn" target="_blank" rel="noopener" href="#">share this</a>
  `;
  setShare(stats, worst, best);
}

async function runAudit() {
  if (!session) return;
  els.runBtn.disabled = true;
  els.results.classList.remove("on");
  els.progress.classList.remove("on");

  try {
    setMsg("mapping your moots and followers…");
    const { moots, candidates } = await resolveGraph(session.did);

    if (!moots.length) {
      setMsg(`@${session.handle} has no moots yet — nothing to relegate.`, "err");
      return;
    }

    setMsg("downloading your whole post history…");
    const posts = await fetchOwnPosts(session, (s) => setMsg(s));

    if (!posts.length) {
      setMsg(`@${session.handle} hasn't posted anything yet — no engagement to measure.`, "err");
      return;
    }

    setMsg(`found ${posts.length} posts — reading who liked and replied to each one (this is the slow part)…`);
    els.progress.classList.add("on");
    els.barFill.style.width = "0%";
    els.barLabel.textContent = `0 / ${posts.length} posts scanned`;

    const { likesByDid, repliesByDid } = await scanEngagement(posts, (done, total) => {
      const pct = Math.round((done / total) * 100);
      els.barFill.style.width = pct + "%";
      els.barLabel.textContent = `${done} / ${total} posts scanned`;
    });

    els.progress.classList.remove("on");

    const withCounts = (list) =>
      list.map((p) => ({
        ...p,
        likes: likesByDid.get(p.did) || 0,
        replies: repliesByDid.get(p.did) || 0,
      }));

    const mootStats = withCounts(moots);
    const candidateStats = withCounts(candidates);

    const leastLikes = [...mootStats]
      .sort((a, b) => a.likes - b.likes || a.handle.localeCompare(b.handle))
      .slice(0, BOARD_SIZE);
    const leastReplies = [...mootStats]
      .sort((a, b) => a.replies - b.replies || a.handle.localeCompare(b.handle))
      .slice(0, BOARD_SIZE);
    const promote = candidateStats
      .filter((c) => c.likes + c.replies > 0)
      .sort((a, b) => (b.likes + b.replies) - (a.likes + a.replies) || a.handle.localeCompare(b.handle))
      .slice(0, BOARD_SIZE);

    renderBoard(els.leastLikesList, leastLikes, "likes", "zone-bad");
    renderBoard(els.leastRepliesList, leastReplies, "replies", "zone-bad");
    renderBoard(els.promoteList, promote, "both", "zone-good");

    renderSummary(
      { posts: posts.length, moots: moots.length, candidates: candidates.length, handle: session.handle },
      leastLikes[0],
      promote[0],
    );

    setMsg(`done — scanned ${posts.length} posts across ${moots.length} moots and ${candidates.length} non-mutual followers.`, "ok");
    els.results.classList.add("on");
    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    els.progress.classList.remove("on");
    setMsg("couldn't finish that audit — " + (e.message || "try again") + ".", "err");
  } finally {
    els.runBtn.disabled = false;
  }
}

els.runBtn.addEventListener("click", runAudit);

async function init() {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setMsg("sign-in failed: " + e.message, "err");
  }
  renderSignin();
}
init();
