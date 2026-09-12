// app.js — blocksweep: paste a Bluesky list link, review its full public
// membership, sign in, and bulk-create app.bsky.graph.block records for
// everyone left checked. Membership fetch is sites/rollcall's
// public/lib/listmembers.js verbatim (CAR-first, paginated fallback); the
// block write is public/lib/block.js (chunked applyWrites, forked from
// sites/listenheimer's modlist.js). OAuth is public/lib/oauth.js, forked
// from sites/blocknotes and narrowed to create-only on app.bsky.graph.block.

import { parseListInput, fetchListMeta, fetchAllMembers } from "./lib/listmembers.js";
import { getProfilesBatch } from "./lib/identity.js";
import { bulkBlock } from "./lib/block.js";
import { login, getSession, clearSession, completeLoginIfCallback, dpopFetch } from "./lib/oauth.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const els = {
  authBar: document.getElementById("authBar"),
  form: document.getElementById("form"),
  listUrl: document.getElementById("listUrl"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  progwrap: document.getElementById("progwrap"),
  progbarfill: document.getElementById("progbarfill"),
  proglabel: document.getElementById("proglabel"),
  listmeta: document.getElementById("listmeta"),
  lname: document.getElementById("lname"),
  lmetaline: document.getElementById("lmetaline"),
  ldesc: document.getElementById("ldesc"),
  toolbar: document.getElementById("toolbar"),
  countLabel: document.getElementById("countLabel"),
  selectAll: document.getElementById("selectAll"),
  selectNone: document.getElementById("selectNone"),
  blockBtn: document.getElementById("blockBtn"),
  memberwrap: document.getElementById("memberwrap"),
};

let session = null;
let members = []; // [{did, handle, displayName, avatar}]
const checked = new Set(); // dids currently checked

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

// --- auth bar ----------------------------------------------------------------

function renderAuthBar() {
  if (session) {
    els.authBar.innerHTML = `signed in as <b>@${esc(session.handle)}</b> · <a class="linklike" id="signOutLink">sign out</a>`;
    document.getElementById("signOutLink").onclick = async () => {
      await clearSession();
      session = null;
      renderAuthBar();
      updateBlockBtn();
    };
  } else {
    els.authBar.innerHTML = `
      sign in to actually block anyone —
      <input id="signinHandle" placeholder="you.bsky.social" autocomplete="username" />
      <button class="btn ghost" id="signInBtn" type="button">sign in with bluesky</button>
    `;
    const handleInput = document.getElementById("signinHandle");
    const goLogin = async () => {
      const h = handleInput.value.trim();
      if (!h) return;
      setStatus("redirecting to your PDS…");
      try {
        await login(h);
      } catch (e) {
        setStatus(e.message || String(e), true);
      }
    };
    document.getElementById("signInBtn").onclick = goLogin;
    handleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") goLogin();
    });
  }
  updateBlockBtn();
}

document.getElementById("ceeHook")?.addEventListener("click", () => {
  const input = document.getElementById("signinHandle");
  if (!input) return;
  input.value = "@cee.wtf";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();
});

// --- member list rendering ----------------------------------------------------

