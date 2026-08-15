// app.js — numbergrid.bisks.net client. Two modes:
//  - "/"                  → your own board (sign in, add numbers, share)
//  - "/board/<handle>"    → read-only view of anyone's public board
//
// Reads (listRecords) are always unauthenticated, straight off the subject's
// PDS — see lib/board.js. Only adding a number needs an OAuth session.

import { login, completeLoginIfCallback, getSession, clearSession, dpopFetch } from "./lib/oauth.js";
import { resolveDid, getProfile, fetchBoard, addNumber, mex, digits, boardSide, layoutCells } from "./lib/board.js";

const els = {
  banner: document.getElementById("viewBanner"),
  authbox: document.getElementById("authbox"),
  loginRow: document.getElementById("loginRow"),
  handleInput: document.getElementById("handleInput"),
  loginBtn: document.getElementById("loginBtn"),
  whoRow: document.getElementById("whoRow"),
  whoAvatar: document.getElementById("whoAvatar"),
  whoName: document.getElementById("whoName"),
  signoutBtn: document.getElementById("signoutBtn"),
  addRow: document.getElementById("addRow"),
  numberInput: document.getElementById("numberInput"),
  addBtn: document.getElementById("addBtn"),
  status: document.getElementById("status"),
  statline: document.getElementById("statline"),
  statCount: document.getElementById("statCount"),
  statSide: document.getElementById("statSide"),
  mexline: document.getElementById("mexline"),
  boardWrap: document.getElementById("boardWrap"),
  boardLabel: document.getElementById("boardLabel"),
  boardCap: document.getElementById("boardCap"),
  bingoRow: document.getElementById("bingoRow"),
  grid: document.getElementById("grid"),
  emptyMsg: document.getElementById("emptyMsg"),
  sharebar: document.getElementById("sharebar"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareSystem: document.getElementById("shareSystem"),
  downloadCard: document.getElementById("downloadCard"),
  copyLink: document.getElementById("copyLink"),
  canvas: document.getElementById("cardCanvas"),
};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.className = "status" + (isErr ? " err" : msg ? " ok" : "");
}

let session = null;
let viewHandle = null; // the "@handle" shown for this board (own or other's)
let isOwn = false;
let boardValues = [];
let freshValue = null;

// --- boot ------------------------------------------------------------------

async function boot() {
  try {
    const s = await completeLoginIfCallback();
    if (s) session = s;
  } catch (e) {
    setStatus("sign-in failed: " + e.message, true);
  }
  if (!session) session = await getSession();

  const m = location.pathname.match(/^\/board\/([^/]+)\/?$/);
  if (m) {
    await bootOtherBoard(decodeURIComponent(m[1]));
  } else {
    await bootOwnBoard();
  }
}

async function bootOwnBoard() {
  els.banner.classList.remove("show");
  els.authbox.style.display = "";

  if (session) {
    els.loginRow.style.display = "none";
    els.whoRow.style.display = "flex";
    els.addRow.classList.add("show");
    els.whoName.textContent = "@" + session.handle;
    viewHandle = session.handle;
    isOwn = true;
    getProfile(session.did)
      .then((p) => {
        if (p.avatar) els.whoAvatar.src = p.avatar;
      })
      .catch(() => {});
    setStatus("loading your board…");
    try {
      boardValues = await fetchBoard(session.did);
      setStatus("");
    } catch (e) {
      setStatus("couldn't load your board: " + e.message, true);
      boardValues = [];
    }
    renderBoard();
  } else {
    els.loginRow.style.display = "flex";
    els.whoRow.style.display = "none";
    els.addRow.classList.remove("show");
    els.statline.style.display = "none";
    els.mexline.style.display = "none";
    els.boardWrap.style.display = "none";
    els.emptyMsg.style.display = "block";
    els.emptyMsg.textContent = "sign in above to start your board.";
    els.sharebar.classList.remove("show");
  }
}

async function bootOtherBoard(rawHandle) {
  els.authbox.style.display = "none";
  els.banner.classList.add("show");
  els.banner.innerHTML = `viewing <b>@${esc(rawHandle)}</b>'s board — <a href="/">sign in and grow your own →</a>`;

  isOwn = false;
  setStatus("loading board…");
  try {
    const did = await resolveDid(rawHandle);
    let handle = rawHandle;
    try {
      handle = (await getProfile(did)).handle || rawHandle;
    } catch {}
    viewHandle = handle;
    boardValues = await fetchBoard(did);
    setStatus("");
  } catch (e) {
    setStatus("couldn't load that board: " + e.message, true);
    viewHandle = rawHandle;
    boardValues = [];
  }
  renderBoard();
}

