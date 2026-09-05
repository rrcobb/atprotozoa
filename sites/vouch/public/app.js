// vouch — public reads are unauthenticated, same three-step resolution as
// rektide's at-seven-ten (github.com/rektide/at-seven-ten), the site this was
// built off of: resolveHandle -> DID -> PDS -> com.atproto.repo.listRecords
// on collection net.bisks.vouch.vouch. A vouch record is
// { subject: <did>, note?, createdAt }, keyed by rkey = subject DID, so
// vouching again for the same person is an idempotent overwrite, and
// un-vouching is a plain deleteRecord. Writing/deleting always goes to the
// *signed-in user's own* PDS (see lib/oauth.js's dpopFetch) — this site never
// holds anyone's credentials and never writes on anyone else's behalf.
//
// No backend at all: no KV, no Durable Object, no server-side tally. The one
// server-side bit (src/index.ts) only renders personalized OG tags for
// /u/<handle> share links, same recipe as sites/didscope.

import {
  login,
  getSession,
  clearSession,
  completeLoginIfCallback,
  dpopFetch,
  resolveHandle,
  resolvePds,
} from "./lib/oauth.js";

const APPVIEW_BASE = "https://public.api.bsky.app";
const APPVIEW = APPVIEW_BASE + "/xrpc/";
const COLLECTION = "net.bisks.vouch.vouch";
const SITE_URL = "https://vouch.bisks.net/";
const MAX_NOTE = 140;

async function xrpc(base, method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${base.replace(/\/$/, "")}/xrpc/${method}${qs ? "?" + qs : ""}`);
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

function cleanHandle(raw) {
  let h = (raw || "").trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function timeAgo(iso) {
  const ts = Date.parse(iso || "");
  if (!Number.isFinite(ts)) return "";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

async function resolveActorDid(handleOrDid) {
  if (handleOrDid.startsWith("did:")) return handleOrDid;
  const did = await resolveHandle(handleOrDid);
  if (!did) throw new Error(`couldn't resolve @${handleOrDid}`);
  return did;
}

async function getProfile(did) {
  try {
    return await xrpc(APPVIEW_BASE, "app.bsky.actor.getProfile", { actor: did });
  } catch (_) {
    return { did, handle: did, displayName: did, avatar: "" };
  }
}

// batched profile hydration, 25 actors per call — same batch size seven-ten uses
async function getProfiles(dids) {
  const out = new Map();
  const uniq = [...new Set(dids)];
  for (let i = 0; i < uniq.length; i += 25) {
    const batch = uniq.slice(i, i + 25);
    const qs = batch.map((d) => `actors=${encodeURIComponent(d)}`).join("&");
    try {
      const res = await fetch(`${APPVIEW}app.bsky.actor.getProfiles?${qs}`);
      if (!res.ok) continue;
      const data = await res.json();
      for (const p of data.profiles || []) out.set(p.did, p);
    } catch (_) {}
  }
  return out;
}

// Reads every net.bisks.vouch.vouch record off `did`'s own PDS. One
// collection, naturally small (a personal curated list, not "all my posts"),
// so a plain listRecords cursor walk is followed to exhaustion — no page cap,
// per the repo's "question every cap" standing order.
async function listVouches(did) {
  const pdsUrl = await resolvePds(did);
  if (!pdsUrl) throw new Error("couldn't resolve that account's PDS");
  const records = [];
  let cursor;
  for (;;) {
    const params = { repo: did, collection: COLLECTION, limit: "100" };
    if (cursor) params.cursor = cursor;
    const data = await xrpc(pdsUrl, "com.atproto.repo.listRecords", params);
    const page = data.records || [];
    records.push(...page);
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
    if (!cursor || !page.length) break;
  }
  return records;
}

// --- DOM ----------------------------------------------------------------

