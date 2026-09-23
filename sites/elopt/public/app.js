// app.js — elopt.bisks.net. Ties together sign-in (lib/oauth.js), the
// opt-in/vote writes (lib/records.js), the network-wide roster+elo replay
// (lib/global-index.js), and thread resolution (lib/thread.js).

import { login, getSession, clearSession, completeLoginIfCallback } from "./lib/oauth.js";
import { getMyOptin, optIn, optOut, castVote, voteRkey } from "./lib/records.js";
import { GlobalIndex } from "./lib/global-index.js";
import { resolveThread } from "./lib/thread.js";

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

const els = {
  signinBar: document.getElementById("signinBar"),
  optinState: document.getElementById("optinState"),
  optinBtn: document.getElementById("optinBtn"),
  optinStatus: document.getElementById("optinStatus"),
  rosterCount: document.getElementById("rosterCount"),
  board: document.getElementById("board"),
  boardBody: document.getElementById("boardBody"),
  boardEmpty: document.getElementById("boardEmpty"),
  threadInput: document.getElementById("threadInput"),
  threadGo: document.getElementById("threadGo"),
  threadStatus: document.getElementById("threadStatus"),
  threadResult: document.getElementById("threadResult"),
  participantsLabel: document.getElementById("participantsLabel"),
  participantsList: document.getElementById("participantsList"),
  matchupBox: document.getElementById("matchupBox"),
  fighterA: document.getElementById("fighterA"),
  fighterB: document.getElementById("fighterB"),
  voteButtons: document.getElementById("voteButtons"),
  voteStatus: document.getElementById("voteStatus"),
  voteShare: document.getElementById("voteShare"),
  shareVote: document.getElementById("shareVote"),
  secretMark: document.getElementById("secretMark"),
};

// --- secret cee.wtf prefill (standing order, 2026-08-28) ---------------------
// The only handle-shaped input on this page is the sign-in box, rendered
// fresh each time renderSignin() runs — so this wires the currently-mounted
// #loginHandle input, not a fixed element.
els.secretMark.addEventListener("click", () => {
  const input = document.getElementById("loginHandle");
  if (!input) return;
  input.value = "@cee.wtf";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();
});

// --- sign-in ------------------------------------------------------------------

let session = null;
let myOptedIn = false;

function renderSignin() {
  if (session) {
    els.signinBar.innerHTML = `
      <span>signed in as <b>@${esc(session.handle)}</b></span>
      <button id="signOut" type="button">sign out</button>
    `;
    document.getElementById("signOut").addEventListener("click", async () => {
      await clearSession();
      session = null;
      myOptedIn = false;
      renderSignin();
      renderOptin();
    });
    return;
  }
  els.signinBar.innerHTML = `
    <input id="loginHandle" type="text" placeholder="your handle to sign in" autocomplete="off" autocapitalize="off" spellcheck="false" />
    <button id="signIn" type="button">sign in</button>
    <span class="signin-err" id="signinErr"></span>
  `;
  if (window.attachHandleTypeahead) window.attachHandleTypeahead(document.getElementById("loginHandle"));
  document.getElementById("signIn").addEventListener("click", async () => {
    const h = cleanHandle(document.getElementById("loginHandle").value);
    const err = document.getElementById("signinErr");
    if (!h) {
      err.textContent = "enter your handle first.";
      return;
    }
    err.textContent = "";
    try {
      await login(h);
    } catch (e) {
      err.textContent = e.message;
    }
  });
}

function renderOptin() {
  if (!session) {
    els.optinState.className = "optin-state out";
    els.optinState.textContent = "sign in to opt in.";
    els.optinBtn.disabled = true;
    els.optinBtn.textContent = "opt in";
    els.optinBtn.className = "";
    return;
  }
  els.optinBtn.disabled = false;
  if (myOptedIn) {
    els.optinState.className = "optin-state";
    els.optinState.innerHTML = `you're <b>opted in</b> — you can be battled and ranked.`;
    els.optinBtn.textContent = "opt out";
    els.optinBtn.className = "danger";
  } else {
    els.optinState.className = "optin-state out";
    els.optinState.textContent = "not opted in — you won't appear on the board.";
    els.optinBtn.textContent = "opt in";
    els.optinBtn.className = "primary";
  }
}

