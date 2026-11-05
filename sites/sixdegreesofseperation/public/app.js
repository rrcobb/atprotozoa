// app.js — SixDegreesOfSeperation. Handle -> moots (follows ∩ followers) ->
// every moot's block records -> accounts blocked by >= N moots, ranked ->
// checked rows saved as a modlist via modlist.js (create-only OAuth scope).
import { login, completeLoginIfCallback, getSession, clearSession, dpopFetch } from "./lib/oauth.js";
import { resolveDid, getProfilesBatch } from "./lib/identity.js";
import { findMoots, tallyBlocks, rank } from "./lib/moots.js";
import { createModList } from "./lib/modlist.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
if (window.attachHandleTypeahead) window.attachHandleTypeahead($("#f-handle"));

let session = null;
let me = null; // DID being analysed
let blockers = new Map(); // blockedDid -> Set<mootDid>
let mootCount = 0;
let failedCount = 0;
let profiles = new Map(); // did -> profile (blocked accounts and moots)
let rows = []; // current ranked rows
const selected = new Set(); // DIDs checked for the list
const unchecked = new Set(); // DIDs the user unchecked (survive threshold changes)

const cleanHandle = (v) => v.trim().replace(/^@/, "");

function setStatus(el, msg, cls = "") { el.textContent = msg; el.className = "status " + cls; }

function renderAuth() {
  $("#signed-in-row").hidden = !session;
  $("#signed-out-row").hidden = !!session;
  if (session) $("#who").textContent = "@" + session.handle;
  updateBuildGate();
}

function updateBuildGate() {
  $("#btn-build").disabled = !(session && selected.size);
}

$("#btn-signin").addEventListener("click", async () => {
  const h = cleanHandle($("#f-handle").value);
  if (!h) return setStatus($("#auth-status"), "type your handle in the box at the top first — that's who you'll sign in as.", "err");
  setStatus($("#auth-status"), "redirecting to your PDS…");
  try {
    await login(h);
  } catch (e) {
    setStatus($("#auth-status"), `sign-in failed: ${e.message}`, "err");
  }
});
$("#btn-signout").addEventListener("click", async () => {
  await clearSession();
  session = null;
  renderAuth();
});

function minValue() {
  const n = parseInt($("#f-min").value, 10);
  return Number.isFinite(n) && n >= 1 ? n : 6;
}

function renderRows() {
  const min = minValue();
  rows = rank(blockers, min, new Set([me]));
  selected.clear();
  for (const r of rows) if (!unchecked.has(r.did)) selected.add(r.did);
  $("#summary").textContent = rows.length
    ? `${rows.length} account${rows.length === 1 ? "" : "s"} blocked by ${min}+ of your ${mootCount} moots`
    : `nobody is blocked by ${min}+ of your ${mootCount} moots`;
  $("#rows").innerHTML = rows
    .map((r) => {
      const p = profiles.get(r.did);
      const handle = p ? "@" + p.handle : r.did;
      const name = p && p.displayName ? p.displayName : p ? p.handle : "(account not found)";
      const by = [...blockers.get(r.did)]
        .map((d) => { const q = profiles.get(d); return q ? "@" + q.handle : d; })
        .sort()
        .map(esc)
        .join(", ");
      return `<div class="row">
        <input type="checkbox" data-did="${esc(r.did)}" ${selected.has(r.did) ? "checked" : ""} aria-label="include ${esc(handle)}" />
        ${p && p.avatar ? `<img class="avatar" src="${esc(p.avatar)}" alt="" loading="lazy" />` : `<span class="avatar"></span>`}
        <div class="who">
          <a class="n" href="https://bsky.app/profile/${encodeURIComponent(r.did)}" target="_blank" rel="noopener">${esc(name)}</a>
          <span class="h">${esc(handle)}</span>
          <details><summary>blocked by</summary>${by}</details>
        </div>
        <div class="cnt">${r.count} <small>blocks</small></div>
      </div>`;
    })
    .join("");
  $("#sel-count").textContent = `${selected.size} selected`;
  $("#save-section").hidden = !rows.length;
  updateBuildGate();
}

