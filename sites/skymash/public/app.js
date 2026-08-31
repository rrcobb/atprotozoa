// app.js — skymash's whole client: OAuth session, the vote screen (two
// eligible profiles + their latest posts, rating-aware matchmaking, click to
// pick), the Elo leaderboard (computed client-side from every
// net.bisks.skymash.vote record on the network, with batch-fetched avatars
// from public/lib/identity.js), the nominate form (open to any account —
// public/lib/cluster.js's mutual-follow "cluster score" is shown alongside
// each nomination for flavor, not a gate; see the 2026-08-31 change below),
// and self-service opt-out (net.bisks.skymash.optout). Frontend-first, no
// server state — see notes/ideas/pds-and-lexicons.md "Tier 3".
//
// 2026-08-31: nomination used to require a 40+ cluster score (the brief's
// "Simcluster" bar). @fromthewestmeadow.com asked to open it up to everyone
// on the site, not just the simcluster people, so the threshold check is
// gone — clusterScore() still runs and gets stored/shown, it just no longer
// blocks anything.
//
// 2026-08-31 (later same thread): @fromthewestmeadow.com asked to make it
// easy to skip a matchup, and to be able to compare people you actually
// recognize. Added a real pre-vote "skip" button (#btn-skip-live — unlike
// the old #btn-skip, it's live during the matchup, not just after voting)
// and an "only match people I follow" toggle that limits matchmaking to the
// signed-in voter's own follow graph (lib/cluster.js's getFollowingDids).

import { login, completeLoginIfCallback, getSession, clearSession, dpopFetch } from "/lib/oauth.js";
import { GlobalIndex } from "/lib/global-index.js";
import { clusterScore, getFollowingDids } from "/lib/cluster.js";
import { computeStandings } from "/lib/elo.js";
import { getProfiles } from "/lib/identity.js";

const PUB = "https://api.bsky.app/xrpc";
const NOMINATION_COLLECTION = "net.bisks.skymash.nomination";
const VOTE_COLLECTION = "net.bisks.skymash.vote";
const OPTOUT_COLLECTION = "net.bisks.skymash.optout";
// How wide a rating band around the anchor pick counts as "nearby" for
// matchmaking, and how often the second pick ignores rating entirely — see
// pickTwo() below.
const MATCHMAKING_WINDOW = 3;
const RANDOM_PAIR_CHANCE = 0.3;

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function truncate(s, max) {
  const str = String(s || "");
  return str.length <= max ? str : str.slice(0, max - 1).trimEnd() + "…";
}

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function getProfile(did) {
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
}
async function getFeed(did) {
  try {
    const d = await jget(`${PUB}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=50`);
    return d.feed || [];
  } catch {
    return [];
  }
}

// --- record normalizers for GlobalIndex ------------------------------------

function normalizeNomination(did, rkey, record) {
  if (!record || typeof record !== "object") return null;
  const subject = typeof record.subject === "string" ? record.subject : "";
  const handle = typeof record.handle === "string" ? record.handle : "";
  const score = Number(record.score);
  if (!subject || !handle || !Number.isFinite(score)) return null;
  const nominatedAt = typeof record.nominatedAt === "string" ? Date.parse(record.nominatedAt) || 0 : 0;
  return { nominator: did, subject, handle, score, nominatedAt };
}

function normalizeVote(did, rkey, record) {
  if (!record || typeof record !== "object") return null;
  const { a, b, winner } = record;
  if (typeof a !== "string" || typeof b !== "string" || typeof winner !== "string") return null;
  if (winner !== a && winner !== b) return null;
  const votedAt = typeof record.votedAt === "string" ? Date.parse(record.votedAt) || 0 : 0;
  return { rater: did, a, b, winner, votedAt };
}

// An opt-out only ever counts if it's on the *subject's own* repo — a
// nominator can't write one on someone else's behalf, and this check is what
// enforces that even if some other client ever wrote a mismatched record.
function normalizeOptOut(did, rkey, record) {
  if (!record || typeof record !== "object") return null;
  const subject = typeof record.subject === "string" ? record.subject : "";
  if (!subject || subject !== did) return null;
  const optedOutAt = typeof record.optedOutAt === "string" ? Date.parse(record.optedOutAt) || 0 : 0;
  return { subject, optedOutAt };
}

