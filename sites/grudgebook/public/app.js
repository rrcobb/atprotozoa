// app.js — grudgebook.bisks.net client logic.
//
// A private-in-spirit ledger: sign in, log a grudge (subject + note +
// source links + a 1-5 severity), search it, edit it, delete it. Every
// grudge is a real net.bisks.grudgebook.entry record on the signed-in
// user's own PDS (see public/lexicons/) — this Worker never sees a token.
// No anonymous mode: a grudge is worth nothing if it isn't kept somewhere,
// so there's nothing useful to do here signed out except read the privacy
// note and sign in.

import { login, completeLoginIfCallback, getSession, clearSession, dpopFetch } from "/lib/oauth.js";

const COLLECTION = "net.bisks.grudgebook.entry";

let session = null;
let entries = []; // { rkey, subject, body, links, severity, tags, createdAt }
let query = "";
let sortMode = "recent"; // "recent" | "severity"
let busy = false;

const els = {
  authBar: document.getElementById("authBar"),
  authMsg: document.getElementById("authMsg"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  entryForm: document.getElementById("entryForm"),
  subjectInput: document.getElementById("subjectInput"),
  bodyInput: document.getElementById("bodyInput"),
  linksInput: document.getElementById("linksInput"),
  severityInput: document.getElementById("severityInput"),
  tagsInput: document.getElementById("tagsInput"),
  formMsg: document.getElementById("formMsg"),
  entriesList: document.getElementById("entriesList"),
  countMsg: document.getElementById("countMsg"),
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function parseLinks(raw) {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/^https?:\/\//i.test(s) ? s : `https://${s}`));
}

function parseTags(raw) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

// --- low-level PDS calls -----------------------------------------------------

// listRecords on the signed-in user's own repo. One person's grudge list
// stays small in practice, so this loops until the PDS stops handing back a
// cursor — no arbitrary page cap (see "No arbitrary caps" in the builder
// instructions), just a defensive break if a page ever comes back empty so a
// misbehaving PDS can't spin this forever.
async function pdsListRecords(sess, collection) {
  const base = sess.pdsUrl.replace(/\/$/, "");
  const out = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ repo: sess.did, collection, limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`${base}/xrpc/com.atproto.repo.listRecords?${qs}`);
    if (!res.ok) break;
    const data = await res.json();
    const records = data.records || [];
    for (const r of records) {
      const rkey = typeof r.uri === "string" ? r.uri.split("/").pop() : null;
      if (rkey) out.push({ rkey, uri: r.uri, value: r.value });
    }
    cursor = data.cursor;
    if (!records.length) break;
  } while (cursor);
  return out;
}

