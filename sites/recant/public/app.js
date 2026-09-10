// app.js — recant.bisks.net client.
//
// One thing crosses the network here: a net.bisks.recant.apology record,
// written straight to *your own* PDS from your own signed-in session — this
// site never sees or stores your token past the request that needs it. The
// public wall is rebuilt entirely client-side by lib/global-wall.js (no
// backend of recant's own), so what you write shows up for everyone as soon
// as the network catches up — this file also merges your own just-written
// apology in immediately so you don't wait on that.

import { login, getSession, clearSession, completeLoginIfCallback, dpopFetch } from "./lib/oauth.js";
import { GlobalWall } from "./lib/global-wall.js";

const APOLOGY_COLLECTION = "net.bisks.recant.apology";
const MAX_GRAPHEMES = 300;

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
function graphemeLen(s) {
  try {
    if (Intl && Intl.Segmenter) return [...new Intl.Segmenter().segment(s)].length;
  } catch (_) {}
  return Array.from(s).length;
}
function defaultTemplate(handle) {
  return `I, @${handle}, assumed OpenAI was at fault in the Tristan Buckmaster / Navier-Stokes affair before the facts were in. I was wrong to jump to that conclusion, and I recant it publicly.`;
}

const els = {
  signinBar: document.getElementById("signinBar"),
  composer: document.getElementById("composer"),
  composerSub: document.getElementById("composerSub"),
  status: document.getElementById("status"),
  wallCount: document.getElementById("wallCount"),
  wallList: document.getElementById("wallList"),
  wallStatus: document.getElementById("wallStatus"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  shareCanvas: document.getElementById("shareCanvas"),
};

// --- sign in ----------------------------------------------------------------

let session = null;
const myApologies = new Map(); // uri -> { did, handle, text, createdAtMs }

function renderSignin() {
  if (session) {
    els.signinBar.innerHTML = `
      <span class="who">signed in as <b>@${esc(session.handle)}</b></span>
      <button id="signOut" type="button">sign out</button>
    `;
    document.getElementById("signOut").addEventListener("click", async () => {
      await clearSession();
      session = null;
      renderSignin();
      renderComposer();
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

function setStatus(msg, kind) {
  els.status.textContent = msg || "";
  els.status.className = "status" + (kind ? " " + kind : "");
}

// --- composer -----------------------------------------------------------------

function renderComposer() {
  if (!session) {
    els.composerSub.innerHTML = "sign in with bluesky to write your apology. it's written as a real record to <b>your own PDS</b> — nothing is stored here.";
    els.composer.innerHTML = "";
    return;
  }
  els.composerSub.innerHTML = "edit it, make it yours, then recant. it's written as a real record to <b>your own PDS</b> — nothing is stored here.";
  els.composer.innerHTML = `
    <form id="recantForm">
      <textarea id="apologyText" maxlength="1200"></textarea>
      <div class="charcount" id="charCount">0 / ${MAX_GRAPHEMES}</div>
      <button id="recantBtn" type="submit">recant publicly</button>
    </form>
  `;
  const textarea = document.getElementById("apologyText");
  textarea.value = defaultTemplate(session.handle);
  updateCharCount();
  textarea.addEventListener("input", updateCharCount);
  document.getElementById("recantForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitApology(textarea.value.trim());
  });
}

function updateCharCount() {
  const textarea = document.getElementById("apologyText");
  const count = document.getElementById("charCount");
  if (!textarea || !count) return;
  const n = graphemeLen(textarea.value);
  count.textContent = `${n} / ${MAX_GRAPHEMES}`;
  count.className = "charcount" + (n > MAX_GRAPHEMES ? " over" : "");
}

async function submitApology(text) {
  if (!session) return;
  if (!text) { setStatus("write something first.", "err"); return; }
  if (graphemeLen(text) > MAX_GRAPHEMES) { setStatus(`too long — keep it under ${MAX_GRAPHEMES} characters.`, "err"); return; }

  const btn = document.getElementById("recantBtn");
  btn.disabled = true;
  setStatus("writing your apology to your own PDS...");
  try {
    const createdAt = new Date().toISOString();
    const record = { $type: APOLOGY_COLLECTION, text, createdAt };
    const writeRes = await dpopFetch(session, `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: APOLOGY_COLLECTION, record }),
    });
    const written = await writeRes.json().catch(() => ({}));
    if (!writeRes.ok) throw new Error(written.message || "couldn't write that to your PDS");

    myApologies.set(written.uri, {
      did: session.did,
      handle: session.handle,
      text,
      createdAtMs: Date.parse(createdAt) || Date.now(),
    });
    setStatus("recanted. it's on the wall now.", "ok");
    setShare(text);
    renderWall();
  } catch (err) {
    setStatus("couldn't recant: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
}

async function initSession() {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setStatus("sign-in failed: " + e.message, "err");
  }
  renderSignin();
  renderComposer();
}
initSession();

// --- the wall -----------------------------------------------------------------
//
// Real, network-wide: lib/global-wall.js finds every repo that has ever
// written a net.bisks.recant.apology record (com.atproto.sync.listReposByCollection)
// and pulls each one's full history with one CAR download per repo, no
// backend of recant's own. myApologies (written this session) render
// immediately and get de-duped against the wall once the network catches up.

function renderSlip(entry) {
  const div = document.createElement("div");
  div.className = "slip";
  const name = entry.displayName || entry.handle;
  div.innerHTML = `
    <div class="stamp">RECANTED</div>
    <div class="head">
      <img class="avatar" ${entry.avatar ? `src="${esc(entry.avatar)}"` : ""} alt="" onerror="this.style.visibility='hidden'" />
      <div>
        <div class="name">${esc(name)}</div>
        <div class="when">@${esc(entry.handle)} · ${timeAgo(entry.createdAtMs)}</div>
      </div>
    </div>
    <div class="text">${esc(entry.text)}</div>
  `;
  return div;
}

let lastWallSnapshot = { entries: [], backfillDone: false, backfillActive: false, reposScanned: 0, reposSeen: 0, connected: false, error: "" };

function mergedWallEntries() {
  const byUri = new Map();
  for (const e of lastWallSnapshot.entries) byUri.set(e.uri, e);
  for (const [uri, mine] of myApologies) {
    if (byUri.has(uri)) continue;
    byUri.set(uri, {
      uri,
      did: mine.did,
      handle: mine.handle,
      displayName: mine.handle,
      avatar: "",
      text: mine.text,
      createdAtMs: mine.createdAtMs,
    });
  }
  return Array.from(byUri.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

function renderWall() {
  const entries = mergedWallEntries();
  els.wallCount.textContent = String(entries.length);
  if (!entries.length) {
    els.wallList.innerHTML = lastWallSnapshot.backfillDone
      ? '<div class="empty">nobody\'s recanted yet. be first.</div>'
      : '<div class="empty">reading the network for other apologies...</div>';
  } else {
    els.wallList.innerHTML = "";
    for (const entry of entries) els.wallList.appendChild(renderSlip(entry));
  }
  if (els.wallStatus) {
    els.wallStatus.textContent = lastWallSnapshot.backfillDone
      ? ""
      : `syncing the wall... ${lastWallSnapshot.reposScanned}/${Math.max(lastWallSnapshot.reposSeen, lastWallSnapshot.reposScanned)} repos checked`;
  }
}

const wall = new GlobalWall({
  onUpdate: (snapshot) => {
    lastWallSnapshot = snapshot;
    renderWall();
  },
});
wall.start();
renderWall();

// --- share ----------------------------------------------------------------

const SITE_URL = "https://recant.bisks.net/";
let lastShareText = "";

function clip(text, max) {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

function setShare(apologyText) {
  lastShareText = apologyText
    ? `I recant: "${clip(apologyText, 180)}"\n\n${SITE_URL}`
    : `a lot of people assumed OpenAI was at fault over the Buckmaster/Navier-Stokes story before the facts were in. if that was you, here's a place to say so.\n\n${SITE_URL}`;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  drawShareCard(apologyText || null);
}
setShare(null);

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawShareCard(apologyText) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "600 28px 'JetBrains Mono', ui-monospace, monospace";

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#140f0a";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.05, 0, W * 0.85, H * 0.05, W * 0.55);
  glow.addColorStop(0, "#2a1512");
  glow.addColorStop(1, "rgba(20,15,10,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // paper card
  const cardX = 90, cardY = 90, cardW = W - 180, cardH = H - 180;
  ctx.fillStyle = "#f4ecd8";
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 18);
  ctx.fill();

  // stamp
  ctx.save();
  ctx.translate(cardX + cardW - 130, cardY + 90);
  ctx.rotate(0.15);
  ctx.strokeStyle = "#a5271f";
  ctx.lineWidth = 4;
  ctx.strokeRect(-90, -28, 180, 56);
  ctx.fillStyle = "#a5271f";
  ctx.font = "800 26px 'JetBrains Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("RECANTED", 0, 2);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#2b2013";
  ctx.font = "800 34px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillText("a public apology", cardX + 60, cardY + 90);

  ctx.font = "400 26px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillStyle = "#4a3c26";
  const body = apologyText || "“I assumed OpenAI was at fault before the facts were in. I was wrong.”";
  const lines = wrapText(ctx, body, cardW - 120).slice(0, 8);
  let ly = cardY + 170;
  for (const line of lines) {
    ctx.fillText(line, cardX + 60, ly);
    ly += 38;
  }

  ctx.font = "700 24px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillStyle = "#a5271f";
  ctx.fillText("recant.bisks.net", cardX + 60, cardY + cardH - 40);

  updateShareButtons();
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}

function updateShareButtons() {
  els.shareDownload.onclick = () => {
    els.shareCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "recant.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  };
}

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "recant.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "recant" });
      } catch (_) {
        // user cancelled the share sheet, or it failed silently — no-op
      }
    }, "image/png");
  });
}