// --- rendering ---------------------------------------------------------------

function renderBoard() {
  const count = boardValues.length;
  const side = boardSide(boardValues);

  els.statline.style.display = "flex";
  els.statCount.textContent = count.toLocaleString();
  els.statSide.textContent = `${side}×${side}`;

  const mx = mex(boardValues);
  const d = digits(mx);
  const who = isOwn ? "you" : `@${esc(viewHandle)}`;
  const havent = isOwn ? "haven't" : "hasn't";
  els.mexline.style.display = "block";
  els.mexline.innerHTML =
    `the smallest number ${who} ${havent} seen yet is ` +
    `<b>${mx.toLocaleString()}</b> — ${d} digit${d === 1 ? "" : "s"}`;

  if (count === 0) {
    els.boardWrap.style.display = "none";
    els.emptyMsg.style.display = "block";
    els.emptyMsg.textContent = isOwn
      ? "no numbers yet — add the first one above."
      : `@${esc(viewHandle)} hasn't added a number yet.`;
    els.sharebar.classList.remove("show");
    return;
  }

  els.emptyMsg.style.display = "none";
  els.boardWrap.style.display = "block";
  els.boardLabel.textContent = isOwn ? "your board" : `@${viewHandle}'s board`;

  const cells = layoutCells(boardValues, side);
  // layoutCells returns fewer than side*side cells only when the true board
  // is too big to draw in full (see MAX_RENDER_CELLS in lib/board.js) — in
  // that case it's a sparse "recorded numbers only" list, so lay it out on
  // its own small square rather than stretching it across `side` columns.
  const sparse = cells.length !== side * side;
  const displaySide = sparse ? Math.max(1, Math.ceil(Math.sqrt(cells.length))) : side;
  els.boardCap.textContent = sparse
    ? `${count} number${count === 1 ? "" : "s"} · true board is ${side}×${side}, too big to fill every blank here`
    : `${count} number${count === 1 ? "" : "s"}`;

  if (side === 5 && !sparse) {
    els.bingoRow.style.display = "grid";
    els.bingoRow.style.gridTemplateColumns = `repeat(${side}, 1fr)`;
    els.bingoRow.innerHTML = "BINGO".split("").map((l) => `<span>${l}</span>`).join("");
  } else {
    els.bingoRow.style.display = "none";
  }

  els.grid.style.gridTemplateColumns = `repeat(${displaySide}, 1fr)`;
  els.grid.innerHTML = "";
  for (const c of cells) {
    const cell = document.createElement("div");
    if (c.empty) {
      cell.className = "cell empty";
    } else {
      cell.className = "cell" + (c.value === freshValue ? " fresh" : "");
      const label = c.value.toLocaleString();
      cell.innerHTML = `<span class="n" style="--len:${label.length}">${label}</span>`;
    }
    els.grid.appendChild(cell);
  }
  freshValue = null;

  els.sharebar.classList.add("show");
  updateShareLinks(count, side, mx, d);
}

function shareUrl() {
  return `https://numbergrid.bisks.net/board/${encodeURIComponent(viewHandle)}`;
}

function buildShareText(count, side, mx, d) {
  const owner = isOwn ? "My" : `@${viewHandle}'s`;
  const pronoun = isOwn ? "I" : "they";
  return (
    `${owner} numbergrid: ${count.toLocaleString()} number${count === 1 ? "" : "s"} on a ${side}×${side} board. ` +
    `The smallest one ${pronoun} haven't seen yet is ${mx.toLocaleString()} (${d} digit${d === 1 ? "" : "s"}). ` +
    shareUrl()
  );
}