// One nomination per (nominator, subject) — the pool is the de-duplicated
// union across every nominator, keeping the highest recorded score per
// subject, minus anyone who's opted themselves out.
function dedupPool(entries, optOutEntries) {
  const optedOut = new Set((optOutEntries || []).map((e) => e.subject));
  const bySubject = new Map();
  for (const e of entries) {
    if (optedOut.has(e.subject)) continue;
    const existing = bySubject.get(e.subject);
    if (!existing || e.score > existing.score) bySubject.set(e.subject, e);
  }
  return Array.from(bySubject.values());
}

// --- global state ------------------------------------------------------------

let session = null;
let poolSnapshot = { entries: [], backfillDone: false };
let voteSnapshot = { entries: [], backfillDone: false };
let optOutSnapshot = { entries: [], backfillDone: false };
let currentPair = null; // { a: {did, profile, feed}, b: {...} }

// "only match people I follow" — the signed-in voter's own follow graph,
// bulk-fetched once (see lib/cluster.js's getFollowingDids) and cached for
// the session. null = not loaded yet (or filter is off); a Set once loaded.
let followFilterEnabled = false;
let followingDids = null;
let followingLoading = false;

function activePool() {
  return dedupPool(poolSnapshot.entries, optOutSnapshot.entries);
}

// The pool actually eligible for a new matchup: the full nomination pool,
// or — when the follow filter is on — just the overlap with the signed-in
// voter's follows. Returns null while that follow list is still loading, so
// callers can distinguish "still loading" from "genuinely too few".
function poolForVoting() {
  const pool = activePool();
  if (!followFilterEnabled) return pool;
  if (!followingDids) return null;
  return pool.filter((p) => followingDids.has(p.subject));
}

async function ensureFollowing() {
  if (!session || followingDids || followingLoading) return followingDids;
  followingLoading = true;
  const hint = $("#follow-filter-hint");
  hint.textContent = "loading who you follow…";
  hint.style.display = "";
  try {
    const dids = await getFollowingDids(session.did);
    followingDids = new Set(dids);
    hint.style.display = "none";
  } catch (e) {
    hint.textContent = `couldn't load your follows (${e.message}) — showing the full pool instead.`;
    hint.style.display = "";
  } finally {
    followingLoading = false;
  }
  return followingDids;
}

const nominationIndex = new GlobalIndex(NOMINATION_COLLECTION, {
  normalize: normalizeNomination,
  onUpdate(snap) {
    poolSnapshot = snap;
    renderPool();
  },
});
const voteIndex = new GlobalIndex(VOTE_COLLECTION, {
  normalize: normalizeVote,
  onUpdate(snap) {
    voteSnapshot = snap;
    renderLeaderboard();
  },
});
const optOutIndex = new GlobalIndex(OPTOUT_COLLECTION, {
  normalize: normalizeOptOut,
  onUpdate(snap) {
    optOutSnapshot = snap;
    renderPool();
  },
});

// --- tabs / router ------------------------------------------------------------

