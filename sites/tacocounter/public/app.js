// app.js — the home page. Sign in, log tacos (each a
// net.bisks.tacocounter.log record in your own PDS), see your running
// total, and manage your boards (leaderboards): create one, join one via a
// pasted link, or jump into one you're already on.

import { getSession, clearSession, completeLoginIfCallback, login, resolvePds } from "./lib/oauth.js";
import { recordTacoLog, createBoard, joinBoard, MEMBERSHIP_COLLECTION, BOARD_COLLECTION } from "./lib/records.js";
import { fetchTacoTotal } from "./lib/tally.js";

const els = {
  sessionBar: document.getElementById("sessionBar"),
  totalDisplay: document.getElementById("totalDisplay"),
  totalLabel: document.getElementById("totalLabel"),
  quickRow: document.getElementById("quickRow"),
  customLog: document.getElementById("customLog"),
  customCount: document.getElementById("customCount"),
  customNote: document.getElementById("customNote"),
  customLogBtn: document.getElementById("customLogBtn"),
  logErr: document.getElementById("logErr"),
  boardList: document.getElementById("boardList"),
  boardsEmpty: document.getElementById("boardsEmpty"),
  boardsStatus: document.getElementById("boardsStatus"),
  newBoardName: document.getElementById("newBoardName"),
  createBoardBtn: document.getElementById("createBoardBtn"),
  joinBoardInput: document.getElementById("joinBoardInput"),
  joinBoardBtn: document.getElementById("joinBoardBtn"),
  boardErr: document.getElementById("boardErr"),
};

let session = null;

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function xrpcJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// --- session bar -----------------------------------------------------------

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
      renderLoggedOut();
    };
  } else {
    els.sessionBar.innerHTML = `
      <input type="text" id="loginHandle" placeholder="your.bsky.social" style="width:150px" autocomplete="off" spellcheck="false" />
      <button id="signInBtn">sign in</button>
    `;
    if (window.attachHandleTypeahead) window.attachHandleTypeahead(document.getElementById("loginHandle"));
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

// --- personal total ----------------------------------------------------

async function refreshTotal() {
  if (!session) return;
  els.totalLabel.textContent = "counting…";
  try {
    const { total } = await fetchTacoTotal(session.did);
    els.totalDisplay.innerHTML = `${total}<span class="taco"> 🌮</span>`;
    els.totalLabel.textContent = total === 1 ? "taco eaten (that we know of)" : "tacos eaten (that we know of)";
  } catch (err) {
    els.totalLabel.textContent = "couldn't load your total — try reloading";
    console.warn("fetchTacoTotal failed", err);
  }
}

function setLogErr(msg) {
  els.logErr.textContent = msg || "";
  els.logErr.style.display = msg ? "block" : "none";
}

async function logTacos(count, note) {
  if (!session) return;
  setLogErr("");
  try {
    await recordTacoLog(session, { count, note });
    await refreshTotal();
  } catch (err) {
    setLogErr(err.message || String(err));
  }
}

els.quickRow.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-n]");
  if (!btn) return;
  logTacos(Number(btn.dataset.n), "");
});

els.customLogBtn.onclick = () => {
  const n = Math.max(1, Math.min(100, Math.round(Number(els.customCount.value) || 1)));
  logTacos(n, els.customNote.value);
  els.customNote.value = "";
};

function renderLoggedOut() {
  els.totalDisplay.textContent = "—";
  els.totalLabel.textContent = "sign in to see your total";
  els.quickRow.style.display = "none";
  els.customLog.style.display = "none";
  els.boardList.innerHTML = "";
  els.boardsEmpty.style.display = "none";
  els.boardsStatus.textContent = "sign in to see your boards.";
}

// --- boards --------------------------------------------------------------

function parseDidFromAtUri(uri) {
  const m = /^at:\/\/(did:[a-zA-Z0-9._:%-]+)\//.exec(uri || "");
  return m ? m[1] : null;
}
function parseRkeyFromAtUri(uri) {
  const parts = String(uri || "").split("/");
  return parts[parts.length - 1] || null;
}

