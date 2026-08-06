// app.js — duohaunt.bisks.net client.
//
// The deck and the actual spaced-repetition scheduling live entirely here,
// in localStorage — nothing about your cards ever reaches the Worker. Only
// three things cross the network once you sign in: a check-in record written
// to *your own* PDS (net.bisks.duohaunt.checkin — src/index.ts reads it back
// off your PDS before it counts, never trusting this client's word for it),
// the public wall read (no auth), and — only on an explicit tap of "confess
// publicly" — a real app.bsky.feed.post record, written from your live
// session, never from the server. See src/index.ts's header comment for the
// full reasoning.

import { login, getSession, clearSession, completeLoginIfCallback, dpopFetch } from "./lib/oauth.js";

const CHECKIN_COLLECTION = "net.bisks.duohaunt.checkin";
const DECK_KEY = "duohaunt:deck";
const LAST_CHECKIN_KEY = "duohaunt:lastCheckinWriteAt";
const NAG_DISMISS_KEY = "duohaunt:nagDismissed"; // sessionStorage — reappears every fresh visit
const CHECKIN_THROTTLE_MS = 5 * 60 * 1000;

const TIERS = [
  { emoji: "🌱", label: "clear" },
  { emoji: "🕯️", label: "haunted" },
  { emoji: "👻", label: "restless" },
  { emoji: "🌀", label: "unravelling" },
  { emoji: "💀", label: "lost to the pit" },
];

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

