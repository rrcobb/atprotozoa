// SkeetIn Corvid — public/corvid/corvid.js
//
// The claim page for the limited-edition numbered SkeetIn Corvid accounts.
  // Claims are deliberately local to this browser. They are a visual toy, not
  // globally unique or portable account state.
(function () {
  "use strict";

  const TOTAL = 500;

  const els = {
    handleInput: document.getElementById("handleInput"),
    claimBtn: document.getElementById("claimBtn"),
    errorMsg: document.getElementById("errorMsg"),
    result: document.getElementById("result"),
    rAvatar: document.getElementById("rAvatar"),
    rName: document.getElementById("rName"),
    rHandle: document.getElementById("rHandle"),
    rNum: document.getElementById("rNum"),
    rNote: document.getElementById("rNote"),
    shareBluesky: document.getElementById("shareBluesky"),
    viewBsky: document.getElementById("viewBsky"),
    claimedLabel: document.getElementById("claimedLabel"),
    remainingLabel: document.getElementById("remainingLabel"),
    statusFill: document.getElementById("statusFill"),
    rosterGrid: document.getElementById("rosterGrid"),
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function cleanHandle(raw) {
    let h = decodeURIComponent(raw || "").trim().replace(/^@/, "");
    const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
    if (m) h = m[1];
    return h;
  }

  function showError(msg) {
    els.errorMsg.textContent = msg;
    els.errorMsg.style.display = "";
  }
  function clearError() {
    els.errorMsg.style.display = "none";
  }

  function claims() {
    return JSON.parse(localStorage.getItem("skeetin:corvid") || "[]");
  }

  async function loadStatus() {
    try {
      const rows = claims();
      renderStatus({ total: TOTAL, claimed: rows.length, recent: rows.slice().reverse().slice(0, 12) });
    } catch (_) { els.claimedLabel.textContent = "— claimed"; }
  }

  function renderStatus(data) {
    const claimed = data.claimed || 0;
    const total = data.total || TOTAL;
    els.claimedLabel.textContent = claimed.toLocaleString("en-US") + " claimed";
    els.remainingLabel.textContent = Math.max(0, total - claimed).toLocaleString("en-US") + " left of " + total;
    els.statusFill.style.width = Math.min(100, (claimed / total) * 100) + "%";
    if (claimed >= total) {
      els.claimBtn.disabled = true;
      els.claimBtn.textContent = "Sold out";
    }
    renderRoster(data.recent || []);
  }

  function rosterItem(entry) {
    return `<div class="roster-item">
      <img src="${esc(entry.avatar || "")}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="meta">
        <div class="rname">${esc(entry.displayName || entry.handle)}</div>
        <div class="rnum">Corvid #${String(entry.number).padStart(3, "0")}</div>
      </div>
    </div>`;
  }

  function renderRoster(recent) {
    if (!recent.length) {
      els.rosterGrid.innerHTML = `<div class="roster-empty">Nobody yet. Be Corvid #001.</div>`;
      return;
    }
    els.rosterGrid.innerHTML = recent.map(rosterItem).join("");
  }

  function shareTextFor(entry) {
    const url = "https://skeetin.bisks.net/corvid/";
    return `I claimed a local SkeetIn Corvid #${String(entry.number).padStart(3, "0")} — visible only in my browser. ${url}`;
  }

  function renderResult(entry, note) {
    els.rAvatar.src = entry.avatar || "";
    els.rName.textContent = entry.displayName || entry.handle;
    els.rHandle.textContent = "@" + entry.handle;
    els.rNum.textContent = "#" + String(entry.number).padStart(3, "0");
    els.rNote.textContent = note;
    els.viewBsky.href = "https://bsky.app/profile/" + entry.handle;
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareTextFor(entry));
    els.result.classList.add("show");
  }

  async function claim() {
    const handle = cleanHandle(els.handleInput.value);
    if (!handle) {
      showError("Type a handle first.");
      return;
    }
    clearError();
    els.claimBtn.disabled = true;
    els.claimBtn.textContent = "Claiming…";
    try {
      const res = await fetch("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=" + encodeURIComponent(handle));
      if (!res.ok) throw new Error("couldn't find that account");
      const profile = await res.json();
      const rows = claims();
      let data = { entry: rows.find((row) => row.did === profile.did), alreadyClaimed: false };
      if (!data.entry) {
        if (rows.length >= TOTAL) { showError("all local numbers are used in this browser."); els.claimBtn.textContent = "Sold out"; return; }
        data.entry = { number: rows.length + 1, did: profile.did, handle: profile.handle || handle, displayName: profile.displayName, avatar: profile.avatar, claimedAt: Date.now() };
        rows.push(data.entry);
        localStorage.setItem("skeetin:corvid", JSON.stringify(rows));
      } else data.alreadyClaimed = true;
      renderResult(
        data.entry,
        data.alreadyClaimed
          ? "@" + data.entry.handle + " already claimed a number — here it is."
          : "Claimed! Only " + (TOTAL - data.entry.number) + " numbers left after this one."
      );
      els.claimBtn.disabled = false;
      els.claimBtn.textContent = "Claim another";
      loadStatus();
    } catch (_) {
      showError("Network hiccup — try again?");
      els.claimBtn.disabled = false;
      els.claimBtn.textContent = "Claim";
    }
  }

  els.claimBtn.addEventListener("click", claim);
  els.handleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") claim();
  });
  if (window.attachHandleTypeahead) {
    attachHandleTypeahead(els.handleInput, {
      onSelect: () => {
        els.handleInput.focus();
      },
    });
  }

  loadStatus();
})();