// Accepts a full share link (https://tacocounter.bisks.net/b/<did>/<rkey>),
// a bare path (/b/<did>/<rkey>), or the raw at-uri of the board record.
function parseBoardRef(text) {
  const t = String(text || "").trim();
  let m = /\/b\/([^/\s]+)\/([^/\s?#]+)/.exec(t);
  if (m) return { did: decodeURIComponent(m[1]), rkey: decodeURIComponent(m[2]) };
  m = new RegExp(`^at://(did:[a-zA-Z0-9._:%-]+)/${BOARD_COLLECTION.replace(/\./g, "\\.")}/([^/\\s]+)$`).exec(t);
  if (m) return { did: m[1], rkey: m[2] };
  return null;
}

async function listOwnRecords(did, collection) {
  const pds = await resolvePds(did);
  if (!pds) return [];
  const base = pds.replace(/\/$/, "");
  const out = [];
  let cursor;
  for (;;) {
    const params = new URLSearchParams({ repo: did, collection, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const data = await xrpcJson(`${base}/xrpc/com.atproto.repo.listRecords?${params}`);
    const records = Array.isArray(data.records) ? data.records : [];
    out.push(...records);
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
    if (!cursor || !records.length) break;
  }
  return out;
}

async function fetchBoardName(did, rkey) {
  try {
    const pds = await resolvePds(did);
    if (!pds) return null;
    const params = new URLSearchParams({ repo: did, collection: BOARD_COLLECTION, rkey });
    const data = await xrpcJson(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`);
    return typeof data?.value?.name === "string" ? data.value.name : null;
  } catch {
    return null;
  }
}

async function renderBoards() {
  if (!session) return;
  els.boardList.innerHTML = "";
  els.boardsEmpty.style.display = "none";
  els.boardsStatus.textContent = "loading your boards…";

  let memberships;
  try {
    memberships = await listOwnRecords(session.did, MEMBERSHIP_COLLECTION);
  } catch (err) {
    els.boardsStatus.textContent = "couldn't load your boards — try reloading.";
    console.warn("listOwnRecords(membership) failed", err);
    return;
  }

  const boardUris = Array.from(
    new Set(memberships.map((r) => r?.value?.board).filter((b) => typeof b === "string")),
  );

  if (!boardUris.length) {
    els.boardsStatus.textContent = "";
    els.boardsEmpty.style.display = "block";
    return;
  }

  const rows = await Promise.all(
    boardUris.map(async (uri) => {
      const did = parseDidFromAtUri(uri);
      const rkey = parseRkeyFromAtUri(uri);
      if (!did || !rkey) return null;
      const name = (await fetchBoardName(did, rkey)) || "(untitled board)";
      return { did, rkey, name };
    }),
  );

  const found = rows.filter(Boolean);
  els.boardsStatus.textContent = "";
  if (!found.length) {
    els.boardsEmpty.style.display = "block";
    return;
  }
  els.boardList.innerHTML = found
    .map(
      (b) => `
      <li>
        <a href="/b/${encodeURIComponent(b.did)}/${encodeURIComponent(b.rkey)}">${esc(b.name)}</a>
        <span class="meta">${b.did === session.did ? "yours" : ""}</span>
      </li>`,
    )
    .join("");
}

function setBoardErr(msg) {
  els.boardErr.textContent = msg || "";
  els.boardErr.style.display = msg ? "block" : "none";
}

els.createBoardBtn.onclick = async () => {
  if (!session) return;
  const name = els.newBoardName.value.trim();
  if (!name) {
    setBoardErr("give your board a name first.");
    return;
  }
  setBoardErr("");
  els.createBoardBtn.disabled = true;
  try {
    const { uri, rkey } = await createBoard(session, { name });
    await joinBoard(session, uri); // creator is a member of their own board
    location.href = `/b/${encodeURIComponent(session.did)}/${encodeURIComponent(rkey)}`;
  } catch (err) {
    setBoardErr(err.message || String(err));
    els.createBoardBtn.disabled = false;
  }
};

els.joinBoardBtn.onclick = async () => {
  if (!session) return;
  const ref = parseBoardRef(els.joinBoardInput.value);
  if (!ref) {
    setBoardErr("couldn't read a board link in that — paste the full tacocounter.bisks.net/b/... link.");
    return;
  }
  setBoardErr("");
  els.joinBoardBtn.disabled = true;
  try {
    const boardUri = `at://${ref.did}/${BOARD_COLLECTION}/${ref.rkey}`;
    const name = await fetchBoardName(ref.did, ref.rkey);
    if (!name) throw new Error("that board doesn't exist (or its owner's PDS is unreachable).");
    await joinBoard(session, boardUri);
    location.href = `/b/${encodeURIComponent(ref.did)}/${encodeURIComponent(ref.rkey)}`;
  } catch (err) {
    setBoardErr(err.message || String(err));
    els.joinBoardBtn.disabled = false;
  }
};

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

  if (session) {
    els.quickRow.style.display = "flex";
    els.customLog.style.display = "block";
    refreshTotal();
    renderBoards();
  } else {
    renderLoggedOut();
  }
})();