const TABS = ["vote", "leaderboard", "nominate", "about"];
function currentTab() {
  const t = location.hash.replace(/^#\//, "");
  return TABS.includes(t) ? t : "vote";
}
function showTab(tab) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${tab}`).classList.add("active");
  document.querySelectorAll("nav.tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
  if (tab === "vote" && !currentPair) loadMatchup();
  if (tab === "leaderboard") renderLeaderboard();
  if (tab === "nominate") renderPool();
}
window.addEventListener("hashchange", () => showTab(currentTab()));

// --- session / oauth ----------------------------------------------------------

const sessionWho = $("#session-who");
const handleInput = $("#handle-input");
const btnSignin = $("#btn-signin");
const btnSignout = $("#btn-signout");
let awaitingHandle = false;

function updateSessionUI() {
  if (session) {
    sessionWho.textContent = `signed in as @${session.handle}`;
    handleInput.style.display = "none";
    btnSignin.style.display = "none";
    btnSignout.style.display = "";
    $("#vote-hint-anon").style.display = "none";
  } else {
    sessionWho.textContent = "not signed in — you can browse, but voting and nominating write a record to your own PDS";
    handleInput.style.display = awaitingHandle ? "" : "none";
    btnSignin.style.display = "";
    btnSignin.disabled = false;
    btnSignin.textContent = awaitingHandle ? "continue →" : "sign in with Bluesky";
    btnSignout.style.display = "none";
  }
}

btnSignin.addEventListener("click", async () => {
  if (!awaitingHandle) {
    awaitingHandle = true;
    updateSessionUI();
    handleInput.focus();
    return;
  }
  const h = handleInput.value.trim();
  if (!h) return;
  btnSignin.disabled = true;
  try {
    await login(h);
  } catch (e) {
    sessionWho.textContent = `sign-in failed: ${e.message}`;
    btnSignin.disabled = false;
  }
});
handleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnSignin.click();
});
btnSignout.addEventListener("click", async () => {
  await clearSession();
  session = null;
  awaitingHandle = false;
  followFilterEnabled = false;
  followingDids = null;
  $("#follow-filter-toggle").checked = false;
  $("#follow-filter-hint").style.display = "none";
  updateSessionUI();
  renderPool();
});

// "only match people I follow" toggle — requires a session (the filter
// reads the signed-in account's own follow graph), so checking it while
// signed out bounces back off with a hint instead of silently doing nothing.
const followFilterToggle = $("#follow-filter-toggle");
followFilterToggle.addEventListener("change", async () => {
  const hint = $("#follow-filter-hint");
  if (followFilterToggle.checked && !session) {
    followFilterToggle.checked = false;
    hint.textContent = "sign in above first — this filters matchups to people your signed-in account follows.";
    hint.style.display = "";
    return;
  }
  followFilterEnabled = followFilterToggle.checked;
  if (!followFilterEnabled) hint.style.display = "none";
  currentPair = null;
  if (followFilterEnabled) await ensureFollowing();
  if (currentTab() === "vote") loadMatchup();
});

// Handle typeahead on the nominate field — same public actor-search widget
// every other site's handle input uses (see lib/handle-typeahead.js).
if (window.attachHandleTypeahead) window.attachHandleTypeahead($("#nominate-handle"));

// The cee.wtf secret: one character of the h1, wired to the self-identifying
// handle input on this page (the nominate form's handle field). No visual
// difference — see notes on the standing order this implements.
$("#cee-anchor").addEventListener("click", () => {
  location.hash = "#/nominate";
  const input = $("#nominate-handle");
  input.value = "@cee.wtf";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();
});

// --- vote screen ---------------------------------------------------------------

// Matchmaking: mostly pair an account with a similarly-rated neighbor (so
// close matches stay close), but RANDOM_PAIR_CHANCE of the time pick a fully
// random opponent instead — that's what surfaces brand-new nominees (no
// votes yet, so no reliable rating) and keeps the leaderboard from calcifying
// into the same handful of accounts always facing each other. Ratings come
// from the same Elo replay the leaderboard uses, so matchmaking and standings
// never disagree about who's "close."
function pickTwo(pool, ratings) {
  const sorted = pool
    .map((p) => ({ p, rating: ratings.get(p.subject) ?? 1500 }))
    .sort((x, y) => x.rating - y.rating);
  const i = Math.floor(Math.random() * sorted.length);
  let j;
  if (sorted.length <= MATCHMAKING_WINDOW * 2 + 1 || Math.random() < RANDOM_PAIR_CHANCE) {
    j = Math.floor(Math.random() * (sorted.length - 1));
    if (j >= i) j++;
  } else {
    const lo = Math.max(0, i - MATCHMAKING_WINDOW);
    const hi = Math.min(sorted.length - 1, i + MATCHMAKING_WINDOW);
    do {
      j = lo + Math.floor(Math.random() * (hi - lo + 1));
    } while (j === i);
  }
  return [sorted[i].p, sorted[j].p];
}

async function loadMatchup() {
  const pool = poolForVoting();
  const voteStatus = $("#vote-status");
  $("#vote-share").style.display = "none";
  if (pool === null) {
    // Follow filter is on and the follow list is still loading — wait
    // rather than flashing a false "not enough" hint.
    $("#vote-pool-hint").style.display = "none";
    $("#matchup").style.display = "none";
    $("#vote-actions").style.display = "none";
    $("#vote-hint-anon").style.display = "none";
    voteStatus.textContent = "loading who you follow…";
    voteStatus.className = "status";
    return;
  }
  $("#vote-hint-anon").style.display = session ? "none" : (pool.length >= 2 ? "" : "none");
  if (pool.length < 2) {
    const poolHint = $("#vote-pool-hint");
    poolHint.innerHTML = followFilterEnabled
      ? `not enough people you follow are in the pool yet — <a href="#/nominate">nominate one</a>, or turn off "only match people I follow" above.`
      : `not enough accounts nominated yet — <a href="#/nominate">go nominate one</a>.`;
    poolHint.style.display = "";
    $("#matchup").style.display = "none";
    $("#vote-actions").style.display = "none";
    return;
  }
  $("#vote-pool-hint").style.display = "none";
  currentPair = null;
  document.querySelectorAll(".matchup-card").forEach((c) => c.classList.remove("picked"));
  voteStatus.textContent = "loading matchup…";
  voteStatus.className = "status";
  const ratings = new Map(computeStandings(voteSnapshot.entries || []).map((s) => [s.did, s.rating]));
  const [p1, p2] = pickTwo(pool, ratings);
  try {
    const [profA, feedA, profB, feedB] = await Promise.all([
      getProfile(p1.subject),
      getFeed(p1.subject),
      getProfile(p2.subject),
      getFeed(p2.subject),
    ]);
    currentPair = { a: { did: p1.subject, profile: profA, feed: feedA }, b: { did: p2.subject, profile: profB, feed: feedB } };
    renderMatchup();
    voteStatus.textContent = "";
  } catch (e) {
    voteStatus.textContent = `couldn't load that matchup (${e.message}) — try again.`;
    voteStatus.className = "status err";
  }
}

