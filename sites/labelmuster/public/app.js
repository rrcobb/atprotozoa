// app.js — labelmuster: enter an account, scan it against every labeler in
// mackuba.eu's label-scanner directory (self-applied labels too — see
// lib/identity.js's header for how getProfileAllLabels gets past the
// AppView's 20-labeler-per-request header limit), pick one from a dropdown,
// then search that account's own follows+followers for anyone else carrying
// the same label. A self-applied label matches by value on any account that
// also self-applied it (src === that account's own did); a moderation label
// matches by value AND the same labeler (src === the original label's src)
// — two different accounts independently getting called "spam" by two
// different labelers isn't the same label.

import { resolveDid, getProfileAllLabels, getProfilesBatch, socialPool } from "./lib/identity.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Fallback for when the labeller-directory fetch itself failed (see
// lib/identity.js's loadAllLabelers) — the one labeler worth naming even
// with no directory at all.
const KNOWN_LABELERS = {
  "did:plc:ar7c4by46qjdydhdevvrndac": "Bluesky Moderation",
};

const els = {
  form: document.getElementById("form"),
  handleInput: document.getElementById("handleInput"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  progwrap: document.getElementById("progwrap"),
  progbarfill: document.getElementById("progbarfill"),
  proglabel: document.getElementById("proglabel"),
  acctcard: document.getElementById("acctcard"),
  acctAvatar: document.getElementById("acctAvatar"),
  acctNoAvatar: document.getElementById("acctNoAvatar"),
  acctName: document.getElementById("acctName"),
  acctHandle: document.getElementById("acctHandle"),
  labelpick: document.getElementById("labelpick"),
  labelpickLbl: document.getElementById("labelpickLbl"),
  labelSelect: document.getElementById("labelSelect"),
  findBtn: document.getElementById("findBtn"),
  toolbar: document.getElementById("toolbar"),
  countLabel: document.getElementById("countLabel"),
  selectAll: document.getElementById("selectAll"),
  selectNone: document.getElementById("selectNone"),
  copyBtn: document.getElementById("copyBtn"),
  memberwrap: document.getElementById("memberwrap"),
  resultNote: document.getElementById("resultNote"),
};

let scannedDid = null;
let scannedProfile = null;
let labellersMap = new Map(); // did -> {did, name, handle} from the label-scanner directory
let distinctLabels = []; // [{val, src, isSelf}]
let members = []; // [{did, handle, displayName, avatar, self, tag}]
const checked = new Set();

function setProgress(frac, label) {
  els.progwrap.classList.add("show");
  els.progbarfill.style.width = Math.round(frac * 100) + "%";
  els.proglabel.textContent = label;
}
function hideProgress() {
  els.progwrap.classList.remove("show");
}
function setStatus(text, isErr) {
  els.status.className = isErr ? "status err" : "status";
  els.status.textContent = text || "";
}

// --- cee.wtf secret prefill (standing order 2026-08-28) --------------------
document.getElementById("ceeHook")?.addEventListener("click", () => {
  els.handleInput.value = "@cee.wtf";
  els.handleInput.dispatchEvent(new Event("input", { bubbles: true }));
  els.handleInput.dispatchEvent(new Event("change", { bubbles: true }));
  els.handleInput.focus();
});

// --- label helpers -----------------------------------------------------------

function isExpired(l) {
  return l.exp && new Date(l.exp).getTime() <= Date.now();
}

function labelerName(src) {
  const l = labellersMap.get(src);
  if (l && (l.name || l.handle)) return l.name || l.handle;
  return KNOWN_LABELERS[src] || `labeler ${src.slice(-8)}`;
}

function extractDistinctLabels(profile) {
  const seen = new Set();
  const out = [];
  for (const l of profile.labels || []) {
    if (isExpired(l)) continue;
    const key = l.val + "|" + l.src;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ val: l.val, src: l.src, isSelf: l.src === profile.did });
  }
  return out;
}

function labelOptionText(l) {
  return l.isSelf ? `${l.val}  (self-applied)` : `${l.val}  (via ${labelerName(l.src)})`;
}