els.optinBtn.addEventListener("click", async () => {
  if (!session) return;
  els.optinBtn.disabled = true;
  els.optinStatus.textContent = "";
  els.optinStatus.className = "status";
  try {
    if (myOptedIn) {
      await optOut(session);
      myOptedIn = false;
      index.applyOwnOptout(session.did);
      els.optinStatus.textContent = "opted out. you're off the board.";
    } else {
      await optIn(session);
      myOptedIn = true;
      index.applyOwnOptin(session.did, new Date().toISOString());
      els.optinStatus.textContent = "opted in! you can now be battled and ranked.";
    }
    els.optinStatus.className = "status ok";
  } catch (e) {
    els.optinStatus.textContent = e.message;
  } finally {
    els.optinBtn.disabled = false;
    renderOptin();
  }
});

// --- roster + leaderboard -----------------------------------------------------

const profileCache = new Map();
async function getProfile(did) {
  if (profileCache.has(did)) return profileCache.get(did);
  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    if (!res.ok) throw new Error();
    const p = await res.json();
    const entry = { did, handle: p.handle || did, displayName: p.displayName || p.handle || did, avatar: p.avatar || "" };
    profileCache.set(did, entry);
    return entry;
  } catch (_) {
    const entry = { did, handle: did, displayName: did, avatar: "" };
    profileCache.set(did, entry);
    return entry;
  }
}

let renderingBoard = false;
let pendingBoardSnapshot = null;
async function renderBoard(snapshot) {
  els.rosterCount.textContent = `${snapshot.rosterSize} opted in · ${snapshot.voteCount} votes cast${snapshot.backfillActive ? " · still reading the network…" : ""}`;
  if (renderingBoard) {
    pendingBoardSnapshot = snapshot; // a render is already in flight — pick this up once it's done
    return;
  }
  renderingBoard = true;
  try {
    const rows = Array.from(snapshot.elo.values()).sort((a, b) => b.elo - a.elo);
    if (!rows.length) {
      els.board.hidden = true;
      els.boardEmpty.hidden = false;
      return;
    }
    els.boardEmpty.hidden = true;
    els.board.hidden = false;
    const profiles = await Promise.all(rows.slice(0, 200).map((r) => getProfile(r.did)));
    els.boardBody.innerHTML = rows
      .slice(0, 200)
      .map((r, i) => {
        const p = profiles[i];
        return `<tr>
          <td class="rank">${i + 1}</td>
          <td><span class="who">${p.avatar ? `<img src="${esc(p.avatar)}" alt="" loading="lazy" />` : ""}<a href="https://bsky.app/profile/${esc(p.handle)}" target="_blank" rel="noopener">@${esc(p.handle)}</a></span></td>
          <td class="elo-num">${r.elo}</td>
          <td class="record">${r.wins}-${r.losses}</td>
        </tr>`;
      })
      .join("");
  } finally {
    renderingBoard = false;
    if (pendingBoardSnapshot) {
      const next = pendingBoardSnapshot;
      pendingBoardSnapshot = null;
      renderBoard(next);
    }
  }
}

const index = new GlobalIndex({
  onUpdate: (snapshot) => {
    // Only ever flip TRUE here (roster catching up to a real opt-in the
    // direct getMyOptin() check at boot already confirmed, or one just
    // applied via applyOwnOptin). Never flip false on absence — the network
    // backfill can take a while to reach any given DID, and "not found yet"
    // is not the same as "opted out."  optOut() flips it false directly.
    if (session && snapshot.roster.has(session.did)) myOptedIn = true;
    renderOptin();
    renderBoard(snapshot);
    if (currentEligible) refreshEligibility(snapshot);
  },
});

// --- battle: resolve a thread, filter to opted-in participants ---------------

let currentThread = null; // { rootUri, participants }
let currentEligible = null; // participants filtered to the live roster
let picked = []; // up to two DIDs picked to battle

function refreshEligibility(snapshot) {
  currentEligible = currentThread.participants.filter((p) => snapshot.roster.has(p.did));
  renderParticipants(snapshot);
}

