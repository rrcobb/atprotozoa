// app.js — the play page. Flow:
//   1. Resolve a SimCluster (self + mutuals) for whatever handle the visitor
//      types in (public/lib/cluster.js — same mutual-follow pool as the rest
//      of the simcluster-* family).
//   2. Filter the network-wide net.bisks.shelfguessr.shelf index (public/lib
//      /global-index.js) down to whoever in that cluster has uploaded a
//      shelf photo.
//   3. Show a random shelf; the player clicks which cluster member they
//      think it belongs to.
//   4. If signed in, the guess is written as a net.bisks.shelfguessr.guess
//      record in the player's own PDS, feeding /leaderboard.

import { getSession, clearSession, completeLoginIfCallback, login, resolvePds } from "./lib/oauth.js";
import { recordGuess } from "./lib/records.js";
import { buildCluster } from "./lib/cluster.js";
import { GlobalIndex } from "./lib/global-index.js";

const SHELF_COLLECTION = "net.bisks.shelfguessr.shelf";

const els = {
  sessionBar: document.getElementById("sessionBar"),
  setupCard: document.getElementById("setupCard"),
  setupHint: document.getElementById("setupHint"),
  setupErr: document.getElementById("setupErr"),
  clusterHandleInput: document.getElementById("clusterHandleInput"),
  playBtn: document.getElementById("playBtn"),
  gameCard: document.getElementById("gameCard"),
};

let session = null;
let sessionScore = { correct: 0, total: 0 };
const pdsCache = new Map();

const shelfIndex = new GlobalIndex(SHELF_COLLECTION, {
  normalize: normalizeShelf,
  onUpdate: () => {
    if (state.mode === "empty" || state.mode === "loading-cluster") renderGame();
  },
});

function normalizeShelf(did, rkey, record) {
  if (rkey !== "self" || !record || typeof record !== "object" || !record.photo) return null;
  return {
    did,
    photo: record.photo,
    caption: typeof record.caption === "string" ? record.caption.slice(0, 140) : "",
    updatedAt: Date.parse(record.updatedAt || "") || 0,
  };
}

async function getPdsUrl(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  const url = await resolvePds(did);
  pdsCache.set(did, url);
  return url;
}

function blobUrl(pdsUrl, did, blob) {
  const cid = blob?.ref?.$link || blob?.ref?.toString?.();
  if (!cid || !pdsUrl) return null;
  const params = new URLSearchParams({ did, cid });
  return `${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.sync.getBlob?${params}`;
}

const state = {
  mode: "setup", // setup | loading-cluster | empty | round | result
  clusterActor: null,
  clusterDid: null,
  profileByDid: null,
  candidates: null,
  round: null, // { answer, options, photoSrc }
  lastAnswerDid: null,
};

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- session bar -------------------------------------------------------

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

// --- setup ---------------------------------------------------------------

els.playBtn.onclick = () => {
  const typed = els.clusterHandleInput.value.trim();
  const actor = typed || (session ? session.handle : "");
  if (!actor) {
    setSetupErr("type a handle, or sign in first.");
    return;
  }
  playCluster(actor);
};
els.clusterHandleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.playBtn.click();
});

function setSetupErr(msg) {
  els.setupErr.textContent = msg;
  els.setupErr.style.display = msg ? "block" : "none";
}

async function playCluster(actor) {
  setSetupErr("");
  state.mode = "loading-cluster";
  state.clusterActor = actor;
  els.gameCard.style.display = "block";
  renderGame();

  try {
    const cluster = await buildCluster(actor, { onStep: (msg) => renderGame(msg) });
    const profileByDid = new Map();
    profileByDid.set(cluster.self.did, cluster.self);
    for (const p of cluster.pool) profileByDid.set(p.did, p);
    state.clusterDid = cluster.did;
    state.profileByDid = profileByDid;
    state.mode = "empty"; // filled in by renderGame's candidate computation
    nextRound();
  } catch (err) {
    state.mode = "setup";
    els.gameCard.style.display = "none";
    setSetupErr(err.message || String(err));
  }
}

function currentCandidates() {
  if (!state.profileByDid) return [];
  const snapshot = shelfIndex.snapshot();
  return snapshot.entries
    .filter((e) => state.profileByDid.has(e.did))
    .map((e) => ({ ...e, profile: state.profileByDid.get(e.did) }));
}

// --- rounds ----------------------------------------------------------------