$("#rows").addEventListener("change", (e) => {
  const cb = e.target;
  if (!(cb instanceof HTMLInputElement) || !cb.dataset.did) return;
  if (cb.checked) { selected.add(cb.dataset.did); unchecked.delete(cb.dataset.did); }
  else { selected.delete(cb.dataset.did); unchecked.add(cb.dataset.did); }
  $("#sel-count").textContent = `${selected.size} selected`;
  updateBuildGate();
});
function setAll(on) {
  for (const r of rows) { if (on) unchecked.delete(r.did); else unchecked.add(r.did); }
  renderRows();
}
$("#btn-all").addEventListener("click", () => setAll(true));
$("#btn-none").addEventListener("click", () => setAll(false));
$("#f-min").addEventListener("input", () => { if (blockers.size || mootCount) renderRows(); });

async function run() {
  const raw = cleanHandle($("#f-handle").value);
  const status = $("#status");
  if (!raw) return setStatus(status, "type a handle first.", "err");
  $("#btn-go").disabled = true;
  $("#results").hidden = true;
  $("#save-section").hidden = true;
  $("#build-result").hidden = true;
  unchecked.clear();
  try {
    setStatus(status, "resolving handle…");
    me = await resolveDid(raw);
    const moots = await findMoots(me, (what, n) => setStatus(status, `reading ${what}… ${n}`));
    mootCount = moots.length;
    if (!moots.length) return setStatus(status, "no mutuals found for that account.", "warn");

    $("#progwrap").hidden = false;
    const fill = $("#progfill");
    setStatus(status, `found ${moots.length} moots. reading their blocks…`);
    const t = await tallyBlocks(moots, (done, total) => {
      fill.style.width = (100 * done) / total + "%";
      $("#proglabel").textContent = `${done} / ${total} moots read`;
    });
    blockers = t.blockers;
    failedCount = t.failed.length;

    // Hydrate only what's displayed: accounts over the lowest useful threshold
    // is unknown up front, so hydrate every blocked account that at least 2
    // moots share, plus the moots themselves (for the "blocked by" lists).
    $("#proglabel").textContent = "loading profiles…";
    const want = new Set(moots);
    for (const [d, s] of blockers) if (s.size >= 2) want.add(d);
    profiles = await getProfilesBatch([...want]);

    $("#progwrap").hidden = true;
    $("#results").hidden = false;
    $("#failnote").textContent = failedCount
      ? `${failedCount} of ${moots.length} moots' repos couldn't be read and are not counted.`
      : "";
    setStatus(status, `done — ${blockers.size} distinct accounts blocked across ${moots.length - failedCount} moots.`, "ok");
    renderRows();
    history.replaceState({}, "", "/?handle=" + encodeURIComponent(raw));
  } catch (e) {
    $("#progwrap").hidden = true;
    setStatus(status, `couldn't finish: ${e.message}`, "err");
  } finally {
    $("#btn-go").disabled = false;
  }
}
$("#btn-go").addEventListener("click", run);
$("#f-handle").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });

$("#btn-build").addEventListener("click", async () => {
  const status = $("#build-status");
  const dids = rows.filter((r) => selected.has(r.did)).map((r) => r.did);
  if (!dids.length) return;
  $("#btn-build").disabled = true;
  setStatus(status, "");
  try {
    const name = $("#f-list-name").value.trim() || "blocked by my moots";
    const result = await createModList(session, dpopFetch, {
      name,
      description: `accounts blocked by ${minValue()} or more of my mutuals — made with sixdegreesofseperation.bisks.net.`,
      memberDids: dids,
    }, (step) => setStatus(status, step));
    setStatus(status, `list created with ${result.count} account${result.count === 1 ? "" : "s"}!`, "ok");
    $("#build-result").hidden = false;
    $("#build-link").href = result.url;
    $("#build-link").textContent = result.url;
    const text = `made a moderation list of the ${result.count} accounts blocked by ${minValue()}+ of my moots → ${result.url}\n\nbuilt with sixdegreesofseperation.bisks.net`;
    $("#build-share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  } catch (e) {
    setStatus(status, `couldn't save the list: ${e.message}`, "err");
  } finally {
    updateBuildGate();
  }
});

(async function boot() {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setStatus($("#auth-status"), e.message, "err");
  }
  renderAuth();
  const h = new URLSearchParams(location.search).get("handle");
  if (h) $("#f-handle").value = h;
  else if (session) $("#f-handle").value = session.handle;
  if (h || session) run();
})();
