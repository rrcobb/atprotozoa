// app.js — blocknotes.bisks.net client logic.
//
// Everything here is a real atproto write against the signed-in user's own
// account, made straight from the browser (this Worker never sees a token):
//   - block / unblock  -> app.bsky.graph.block create/delete, on your own PDS.
//   - mute / unmute    -> app.bsky.graph.muteActor/unmuteActor, proxied
//                         through your own PDS to the AppView (mutes are
//                         account-side state, not a repo record).
//   - the note         -> net.bisks.blocknotes.entry create/delete, on your
//                         own PDS — see public/lexicons/. One entry per
//                         (subject, kind) pair; editing a note deletes the old
//                         record and creates a new one (this site only has
//                         create+delete scope, not update) but keeps the
//                         original createdAt, since that's the date that
//                         matters — when you blocked/muted them, not when you
//                         last edited the reminder.
//
// No anonymous/local-only mode: blocking and muting are account actions, so
// there's nothing useful to do here signed out except read the privacy note
// and sign in.

import { login, completeLoginIfCallback, getSession, clearSession, dpopFetch, resolveHandle } from "/lib/oauth.js";

const BLOCK_COLLECTION = "app.bsky.graph.block";
const NOTE_COLLECTION = "net.bisks.blocknotes.entry";
const APPVIEW_PROXY = "did:web:api.bsky.app#bsky_appview";
const PUBLIC_API = "https://api.bsky.app";

let session = null;
let blocks = []; // { did, handle, displayName, avatar, blockRkey, blockUri, noteRkey, reason, createdAt }
let mutes = [];  // same shape, no blockRkey/blockUri
let query = "";
let busy = false;