function renderParticipants(snapshot) {
  els.participantsLabel.textContent = currentEligible.length
    ? `${currentEligible.length} of ${currentThread.participants.length} people in this thread have opted in — pick two to battle:`
    : `none of the ${currentThread.participants.length} people in this thread have opted in yet. nobody gets battled or ranked without consenting first.`;
  els.participantsList.innerHTML = currentThread.participants
    .map((p) => {
      const eligible = snapshot.roster.has(p.did);
      const isPicked = picked.includes(p.did);
      return `<span class="pchip ${eligible ? "eligible" : "ineligible"}" data-did="${esc(p.did)}" style="${eligible ? "cursor:pointer" : ""}${isPicked ? ";outline:2px solid var(--accent)" : ""}">
        ${p.avatar ? `<img src="${esc(p.avatar)}" alt="" loading="lazy" />` : ""}@${esc(p.handle)}
      </span>`;
    })
    .join("");
  if (currentEligible.length >= 2) {
    for (const chip of els.participantsList.querySelectorAll(".pchip.eligible")) {
      chip.addEventListener("click", () => togglePick(chip.dataset.did, snapshot));
    }
  }
  renderMatchup(snapshot);
}

function togglePick(did, snapshot) {
  if (picked.includes(did)) {
    picked = picked.filter((d) => d !== did);
  } else if (picked.length < 2) {
    picked = [...picked, did];
  } else {
    picked = [picked[1], did];
  }
  renderParticipants(snapshot);
}

function fighterHtml(p, elo) {
  return `${p.avatar ? `<img src="${esc(p.avatar)}" alt="" />` : ""}<div class="name">@${esc(p.handle)}</div><div class="elo">elo ${elo}</div>`;
}

function renderMatchup(snapshot) {
  if (picked.length !== 2) {
    els.matchupBox.hidden = true;
    return;
  }
  els.matchupBox.hidden = false;
  const [aDid, bDid] = picked;
  const a = currentThread.participants.find((p) => p.did === aDid);
  const b = currentThread.participants.find((p) => p.did === bDid);
  const board = snapshot.elo;
  els.fighterA.innerHTML = fighterHtml(a, board.get(aDid)?.elo ?? 1000);
  els.fighterB.innerHTML = fighterHtml(b, board.get(bDid)?.elo ?? 1000);
  els.voteButtons.innerHTML = `
    <button id="voteA" type="button">@${esc(a.handle)} won</button>
    <button id="voteB" type="button">@${esc(b.handle)} won</button>
  `;
  document.getElementById("voteA").addEventListener("click", () => vote(aDid, bDid, aDid));
  document.getElementById("voteB").addEventListener("click", () => vote(aDid, bDid, bDid));
}

async function vote(subjectA, subjectB, winner) {
  els.voteStatus.className = "status";
  els.voteShare.hidden = true;
  if (!session) {
    els.voteStatus.textContent = "sign in to vote.";
    return;
  }
  els.voteStatus.textContent = "casting vote…";
  try {
    await castVote(session, subjectA, subjectB, winner, currentThread.rootUri);
    index.applyOwnVote(session.did, voteRkey(subjectA, subjectB, currentThread.rootUri), {
      subjectA, subjectB, winner, thread: currentThread.rootUri, createdAt: new Date().toISOString(),
    });
    els.voteStatus.textContent = "vote cast — the board just moved.";
    els.voteStatus.className = "status ok";
    const loserDid = winner === subjectA ? subjectB : subjectA;
    const winnerP = currentThread.participants.find((p) => p.did === winner);
    const loserP = currentThread.participants.find((p) => p.did === loserDid);
    const shareText = `I just called @${winnerP.handle} the winner over @${loserP.handle} on elopt — elo, but only for people who consent. https://elopt.bisks.net/`;
    els.shareVote.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
    els.voteShare.hidden = false;
  } catch (e) {
    els.voteStatus.textContent = e.message;
  }
}

els.threadGo.addEventListener("click", async () => {
  const raw = els.threadInput.value;
  els.threadStatus.textContent = "reading thread…";
  els.threadStatus.className = "status";
  els.threadResult.hidden = true;
  picked = [];
  try {
    const thread = await resolveThread(raw);
    currentThread = thread;
    els.threadStatus.textContent = "";
    els.threadResult.hidden = false;
    refreshEligibility(index.snapshot());
  } catch (e) {
    els.threadStatus.textContent = e.message;
  }
});

// --- boot -----------------------------------------------------------------

async function boot() {
  renderSignin();
  renderOptin();
  index.start();
  try {
    const cb = await completeLoginIfCallback();
    if (cb) session = cb;
  } catch (e) {
    console.warn("oauth callback failed", e);
  }
  if (!session) session = await getSession();
  if (session) {
    renderSignin();
    try {
      const rec = await getMyOptin(session);
      myOptedIn = !!rec?.value && rec.value.consent === true;
    } catch (_) {
      myOptedIn = false;
    }
    renderOptin();
  }
}

boot();