function matchesLabel(profile, chosen) {
  for (const l of profile.labels || []) {
    if (isExpired(l)) continue;
    if (l.val !== chosen.val) continue;
    if (chosen.isSelf ? l.src === profile.did : l.src === chosen.src) return true;
  }
  return false;
}

// --- account card + label dropdown -------------------------------------------

function renderAcctCard(p) {
  els.acctName.textContent = p.displayName || p.handle;
  els.acctHandle.textContent = "@" + p.handle;
  if (p.avatar) {
    els.acctAvatar.src = p.avatar;
    els.acctAvatar.style.display = "";
    els.acctNoAvatar.style.display = "none";
  } else {
    els.acctAvatar.style.display = "none";
    els.acctNoAvatar.style.display = "";
  }
  els.acctcard.classList.add("show");
}

function renderLabelPicker() {
  if (!distinctLabels.length) {
    els.labelpick.classList.remove("show");
    return;
  }
  els.labelpickLbl.textContent = `${distinctLabels.length} label${distinctLabels.length === 1 ? "" : "s"} found on this account:`;
  els.labelSelect.innerHTML = distinctLabels.map((l, i) => `<option value="${i}">${esc(labelOptionText(l))}</option>`).join("");
  els.labelpick.classList.add("show");
}

// --- scanning an account -------------------------------------------------------

let busyScan = false;
async function scan(raw) {
  if (busyScan) return;
  busyScan = true;
  els.go.disabled = true;
  setStatus("");
  els.acctcard.classList.remove("show");
  els.labelpick.classList.remove("show");
  els.toolbar.classList.remove("show");
  els.memberwrap.classList.remove("show");
  els.memberwrap.innerHTML = "";
  els.resultNote.textContent = "";
  hideProgress();
  members = [];
  checked.clear();

  try {
    setStatus("resolving account…");
    scannedDid = await resolveDid(raw);

    setStatus("checking it against every known labeler…");
    const result = await getProfileAllLabels(scannedDid, (done, total) => {
      if (total) setProgress(0.05 + 0.9 * (done / total), `checking labelers… (${done}/${total})`);
    });
    scannedProfile = result.profile;
    labellersMap = result.labellersMap;
    renderAcctCard(scannedProfile);

    distinctLabels = extractDistinctLabels(scannedProfile);
    renderLabelPicker();

    setStatus(
      distinctLabels.length
        ? `found ${distinctLabels.length} label${distinctLabels.length === 1 ? "" : "s"} — pick one to muster.`
        : "this account has no labels attached right now.",
    );
  } catch (e) {
    setStatus("couldn't scan that account: " + e.message, true);
  } finally {
    hideProgress();
    els.go.disabled = false;
    busyScan = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (els.handleInput.value.trim()) scan(els.handleInput.value);
});

// --- mustering a label -----------------------------------------------------

function memberRowHTML(m) {
  const profileUrl = m.handle ? `https://bsky.app/profile/${esc(m.handle)}` : `https://bsky.app/profile/${esc(m.did)}`;
  const nameOrHandle = m.displayName || m.handle || "(no handle)";
  const avatar = m.avatar
    ? `<img src="${esc(m.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy" />`
    : `<div class="noavatar">?</div>`;
  return `
    <label class="member${m.self ? " self" : ""}">
      <input type="checkbox" data-did="${esc(m.did)}" checked />
      ${avatar}
      <div class="who">
        <div class="rname">${esc(nameOrHandle)}${m.self ? '<span class="rtag">you scanned this one</span>' : ""}</div>
        <div class="rhandle">${m.handle ? "@" + esc(m.handle) : esc(m.did)}</div>
      </div>
      <a class="rlink" href="${profileUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">profile ↗</a>
    </label>`;
}

function renderMembers() {
  els.memberwrap.innerHTML = members.map(memberRowHTML).join("");
  els.memberwrap.classList.add("show");
  els.memberwrap.addEventListener("change", onMemberToggle);
}

function onMemberToggle(e) {
  const cb = e.target.closest('input[type="checkbox"][data-did]');
  if (!cb) return;
  if (cb.checked) checked.add(cb.dataset.did);
  else checked.delete(cb.dataset.did);
  updateCountLabel();
}

function updateCountLabel() {
  els.countLabel.innerHTML = `<b>${checked.size}</b> of ${members.length} selected`;
}

