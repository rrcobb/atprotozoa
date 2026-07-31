// app.js — memex.bisks.net client logic.
//
// Three pieces on one page:
//   1. the canon — the seed phrases from canon.js, static, always shown.
//   2. your phrasebook — a personal list of phrases, always cached in
//      localStorage so the page works instantly and anonymously; synced to
//      net.bisks.memex.phrase records on your own PDS once you sign in.
//   3. "what's atomic" — the network-wide adoption leaderboard, fetched from
//      /api/atomic (a Durable Object watching the firehose — see src/index.ts).

import { CANON, THREAD_URL } from "/canon.js";
import { login, completeLoginIfCallback, getSession, clearSession, dpopFetch } from "/lib/oauth.js";

const COLLECTION = "net.bisks.memex.phrase";
let session = null;

const els = {
  authBar: document.getElementById("authBar"),
  authMsg: document.getElementById("authMsg"),
  canonList: document.getElementById("canonList"),
  libraryList: document.getElementById("libraryList"),
  addText: document.getElementById("addText"),
  addNote: document.getElementById("addNote"),
  addSource: document.getElementById("addSource"),
  addBtn: document.getElementById("addBtn"),
  atomicList: document.getElementById("atomicList"),
  atomicStats: document.getElementById("atomicStats"),
};

// --- local phrasebook: always mirrored to localStorage --------------------
// Signed-in users additionally sync every add/remove to COLLECTION on their
// own PDS. `rkey` is null until a record has actually been written to a PDS
// (or read back from one); anonymous entries just never get one.

const DB_KEY = "memex:library:v1";

function normText(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function loadLib() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveLib(list) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(list));
  } catch (_) {
    // storage full/unavailable — still works for this session in memory
  }
}

function findByText(list, text) {
  const n = normText(text);
  return list.find((e) => normText(e.text) === n);
}

// --- PDS sync ---------------------------------------------------------------

function recordFromEntry(entry) {
  const rec = {
    $type: COLLECTION,
    text: entry.text,
    createdAt: new Date(entry.createdAt || Date.now()).toISOString(),
  };
  if (entry.note) rec.note = entry.note;
  if (entry.source) rec.source = entry.source;
  return rec;
}

function entryFromRecord(rkey, rec) {
  const v = rec || {};
  return {
    rkey,
    text: typeof v.text === "string" ? v.text : "",
    note: typeof v.note === "string" ? v.note : "",
    source: typeof v.source === "string" ? v.source : "",
    createdAt: v.createdAt ? Date.parse(v.createdAt) || Date.now() : Date.now(),
  };
}