async function pdsCreateRecord(sess, collection, record) {
  const base = sess.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(sess, `${base}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: sess.did, collection, record }),
  });
  if (!res.ok) throw new Error(`createRecord ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const rkey = typeof data.uri === "string" ? data.uri.split("/").pop() : null;
  return { rkey, uri: data.uri };
}

async function pdsDeleteRecord(sess, collection, rkey) {
  if (!rkey) return;
  const base = sess.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(sess, `${base}/xrpc/com.atproto.repo.deleteRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: sess.did, collection, rkey }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`deleteRecord ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// --- loading -----------------------------------------------------------------

function fromRecord(r) {
  const v = r.value || {};
  return {
    rkey: r.rkey,
    subject: v.subject || "(untitled grudge)",
    body: v.body || "",
    links: Array.isArray(v.links) ? v.links : [],
    severity: Number.isInteger(v.severity) ? v.severity : null,
    tags: Array.isArray(v.tags) ? v.tags : [],
    createdAt: v.createdAt || null,
  };
}

async function loadAll() {
  setAuthMsg("loading your grudges…");
  try {
    const records = await pdsListRecords(session, COLLECTION);
    entries = records.map(fromRecord);
    setAuthMsg("");
  } catch (e) {
    setAuthMsg("couldn't load your grudges: " + (e.message || e), true);
  }
  renderList();
}

// --- mutations ----------------------------------------------------------------

async function handleAddSubmit(e) {
  e.preventDefault();
  if (!session || busy) return;
  const subject = els.subjectInput.value.trim();
  const body = els.bodyInput.value.trim();
  const links = parseLinks(els.linksInput.value);
  const severity = Number(els.severityInput.value) || null;
  const tags = parseTags(els.tagsInput.value);
  setFormMsg("");
  if (!subject) {
    setFormMsg("a grudge needs a subject — who or what this is about.", true);
    return;
  }
  busy = true;
  els.entryForm.querySelector("button[type=submit]").disabled = true;
  try {
    const createdAt = new Date().toISOString();
    const record = { $type: COLLECTION, subject, createdAt };
    if (body) record.body = body;
    if (links.length) record.links = links;
    if (severity) record.severity = severity;
    if (tags.length) record.tags = tags;
    const { rkey } = await pdsCreateRecord(session, COLLECTION, record);
    entries.unshift({ rkey, subject, body, links, severity, tags, createdAt });
    els.entryForm.reset();
    els.severityInput.value = "3";
    renderList();
  } catch (err) {
    setFormMsg(err.message || String(err), true);
  } finally {
    busy = false;
    els.entryForm.querySelector("button[type=submit]").disabled = false;
  }
}

async function doDelete(rkey) {
  if (!session) return;
  if (!confirm("let this one go? this deletes the record from your PDS.")) return;
  try {
    await pdsDeleteRecord(session, COLLECTION, rkey);
    entries = entries.filter((en) => en.rkey !== rkey);
    renderList();
  } catch (e) {
    setAuthMsg("couldn't delete: " + (e.message || e), true);
  }
}

// Editing has only create+delete scope, so this deletes the old record and
// creates a new one — but keeps the original createdAt, since that's the
// date that matters (when the grudge was first logged, not last edited).
async function saveEdit(rkey, patch) {
  if (!session) return;
  const entry = entries.find((en) => en.rkey === rkey);
  if (!entry) return;
  const next = { ...entry, ...patch };
  if (!next.subject.trim()) return;
  try {
    await pdsDeleteRecord(session, COLLECTION, rkey);
    const record = { $type: COLLECTION, subject: next.subject.trim(), createdAt: next.createdAt || new Date().toISOString() };
    if (next.body) record.body = next.body;
    if (next.links.length) record.links = next.links;
    if (next.severity) record.severity = next.severity;
    if (next.tags.length) record.tags = next.tags;
    const { rkey: newRkey } = await pdsCreateRecord(session, COLLECTION, record);
    Object.assign(entry, next, { rkey: newRkey });
    renderList();
  } catch (e) {
    setAuthMsg("couldn't save edit: " + (e.message || e), true);
  }
}

// --- rendering ----------------------------------------------------------------

function fmtDate(iso) {
  if (!iso) return "date unknown";
  const d = new Date(iso);
  if (isNaN(d)) return "date unknown";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const SEVERITY_LABEL = { 1: "mild annoyance", 2: "still stings", 3: "won't forget", 4: "deep cut", 5: "blood feud" };

function matches(entry) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    entry.subject.toLowerCase().includes(q) ||
    entry.body.toLowerCase().includes(q) ||
    entry.tags.some((t) => t.toLowerCase().includes(q))
  );
}

function entryRow(entry) {
  const links = entry.links.length
    ? `<div class="entry-links">${entry.links
        .map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l.replace(/^https?:\/\//, "").slice(0, 60))}</a>`)
        .join("")}</div>`
    : "";
  const tags = entry.tags.length ? `<div class="entry-tags">${entry.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : "";
  const severity = entry.severity
    ? `<span class="severity sev-${entry.severity}" title="${esc(SEVERITY_LABEL[entry.severity] || "")}">${"●".repeat(entry.severity)}${"○".repeat(5 - entry.severity)}</span>`
    : "";
  return `<div class="entry-row" data-rkey="${esc(entry.rkey)}">
    <div class="entry-head">
      <span class="entry-subject">${esc(entry.subject)}</span>
      ${severity}
      <span class="entry-date">${esc(fmtDate(entry.createdAt))}</span>
    </div>
    <div class="entry-body" data-role="view">
      ${entry.body ? `<div class="entry-note">${esc(entry.body)}</div>` : ""}
      ${links}
      ${tags}
    </div>
    <div class="entry-edit" data-role="edit" hidden>
      <input class="edit-subject" value="${esc(entry.subject)}" placeholder="subject" />
      <textarea class="edit-body" rows="3" maxlength="3000">${esc(entry.body)}</textarea>
      <textarea class="edit-links" rows="2" placeholder="links, one per line">${entry.links.join("\n")}</textarea>
      <input class="edit-tags" value="${esc(entry.tags.join(", "))}" placeholder="tags, comma separated" />
      <select class="edit-severity">
        ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === entry.severity ? "selected" : ""}>${n} — ${SEVERITY_LABEL[n]}</option>`).join("")}
      </select>
      <div class="entry-edit-actions">
        <button type="button" class="btn small" data-action="save-edit">save</button>
        <button type="button" class="btn small" data-action="cancel-edit">cancel</button>
      </div>
    </div>
    <div class="entry-actions">
      <button type="button" class="btn small" data-action="edit">edit</button>
      <button type="button" class="btn small danger" data-action="delete">let it go</button>
    </div>
  </div>`;
}

function sortedFiltered() {
  const filtered = entries.filter(matches);
  if (sortMode === "severity") {
    return filtered.slice().sort((a, b) => (b.severity || 0) - (a.severity || 0) || (b.createdAt || "").localeCompare(a.createdAt || ""));
  }
  return filtered.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function renderList() {
  if (!session) {
    els.entriesList.innerHTML = `<div class="empty">sign in to see your grudges.</div>`;
    els.countMsg.textContent = "";
    return;
  }
  const list = sortedFiltered();
  els.countMsg.textContent = entries.length
    ? `${entries.length} grudge${entries.length === 1 ? "" : "s"} held${query ? `, ${list.length} shown` : ""}`
    : "";
  if (!entries.length) {
    els.entriesList.innerHTML = `<div class="empty">nothing yet — log your first grudge above. the receipts (links) are the whole point.</div>`;
    return;
  }
  if (!list.length) {
    els.entriesList.innerHTML = `<div class="empty">nothing matches "${esc(query)}".</div>`;
    return;
  }
  els.entriesList.innerHTML = list.map(entryRow).join("");
}

function wireListActions() {
  els.entriesList.addEventListener("click", (e) => {
    const row = e.target.closest(".entry-row");
    if (!row) return;
    const rkey = row.dataset.rkey;
    const action = e.target.dataset.action;
    if (action === "edit") {
      row.querySelector('[data-role="view"]').hidden = true;
      row.querySelector('[data-role="edit"]').hidden = false;
      row.querySelector(".edit-subject").focus();
    } else if (action === "cancel-edit") {
      row.querySelector('[data-role="view"]').hidden = false;
      row.querySelector('[data-role="edit"]').hidden = true;
    } else if (action === "save-edit") {
      const entry = entries.find((en) => en.rkey === rkey);
      if (!entry) return;
      const patch = {
        subject: row.querySelector(".edit-subject").value,
        body: row.querySelector(".edit-body").value.trim(),
        links: parseLinks(row.querySelector(".edit-links").value),
        tags: parseTags(row.querySelector(".edit-tags").value),
        severity: Number(row.querySelector(".edit-severity").value) || null,
      };
      saveEdit(rkey, patch);
    } else if (action === "delete") {
      doDelete(rkey);
    }
  });
}

// --- auth bar ------------------------------------------------------------------

function renderAuthBar() {
  if (session) {
    els.authBar.innerHTML = `signed in as <b>@${esc(session.handle)}</b> · <a id="signOutLink">sign out</a>`;
    document.getElementById("signOutLink").onclick = async () => {
      await clearSession();
      session = null;
      entries = [];
      renderAuthBar();
      renderList();
    };
  } else {
    els.authBar.innerHTML = `
      <input id="signinHandle" placeholder="you.bsky.social" autocomplete="username" />
      <button id="signInBtn" class="btn primary">sign in with bluesky</button>
    `;
    const handleInput = document.getElementById("signinHandle");
    const go = async () => {
      const h = handleInput.value.trim().replace(/^@/, "");
      if (!h) return;
      setAuthMsg("redirecting to your PDS…");
      try {
        await login(h);
      } catch (e) {
        setAuthMsg(e.message || String(e), true);
      }
    };
    document.getElementById("signInBtn").onclick = go;
    handleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
  }
}

function setAuthMsg(text, isErr) {
  els.authMsg.textContent = text || "";
  els.authMsg.style.color = isErr ? "var(--bad)" : "var(--dim)";
}

function setFormMsg(text, isErr) {
  els.formMsg.textContent = text || "";
  els.formMsg.style.color = isErr ? "var(--bad)" : "var(--dim)";
}

// --- boot ------------------------------------------------------------------

async function boot() {
  wireListActions();
  els.entryForm.addEventListener("submit", handleAddSubmit);
  els.searchInput.addEventListener("input", () => {
    query = els.searchInput.value.trim();
    renderList();
  });
  els.sortSelect.addEventListener("change", () => {
    sortMode = els.sortSelect.value;
    renderList();
  });
  document.getElementById("ceeHook")?.addEventListener("click", () => {
    const input = document.getElementById("signinHandle");
    if (!input) return;
    input.value = "@cee.wtf";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  });

  try {
    const fromCallback = await completeLoginIfCallback();
    session = fromCallback || (await getSession());
  } catch (e) {
    setAuthMsg(e.message || String(e), true);
    session = await getSession();
  }

  renderAuthBar();
  renderList();
  if (session) await loadAll();
}

boot();