const els = {
  authBar: document.getElementById("authBar"),
  authMsg: document.getElementById("authMsg"),
  searchInput: document.getElementById("searchInput"),
  blockForm: document.getElementById("blockForm"),
  blockHandle: document.getElementById("blockHandle"),
  blockReason: document.getElementById("blockReason"),
  blockMsg: document.getElementById("blockMsg"),
  blocksList: document.getElementById("blocksList"),
  muteForm: document.getElementById("muteForm"),
  muteHandle: document.getElementById("muteHandle"),
  muteReason: document.getElementById("muteReason"),
  muteMsg: document.getElementById("muteMsg"),
  mutesList: document.getElementById("mutesList"),
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// --- low-level PDS calls -----------------------------------------------------

// listRecords on the signed-in user's own repo. Own-account collections stay
// small in practice, so this loops until the PDS stops handing back a
// cursor — no arbitrary page cap (see notes/25-08 "question every cap"), just
// a defensive break if a page ever comes back empty so a misbehaving PDS
// can't spin this forever.
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

// Mutes have no bulk-download equivalent (they're account-side AppView state,
// not repo records), so this has to paginate. Loops until exhausted; the
// empty-page break is a runaway-safety backstop, not a speed knob, so it
// stays regardless of list size.
async function fetchAllMutes(sess) {
  const out = [];
  let cursor;
  do {
    const url = new URL(`${sess.pdsUrl.replace(/\/$/, "")}/xrpc/app.bsky.graph.getMutes`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await dpopFetch(sess, url.toString(), {
      headers: { accept: "application/json", "atproto-proxy": APPVIEW_PROXY },
    });
    if (!res.ok) throw new Error(`getMutes failed (${res.status})`);
    const data = await res.json();
    const page = data.mutes || [];
    out.push(...page);
    cursor = data.cursor;
    if (!page.length) break;
  } while (cursor);
  return out;
}

async function rpcMuteActor(sess, did) {
  const res = await dpopFetch(sess, `${sess.pdsUrl.replace(/\/$/, "")}/xrpc/app.bsky.graph.muteActor`, {
    method: "POST",
    headers: { "content-type": "application/json", "atproto-proxy": APPVIEW_PROXY },
    body: JSON.stringify({ actor: did }),
  });
  if (!res.ok) throw new Error(`muteActor ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function rpcUnmuteActor(sess, did) {
  const res = await dpopFetch(sess, `${sess.pdsUrl.replace(/\/$/, "")}/xrpc/app.bsky.graph.unmuteActor`, {
    method: "POST",
    headers: { "content-type": "application/json", "atproto-proxy": APPVIEW_PROXY },
    body: JSON.stringify({ actor: did }),
  });
  if (!res.ok) throw new Error(`unmuteActor ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// Public, unauthenticated, CORS-open — batches of 25 (getProfiles' own cap).
async function fetchProfiles(dids) {
  const out = new Map();
  const unique = [...new Set(dids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += 25) {
    const chunk = unique.slice(i, i + 25);
    const qs = new URLSearchParams();
    chunk.forEach((d) => qs.append("actors", d));
    try {
      const res = await fetch(`${PUBLIC_API}/xrpc/app.bsky.actor.getProfiles?${qs}`);
      if (!res.ok) continue;
      const data = await res.json();
      for (const p of data.profiles || []) out.set(p.did, p);
    } catch {}
  }
  return out;
}

async function resolveActor(input) {
  const raw = input.trim().replace(/^@/, "");
  if (!raw) throw new Error("enter a handle");
  const did = raw.startsWith("did:") ? raw : await resolveHandle(raw);
  if (!did) throw new Error(`couldn't resolve "${raw}"`);
  return did;
}

// --- loading -----------------------------------------------------------------

async function loadAll() {
  setAuthMsg("loading your blocks and mutes…");
  try {
    const [blockRecords, noteRecords, muteActors] = await Promise.all([
      pdsListRecords(session, BLOCK_COLLECTION),
      pdsListRecords(session, NOTE_COLLECTION),
      fetchAllMutes(session),
    ]);

    const noteFor = (did, kind) =>
      noteRecords.find((n) => n.value?.subject === did && n.value?.kind === kind);

    const blockDids = blockRecords.map((r) => r.value?.subject).filter(Boolean);
    const profiles = await fetchProfiles(blockDids);

    blocks = blockRecords
      .filter((r) => r.value?.subject)
      .map((r) => {
        const did = r.value.subject;
        const note = noteFor(did, "block");
        const profile = profiles.get(did);
        return {
          did,
          handle: profile?.handle || note?.value?.subjectHandle || did,
          displayName: profile?.displayName || "",
          avatar: profile?.avatar || "",
          blockRkey: r.rkey,
          noteRkey: note?.rkey || null,
          reason: note?.value?.reason || "",
          createdAt: r.value.createdAt || note?.value?.createdAt || null,
        };
      })
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    mutes = muteActors.map((actor) => {
      const note = noteFor(actor.did, "mute");
      return {
        did: actor.did,
        handle: actor.handle || note?.value?.subjectHandle || actor.did,
        displayName: actor.displayName || "",
        avatar: actor.avatar || "",
        noteRkey: note?.rkey || null,
        reason: note?.value?.reason || "",
        createdAt: note?.value?.createdAt || null,
      };
    }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    setAuthMsg("");
  } catch (e) {
    setAuthMsg("couldn't load your blocks/mutes: " + (e.message || e), true);
  }
  renderLists();
}

// --- mutations ----------------------------------------------------------------

async function handleBlockSubmit(e) {
  e.preventDefault();
  if (!session) return;
  if (busy) return;
  const handleInput = els.blockHandle.value;
  const reason = els.blockReason.value.trim();
  setFormMsg(els.blockMsg, "");
  if (blocks.some((b) => b.handle.toLowerCase() === handleInput.trim().replace(/^@/, "").toLowerCase())) {
    setFormMsg(els.blockMsg, "already on your block list — edit the note below instead.", true);
    return;
  }
  busy = true;
  els.blockForm.querySelector("button").disabled = true;
  try {
    const did = await resolveActor(handleInput);
    if (did === session.did) throw new Error("can't block yourself");
    const createdAt = new Date().toISOString();
    const { rkey: blockRkey } = await pdsCreateRecord(session, BLOCK_COLLECTION, {
      $type: BLOCK_COLLECTION,
      subject: did,
      createdAt,
    });
    let noteRkey = null;
    if (reason) {
      const created = await pdsCreateRecord(session, NOTE_COLLECTION, {
        $type: NOTE_COLLECTION,
        subject: did,
        subjectHandle: handleInput.trim().replace(/^@/, ""),
        kind: "block",
        reason,
        createdAt,
      });
      noteRkey = created.rkey;
    }
    const profiles = await fetchProfiles([did]);
    const profile = profiles.get(did);
    blocks.unshift({
      did,
      handle: profile?.handle || handleInput.trim().replace(/^@/, ""),
      displayName: profile?.displayName || "",
      avatar: profile?.avatar || "",
      blockRkey,
      noteRkey,
      reason,
      createdAt,
    });
    els.blockForm.reset();
    renderLists();
  } catch (err) {
    setFormMsg(els.blockMsg, err.message || String(err), true);
  } finally {
    busy = false;
    els.blockForm.querySelector("button").disabled = false;
  }
}

async function handleMuteSubmit(e) {
  e.preventDefault();
  if (!session) return;
  if (busy) return;
  const handleInput = els.muteHandle.value;
  const reason = els.muteReason.value.trim();
  setFormMsg(els.muteMsg, "");
  if (mutes.some((m) => m.handle.toLowerCase() === handleInput.trim().replace(/^@/, "").toLowerCase())) {
    setFormMsg(els.muteMsg, "already on your mute list — edit the note below instead.", true);
    return;
  }
  busy = true;
  els.muteForm.querySelector("button").disabled = true;
  try {
    const did = await resolveActor(handleInput);
    if (did === session.did) throw new Error("can't mute yourself");
    await rpcMuteActor(session, did);
    const createdAt = new Date().toISOString();
    let noteRkey = null;
    if (reason) {
      const created = await pdsCreateRecord(session, NOTE_COLLECTION, {
        $type: NOTE_COLLECTION,
        subject: did,
        subjectHandle: handleInput.trim().replace(/^@/, ""),
        kind: "mute",
        reason,
        createdAt,
      });
      noteRkey = created.rkey;
    }
    const profiles = await fetchProfiles([did]);
    const profile = profiles.get(did);
    mutes.unshift({
      did,
      handle: profile?.handle || handleInput.trim().replace(/^@/, ""),
      displayName: profile?.displayName || "",
      avatar: profile?.avatar || "",
      noteRkey,
      reason,
      createdAt,
    });
    els.muteForm.reset();
    renderLists();
  } catch (err) {
    setFormMsg(els.muteMsg, err.message || String(err), true);
  } finally {
    busy = false;
    els.muteForm.querySelector("button").disabled = false;
  }
}

async function doUnblock(did) {
  const entry = blocks.find((b) => b.did === did);
  if (!entry || !session) return;
  try {
    await pdsDeleteRecord(session, BLOCK_COLLECTION, entry.blockRkey);
    await pdsDeleteRecord(session, NOTE_COLLECTION, entry.noteRkey);
    blocks = blocks.filter((b) => b.did !== did);
    renderLists();
  } catch (e) {
    setAuthMsg("couldn't unblock: " + (e.message || e), true);
  }
}

async function doUnmute(did) {
  const entry = mutes.find((m) => m.did === did);
  if (!entry || !session) return;
  try {
    await rpcUnmuteActor(session, did);
    await pdsDeleteRecord(session, NOTE_COLLECTION, entry.noteRkey);
    mutes = mutes.filter((m) => m.did !== did);
    renderLists();
  } catch (e) {
    setAuthMsg("couldn't unmute: " + (e.message || e), true);
  }
}

async function saveNote(kind, did, newReason) {
  if (!session) return;
  const list = kind === "block" ? blocks : mutes;
  const entry = list.find((e) => e.did === did);
  if (!entry) return;
  const trimmed = newReason.trim();
  try {
    if (entry.noteRkey) await pdsDeleteRecord(session, NOTE_COLLECTION, entry.noteRkey);
    if (trimmed) {
      const created = await pdsCreateRecord(session, NOTE_COLLECTION, {
        $type: NOTE_COLLECTION,
        subject: did,
        subjectHandle: entry.handle,
        kind,
        reason: trimmed,
        createdAt: entry.createdAt || new Date().toISOString(),
      });
      entry.noteRkey = created.rkey;
      entry.reason = trimmed;
    } else {
      entry.noteRkey = null;
      entry.reason = "";
    }
    renderLists();
  } catch (e) {
    setAuthMsg("couldn't save note: " + (e.message || e), true);
  }
}

// --- rendering ----------------------------------------------------------------

function fmtDate(iso) {
  if (!iso) return "date unknown";
  const d = new Date(iso);
  if (isNaN(d)) return "date unknown";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function matches(entry) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    entry.handle.toLowerCase().includes(q) ||
    entry.displayName.toLowerCase().includes(q) ||
    entry.reason.toLowerCase().includes(q)
  );
}

function entryRow(entry, kind) {
  const name = entry.displayName || entry.handle;
  const actionLabel = kind === "block" ? "unblock" : "unmute";
  return `<div class="entry-row" data-did="${esc(entry.did)}" data-kind="${kind}">
    <img class="entry-avatar" src="${esc(entry.avatar) || FALLBACK_AVATAR}" alt="" loading="lazy" />
    <div class="entry-body">
      <div class="entry-head">
        <a class="entry-name" href="https://bsky.app/profile/${esc(entry.handle)}" target="_blank" rel="noopener">${esc(name)}</a>
        <span class="entry-handle">@${esc(entry.handle)}</span>
        <span class="entry-date">${esc(fmtDate(entry.createdAt))}</span>
      </div>
      <div class="entry-reason" data-role="reason">${entry.reason ? esc(entry.reason) : '<span class="no-note">no note — add one</span>'}</div>
      <div class="entry-edit" data-role="edit" hidden>
        <textarea rows="2" maxlength="2000">${esc(entry.reason)}</textarea>
        <div class="entry-edit-actions">
          <button type="button" class="btn small" data-action="save-note">save</button>
          <button type="button" class="btn small" data-action="cancel-note">cancel</button>
        </div>
      </div>
      <div class="entry-actions">
        <button type="button" class="btn small" data-action="edit-note">edit note</button>
        <button type="button" class="btn small danger" data-action="remove">${actionLabel}</button>
      </div>
    </div>
  </div>`;
}

const FALLBACK_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#3a2f1e"/></svg>',
  );

function renderList(container, list, kind, emptyMsg) {
  const filtered = list.filter(matches);
  if (!session) {
    container.innerHTML = `<div class="empty">sign in to see your ${kind}s.</div>`;
    return;
  }
  if (!list.length) {
    container.innerHTML = `<div class="empty">${emptyMsg}</div>`;
    return;
  }
  if (!filtered.length) {
    container.innerHTML = `<div class="empty">nothing matches "${esc(query)}".</div>`;
    return;
  }
  container.innerHTML = filtered.map((e) => entryRow(e, kind)).join("");
}

function renderLists() {
  renderList(els.blocksList, blocks, "block", "no blocks yet — block someone above and leave yourself a note.");
  renderList(els.mutesList, mutes, "mute", "no mutes yet — mute someone above and leave yourself a note.");
}

function wireListActions(container, onSave, onRemove) {
  container.addEventListener("click", (e) => {
    const row = e.target.closest(".entry-row");
    if (!row) return;
    const did = row.dataset.did;
    const kind = row.dataset.kind;
    const action = e.target.dataset.action;
    if (action === "edit-note") {
      row.querySelector('[data-role="reason"]').hidden = true;
      row.querySelector('[data-role="edit"]').hidden = false;
      row.querySelector('[data-role="edit"] textarea').focus();
    } else if (action === "cancel-note") {
      row.querySelector('[data-role="reason"]').hidden = false;
      row.querySelector('[data-role="edit"]').hidden = true;
    } else if (action === "save-note") {
      const val = row.querySelector('[data-role="edit"] textarea').value;
      onSave(kind, did, val);
    } else if (action === "remove") {
      onRemove(did);
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
      blocks = [];
      mutes = [];
      renderAuthBar();
      renderLists();
    };
  } else {
    els.authBar.innerHTML = `
      <input id="signinHandle" placeholder="you.bsky.social" autocomplete="username" />
      <button id="signInBtn" class="btn primary">sign in with bluesky</button>
    `;
    const handleInput = document.getElementById("signinHandle");
    const go = async () => {
      const h = handleInput.value.trim();
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

function setFormMsg(el, text, isErr) {
  el.textContent = text || "";
  el.style.color = isErr ? "var(--bad)" : "var(--dim)";
}

// --- boot ------------------------------------------------------------------

async function boot() {
  wireListActions(els.blocksList, saveNote, doUnblock);
  wireListActions(els.mutesList, saveNote, doUnmute);
  els.blockForm.addEventListener("submit", handleBlockSubmit);
  els.muteForm.addEventListener("submit", handleMuteSubmit);
  els.searchInput.addEventListener("input", () => {
    query = els.searchInput.value.trim();
    renderLists();
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
  renderLists();
  if (session) await loadAll();
}

boot();