function memberRowHTML(m) {
  const profileUrl = m.handle ? `https://bsky.app/profile/${esc(m.handle)}` : `https://bsky.app/profile/${esc(m.did)}`;
  const nameOrHandle = m.displayName || m.handle || "(no handle)";
  const avatar = m.avatar
    ? `<img src="${esc(m.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy" />`
    : `<div class="noavatar">?</div>`;
  return `
    <label class="member">
      <input type="checkbox" data-did="${esc(m.did)}" checked />
      ${avatar}
      <div class="who">
        <div class="rname">${esc(nameOrHandle)}</div>
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
  updateBlockBtn();
}

function updateCountLabel() {
  els.countLabel.innerHTML = `<b>${checked.size}</b> of ${members.length} checked`;
}

function updateBlockBtn() {
  els.blockBtn.disabled = !session || checked.size === 0 || busyBlocking;
  els.blockBtn.textContent = busyBlocking
    ? "blocking…"
    : `block ${checked.size ? checked.size + " " : ""}checked`;
}

els.selectAll.addEventListener("click", () => {
  for (const cb of els.memberwrap.querySelectorAll('input[type="checkbox"][data-did]')) {
    cb.checked = true;
    checked.add(cb.dataset.did);
  }
  updateCountLabel();
  updateBlockBtn();
});
els.selectNone.addEventListener("click", () => {
  for (const cb of els.memberwrap.querySelectorAll('input[type="checkbox"][data-did]')) {
    cb.checked = false;
  }
  checked.clear();
  updateCountLabel();
  updateBlockBtn();
});

// --- loading a list ------------------------------------------------------------

let busyLoad = false;
async function run(raw) {
  if (busyLoad) return;
  busyLoad = true;
  els.go.disabled = true;
  setStatus("");
  els.listmeta.classList.remove("show");
  els.toolbar.classList.remove("show");
  els.memberwrap.classList.remove("show");
  els.memberwrap.innerHTML = "";
  hideProgress();
  members = [];
  checked.clear();

  try {
    setStatus("resolving list link…");
    const { ownerDid, listUri } = await parseListInput(raw);

    setStatus("loading list details…");
    const meta = await fetchListMeta(listUri);
    els.lname.textContent = meta.name;
    const purposeLabel = meta.purpose.includes("modlist") ? "moderation list" : meta.purpose.includes("curatelist") ? "curation list" : "list";
    els.lmetaline.textContent = `${purposeLabel} · curated by @${meta.creatorHandle || ownerDid}`;
    els.ldesc.textContent = meta.description;
    els.ldesc.style.display = meta.description ? "" : "none";
    els.listmeta.classList.add("show");

    setProgress(0.05, "downloading list membership…");
    const { dids: allDids, viaCar } = await fetchAllMembers(ownerDid, listUri, (msg) => setProgress(0.15, msg));

    const dids = allDids.filter((d) => !session || d !== session.did);
    if (!dids.length) {
      setStatus("this list has no members to block.");
      hideProgress();
      return;
    }

    setProgress(0.5, "fetching profiles…");
    const profiles = await getProfilesBatch(dids);
    members = dids.map((did) => {
      const p = profiles.get(did);
      return {
        did,
        handle: (p && p.handle) || null,
        displayName: (p && p.displayName) || "",
        avatar: (p && p.avatar) || "",
      };
    });
    for (const m of members) checked.add(m.did);

    renderMembers();
    els.toolbar.classList.add("show");
    updateCountLabel();
    updateBlockBtn();

    hideProgress();
    setStatus(
      `${members.length} member${members.length === 1 ? "" : "s"} found` +
        (viaCar ? " via repo download." : " via paginated list read.") +
        (allDids.length !== dids.length ? " (you were on the list — skipped yourself.)" : ""),
    );
  } catch (e) {
    setStatus("couldn't load that list: " + e.message, true);
    hideProgress();
  } finally {
    els.go.disabled = false;
    busyLoad = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (els.listUrl.value.trim()) run(els.listUrl.value);
});

// --- blocking --------------------------------------------------------------

let busyBlocking = false;
els.blockBtn.addEventListener("click", async () => {
  if (!session || checked.size === 0 || busyBlocking) return;
  const dids = Array.from(checked);
  const ok = window.confirm(
    `Block ${dids.length} account${dids.length === 1 ? "" : "s"}? This creates a real block on your Bluesky account for each one.`,
  );
  if (!ok) return;

  busyBlocking = true;
  updateBlockBtn();
  setProgress(0.02, `blocking 0/${dids.length}…`);

  try {
    const { blocked, failed } = await bulkBlock(session, dpopFetch, dids, (done, total) => {
      setProgress(done / total, `blocking ${done}/${total}…`);
    });
    hideProgress();
    if (failed.length) {
      setStatus(`blocked ${blocked} of ${dids.length} — ${failed.length} failed (${failed[0].error}).`, true);
    } else {
      setStatus(`done — blocked ${blocked} account${blocked === 1 ? "" : "s"}.`);
    }
    // Drop the successfully-blocked rows from the checked set so a retry only
    // targets whatever's left.
    for (const did of dids) {
      if (!failed.some((f) => f.did === did)) checked.delete(did);
    }
    for (const cb of els.memberwrap.querySelectorAll('input[type="checkbox"][data-did]')) {
      if (!checked.has(cb.dataset.did)) cb.checked = false;
    }
    updateCountLabel();
  } catch (e) {
    hideProgress();
    setStatus("blocking failed: " + (e.message || String(e)), true);
  } finally {
    busyBlocking = false;
    updateBlockBtn();
  }
});

// --- boot --------------------------------------------------------------------

async function boot() {
  try {
    const fromCallback = await completeLoginIfCallback();
    session = fromCallback || (await getSession());
  } catch (e) {
    setStatus(e.message || String(e), true);
    session = await getSession();
  }
  renderAuthBar();

  const qp = new URLSearchParams(location.search).get("list");
  if (qp) {
    els.listUrl.value = qp;
    run(qp);
  } else {
    els.listUrl.focus();
  }
}

boot();