async function pdsListRecords(sess) {
  const base = sess.pdsUrl.replace(/\/$/, "");
  const out = [];
  let cursor;
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({ repo: sess.did, collection: COLLECTION, limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    let data;
    try {
      const res = await fetch(`${base}/xrpc/com.atproto.repo.listRecords?${qs}`);
      if (!res.ok) break;
      data = await res.json();
    } catch (_) {
      break;
    }
    const records = data.records || [];
    records.forEach((r) => {
      const rkey = typeof r.uri === "string" ? r.uri.split("/").pop() : null;
      if (rkey) out.push(entryFromRecord(rkey, r.value));
    });
    cursor = data.cursor;
    if (!cursor || !records.length) break;
  }
  return out.filter((e) => e.text);
}

async function pdsCreateRecord(sess, entry) {
  const base = sess.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(sess, `${base}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: sess.did,
      collection: COLLECTION,
      record: recordFromEntry(entry),
    }),
  });
  if (!res.ok) throw new Error(`createRecord ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const rkey = typeof data.uri === "string" ? data.uri.split("/").pop() : null;
  return rkey;
}

async function pdsDeleteRecord(sess, rkey) {
  const base = sess.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(sess, `${base}/xrpc/com.atproto.repo.deleteRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: sess.did, collection: COLLECTION, rkey }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`deleteRecord ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// Runs once right after sign-in: whatever's already on the PDS (added from
// another device/browser) gets pulled into the local list; whatever's only
// local (added anonymously before signing in) gets pushed up. Matched by
// normalized text, not rkey, since the local copy never had one.
async function syncOnLogin(sess) {
  setAuthMsg("syncing your phrasebook…");
  try {
    const remote = await pdsListRecords(sess);
    const local = loadLib();

    const merged = remote.slice();
    for (const localEntry of local) {
      if (localEntry.rkey) continue; // already a synced record, remote list is authoritative
      const already = findByText(merged, localEntry.text);
      if (already) continue;
      try {
        const rkey = await pdsCreateRecord(sess, localEntry);
        merged.push({ ...localEntry, rkey });
      } catch (e) {
        console.error("push failed", localEntry, e);
        merged.push(localEntry); // keep it locally even if the push failed
      }
    }

    saveLib(merged);
    setAuthMsg("");
  } catch (e) {
    setAuthMsg("couldn't sync your phrasebook: " + (e.message || e), true);
  }
  renderLibrary();
}

// --- mutations (shared by canon "keep" buttons and the add-your-own form) --

async function addPhrase(text, note, source) {
  text = text.trim();
  if (!text) return;
  const lib = loadLib();
  if (findByText(lib, text)) return; // already kept
  const entry = { rkey: null, text, note: (note || "").trim(), source: (source || "").trim(), createdAt: Date.now() };
  if (session) {
    try {
      entry.rkey = await pdsCreateRecord(session, entry);
    } catch (e) {
      setAuthMsg("saved locally, but couldn't sync to your PDS: " + (e.message || e), true);
    }
  }
  lib.push(entry);
  saveLib(lib);
  renderLibrary();
  renderCanon();
}

async function removePhrase(text) {
  const lib = loadLib();
  const entry = findByText(lib, text);
  if (!entry) return;
  if (session && entry.rkey) {
    try {
      await pdsDeleteRecord(session, entry.rkey);
    } catch (e) {
      setAuthMsg("couldn't remove from your PDS: " + (e.message || e), true);
      return;
    }
  }
  saveLib(lib.filter((e) => e !== entry));
  renderLibrary();
  renderCanon();
}

// --- clipboard / share helpers ---------------------------------------------

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    return false;
  }
}

function composeIntent(text) {
  return "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

function flash(el, msg) {
  const prev = el.textContent;
  const prevClass = el.className;
  el.textContent = msg;
  el.className = el.className + " copied-flash";
  setTimeout(() => {
    el.textContent = prev;
    el.className = prevClass;
  }, 1400);
}

// --- rendering ---------------------------------------------------------------

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderAuthBar() {
  const bar = els.authBar;
  bar.innerHTML = "";
  if (session) {
    const b = document.createElement("b");
    b.textContent = "@" + (session.handle || session.did);
    const out = document.createElement("a");
    out.textContent = "sign out";
    out.onclick = async () => {
      await clearSession();
      session = null;
      renderAuthBar();
      renderLibrary();
      renderCanon();
    };
    bar.append("signed in as ", b, " · ", out);
  } else {
    const input = document.createElement("input");
    input.placeholder = "your.handle";
    input.id = "authHandle";
    const goBtn = document.createElement("button");
    goBtn.textContent = "sign in with Bluesky";
    const go = async () => {
      const h = input.value.trim();
      if (!h) return;
      goBtn.disabled = true;
      try {
        await login(h);
      } catch (e) {
        setAuthMsg(e.message || String(e), true);
        goBtn.disabled = false;
      }
    };
    goBtn.onclick = go;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
    bar.append("anonymous — your phrasebook stays in this browser · ", input, goBtn);
  }
}

function setAuthMsg(text, isErr) {
  els.authMsg.textContent = text || "";
  els.authMsg.style.color = isErr ? "var(--bad)" : "var(--dim)";
}

function phraseActions(text, id, kept) {
  const actions = document.createElement("div");
  actions.className = "phrase-actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn";
  copyBtn.textContent = "copy";
  copyBtn.onclick = async () => {
    const ok = await copyText(text);
    flash(copyBtn, ok ? "copied!" : "couldn't copy");
  };
  actions.appendChild(copyBtn);

  const postBtn = document.createElement("a");
  postBtn.className = "btn";
  postBtn.href = composeIntent(text);
  postBtn.target = "_blank";
  postBtn.rel = "noopener";
  postBtn.textContent = "post verbatim →";
  actions.appendChild(postBtn);

  const keepBtn = document.createElement("button");
  keepBtn.className = "btn" + (kept ? " kept" : " primary");
  keepBtn.textContent = kept ? "kept ✓" : "keep in my phrasebook";
  keepBtn.onclick = async () => {
    if (kept) return;
    keepBtn.disabled = true;
    await addPhrase(text, "", "");
  };
  if (kept) keepBtn.disabled = true;
  actions.appendChild(keepBtn);

  if (id) {
    const shareLink = document.createElement("a");
    shareLink.className = "btn";
    shareLink.href = "/p/" + id;
    shareLink.textContent = "share ↗";
    actions.appendChild(shareLink);
  }

  return actions;
}

function renderCanon() {
  const lib = loadLib();
  els.canonList.innerHTML = "";
  for (const phrase of CANON) {
    const kept = !!findByText(lib, phrase.text);
    const card = document.createElement("div");
    card.className = "card";

    const textEl = document.createElement("div");
    textEl.className = "phrase-text";
    textEl.textContent = phrase.text;
    card.appendChild(textEl);

    const note = document.createElement("div");
    note.className = "phrase-note";
    let noteHtml = esc(phrase.note);
    if (phrase.addedBy) noteHtml += ` — added by <span class="phrase-added-by">@${esc(phrase.addedBy)}</span>`;
    if (phrase.source) noteHtml += ` · <a href="${esc(phrase.source)}" target="_blank" rel="noopener">source</a>`;
    note.innerHTML = noteHtml;
    card.appendChild(note);

    card.appendChild(phraseActions(phrase.text, phrase.id, kept));
    els.canonList.appendChild(card);
  }
}

function renderLibrary() {
  const lib = loadLib();
  els.libraryList.innerHTML = "";
  if (!lib.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "nothing kept yet — add one below, or keep a phrase from the canon above.";
    els.libraryList.appendChild(empty);
    return;
  }
  // newest first
  const sorted = lib.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  for (const entry of sorted) {
    const card = document.createElement("div");
    card.className = "card";

    const textEl = document.createElement("div");
    textEl.className = "phrase-text";
    textEl.textContent = entry.text;
    card.appendChild(textEl);

    if (entry.note || entry.source) {
      const note = document.createElement("div");
      note.className = "phrase-note";
      let noteHtml = entry.note ? esc(entry.note) : "";
      if (entry.source) {
        if (noteHtml) noteHtml += " · ";
        noteHtml += `<a href="${esc(entry.source)}" target="_blank" rel="noopener">source</a>`;
      }
      note.innerHTML = noteHtml;
      card.appendChild(note);
    }

    const actions = document.createElement("div");
    actions.className = "phrase-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn";
    copyBtn.textContent = "copy";
    copyBtn.onclick = async () => {
      const ok = await copyText(entry.text);
      flash(copyBtn, ok ? "copied!" : "couldn't copy");
    };
    actions.appendChild(copyBtn);

    const postBtn = document.createElement("a");
    postBtn.className = "btn";
    postBtn.href = composeIntent(entry.text);
    postBtn.target = "_blank";
    postBtn.rel = "noopener";
    postBtn.textContent = "post verbatim →";
    actions.appendChild(postBtn);

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn danger";
    removeBtn.textContent = "remove";
    removeBtn.onclick = async () => {
      removeBtn.disabled = true;
      await removePhrase(entry.text);
    };
    actions.appendChild(removeBtn);

    card.appendChild(actions);
    els.libraryList.appendChild(card);
  }
}

// --- "what's atomic" global leaderboard --------------------------------------

function formatAgo(ts) {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  return Math.round(h / 24) + "d ago";
}

async function loadAtomic() {
  els.atomicStats.textContent = "loading…";
  try {
    const res = await fetch("/api/atomic");
    const data = await res.json();
    renderAtomic(data);
  } catch (e) {
    els.atomicStats.textContent = "couldn't load the leaderboard right now.";
  }
}

function renderAtomic(data) {
  const phrases = data.phrases || [];
  const refresh = document.createElement("a");
  refresh.textContent = "refresh";
  refresh.onclick = loadAtomic;
  els.atomicStats.innerHTML = "";
  els.atomicStats.append(
    `${data.userCount || 0} people, ${phrases.length} distinct phrase${phrases.length === 1 ? "" : "s"}` +
      (data.backfillDone ? "" : " (still backfilling history…)") +
      ` · updated ${formatAgo(data.updatedAt)} · `,
    refresh,
  );

  els.atomicList.innerHTML = "";
  if (!phrases.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "nobody's synced a phrase to their PDS yet — sign in and keep one to be first.";
    els.atomicList.appendChild(empty);
    return;
  }
  const max = phrases[0].adopterCount || 1;
  phrases.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "atomic-row";

    const rank = document.createElement("div");
    rank.className = "atomic-rank";
    rank.textContent = "#" + (i + 1);
    row.appendChild(rank);

    const body = document.createElement("div");
    body.className = "atomic-body";
    const text = document.createElement("div");
    text.className = "atomic-text";
    text.textContent = p.text;
    body.appendChild(text);
    const track = document.createElement("div");
    track.className = "atomic-bar-track";
    const fill = document.createElement("div");
    fill.className = "atomic-bar-fill";
    fill.style.width = Math.max(4, Math.round((p.adopterCount / max) * 100)) + "%";
    track.appendChild(fill);
    body.appendChild(track);
    row.appendChild(body);

    const count = document.createElement("div");
    count.className = "atomic-count";
    count.textContent = p.adopterCount + (p.adopterCount === 1 ? " person" : " people");
    row.appendChild(count);

    els.atomicList.appendChild(row);
  });
}

// --- boot ---------------------------------------------------------------------

async function boot() {
  renderCanon();
  renderLibrary();
  loadAtomic();

  els.addBtn.onclick = async () => {
    const text = els.addText.value;
    if (!text.trim()) return;
    els.addBtn.disabled = true;
    await addPhrase(text, els.addNote.value, els.addSource.value);
    els.addText.value = "";
    els.addNote.value = "";
    els.addSource.value = "";
    els.addBtn.disabled = false;
  };

  try {
    const cb = await completeLoginIfCallback();
    if (cb) session = cb;
  } catch (e) {
    setAuthMsg(e.message || String(e), true);
  }
  if (!session) session = await getSession();
  renderAuthBar();
  if (session) await syncOnLogin(session);
}

boot();
