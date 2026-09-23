// app.js — hashteams (hashteams.bisks.net). Computing a team is a pure
// function of a DID (see lib/team.js) and needs no account, no index, no
// network write. The roster ("who else is on this team") is different: it
// can only ever show accounts that chose to publish a
// net.bisks.hashteams.member record to their own PDS (see wrangler.toml for
// why crawling every DID on the network instead would violate the site's own
// consent rule). lib/global-index.js replays the whole network for that one
// collection — backfill via com.atproto.sync.listReposByCollection plus a
// live Jetstream subscription — straight in the browser.

import { login, getSession, clearSession, completeLoginIfCallback, dpopFetch, resolveHandle } from "./lib/oauth.js";
import { GlobalIndex } from "./lib/global-index.js";
import { digestForDid, teamFromDigest, colorFromDigest } from "./lib/team.js";

const COLLECTION = "net.bisks.hashteams.member";
const SITE = "https://hashteams.bisks.net";
// A real browser-render cap (DOM nodes in the roster list), not a network or
// count cap — rosterMeta always reports the true member count, uncapped.
const ROSTER_RENDER_CAP = 500;

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function cleanHandle(raw) {
  let h = (raw || "").trim().replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}
async function resolveDisplayHandle(did) {
  try {
    let doc = null;
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`https://plc.directory/${did}`);
      if (r.ok) doc = await r.json();
    } else if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").replace(/:/g, "/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      if (r.ok) doc = await r.json();
    }
    const aka = (doc?.alsoKnownAs || []).find((a) => a.startsWith("at://"));
    return aka ? aka.slice("at://".length) : null;
  } catch (_) {
    return null;
  }
}

// The lexicon's record key is literal:self — one membership per account.
// Anything written under a different rkey isn't a conforming member record.
function normalize(did, rkey, record) {
  if (rkey !== "self" || !record || typeof record !== "object") return null;
  const createdAtMs = Date.parse(record.createdAt || "");
  return { did, createdAt: Number.isFinite(createdAtMs) ? createdAtMs : 0 };
}

const els = {
  lookupForm: document.getElementById("lookupForm"),
  handleInput: document.getElementById("handleInput"),
  lookupGo: document.getElementById("lookupGo"),
  lookupStatus: document.getElementById("lookupStatus"),
  result: document.getElementById("result"),
  swatch: document.getElementById("swatch"),
  teamNumber: document.getElementById("teamNumber"),
  resultHandle: document.getElementById("resultHandle"),
  resultDid: document.getElementById("resultDid"),
  resultBytes: document.getElementById("resultBytes"),
  viewTeamPage: document.getElementById("viewTeamPage"),
  shareBluesky: document.getElementById("shareBluesky"),
  signinBar: document.getElementById("signinBar"),
  joinRow: document.getElementById("joinRow"),
  joinBtn: document.getElementById("joinBtn"),
  leaveBtn: document.getElementById("leaveBtn"),
  joinStatus: document.getElementById("joinStatus"),
  rosterTitle: document.getElementById("rosterTitle"),
  rosterMeta: document.getElementById("rosterMeta"),
  rosterEmpty: document.getElementById("rosterEmpty"),
  rosterList: document.getElementById("rosterList"),
};

function setLookupStatus(msg, kindClass) {
  els.lookupStatus.textContent = msg || "";
  els.lookupStatus.className = "status" + (kindClass ? " " + kindClass : "");
}
function setJoinStatus(msg, kindClass) {
  els.joinStatus.textContent = msg || "";
  els.joinStatus.className = "status" + (kindClass ? " " + kindClass : "");
}

if (window.attachHandleTypeahead) window.attachHandleTypeahead(els.handleInput);

// --- team + handle caches, resolved lazily and re-rendered as they land -----

