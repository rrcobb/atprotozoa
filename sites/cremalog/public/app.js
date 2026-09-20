// app.js — the home page. Sign in, log a latte review (a
// net.bisks.cremalog.review record in your own PDS), and see your log as a
// taste chart plus a card for every review.

import { getSession, clearSession, completeLoginIfCallback, login } from "./lib/oauth.js";
import { recordReview } from "./lib/records.js";
import { fetchLog } from "./lib/log.js";
import { renderChart } from "./lib/chart.js";

const els = {
  sessionBar: document.getElementById("sessionBar"),
  drinkInput: document.getElementById("drinkInput"),
  shopInput: document.getElementById("shopInput"),
  ratingInput: document.getElementById("ratingInput"),
  ratingReadout: document.getElementById("ratingReadout"),
  notesInput: document.getElementById("notesInput"),
  logBtn: document.getElementById("logBtn"),
  logErr: document.getElementById("logErr"),
  statRow: document.getElementById("statRow"),
  statCount: document.getElementById("statCount"),
  statAvg: document.getElementById("statAvg"),
  statBest: document.getElementById("statBest"),
  chartTitle: document.getElementById("chartTitle"),
  chartContainer: document.getElementById("chartContainer"),
  logEmpty: document.getElementById("logEmpty"),
  shareCard: document.getElementById("shareCard"),
  shareLink: document.getElementById("shareLink"),
  reviewList: document.getElementById("reviewList"),
};

let session = null;
let log = [];

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
      log = [];
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
      const h = document.getElementById("loginHandle").value.trim().replace(/^@/, "");
      if (!h) return;
      try {
        await login(h);
      } catch (err) {
        alert(`sign in failed: ${err.message}`);
      }
    };
  }
}

// --- rating slider readout --------------------------------------------------

els.ratingInput.addEventListener("input", () => {
  els.ratingReadout.textContent = Number(els.ratingInput.value).toFixed(1);
});

// --- logging -----------------------------------------------------------

function setLogErr(msg) {
  els.logErr.textContent = msg || "";
  els.logErr.style.display = msg ? "block" : "none";
}

els.logBtn.onclick = async () => {
  if (!session) return;
  setLogErr("");
  els.logBtn.disabled = true;
  els.logBtn.textContent = "logging…";
  try {
    await recordReview(session, {
      drink: els.drinkInput.value,
      shop: els.shopInput.value,
      rating: els.ratingInput.value,
      notes: els.notesInput.value,
    });
    els.drinkInput.value = "";
    els.shopInput.value = "";
    els.notesInput.value = "";
    await refreshLog();
  } catch (err) {
    setLogErr(err.message || String(err));
  } finally {
    els.logBtn.disabled = false;
    els.logBtn.textContent = "log it";
  }
};

// --- log: stats, chart, list, share -----------------------------------------

async function refreshLog() {
  if (!session) return;
  try {
    log = await fetchLog(session.did);
  } catch (err) {
    console.warn("fetchLog failed", err);
    els.logEmpty.textContent = "couldn't load your log — try reloading.";
    els.logEmpty.style.display = "block";
    return;
  }
  renderStats();
  renderChartSection();
  renderShare();
  renderReviewList();
}

function renderStats() {
  if (!log.length) {
    els.statRow.style.display = "none";
    return;
  }
  els.statRow.style.display = "flex";
  const avg = log.reduce((s, r) => s + r.rating, 0) / log.length;
  const best = log.reduce((m, r) => Math.max(m, r.rating), 0);
  els.statCount.textContent = log.length;
  els.statAvg.textContent = avg.toFixed(1);
  els.statBest.textContent = best.toFixed(1);
}

function renderChartSection() {
  if (!log.length) {
    els.chartTitle.style.display = "none";
    els.chartContainer.innerHTML = "";
    els.logEmpty.textContent = "no lattes logged yet — the form above is where they start.";
    els.logEmpty.style.display = "block";
    return;
  }
  els.chartTitle.style.display = "block";
  els.logEmpty.style.display = "none";
  renderChart(els.chartContainer, log);
}

function renderShare() {
  if (!log.length) {
    els.shareCard.style.display = "none";
    return;
  }
  const avg = (log.reduce((s, r) => s + r.rating, 0) / log.length).toFixed(1);
  const text = `☕ I've logged ${log.length} latte${log.length === 1 ? "" : "s"} on cremalog, averaging ${avg}/10.\n\ncremalog.bisks.net`;
  els.shareLink.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
  els.shareCard.style.display = "block";
}

function renderReviewList() {
  els.reviewList.innerHTML = log
    .map(
      (r) => `
      <li class="review-card">
        <div class="review-top">
          <span class="review-drink">${esc(r.drink)}</span>
          <span class="review-rating">${r.rating.toFixed(1)}<span class="review-rating-max">/10</span></span>
        </div>
        ${r.shop ? `<div class="review-shop">${esc(r.shop)}</div>` : ""}
        ${r.notes ? `<div class="review-notes">${esc(r.notes)}</div>` : ""}
        <div class="review-date">${esc(fmtDate(r.reviewedAt))}</div>
      </li>`,
    )
    .join("");
}

function renderLoggedOut() {
  els.logBtn.disabled = true;
  els.logBtn.textContent = "sign in to log";
  els.statRow.style.display = "none";
  els.chartTitle.style.display = "none";
  els.chartContainer.innerHTML = "";
  els.logEmpty.textContent = "sign in to see your log.";
  els.logEmpty.style.display = "block";
  els.shareCard.style.display = "none";
  els.reviewList.innerHTML = "";
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

  if (session) {
    els.logBtn.disabled = false;
    els.logBtn.textContent = "log it";
    els.logEmpty.textContent = "loading your log…";
    els.logEmpty.style.display = "block";
    refreshLog();
  } else {
    renderLoggedOut();
  }
})();