const els = {
  addForm: document.getElementById("addForm"),
  front: document.getElementById("front"),
  back: document.getElementById("back"),
  addStatus: document.getElementById("addStatus"),
  deckCount: document.getElementById("deckCount"),
  cardList: document.getElementById("cardList"),
  reviewBtn: document.getElementById("reviewBtn"),
  reviewBox: document.getElementById("reviewBox"),
  rFront: document.getElementById("rFront"),
  rBack: document.getElementById("rBack"),
  rProgress: document.getElementById("rProgress"),
  showBtn: document.getElementById("showBtn"),
  rateRow: document.getElementById("rateRow"),
  hauntSub: document.getElementById("hauntSub"),
  signinBar: document.getElementById("signinBar"),
  hauntStatus: document.getElementById("hauntStatus"),
  hauntStatusMsg: document.getElementById("hauntStatusMsg"),
  wallCount: document.getElementById("wallCount"),
  wallList: document.getElementById("wallList"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareCopy: document.getElementById("shareCopy"),
  nagback: document.getElementById("nagback"),
  nagTitle: document.getElementById("nagTitle"),
  nagBody: document.getElementById("nagBody"),
  nagReview: document.getElementById("nagReview"),
  nagDismiss: document.getElementById("nagDismiss"),
};

// --- deck (localStorage) ---------------------------------------------------

function loadDeck() {
  try {
    return JSON.parse(localStorage.getItem(DECK_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveDeck(deck) {
  localStorage.setItem(DECK_KEY, JSON.stringify(deck));
}
let deck = loadDeck();

function dueCards(now = Date.now()) {
  return deck.filter((c) => c.dueAt <= now);
}

function renderDeck() {
  const now = Date.now();
  const due = dueCards(now);
  els.deckCount.innerHTML = `${deck.length} total, <span class="${due.length ? "due" : ""}">${due.length}</span> due`;
  els.reviewBtn.disabled = due.length === 0;
  els.reviewBtn.textContent = due.length ? `review ${due.length} due card${due.length === 1 ? "" : "s"}` : "review due cards";

  if (!deck.length) {
    els.cardList.innerHTML = '<div class="empty">no cards yet. add one above.</div>';
    return;
  }
  const sorted = [...deck].sort((a, b) => a.dueAt - b.dueAt);
  els.cardList.innerHTML = "";
  for (const c of sorted) {
    const row = document.createElement("div");
    row.className = "cardrow";
    const overdue = c.dueAt <= now;
    row.innerHTML = `
      <div class="front">${esc(c.front)}</div>
      <div class="due ${overdue ? "overdue" : ""}">${overdue ? "due now" : "due " + new Date(c.dueAt).toLocaleDateString()}</div>
      <button class="del" type="button" title="delete">✕</button>
    `;
    row.querySelector(".del").addEventListener("click", () => {
      deck = deck.filter((x) => x.id !== c.id);
      saveDeck(deck);
      renderDeck();
    });
    els.cardList.appendChild(row);
  }
}
renderDeck();

els.addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const front = els.front.value.trim();
  const back = els.back.value.trim();
  if (!front || !back) {
    els.addStatus.textContent = "fill in both sides.";
    els.addStatus.className = "status err";
    return;
  }
  deck.push({
    id: crypto.randomUUID(),
    front,
    back,
    dueAt: Date.now(),
    interval: 0,
    ease: 2.5,
    reps: 0,
  });
  saveDeck(deck);
  els.front.value = "";
  els.back.value = "";
  els.addStatus.textContent = "card added.";
  els.addStatus.className = "status ok";
  renderDeck();
});

// --- review session ---------------------------------------------------------

let queue = [];
let current = null;

function grade(card, rating) {
  if (rating === "again") {
    card.reps = 0;
    card.interval = 0;
    card.ease = Math.max(1.3, card.ease - 0.2);
    card.dueAt = Date.now() + 10 * 60 * 1000; // relearn in 10 minutes
    return;
  }
  card.reps += 1;
  if (rating === "hard") {
    card.interval = card.reps === 1 ? 1 : Math.max(1, card.interval * 1.2);
    card.ease = Math.max(1.3, card.ease - 0.15);
  } else if (rating === "good") {
    card.interval = card.reps === 1 ? 1 : card.interval * card.ease;
  } else if (rating === "easy") {
    card.interval = card.reps === 1 ? 2 : card.interval * card.ease * 1.3;
    card.ease += 0.15;
  }
  card.dueAt = Date.now() + card.interval * 24 * 60 * 60 * 1000;
}

function startReview() {
  queue = dueCards().sort((a, b) => a.dueAt - b.dueAt);
  if (!queue.length) return;
  els.reviewBox.hidden = false;
  els.reviewBox.scrollIntoView({ behavior: "smooth", block: "center" });
  nextCard();
}

function nextCard() {
  if (!queue.length) {
    els.reviewBox.hidden = true;
    current = null;
    saveDeck(deck);
    renderDeck();
    maybeCheckin(false);
    return;
  }
  current = queue.shift();
  els.rFront.textContent = current.front;
  els.rBack.textContent = current.back;
  els.rBack.hidden = true;
  els.showBtn.hidden = false;
  els.rateRow.hidden = true;
  els.rProgress.textContent = `${queue.length} more after this`;
}

els.reviewBtn.addEventListener("click", startReview);
els.nagReview.addEventListener("click", () => {
  els.nagback.hidden = true;
  startReview();
});

els.showBtn.addEventListener("click", () => {
  els.rBack.hidden = false;
  els.showBtn.hidden = true;
  els.rateRow.hidden = false;
});

els.rateRow.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-r]");
  if (!btn || !current) return;
  grade(current, btn.dataset.r);
  const idx = deck.findIndex((c) => c.id === current.id);
  if (idx >= 0) deck[idx] = current;
  nextCard();
});

// --- sign in + the haunt -----------------------------------------------------

let session = null;
let myEntry = null;