function fillCard(side, entry) {
  const prof = entry.profile || {};
  $(`#avatar-${side}`).src = prof.avatar || "";
  $(`#name-${side}`).textContent = prof.displayName || prof.handle || entry.did;
  $(`#handle-${side}`).textContent = `@${prof.handle || entry.did}`;
  const feedEl = $(`#feed-${side}`);
  if (!entry.feed.length) {
    feedEl.innerHTML = `<div class="feed-empty">no public posts.</div>`;
  } else {
    feedEl.innerHTML = entry.feed
      .map((item) => {
        const text = item?.post?.record?.text || "";
        const at = item?.post?.record?.createdAt ? new Date(item.post.record.createdAt).toLocaleDateString() : "";
        return `<div class="feed-post">${esc(truncate(text, 200))}<div class="t">${esc(at)}</div></div>`;
      })
      .join("");
  }
}

function renderMatchup() {
  $("#matchup").style.display = "";
  $("#vote-actions").style.display = "";
  fillCard("a", currentPair.a);
  fillCard("b", currentPair.b);
}

async function castVote(side) {
  if (!currentPair) return;
  const winnerEntry = currentPair[side];
  const loserEntry = currentPair[side === "a" ? "b" : "a"];
  document.getElementById(`card-${side}`).classList.add("picked");
  const voteStatus = $("#vote-status");

  if (!session) {
    voteStatus.textContent = "sign in above to make votes count toward the leaderboard — here's another matchup.";
    voteStatus.className = "status";
    setTimeout(loadMatchup, 900);
    return;
  }

  const a = winnerEntry.did < loserEntry.did ? winnerEntry.did : loserEntry.did;
  const b = winnerEntry.did < loserEntry.did ? loserEntry.did : winnerEntry.did;
  const rkey = `${a}_vs_${b}`;
  const record = { a, b, winner: winnerEntry.did, votedAt: new Date().toISOString() };

  voteStatus.textContent = "saving your vote…";
  voteStatus.className = "status";
  try {
    const base = session.pdsUrl.replace(/\/$/, "");
    const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.putRecord`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: VOTE_COLLECTION, rkey, record }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    voteIndex.applyOwn(session.did, rkey, record);
    voteStatus.textContent = "vote saved — loading the next matchup…";
    voteStatus.className = "status ok";

    const winnerHandle = winnerEntry.profile?.handle || winnerEntry.did;
    const loserHandle = loserEntry.profile?.handle || loserEntry.did;
    const shareText = `on skymash I picked @${winnerHandle} over @${loserHandle} — vote your own matchups at https://skymash.bisks.net/`;
    $("#share-vote").href = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;
    $("#vote-share").style.display = "";

    setTimeout(loadMatchup, 1400);
  } catch (e) {
    voteStatus.textContent = `couldn't save that vote (${e.message}).`;
    voteStatus.className = "status err";
  }
}