async function nextRound() {
  const candidates = currentCandidates();
  state.candidates = candidates;
  if (candidates.length < 2) {
    state.mode = "empty";
    renderGame();
    return;
  }
  let pool = candidates;
  if (candidates.length > 1 && state.lastAnswerDid) {
    const filtered = candidates.filter((c) => c.did !== state.lastAnswerDid);
    if (filtered.length) pool = filtered;
  }
  const answer = pool[Math.floor(Math.random() * pool.length)];
  state.lastAnswerDid = answer.did;
  const options = shuffle(candidates.slice());

  state.mode = "round";
  state.round = { answer, options, photoSrc: null, resolved: false };
  renderGame();

  const pdsUrl = await getPdsUrl(answer.did);
  const src = blobUrl(pdsUrl, answer.did, answer.photo);
  if (state.round.answer.did === answer.did) {
    state.round.photoSrc = src;
    renderGame();
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function chooseCandidate(did) {
  if (!state.round || state.round.resolved) return;
  const { answer } = state.round;
  const correct = did === answer.did;
  state.round.resolved = true;
  state.round.guessedDid = did;
  sessionScore.total += 1;
  if (correct) sessionScore.correct += 1;
  renderGame();

  if (session) {
    try {
      await recordGuess(session, { actual: answer.did, guessed: did, correct, clusterSeed: state.clusterDid });
    } catch (err) {
      console.warn("recordGuess failed", err);
    }
  }
}

// --- render ------------------------------------------------------------

function candidateChip(c, opts = {}) {
  const p = c.profile;
  const avatar = p.avatar
    ? `<img src="${esc(p.avatar)}" alt="" />`
    : `<img src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="%23e6dabd"/></svg>')}" alt="" />`;
  const cls = ["candidate"];
  if (opts.correct) cls.push("correct");
  if (opts.wrong) cls.push("wrong");
  if (opts.answer) cls.push("answer");
  return `<button class="${cls.join(" ")}" data-did="${esc(c.did)}" ${opts.disabled ? "disabled" : ""}>
    ${avatar}<span>@${esc(p.handle)}</span>
  </button>`;
}

function renderGame(loadingStep) {
  if (state.mode === "loading-cluster") {
    els.gameCard.innerHTML = `<p class="status">mapping @${esc(state.clusterActor)}'s SimCluster… ${esc(loadingStep || "")}</p>`;
    return;
  }

  if (state.mode === "empty") {
    const snap = shelfIndex.snapshot();
    const found = currentCandidates().length;
    els.gameCard.innerHTML = `
      <div class="empty-state">
        <p>only <strong>${found}</strong> ${found === 1 ? "person" : "people"} in @${esc(state.clusterActor)}'s SimCluster ${found === 1 ? "has" : "have"} uploaded a shelf so far — need at least 2 to play a round.</p>
        <p class="hint">${snap.backfillDone ? "the network-wide scan is finished." : `still scanning the network for shelves (${snap.entryCount} found so far)…`}</p>
        <p><a class="btn" href="/upload">upload your shelf</a> <button class="btn secondary" id="rescanBtn">check again</button> <button class="btn secondary" id="backBtn">try another handle</button></p>
      </div>
    `;
    const rescan = document.getElementById("rescanBtn");
    if (rescan) rescan.onclick = () => nextRound();
    const back = document.getElementById("backBtn");
    if (back) back.onclick = resetToSetup;
    return;
  }

  if (state.mode === "round" || state.mode === "result") {
    const r = state.round;
    const photo = r.photoSrc
      ? `<img src="${esc(r.photoSrc)}" alt="a bookshelf" />`
      : `<div style="padding:60px;text-align:center;color:var(--ink-soft)">loading photo…</div>`;

    let banner = "";
    let chips = "";
    if (r.resolved) {
      const correct = r.guessedDid === r.answer.did;
      banner = `<div class="result-banner ${correct ? "correct" : "wrong"}">
        ${correct ? "correct! " : "nope — "} it was <strong>@${esc(r.answer.profile.handle)}</strong>'s shelf.
        ${r.answer.caption ? `<br><em>"${esc(r.answer.caption)}"</em>` : ""}
        ${!session ? `<br><span class="hint">sign in to save this to the leaderboard.</span>` : ""}
      </div>`;
      chips = r.options
        .map((c) => candidateChip(c, {
          disabled: true,
          answer: c.did === r.answer.did,
          wrong: c.did === r.guessedDid && r.guessedDid !== r.answer.did,
        }))
        .join("");
    } else {
      chips = r.options.map((c) => candidateChip(c)).join("");
    }

    els.gameCard.innerHTML = `
      <p><span class="score-pill">${sessionScore.correct}/${sessionScore.total} this session</span> · playing @${esc(state.clusterActor)}'s SimCluster · <button class="btn secondary" id="backBtn" style="padding:3px 8px;font-size:11px">switch</button></p>
      <div class="shelf-photo-wrap">${photo}</div>
      <p style="margin:0 0 8px;font-weight:bold">whose shelf is this?</p>
      ${banner}
      <div class="candidate-grid">${chips}</div>
      ${r.resolved ? `<p style="margin-top:16px"><button class="btn" id="nextBtn">next round →</button> <a class="btn secondary" id="shareBtn" href="#">share your streak</a></p>` : ""}
    `;

    if (!r.resolved) {
      els.gameCard.querySelectorAll(".candidate").forEach((btn) => {
        btn.onclick = () => chooseCandidate(btn.dataset.did);
      });
    } else {
      document.getElementById("nextBtn").onclick = () => nextRound();
      const backBtn = document.getElementById("backBtn");
      if (backBtn) backBtn.onclick = resetToSetup;
      const shareBtn = document.getElementById("shareBtn");
      if (shareBtn) {
        const shareText = `I just guessed ${sessionScore.correct}/${sessionScore.total} bookshelves right playing @${state.clusterActor}'s SimCluster on shelfguessr 📚 https://shelfguessr.bisks.net/`;
        shareBtn.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;
        shareBtn.target = "_blank";
        shareBtn.rel = "noopener";
      }
    }
    return;
  }
}

function resetToSetup() {
  state.mode = "setup";
  state.clusterActor = null;
  state.profileByDid = null;
  state.round = null;
  els.gameCard.style.display = "none";
  els.gameCard.innerHTML = "";
  els.clusterHandleInput.value = "";
}

// --- boot -----------------------------------------------------------------

(async function boot() {
  try {
    const cb = await completeLoginIfCallback();
    if (cb) session = cb;
  } catch (err) {
    console.warn("oauth callback failed", err);
  }
  if (!session) session = await getSession();
  renderSessionBar();
  if (session && !els.clusterHandleInput.value) {
    els.clusterHandleInput.placeholder = `@${session.handle} (your own cluster)`;
  }
  shelfIndex.start();
})();