const teamCache = new Map(); // did -> { team, color }
const handleCache = new Map(); // did -> handle string | "pending"
let rerenderTimer = null;
function scheduleRerender() {
  if (rerenderTimer) return;
  rerenderTimer = setTimeout(() => {
    rerenderTimer = null;
    renderRoster();
  }, 150);
}
async function teamFor(did) {
  if (teamCache.has(did)) return teamCache.get(did);
  const digest = await digestForDid(did);
  const info = { team: teamFromDigest(digest), color: colorFromDigest(digest) };
  teamCache.set(did, info);
  return info;
}
function ensureTeamsCached(entries) {
  const missing = entries.filter((e) => !teamCache.has(e.did));
  if (!missing.length) return;
  Promise.all(missing.map((e) => teamFor(e.did))).then(scheduleRerender);
}
function handleFor(did) {
  if (handleCache.has(did)) {
    const v = handleCache.get(did);
    return v === "pending" ? null : v;
  }
  handleCache.set(did, "pending");
  fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      handleCache.set(did, d?.handle || did);
      scheduleRerender();
    })
    .catch(() => handleCache.set(did, did));
  return null;
}

let lastSnapshot = { entries: [], backfillDone: false };
const index = new GlobalIndex(COLLECTION, {
  normalize,
  onUpdate: (snap) => {
    lastSnapshot = snap;
    ensureTeamsCached(snap.entries);
    renderRoster();
  },
});

// --- session -----------------------------------------------------------------

let session = null;
let membership = null; // null = unknown/logged-out, true/false once checked

async function checkMembership() {
  if (!session) { membership = null; return; }
  try {
    const qs = new URLSearchParams({ repo: session.did, collection: COLLECTION, rkey: "self" }).toString();
    const res = await fetch(`${session.pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${qs}`);
    membership = res.ok;
  } catch (_) {
    membership = false;
  }
  renderJoin();
}

function renderSignin() {
  if (session) {
    els.signinBar.innerHTML = `
      <span>signed in as <b>@${esc(session.handle)}</b></span>
      <button id="signOut" type="button" class="btn secondary">sign out</button>
    `;
    document.getElementById("signOut").addEventListener("click", async () => {
      await clearSession();
      session = null;
      membership = null;
      renderSignin();
      renderJoin();
    });
    return;
  }
  els.signinBar.innerHTML = `
    <input id="loginHandle" type="text" placeholder="your handle to sign in" autocomplete="off" autocapitalize="off" spellcheck="false" />
    <button id="signIn" type="button" class="btn">sign in</button>
    <span class="status" id="signinErr"></span>
  `;
  if (window.attachHandleTypeahead) window.attachHandleTypeahead(document.getElementById("loginHandle"));
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
}

function renderJoin() {
  els.joinRow.hidden = !session;
  if (!session) return;
  els.joinBtn.hidden = membership === true;
  els.leaveBtn.hidden = membership !== true;
}

async function join() {
  if (!session) return;
  els.joinBtn.disabled = true;
  setJoinStatus("joining…");
  try {
    const record = { $type: COLLECTION, createdAt: new Date().toISOString() };
    const res = await dpopFetch(session, `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: COLLECTION, rkey: "self", record }),
    });
    const written = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(written.message || "couldn't write that record to your PDS");
    index.applyOwn(session.did, "self", record);
    membership = true;
    renderJoin();
    setJoinStatus("joined.", "ok");
    doLookup(session.handle || session.did);
  } catch (err) {
    setJoinStatus("couldn't join: " + err.message, "err");
  } finally {
    els.joinBtn.disabled = false;
  }
}

async function leave() {
  if (!session) return;
  els.leaveBtn.disabled = true;
  setJoinStatus("leaving…");
  try {
    const res = await dpopFetch(session, `${session.pdsUrl}/xrpc/com.atproto.repo.deleteRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: COLLECTION, rkey: "self" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || "couldn't remove that record");
    }
    index.removeOwn(session.did, "self");
    membership = false;
    renderJoin();
    setJoinStatus("left the roster.", "ok");
  } catch (err) {
    setJoinStatus("couldn't leave: " + err.message, "err");
  } finally {
    els.leaveBtn.disabled = false;
  }
}
els.joinBtn.addEventListener("click", join);
els.leaveBtn.addEventListener("click", leave);

// --- lookup / compute ---------------------------------------------------------

let currentTeam = null;