function renderSignin() {
  if (session) {
    els.signinBar.innerHTML = `
      <span class="who">signed in as <b>@${esc(session.handle)}</b></span>
      <button id="signOut" type="button">sign out</button>
    `;
    document.getElementById("signOut").addEventListener("click", async () => {
      await clearSession();
      session = null;
      myEntry = null;
      renderSignin();
      renderHaunt();
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
    const h = document.getElementById("loginHandle").value.trim().replace(/^@/, "");
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

function setHauntStatus(msg, kind) {
  els.hauntStatusMsg.textContent = msg || "";
  els.hauntStatusMsg.className = "status" + (kind ? " " + kind : "");
}

function renderHaunt() {
  if (!session) {
    els.hauntSub.textContent = "sign in with bluesky to see your public shame tier, or to opt in for the first time.";
    els.hauntStatus.innerHTML = "";
    return;
  }
  if (!myEntry) {
    els.hauntSub.textContent = "you haven't opted in yet. this is the one irreversible part — read before you tap it.";
    els.hauntStatus.innerHTML = `
      <div class="warning"><b>heads up:</b> opting in publishes your handle, overdue count, and shame tier to a public wall anyone can see, and writes a tiny record to your own PDS every time it changes. there's no delete button — the only way your tier goes back down is actually clearing your overdue cards. that's the "irreversible" part.</div>
      <button id="optIn" type="button" style="width:100%; margin-top:0.9rem;">let duohaunt haunt me publicly</button>
    `;
    document.getElementById("optIn").addEventListener("click", () => maybeCheckin(true));
    return;
  }
  const t = TIERS[myEntry.tier] || TIERS[0];
  els.hauntSub.textContent = "you're on the wall. this updates itself.";
  els.hauntStatus.innerHTML = `
    <div class="tierbig">${t.emoji}</div>
    <div class="tierlabel">${t.label}</div>
    <div class="tiersub">${myEntry.overdue} card${myEntry.overdue === 1 ? "" : "s"} overdue · haunted since ${timeAgo(myEntry.hauntedSince)} · cleared ${myEntry.clears} time${myEntry.clears === 1 ? "" : "s"}${myEntry.lastConfessedAt ? " · last confessed " + timeAgo(myEntry.lastConfessedAt) : ""}</div>
    <div class="hauntactions">
      <button id="confessBtn" class="warn" type="button">🦋 confess publicly</button>
      <button id="checkinNow" class="ghost" type="button">refresh my status</button>
    </div>
  `;
  document.getElementById("confessBtn").addEventListener("click", confessPublicly);
  document.getElementById("checkinNow").addEventListener("click", () => maybeCheckin(true));
}

async function maybeCheckin(force) {
  if (!session) return;
  // Without an explicit opt-in tap (force === true, from the "let duohaunt
  // haunt me publicly" / "refresh my status" buttons), never write a
  // check-in — myEntry is only non-null once you've already opted in, so
  // this is the gate that keeps a review session from silently enrolling
  // someone on the public wall who never asked to be on it.
  if (!force && !myEntry) return;
  const now = Date.now();
  const last = Number(localStorage.getItem(LAST_CHECKIN_KEY) || 0);
  if (!force && now - last < CHECKIN_THROTTLE_MS) return;

  const overdue = dueCards(now).length;
  const totalCards = deck.length;
  setHauntStatus("writing your check-in to your own PDS...");
  try {
    const record = {
      $type: CHECKIN_COLLECTION,
      overdue,
      totalCards,
      createdAt: new Date().toISOString(),
    };
    const writeRes = await dpopFetch(session, `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: CHECKIN_COLLECTION, record }),
    });
    const written = await writeRes.json().catch(() => ({}));
    if (!writeRes.ok) throw new Error(written.message || "couldn't write that to your PDS");

    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uri: written.uri }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "couldn't check in");

    myEntry = data.entry;
    localStorage.setItem(LAST_CHECKIN_KEY, String(now));
    setHauntStatus("checked in.", "ok");
    renderHaunt();
    loadWall();
  } catch (err) {
    setHauntStatus("check-in failed: " + err.message, "err");
  }
}

async function confessPublicly() {
  if (!session || !myEntry) return;
  const t = TIERS[myEntry.tier] || TIERS[0];
  const url = `https://duohaunt.bisks.net/haunt/${encodeURIComponent(session.handle)}`;
  const text = `duohaunt confession: I have ${myEntry.overdue} flashcard${myEntry.overdue === 1 ? "" : "s"} overdue and my public tier is ${t.emoji} ${t.label}. it climbs on its own — I did not open this app today.\n\n${url}`;
  setHauntStatus("posting your confession...");
  try {
    const record = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
    };
    const writeRes = await dpopFetch(session, `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
    });
    const written = await writeRes.json().catch(() => ({}));
    if (!writeRes.ok) throw new Error(written.message || "couldn't post that");

    await fetch("/api/confessed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ did: session.did }),
    }).catch(() => {});
    myEntry.lastConfessedAt = Date.now();
    setHauntStatus("posted. everyone knows now.", "ok");
    renderHaunt();
  } catch (err) {
    setHauntStatus("couldn't post that: " + err.message, "err");
  }
}

async function loadMyEntry() {
  if (!session) return;
  try {
    const res = await fetch(`/api/entry?did=${encodeURIComponent(session.did)}`);
    const data = await res.json();
    myEntry = data.entry || null;
  } catch {
    myEntry = null;
  }
  renderHaunt();
  if (myEntry) maybeCheckin(false); // opted in elsewhere — keep it current
}

async function initSession() {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setHauntStatus("sign-in failed: " + e.message, "err");
  }
  renderSignin();
  renderHaunt();
  if (session) loadMyEntry();
}
initSession();

// --- the wall -----------------------------------------------------------------

function renderWallEntry(entry) {
  const t = TIERS[entry.tier] || TIERS[0];
  const div = document.createElement("div");
  div.className = "wallentry";
  const name = entry.displayName || entry.handle;
  div.innerHTML = `
    <img class="avatar" ${entry.avatar ? `src="${esc(entry.avatar)}"` : ""} alt="" onerror="this.style.visibility='hidden'" />
    <div class="meta">
      <div class="name">${esc(name)}</div>
      <div class="sub">@${esc(entry.handle)} · ${entry.overdue} overdue</div>
    </div>
    <div class="tier"><div class="emoji">${t.emoji}</div><div>${t.label}</div></div>
  `;
  return div;
}

async function loadWall() {
  try {
    const res = await fetch("/api/wall");
    if (!res.ok) throw new Error("wall fetch failed");
    const data = await res.json();
    const entries = data.entries || [];
    els.wallCount.textContent = String(data.total || entries.length);
    if (!entries.length) {
      els.wallList.innerHTML = '<div class="empty">nobody\'s opted in yet. be first.</div>';
      return;
    }
    els.wallList.innerHTML = "";
    for (const entry of entries) els.wallList.appendChild(renderWallEntry(entry));
  } catch {
    els.wallList.innerHTML = '<div class="empty">couldn\'t reach the wall. try again in a moment.</div>';
  }
}
loadWall();

// --- share ----------------------------------------------------------------

function setShare() {
  const url = "https://duohaunt.bisks.net/";
  const text = `duohaunt: the irreversible anki bot that follows you around. review your deck or don't — your overdue count climbs a public shame tier on its own timer either way.\n\n${url}`;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  els.shareCopy.onclick = () => {
    navigator.clipboard?.writeText(url).then(() => setHauntStatus("link copied.", "ok")).catch(() => {});
  };
}
setShare();

// --- the nag ----------------------------------------------------------------

function maybeNag() {
  if (sessionStorage.getItem(NAG_DISMISS_KEY)) return;
  const due = dueCards().length;
  if (!due) return;
  els.nagTitle.textContent = `you have ${due} card${due === 1 ? "" : "s"} overdue`;
  els.nagBody.textContent = session && myEntry
    ? "your public tier is already climbing. review now to bring it back down, or don't — duohaunt isn't going anywhere."
    : "review now, or let them pile up. if you sign in and opt in below, this becomes everyone's business.";
  els.nagback.hidden = false;
}
els.nagDismiss.addEventListener("click", () => {
  sessionStorage.setItem(NAG_DISMISS_KEY, "1");
  els.nagback.hidden = true;
});
setTimeout(maybeNag, 400);