$("#avatar-a").addEventListener("click", () => castVote("a"));
$("#avatar-b").addEventListener("click", () => castVote("b"));
$("#pick-a").addEventListener("click", () => castVote("a"));
$("#pick-b").addEventListener("click", () => castVote("b"));
$("#btn-skip").addEventListener("click", () => loadMatchup());
// The live "skip this matchup" button — available before voting, unlike
// #btn-skip above (which only appears in the post-vote share row). Loads a
// fresh pair without writing any record.
$("#btn-skip-live").addEventListener("click", () => loadMatchup());

// --- leaderboard -----------------------------------------------------------

let boardRenderToken = 0;

async function renderLeaderboard() {
  const boardStatus = $("#board-status");
  const table = $("#board-table");
  const body = $("#board-body");
  const standings = computeStandings(voteSnapshot.entries || []);
  if (!standings.length) {
    boardStatus.textContent = voteSnapshot.backfillDone
      ? "no votes yet — go pick a matchup."
      : "loading votes from across the network…";
    table.style.display = "none";
    return;
  }
  const poolMap = new Map(activePool().map((p) => [p.subject, p]));
  boardStatus.textContent = voteSnapshot.backfillDone ? "" : "still backfilling full vote history — standings may shift.";
  table.style.display = "";

  const token = ++boardRenderToken;
  const profiles = await getProfiles(standings.map((s) => s.did));
  if (token !== boardRenderToken) return; // a newer render started while profiles loaded

  body.innerHTML = standings
    .map((s, i) => {
      const p = poolMap.get(s.did);
      const prof = profiles.get(s.did);
      const handle = prof?.handle || p?.handle || s.did;
      const avatar = prof?.avatar || "";
      const avatarCell = avatar
        ? `<img class="board-avatar" src="${esc(avatar)}" alt="" loading="lazy" />`
        : `<span class="board-avatar board-avatar-empty"></span>`;
      return `<tr><td class="rank">${i + 1}</td><td class="profile"><span class="board-profile">${avatarCell}@${esc(handle)}</span></td><td class="rating">${s.rating}</td><td>${s.wins}–${s.losses}</td><td>${s.total}</td><td>${s.winPct == null ? "—" : s.winPct + "%"}</td></tr>`;
    })
    .join("");
}

// --- nominate ----------------------------------------------------------------