const els = {
  signinBar: document.getElementById("signinBar"),
  lookupForm: document.getElementById("lookupForm"),
  handle: document.getElementById("handle"),
  lookupGo: document.getElementById("lookupGo"),
  lookupStatus: document.getElementById("lookupStatus"),
  profile: document.getElementById("profile"),
  profAvatar: document.getElementById("profAvatar"),
  profName: document.getElementById("profName"),
  profHandle: document.getElementById("profHandle"),
  vouchAction: document.getElementById("vouchAction"),
  listLabel: document.getElementById("listLabel"),
  vouchCount: document.getElementById("vouchCount"),
  vouchList: document.getElementById("vouchList"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareCopy: document.getElementById("shareCopy"),
};

let session = null;
let myVouchedDids = new Set(); // subjects the signed-in user currently vouches for
let viewed = null; // { did, handle, displayName, avatar }

function setLookupStatus(msg, kind) {
  els.lookupStatus.textContent = msg || "";
  els.lookupStatus.className = "status" + (kind ? " " + kind : "");
}

function renderSignin() {
  if (session) {
    els.signinBar.innerHTML = `
      <span class="who">signed in as <b>@${esc(session.handle)}</b></span>
      <button id="signOut" type="button">sign out</button>
    `;
    document.getElementById("signOut").addEventListener("click", async () => {
      await clearSession();
      session = null;
      myVouchedDids = new Set();
      renderSignin();
      if (viewed) renderVouchAction();
    });
    return;
  }
  els.signinBar.innerHTML = `
    <input id="loginHandle" type="text" placeholder="your handle to sign in" autocomplete="off" autocapitalize="off" spellcheck="false" />
    <button id="signIn" type="button">sign in</button>
    <span class="signin-err" id="signinErr"></span>
  `;
  document.getElementById("signIn").addEventListener("click", async () => {
    const h = cleanHandle(document.getElementById("loginHandle").value);
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

function shareUrlFor(handle) {
  return SITE_URL + "u/" + encodeURIComponent(handle);
}

function setShare(profile, count) {
  const url = shareUrlFor(profile.handle);
  const isSelf = session && profile.did === session.did;
  const text = isSelf
    ? `here's who I vouch for as influential (${count}) — inspired by rektide's at-seven-ten\n\n${url}`
    : `@${profile.handle} vouches for ${count} ${count === 1 ? "person" : "people"} as influential\n\n${url}`;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  els.shareCopy.onclick = () => {
    navigator.clipboard?.writeText(url).then(() => setLookupStatus("link copied.", "ok")).catch(() => {});
  };
}

function renderEntry(subjectDid, profile, value, canRemove) {
  const div = document.createElement("div");
  div.className = "entry";
  const name = profile?.displayName || profile?.handle || subjectDid;
  const handle = profile?.handle || subjectDid;
  div.innerHTML = `
    <img ${profile?.avatar ? `src="${esc(profile.avatar)}"` : ""} alt="" onerror="this.style.visibility='hidden'" />
    <div class="meta">
      <div class="name">${esc(name)}</div>
      <div class="handle">@${esc(handle)}</div>
      ${value.note ? `<div class="note">"${esc(value.note)}"</div>` : ""}
    </div>
    <div class="when">${esc(timeAgo(value.createdAt))}</div>
    ${canRemove ? `<button class="rm" type="button">remove</button>` : ""}
  `;
  if (canRemove) {
    div.querySelector(".rm").addEventListener("click", () => removeVouch(subjectDid, div));
  }
  return div;
}

async function renderVouchList(records) {
  const dids = records.map((r) => r.value?.subject).filter(Boolean);
  const profiles = await getProfiles(dids);
  els.vouchCount.textContent = String(records.length);
  els.vouchList.innerHTML = "";
  if (!records.length) {
    els.vouchList.innerHTML = '<div class="list-empty">nobody yet.</div>';
    return;
  }
  const isSelf = session && viewed.did === session.did;
  const sorted = [...records].sort(
    (a, b) => Date.parse(b.value?.createdAt || 0) - Date.parse(a.value?.createdAt || 0),
  );
  for (const r of sorted) {
    const subjectDid = r.value?.subject;
    if (!subjectDid) continue;
    els.vouchList.appendChild(
      renderEntry(subjectDid, profiles.get(subjectDid), r.value, isSelf),
    );
  }
}

function renderVouchAction() {
  els.vouchAction.innerHTML = "";
  if (!session) {
    els.vouchAction.innerHTML = `<div class="already">sign in above to vouch for someone.</div>`;
    return;
  }
  if (viewed.did === session.did) {
    els.vouchAction.innerHTML = `
      <form id="addForm">
        <div class="row">
          <input id="addHandle" type="text" placeholder="handle to vouch for" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <button class="primary" type="submit">vouch</button>
        </div>
        <input id="addNote" type="text" maxlength="${MAX_NOTE}" placeholder="why (optional)" autocomplete="off" />
      </form>
    `;
    document.getElementById("addForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const h = cleanHandle(document.getElementById("addHandle").value);
      const note = document.getElementById("addNote").value.trim().slice(0, MAX_NOTE);
      addVouchByHandle(h, note);
    });
    return;
  }
  if (myVouchedDids.has(viewed.did)) {
    els.vouchAction.innerHTML = `
      <div class="already">✓ you vouch for @${esc(viewed.handle)}</div>
      <button class="remove" type="button" id="unvouchBtn" style="margin-top:0.5rem;width:100%;">un-vouch</button>
    `;
    document.getElementById("unvouchBtn").addEventListener("click", () => removeVouch(viewed.did));
    return;
  }
  els.vouchAction.innerHTML = `
    <form id="voteForm">
      <button class="add" type="submit">vouch for @${esc(viewed.handle)}</button>
      <input class="note-input" id="voteNote" type="text" maxlength="${MAX_NOTE}" placeholder="why (optional)" autocomplete="off" />
    </form>
  `;
  document.getElementById("voteForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const note = document.getElementById("voteNote").value.trim().slice(0, MAX_NOTE);
    addVouch(viewed.did, note);
  });
}

async function addVouchByHandle(rawHandle, note) {
  if (!rawHandle) { setLookupStatus("enter a handle first.", "err"); return; }
  try {
    setLookupStatus(`resolving @${rawHandle}...`);
    const did = await resolveActorDid(rawHandle);
    if (did === session.did) throw new Error("you can't vouch for yourself.");
    await addVouch(did, note);
  } catch (e) {
    setLookupStatus("couldn't vouch for that one: " + e.message, "err");
  }
}

async function addVouch(subjectDid, note) {
  if (!session) return;
  try {
    setLookupStatus("writing your vouch...");
    const record = {
      $type: COLLECTION,
      subject: subjectDid,
      note: note || "",
      createdAt: new Date().toISOString(),
    };
    const res = await dpopFetch(session, `${session.pdsUrl}/xrpc/com.atproto.repo.putRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: COLLECTION, rkey: subjectDid, record }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "couldn't write that record to your PDS");
    myVouchedDids.add(subjectDid);
    setLookupStatus("vouched.", "ok");
    if (viewed && viewed.did === session.did) {
      await viewActor(session.did);
    } else {
      renderVouchAction();
    }
  } catch (e) {
    setLookupStatus("couldn't vouch for that one: " + e.message, "err");
  }
}

async function removeVouch(subjectDid, entryEl) {
  if (!session) return;
  try {
    if (entryEl) entryEl.style.opacity = "0.4";
    const res = await dpopFetch(session, `${session.pdsUrl}/xrpc/com.atproto.repo.deleteRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: COLLECTION, rkey: subjectDid }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "couldn't remove that record");
    }
    myVouchedDids.delete(subjectDid);
    setLookupStatus("removed.", "ok");
    if (viewed && viewed.did === session.did) {
      await viewActor(session.did);
    } else {
      renderVouchAction();
    }
  } catch (e) {
    setLookupStatus("couldn't remove that one: " + e.message, "err");
    if (entryEl) entryEl.style.opacity = "1";
  }
}