els.selectAll.addEventListener("click", () => {
  for (const cb of els.memberwrap.querySelectorAll('input[type="checkbox"][data-did]')) {
    cb.checked = true;
    checked.add(cb.dataset.did);
  }
  updateCountLabel();
});
els.selectNone.addEventListener("click", () => {
  for (const cb of els.memberwrap.querySelectorAll('input[type="checkbox"][data-did]')) {
    cb.checked = false;
  }
  checked.clear();
  updateCountLabel();
});

els.copyBtn.addEventListener("click", async () => {
  const handles = members.filter((m) => checked.has(m.did) && m.handle).map((m) => "@" + m.handle);
  if (!handles.length) return;
  try {
    await navigator.clipboard.writeText(handles.join(" "));
    setStatus(`copied ${handles.length} handle${handles.length === 1 ? "" : "s"} — paste into a new group chat's "add people" search.`);
  } catch {
    setStatus("couldn't copy — your browser blocked clipboard access.", true);
  }
});

let busyFind = false;
els.findBtn.addEventListener("click", async () => {
  if (busyFind || !scannedDid || !distinctLabels.length) return;
  busyFind = true;
  els.findBtn.disabled = true;
  els.toolbar.classList.remove("show");
  els.memberwrap.classList.remove("show");
  els.memberwrap.innerHTML = "";
  members = [];
  checked.clear();

  const chosen = distinctLabels[Number(els.labelSelect.value)];

  try {
    setProgress(0.05, "building the search pool…");
    const pool = await socialPool(scannedDid, (msg) => setProgress(0.15, msg));

    if (!pool.length) {
      setStatus("this account has no follows or followers to search.", true);
      hideProgress();
      return;
    }

    setProgress(0.35, `checking labels on ${pool.length} accounts…`);
    const profiles = await getProfilesBatch(
      pool,
      (done, total) => {
        setProgress(0.35 + 0.6 * (done / total), `checking labels on ${pool.length} accounts… (${done}/${total})`);
      },
      chosen.isSelf ? undefined : chosen.src,
    );

    const matched = [];
    for (const did of pool) {
      const p = profiles.get(did);
      if (p && matchesLabel(p, chosen)) matched.push(p);
    }

    members = [
      { did: scannedProfile.did, handle: scannedProfile.handle, displayName: scannedProfile.displayName, avatar: scannedProfile.avatar, self: true },
      ...matched.map((p) => ({ did: p.did, handle: p.handle, displayName: p.displayName, avatar: p.avatar, self: false })),
    ];
    for (const m of members) checked.add(m.did);

    renderMembers();
    els.toolbar.classList.add("show");
    updateCountLabel();

    hideProgress();
    const shareUrl = `https://labelmuster.bisks.net/summary/${encodeURIComponent(scannedProfile.handle)}/${encodeURIComponent(chosen.val)}/${matched.length}`;
    const intentText = `${matched.length} account${matched.length === 1 ? "" : "s"} near @${scannedProfile.handle} carry the "${chosen.val}" label — mustered with labelmuster`;
    els.resultNote.innerHTML =
      `Searched ${pool.length} accounts in @${esc(scannedProfile.handle)}'s follows + followers — ${matched.length} of them also carry "${esc(chosen.val)}"` +
      `${chosen.isSelf ? " (self-applied)" : ` via ${esc(labelerName(chosen.src))}`}. ` +
      `<a href="https://bsky.app/intent/compose?text=${encodeURIComponent(intentText + " " + shareUrl)}" target="_blank" rel="noopener">share this muster →</a>`;
    setStatus(`mustered ${members.length} account${members.length === 1 ? "" : "s"} for "${chosen.val}".`);
  } catch (e) {
    setStatus("couldn't muster that label: " + e.message, true);
    hideProgress();
  } finally {
    els.findBtn.disabled = false;
    busyFind = false;
  }
});

// --- boot --------------------------------------------------------------------

function boot() {
  const qp = new URLSearchParams(location.search).get("account");
  if (qp) {
    els.handleInput.value = qp;
    scan(qp);
  } else {
    els.handleInput.focus();
  }
}

boot();