async function doLookup(rawInput) {
  const raw = cleanHandle(rawInput);
  if (!raw) { setLookupStatus("enter a handle first.", "err"); return; }
  els.lookupGo.disabled = true;
  setLookupStatus("resolving…");
  try {
    const did = raw.startsWith("did:") ? raw : await resolveHandle(raw);
    if (!did) throw new Error("couldn't resolve that handle");
    const digest = await digestForDid(did);
    const team = teamFromDigest(digest);
    const color = colorFromDigest(digest);
    teamCache.set(did, { team, color });

    const handle = raw.startsWith("did:") ? (await resolveDisplayHandle(did)) || did : raw;

    currentTeam = team;
    renderResult(did, handle, team, color, digest);
    setLookupStatus("");
    renderRoster();
  } catch (err) {
    setLookupStatus("couldn't compute that: " + err.message, "err");
  } finally {
    els.lookupGo.disabled = false;
  }
}

function renderResult(did, handle, team, color, digest) {
  els.result.hidden = false;
  els.swatch.style.background = color;
  els.teamNumber.textContent = team;
  els.resultHandle.textContent = "@" + handle;
  els.resultDid.textContent = did;
  const b0 = "0x" + digest[0].toString(16).padStart(2, "0");
  const b1 = "0x" + digest[1].toString(16).padStart(2, "0");
  els.resultBytes.textContent = `${b0} ${b1} → ${team}`;
  els.viewTeamPage.href = `/team/${team}`;
  const shareText = `@${handle} is on team #${team} of 65536, computed from SHA-256(their DID) — ${SITE}/team/${team}`;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
}

els.lookupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  doLookup(els.handleInput.value);
});

// --- roster --------------------------------------------------------------------

function renderRoster() {
  if (currentTeam === null) {
    els.rosterTitle.textContent = "roster";
    els.rosterMeta.textContent = "";
    els.rosterEmpty.hidden = false;
    els.rosterEmpty.textContent = "look up a handle above to see who else opted into that team.";
    els.rosterList.innerHTML = "";
    return;
  }
  els.rosterTitle.textContent = `team #${currentTeam}`;
  const members = lastSnapshot.entries
    .filter((e) => teamCache.get(e.did)?.team === currentTeam)
    .sort((a, b) => a.createdAt - b.createdAt);

  els.rosterMeta.textContent = lastSnapshot.backfillDone
    ? `${members.length} on the roster`
    : `${members.length} on the roster so far — still scanning the network…`;

  if (!members.length) {
    els.rosterEmpty.hidden = false;
    els.rosterEmpty.textContent = lastSnapshot.backfillDone
      ? "nobody's joined this team's roster yet — be the first."
      : "nobody's shown up yet — still scanning the network…";
    els.rosterList.innerHTML = "";
    return;
  }
  els.rosterEmpty.hidden = true;
  els.rosterList.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const m of members.slice(0, ROSTER_RENDER_CAP)) {
    const handle = handleFor(m.did);
    const el = document.createElement(handle ? "a" : "span");
    el.className = "roster-item" + (session && session.did === m.did ? " you" : "");
    if (handle) {
      el.href = `https://bsky.app/profile/${handle}`;
      el.target = "_blank";
      el.rel = "noopener";
      el.textContent = "@" + handle;
    } else {
      el.textContent = m.did.slice(0, 20) + "…";
    }
    frag.appendChild(el);
  }
  els.rosterList.appendChild(frag);
}

// --- routing: /team/<n> is a real, shareable permalink to one team's roster
// (notes/45-sharing-and-virality.md tier 4) — src/index.ts stamps that
// team's number into the OG tags for link unfurlers before this script ever
// runs; here it just means starting straight on that team's roster instead
// of the empty "look up a handle" state.
function parseRoute() {
  const m = location.pathname.match(/^\/team\/(\d{1,5})\/?$/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 0 && n <= 65535) return { team: n };
  }
  return { team: null };
}

async function init() {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setJoinStatus("sign-in failed: " + e.message, "err");
  }
  renderSignin();
  renderJoin();
  checkMembership();

  const route = parseRoute();
  if (route.team !== null) {
    currentTeam = route.team;
    renderRoster();
  }

  index.start();
}
init();