async function loadMyVouchedDids() {
  if (!session) { myVouchedDids = new Set(); return; }
  try {
    const records = await listVouches(session.did);
    myVouchedDids = new Set(records.map((r) => r.value?.subject).filter(Boolean));
  } catch (_) {
    myVouchedDids = new Set();
  }
}

async function viewActor(handleOrDid) {
  els.lookupGo.disabled = true;
  setLookupStatus(`looking up ${handleOrDid}...`);
  try {
    const did = await resolveActorDid(handleOrDid);
    const profile = await getProfile(did);
    viewed = { did, handle: profile.handle || did, displayName: profile.displayName, avatar: profile.avatar };

    els.profAvatar.src = profile.avatar || "";
    els.profName.textContent = profile.displayName || profile.handle || did;
    els.profHandle.textContent = "@" + (profile.handle || did);
    els.listLabel.textContent = session && did === session.did ? "you vouch for" : `@${profile.handle || did} vouches for`;

    const records = await listVouches(did);
    await renderVouchList(records);
    renderVouchAction();
    setShare(viewed, records.length);

    els.profile.classList.add("show");
    history.replaceState({}, "", "/u/" + encodeURIComponent(profile.handle || did));
    setLookupStatus("");
  } catch (e) {
    setLookupStatus("couldn't look that up: " + e.message, "err");
  } finally {
    els.lookupGo.disabled = false;
  }
}

els.lookupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const h = cleanHandle(els.handle.value);
  if (!h) { setLookupStatus("enter a handle first.", "err"); return; }
  viewActor(h);
});

async function init() {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setLookupStatus("sign-in failed: " + e.message, "err");
  }
  renderSignin();
  await loadMyVouchedDids();

  // /u/<handle> — a shared link jumps straight to that person's list.
  const pathHandle = (location.pathname.match(/^\/u\/([^/]+)\/?$/) || [])[1];
  if (pathHandle) {
    await viewActor(decodeURIComponent(pathHandle));
  } else if (session) {
    await viewActor(session.handle);
  }
}
init();