$("#btn-nominate").addEventListener("click", async () => {
  const status = $("#nominate-status");
  const input = $("#nominate-handle");
  const raw = input.value.trim();
  const btn = $("#btn-nominate");
  if (!raw) {
    status.textContent = "type a handle first.";
    status.className = "status err";
    return;
  }
  if (!session) {
    status.textContent = "sign in above first — nominating writes a record to your own PDS.";
    status.className = "status err";
    return;
  }
  btn.disabled = true;
  status.className = "status";
  try {
    status.textContent = "resolving…";
    const result = await clusterScore(raw, { onStep: (s) => (status.textContent = s) });
    const prof = await getProfile(result.did).catch(() => null);
    const handle = prof?.handle || raw.replace(/^@/, "");
    const record = { subject: result.did, handle, score: result.score, nominatedAt: new Date().toISOString() };
    const base = session.pdsUrl.replace(/\/$/, "");
    const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.putRecord`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: NOMINATION_COLLECTION, rkey: result.did, record }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    nominationIndex.applyOwn(session.did, result.did, record);
    status.textContent = `nominated @${handle} — cluster score ${result.score} (${result.kind}). in the pool now.`;
    status.className = "status ok";
    input.value = "";
  } catch (e) {
    status.textContent = `couldn't nominate that: ${e.message}`;
    status.className = "status err";
  } finally {
    btn.disabled = false;
  }
});

$("#btn-optout").addEventListener("click", async () => {
  if (!session) return;
  const btn = $("#btn-optout");
  const status = $("#optout-status");
  btn.disabled = true;
  status.textContent = "opting out…";
  try {
    const record = { subject: session.did, optedOutAt: new Date().toISOString() };
    const base = session.pdsUrl.replace(/\/$/, "");
    const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.putRecord`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: OPTOUT_COLLECTION, rkey: "self", record }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    optOutIndex.applyOwn(session.did, "self", record);
    status.textContent = "done — you're out of the pool. this can't be undone from here (record's on your own PDS).";
  } catch (e) {
    status.textContent = `couldn't opt out (${e.message}).`;
    btn.disabled = false;
  }
});

function renderPool() {
  const pool = activePool().sort((a, b) => b.score - a.score);
  const status = $("#pool-status");
  status.textContent = `${pool.length} account${pool.length === 1 ? "" : "s"} nominated so far${
    poolSnapshot.backfillDone ? "" : " (still loading full history…)"
  }.`;
  $("#pool-list").innerHTML =
    pool.map((p) => `<div class="pool-row"><span>@${esc(p.handle)}</span><span class="score">cluster score ${p.score}</span></div>`).join("") ||
    `<p class="empty">nobody yet — be the first.</p>`;

  const optOutBtn = $("#btn-optout");
  const optOutStatus = $("#optout-status");
  if (session) {
    const alreadyOut = (optOutSnapshot.entries || []).some((e) => e.subject === session.did);
    const inPool = pool.some((p) => p.subject === session.did);
    optOutBtn.style.display = "";
    optOutBtn.disabled = alreadyOut;
    optOutBtn.textContent = alreadyOut ? "you're opted out of the pool" : "remove me from the pool";
    optOutStatus.textContent = alreadyOut
      ? "signed-in account is excluded from nominations, past and future."
      : inPool
        ? "you're currently nominated — click to opt out."
        : "not currently nominated, but you can opt out pre-emptively.";
  } else {
    optOutBtn.style.display = "none";
    optOutStatus.textContent = "";
  }
  const votingPool = poolForVoting();
  if (currentTab() === "vote" && !currentPair && votingPool !== null && votingPool.length >= 2) loadMatchup();
  if (currentTab() === "vote" && votingPool !== null && votingPool.length < 2) {
    $("#vote-pool-hint").style.display = "";
    $("#matchup").style.display = "none";
    $("#vote-actions").style.display = "none";
  }
}

// --- boot ----------------------------------------------------------------------

async function boot() {
  document.querySelectorAll("nav.tabs a").forEach((a) => {
    a.addEventListener("click", () => {
      // hashchange listener handles the actual tab switch; nothing else needed.
    });
  });

  try {
    session = await completeLoginIfCallback();
  } catch (e) {
    sessionWho.textContent = `sign-in failed: ${e.message}`;
  }
  if (!session) session = await getSession();
  updateSessionUI();

  nominationIndex.start();
  voteIndex.start();
  optOutIndex.start();

  showTab(currentTab());
}

boot();
