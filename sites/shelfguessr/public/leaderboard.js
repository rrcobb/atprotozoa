// leaderboard.js — replays the network-wide net.bisks.shelfguessr.guess
// index (public/lib/global-index.js) into a correct/total standings table
// (public/lib/standings.js), same recipe as sites/skymash's vote -> elo.js.

import { getSession, clearSession, completeLoginIfCallback, login } from "./lib/oauth.js";
import { GlobalIndex } from "./lib/global-index.js";
import { computeStandings } from "./lib/standings.js";

const GUESS_COLLECTION = "net.bisks.shelfguessr.guess";
const PLC_DIR = "https://plc.directory";

const els = {
  sessionBar: document.getElementById("sessionBar"),
  scanStatus: document.getElementById("scanStatus"),
  standingsTable: document.getElementById("standingsTable"),
  standingsBody: document.getElementById("standingsBody"),
  emptyState: document.getElementById("emptyState"),
};

let session = null;
const profileCache = new Map();

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function normalizeGuess(did, rkey, record) {
  if (!record || typeof record !== "object") return null;
  if (typeof record.correct !== "boolean" || typeof record.actual !== "string" || typeof record.guessed !== "string") return null;
  return {
    guesserDid: did,
    actual: record.actual,
    guessed: record.guessed,
    correct: record.correct,
    guessedAt: Date.parse(record.guessedAt || "") || 0,
  };
}

const guessIndex = new GlobalIndex(GUESS_COLLECTION, {
  normalize: normalizeGuess,
  onUpdate: render,
});

async function didDoc(did) {
  try {
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`${PLC_DIR}/${did}`);
      return r.ok ? r.json() : null;
    }
    if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").split(":").join("/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      return r.ok ? r.json() : null;
    }
  } catch {}
  return null;
}

async function handleFor(did) {
  if (profileCache.has(did)) return profileCache.get(did);
  const p = (async () => {
    const doc = await didDoc(did);
    const aka = (doc?.alsoKnownAs || []).find((a) => typeof a === "string" && a.startsWith("at://"));
    return aka ? aka.slice("at://".length) : did;
  })();
  profileCache.set(did, p);
  return p;
}

async function render() {
  const snap = guessIndex.snapshot();
  els.scanStatus.textContent = snap.backfillDone
    ? `scan complete — ${snap.entryCount} guesses replayed.`
    : `scanning the network for guesses… ${snap.entryCount} found so far.`;

  const standings = computeStandings(snap.entries).slice(0, 100);
  if (!standings.length) {
    els.standingsTable.style.display = "none";
    els.emptyState.style.display = "block";
    return;
  }
  els.emptyState.style.display = "none";
  els.standingsTable.style.display = "table";

  const handles = await Promise.all(standings.map((s) => handleFor(s.did)));
  els.standingsBody.innerHTML = standings
    .map((s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>@${esc(handles[i])}</td>
        <td>${s.correct}</td>
        <td>${s.total}</td>
        <td>${s.accuracy}%</td>
      </tr>
    `)
    .join("");
}

function renderSessionBar() {
  if (session) {
    els.sessionBar.innerHTML = `
      <span>signed in as <strong>@${esc(session.handle)}</strong></span>
      <button id="signOutBtn">sign out</button>
    `;
    document.getElementById("signOutBtn").onclick = async () => {
      await clearSession();
      session = null;
      renderSessionBar();
    };
  } else {
    els.sessionBar.innerHTML = `
      <input type="text" id="loginHandle" placeholder="your.bsky.social" style="width:150px" autocomplete="off" spellcheck="false" />
      <button id="signInBtn">sign in</button>
    `;
    document.getElementById("signInBtn").onclick = async () => {
      const h = document.getElementById("loginHandle").value.trim();
      if (!h) return;
      try {
        await login(h);
      } catch (err) {
        alert(`sign in failed: ${err.message}`);
      }
    };
  }
}

(async function boot() {
  try {
    const cb = await completeLoginIfCallback();
    if (cb) session = cb;
  } catch (err) {
    console.warn("oauth callback failed", err);
  }
  if (!session) session = await getSession();
  renderSessionBar();
  render();
  guessIndex.start();
})();