function updateShareLinks(count, side, mx, d) {
  const text = buildShareText(count, side, mx, d);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

// --- share card (canvas) ------------------------------------------------------

function drawCard() {
  const ctx = els.canvas.getContext("2d");
  const W = els.canvas.width, H = els.canvas.height;
  ctx.clearRect(0, 0, W, H);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1c1309");
  bg.addColorStop(1, "#151009");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#f2e6cf";
  ctx.font = "800 56px ui-monospace, monospace";
  ctx.fillText("🔢 numbergrid", 60, 100);

  const count = boardValues.length;
  const side = boardSide(boardValues);
  const mx = mex(boardValues);
  const d = digits(mx);

  ctx.fillStyle = "#c9b891";
  ctx.font = "400 26px ui-sans-serif, sans-serif";
  const who = isOwn ? "my board" : `@${viewHandle}'s board`;
  ctx.fillText(who, 62, 148);

  // mini grid, up to 9x9 worth of visible cells for legibility
  const cardX = 640, cardY = 60, cardW = 500, cardH = 500;
  ctx.fillStyle = "#fbf1da";
  roundRect(ctx, cardX, cardY, cardW, cardH, 20);
  ctx.fill();

  // Top-left corner of the real board (cell i = number i), same positional
  // layout as the live grid — not just the first few numbers recorded.
  const drawSide = Math.min(side, 9);
  const pad = 22;
  const gap = 8;
  const cell = (cardW - pad * 2 - gap * (drawSide - 1)) / drawSide;
  const present = new Set(boardValues);
  for (let i = 0; i < drawSide * drawSide; i++) {
    const r = Math.floor(i / drawSide), c = i % drawSide;
    const x = cardX + pad + c * (cell + gap);
    const y = cardY + pad + r * (cell + gap);
    if (present.has(i)) {
      ctx.fillStyle = "#f4e6c6";
      roundRect(ctx, x, y, cell, cell, 6);
      ctx.fill();
      ctx.fillStyle = "#2c2013";
      ctx.font = `800 ${Math.max(11, Math.min(22, 140 / drawSide))}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = String(i);
      ctx.fillText(label.length > 5 ? label.slice(0, 4) + "…" : label, x + cell / 2, y + cell / 2 + 1);
    } else {
      ctx.strokeStyle = "#d9c491";
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, cell, cell, 6);
      ctx.stroke();
    }
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#e4d3a9";
  ctx.font = "700 30px ui-monospace, monospace";
  ctx.fillText(`${count.toLocaleString()} number${count === 1 ? "" : "s"} · ${side}×${side}`, 60, 260);

  ctx.fillStyle = "#c99a2e";
  ctx.font = "700 24px ui-sans-serif, sans-serif";
  wrapText(ctx, `smallest not seen yet: ${mx.toLocaleString()} (${d} digit${d === 1 ? "" : "s"})`, 60, 320, 500, 32);

  ctx.fillStyle = "#8a7654";
  ctx.font = "700 24px ui-monospace, monospace";
  ctx.fillText("numbergrid.bisks.net", 60, 570);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

async function cardBlob() {
  drawCard();
  return new Promise((resolve) => els.canvas.toBlob(resolve, "image/png"));
}

// --- events --------------------------------------------------------------

els.loginBtn.addEventListener("click", async () => {
  const h = els.handleInput.value.trim();
  if (!h) return;
  els.loginBtn.disabled = true;
  setStatus("redirecting to your PDS to sign in…");
  try {
    await login(h);
  } catch (e) {
    setStatus("couldn't sign in: " + e.message, true);
    els.loginBtn.disabled = false;
  }
});
els.handleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.loginBtn.click();
});

els.signoutBtn.addEventListener("click", async () => {
  await clearSession();
  location.reload();
});

async function submitNumber() {
  const raw = els.numberInput.value.trim();
  if (!/^\d+$/.test(raw)) {
    setStatus("enter a whole number, zero or more.", true);
    return;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    setStatus("that number's too big for me to keep straight.", true);
    return;
  }
  if (boardValues.includes(value)) {
    freshValue = value;
    setStatus(`${value.toLocaleString()} is already on your board.`);
    renderBoard();
    return;
  }
  els.addBtn.disabled = true;
  setStatus("writing to your PDS…");
  try {
    await addNumber(session, dpopFetch, value);
    boardValues.push(value);
    boardValues.sort((a, b) => a - b);
    freshValue = value;
    els.numberInput.value = "";
    setStatus(`added ${value.toLocaleString()}.`);
    renderBoard();
  } catch (e) {
    setStatus("couldn't add that: " + e.message, true);
  } finally {
    els.addBtn.disabled = false;
  }
}
els.addBtn.addEventListener("click", submitNumber);
els.numberInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitNumber();
});

els.downloadCard.addEventListener("click", async () => {
  const blob = await cardBlob();
  if (!blob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `numbergrid-${viewHandle || "board"}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});

els.copyLink.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareUrl());
    setStatus("link copied.");
  } catch {
    setStatus(shareUrl());
  }
});

if (canShareFiles()) {
  els.shareSystem.style.display = "";
  els.shareSystem.addEventListener("click", async () => {
    const blob = await cardBlob();
    if (!blob) return;
    const count = boardValues.length;
    const side = boardSide(boardValues);
    const mx = mex(boardValues);
    const d = digits(mx);
    const file = new File([blob], "numbergrid.png", { type: "image/png" });
    try {
      await navigator.share({ files: [file], text: buildShareText(count, side, mx, d), title: "numbergrid" });
    } catch {}
  });
}

boot();
