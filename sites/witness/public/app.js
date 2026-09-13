// app.js — witness (witness.bisks.net). Every entry is a plain
// net.bisks.witness.entry record; there is no server-side feed at all. The
// GlobalIndex (lib/global-index.js) replays the whole network for this
// collection — a backfill via com.atproto.sync.listReposByCollection plus a
// live Jetstream subscription — straight in the browser, no login required
// to read any of it. Signing in only gates the "add an entry" form.

import { login, getSession, clearSession, completeLoginIfCallback, dpopFetch, resolvePds } from "./lib/oauth.js";
import { uploadImage } from "./lib/blob.js";
import { GlobalIndex } from "./lib/global-index.js";

const COLLECTION = "net.bisks.witness.entry";
const CATEGORIES = ["receipt", "pothole", "other"];
// Bounds how many entries get DOM nodes at once — a real browser-render cap,
// not a network or tally cap. The pothole tally and the "entries total"
// count below are both computed over the FULL index, never this slice.
const RENDER_CAP = 300;

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function cleanStr(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function cleanUrl(v) {
  if (typeof v !== "string" || !v.trim()) return "";
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch (_) {
    return "";
  }
}
// Case/punctuation/whitespace-insensitive key so "Elm St & 4th Ave" and
// "elm st and 4th ave!" still tally as the same spot. Not geocoding — a
// stated, honest limit, same spirit as this repo's other best-effort tallies.
function locationKey(loc) {
  return String(loc || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}
function cleanHandle(raw) {
  let h = (raw || "").trim().replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}
function blobUrl(pdsUrl, did, blob) {
  const cid = blob?.ref?.$link || blob?.ref?.toString?.();
  if (!cid || !pdsUrl) return null;
  const params = new URLSearchParams({ did, cid });
  return `${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.sync.getBlob?${params}`;
}

function normalize(did, rkey, record) {
  if (!record || typeof record !== "object") return null;
  const category = CATEGORIES.includes(record.category) ? record.category : null;
  if (!category) return null;
  const title = cleanStr(record.title, 300);
  if (!title) return null;
  const createdAtMs = Date.parse(record.createdAt || "");
  return {
    did,
    rkey,
    uri: `at://${did}/${COLLECTION}/${rkey}`,
    category,
    title,
    body: cleanStr(record.body, 3000),
    amount: cleanStr(record.amount, 40),
    location: cleanStr(record.location, 200),
    sourceUrl: cleanUrl(record.sourceUrl),
    photo: record.photo && typeof record.photo === "object" ? record.photo : null,
    createdAt: Number.isFinite(createdAtMs) ? createdAtMs : 0,
  };
}

const index = new GlobalIndex(COLLECTION, { normalize, onUpdate: () => renderRoute() });

// --- lazy profile / PDS resolution (rendered progressively, not blocking) ---

const profileCache = new Map(); // did -> {handle,displayName,avatar} | "pending"
const pdsCache = new Map(); // did -> pdsUrl|null | "pending"
let rerenderTimer = null;
function scheduleRerender() {
  if (rerenderTimer) return;
  rerenderTimer = setTimeout(() => {
    rerenderTimer = null;
    renderRoute();
  }, 150);
}
function profileFor(did) {
  if (profileCache.has(did)) {
    const v = profileCache.get(did);
    return v === "pending" ? null : v;
  }
  profileCache.set(did, "pending");
  fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      profileCache.set(did, {
        handle: d?.handle || did,
        displayName: d?.displayName || d?.handle || did,
        avatar: d?.avatar || "",
      });
      scheduleRerender();
    })
    .catch(() => {
      profileCache.set(did, { handle: did, displayName: did, avatar: "" });
    });
  return null;
}
function pdsFor(did) {
  if (pdsCache.has(did)) {
    const v = pdsCache.get(did);
    return v === "pending" ? null : v;
  }
  pdsCache.set(did, "pending");
  resolvePds(did)
    .then((url) => {
      pdsCache.set(did, url || null);
      scheduleRerender();
    })
    .catch(() => pdsCache.set(did, null));
  return null;
}

// --- session / sign-in ------------------------------------------------------

let session = null;
let category = "receipt";
let filter = "";
let currentEntry = null; // the single entry loaded for /entry/<did>/<rkey>, else null

// --- routing: /entry/<did>/<rkey> is a real, shareable permalink to one
// entry (notes/45-sharing-and-virality.md tier 4) — the Worker
// (src/index.ts) stamps its og:title/description for link unfurlers, and
// this reads location.pathname to render the same detail view for a real
// browser. Every other path (including any unrecognized one) falls back to
// the normal feed.
function parseRoute() {
  const m = location.pathname.match(/^\/entry\/([^/]+)\/([^/]+)\/?$/);
  if (m) return { view: "entry", did: decodeURIComponent(m[1]), rkey: decodeURIComponent(m[2]) };
  return { view: "feed" };
}
let route = parseRoute();

function buildEntryUrl(entry) {
  return `https://witness.bisks.net/entry/${entry.did}/${entry.rkey}`;
}
function buildEntryShareText(entry) {
  return `witnessed on witness.bisks.net: "${entry.title}" (${entry.category}) — ${buildEntryUrl(entry)}`;
}

// A direct, unauthenticated com.atproto.repo.getRecord read off the poster's
// own PDS — no need to wait for the full network-wide GlobalIndex backfill
// just to render one already-known (did, rkey) permalink. Same resolve step
// as the Worker's server-side stamping (src/index.ts's getRecord).
async function fetchEntryDirect(did, rkey) {
  const pds = await resolvePds(did);
  if (!pds) throw new Error("could not resolve that account's PDS");
  const qs = new URLSearchParams({ repo: did, collection: COLLECTION, rkey }).toString();
  const res = await fetch(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${qs}`);
  if (!res.ok) throw new Error("that entry doesn't exist — deleted, or a bad link");
  const data = await res.json();
  const entry = normalize(did, rkey, data.value);
  if (!entry) throw new Error("that record isn't a valid witness entry");
  return entry;
}

const els = {
  homeView: document.getElementById("homeView"),
  entryView: document.getElementById("entryView"),
  entryBody: document.getElementById("entryBody"),
  form: document.getElementById("f"),
  title: document.getElementById("title"),
  body: document.getElementById("body"),
  amount: document.getElementById("amount"),
  amountField: document.getElementById("amountField"),
  location: document.getElementById("location"),
  locationField: document.getElementById("locationField"),
  sourceUrl: document.getElementById("sourceUrl"),
  photoFile: document.getElementById("photoFile"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  signinBar: document.getElementById("signinBar"),
  composeHint: document.getElementById("composeHint"),
  catRow: document.getElementById("catRow"),
  catBtns: [...document.querySelectorAll(".catbtn")],
  tabs: [...document.querySelectorAll("#tabs button")],
  tallyHead: document.getElementById("tallyHead"),
  tallyMeta: document.getElementById("tallyMeta"),
  tallyList: document.getElementById("tallyList"),
  feedEmpty: document.getElementById("feedEmpty"),
  feedMeta: document.getElementById("feedMeta"),
  feedList: document.getElementById("feedList"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareCopy: document.getElementById("shareCopy"),
};

function setStatus(msg, kindClass) {
  els.status.textContent = msg || "";
  els.status.className = "status" + (kindClass ? " " + kindClass : "");
}

function renderSignin() {
  if (session) {
    els.signinBar.innerHTML = `
      <span>signed in as <b>@${esc(session.handle)}</b></span>
      <button id="signOut" type="button" class="btn secondary">sign out</button>
    `;
    document.getElementById("signOut").addEventListener("click", async () => {
      await clearSession();
      session = null;
      renderSignin();
    });
    els.composeHint.textContent = "Every entry writes a record to your own PDS, then this site reads it back into the ledger below.";
    return;
  }
  els.signinBar.innerHTML = `
    <input id="loginHandle" type="text" placeholder="your handle to sign in" autocomplete="off" autocapitalize="off" spellcheck="false" />
    <button id="signIn" type="button" class="btn">sign in</button>
    <span class="signin-err" id="signinErr"></span>
  `;
  if (window.attachHandleTypeahead) window.attachHandleTypeahead(document.getElementById("loginHandle"));
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
  els.composeHint.textContent = "Sign in with Bluesky (or any atproto PDS). Every entry is a real record written to your own repo — this site never stores it, only reads it back off the network.";
}

els.catBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    category = btn.dataset.cat;
    els.catBtns.forEach((b) => b.classList.toggle("active", b === btn));
    els.amountField.style.display = category === "pothole" ? "none" : "";
    els.locationField.style.display = category === "receipt" ? "none" : "";
  });
});

els.tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    els.tabs.forEach((b) => b.classList.toggle("active", b === btn));
    renderAll();
  });
});

function shareText() {
  return "witness: a plain public ledger — post a receipt, a pothole, whatever needs a paper trail. no login to read.\n\nhttps://witness.bisks.net/";
}
els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText());
els.shareCopy.addEventListener("click", () => {
  navigator.clipboard?.writeText("https://witness.bisks.net/")
    .then(() => setStatus("link copied.", "ok"))
    .catch(() => {});
});

// --- submit ------------------------------------------------------------------

async function postEntry() {
  const title = els.title.value.trim();
  if (!title) { setStatus("say what this is, first.", "err"); return; }
  if (!session) { setStatus("sign in above first.", "err"); return; }

  els.go.disabled = true;
  setStatus("writing to your PDS...");

  try {
    let photo = null;
    const file = els.photoFile.files[0];
    if (file) {
      setStatus("uploading photo...");
      const bytes = new Uint8Array(await file.arrayBuffer());
      photo = await uploadImage(session, bytes, file.type || "application/octet-stream");
    }

    const record = {
      $type: COLLECTION,
      category,
      title: title.slice(0, 300),
      createdAt: new Date().toISOString(),
    };
    const body = els.body.value.trim();
    if (body) record.body = body.slice(0, 3000);
    const amount = els.amount.value.trim();
    if (amount) record.amount = amount.slice(0, 40);
    const location = els.location.value.trim();
    if (location) record.location = location.slice(0, 200);
    const sourceUrl = cleanUrl(els.sourceUrl.value);
    if (sourceUrl) record.sourceUrl = sourceUrl;
    if (photo) record.photo = photo;

    setStatus("witnessing it...");
    const writeRes = await dpopFetch(session, `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: COLLECTION, record }),
    });
    const written = await writeRes.json().catch(() => ({}));
    if (!writeRes.ok) throw new Error(written.message || "couldn't write that record to your PDS");

    const rkey = String(written.uri || "").split("/").pop();
    if (rkey) index.applyOwn(session.did, rkey, record);

    setStatus("witnessed.", "ok");
    els.form.reset();
    els.photoFile.value = "";
  } catch (err) {
    setStatus("couldn't post that: " + err.message, "err");
  } finally {
    els.go.disabled = false;
  }
}
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  postEntry();
});

// --- render ------------------------------------------------------------------

function renderEntry(entry, potholeGroups) {
  const div = document.createElement("div");
  div.className = `entry cat-${entry.category}`;

  let dupeBadge = "";
  if (entry.category === "pothole" && entry.location) {
    const group = potholeGroups.get(locationKey(entry.location));
    if (group && group.count > 1) dupeBadge = `<span class="dupe">reported ${group.count}×</span>`;
  }

  const profile = profileFor(entry.did);
  const who = profile ? `@${esc(profile.handle)}` : entry.did.slice(0, 16) + "…";

  const facts = [];
  if (entry.amount) facts.push(`<span><b>amount:</b> ${esc(entry.amount)}</span>`);
  if (entry.location) facts.push(`<span><b>location:</b> ${esc(entry.location)}</span>`);

  let photoHtml = "";
  if (entry.photo) {
    const pds = pdsFor(entry.did);
    const src = pds ? blobUrl(pds, entry.did, entry.photo) : null;
    if (src) photoHtml = `<img class="photo" src="${esc(src)}" alt="" loading="lazy" />`;
  }

  div.innerHTML = `
    <div class="top">
      <span class="badge">${esc(entry.category)}</span>
      ${dupeBadge}
      <span class="who">${who} · ${timeAgo(entry.createdAt || Date.now())}</span>
    </div>
    <div class="title">${esc(entry.title)}</div>
    ${entry.body ? `<div class="body">${esc(entry.body)}</div>` : ""}
    ${facts.length ? `<div class="facts">${facts.join("")}</div>` : ""}
    ${photoHtml}
    ${entry.sourceUrl ? `<div class="src"><a href="${esc(entry.sourceUrl)}" target="_blank" rel="noopener">view the original document →</a></div>` : ""}
    <div class="foot"><a href="/entry/${esc(entry.did)}/${esc(entry.rkey)}">permalink →</a></div>
  `;
  return div;
}

// Duplicate-report tally: keyed on normalized pothole location text, built
// over every entry the index holds (never truncated by RENDER_CAP) — shared
// by the feed's "most-reported potholes" board and a single entry's own
// "reported N×" badge on its permalink page.
function computePotholeGroups(entries) {
  const potholeGroups = new Map();
  for (const e of entries) {
    if (e.category !== "pothole" || !e.location) continue;
    const key = locationKey(e.location);
    if (!key) continue;
    const group = potholeGroups.get(key) || { location: e.location, count: 0 };
    group.count++;
    potholeGroups.set(key, group);
  }
  return potholeGroups;
}

// --- single-entry permalink page (/entry/<did>/<rkey>) ----------------------
// "printed, taped to a door, passed hand to hand" (the thread this site was
// built off): a printed copy can't be clicked, so the permalink also appears
// as plain text on the page — hidden on screen, shown only in @media print
// (see .print-url in style.css) — right on the printout for anyone
// re-verifying it later.

function renderEntryDetail(entry, potholeGroups) {
  let dupeBadge = "";
  if (entry.category === "pothole" && entry.location) {
    const group = potholeGroups.get(locationKey(entry.location));
    if (group && group.count > 1) dupeBadge = `<span class="dupe">reported ${group.count}×</span>`;
  }

  const profile = profileFor(entry.did);
  const who = profile ? `@${esc(profile.handle)}` : entry.did.slice(0, 16) + "…";

  const facts = [];
  if (entry.amount) facts.push(`<span><b>amount:</b> ${esc(entry.amount)}</span>`);
  if (entry.location) facts.push(`<span><b>location:</b> ${esc(entry.location)}</span>`);

  let photoHtml = "";
  if (entry.photo) {
    const pds = pdsFor(entry.did);
    const src = pds ? blobUrl(pds, entry.did, entry.photo) : null;
    if (src) photoHtml = `<img class="photo" src="${esc(src)}" alt="" loading="lazy" />`;
  }

  const url = buildEntryUrl(entry);
  const shareHref = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildEntryShareText(entry));

  els.entryBody.innerHTML = `
    <div class="entry entry-detail cat-${entry.category}">
      <div class="top">
        <span class="badge">${esc(entry.category)}</span>
        ${dupeBadge}
        <span class="who">${who} · ${timeAgo(entry.createdAt || Date.now())}</span>
      </div>
      <div class="title">${esc(entry.title)}</div>
      ${entry.body ? `<div class="body">${esc(entry.body)}</div>` : ""}
      ${facts.length ? `<div class="facts">${facts.join("")}</div>` : ""}
      ${photoHtml}
      ${entry.sourceUrl ? `<div class="src"><a href="${esc(entry.sourceUrl)}" target="_blank" rel="noopener">view the original document →</a></div>` : ""}
      <div class="foot noprint">
        <button type="button" id="printEntry">🖨 print this entry</button>
        <a href="${esc(shareHref)}" target="_blank" rel="noopener">🦋 share</a>
        <button type="button" id="copyEntryLink">🔗 copy link</button>
      </div>
      <p class="print-url">witnessed on witness.bisks.net — verify at ${esc(url)}</p>
    </div>
  `;
  document.getElementById("printEntry").addEventListener("click", () => window.print());
  document.getElementById("copyEntryLink").addEventListener("click", (e) => {
    navigator.clipboard?.writeText(url)
      .then(() => {
        e.target.textContent = "🔗 copied";
        setTimeout(() => { e.target.textContent = "🔗 copy link"; }, 1500);
      })
      .catch(() => {});
  });
}

// Dispatches to the entry-permalink view or the normal feed depending on
// `route` — the one thing the index's onUpdate handler calls on every
// backfill page and every live commit, so a dupe-report badge on a
// permalink page fills in progressively same as the feed's tally does.
function renderRoute() {
  if (route.view === "entry") {
    if (currentEntry) renderEntryDetail(currentEntry, computePotholeGroups(index.snapshot().entries));
    return;
  }
  renderAll();
}

function renderAll() {
  const snapshot = index.snapshot();
  const entries = snapshot.entries.slice().sort((a, b) => b.createdAt - a.createdAt);
  const potholeGroups = computePotholeGroups(entries);
  const tallyRows = [...potholeGroups.values()]
    .filter((g) => g.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  els.tallyHead.style.display = tallyRows.length ? "" : "none";
  els.tallyMeta.textContent = tallyRows.length ? `${tallyRows.length} repeat spot${tallyRows.length === 1 ? "" : "s"}` : "";
  els.tallyList.innerHTML = tallyRows
    .map((g) => `<div class="tally-row"><span class="loc">${esc(g.location)}</span><span class="count">${g.count}×</span></div>`)
    .join("");

  const filtered = filter ? entries.filter((e) => e.category === filter) : entries;
  els.feedEmpty.hidden = !!entries.length;
  const statusBits = [`${entries.length} entr${entries.length === 1 ? "y" : "ies"}`];
  if (!snapshot.backfillDone) statusBits.push("loading history…");
  if (snapshot.connected) statusBits.push("live");
  els.feedMeta.textContent = statusBits.join(" · ");

  els.feedList.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const entry of filtered.slice(0, RENDER_CAP)) frag.appendChild(renderEntry(entry, potholeGroups));
  els.feedList.appendChild(frag);
}

// --- boot --------------------------------------------------------------------

async function init() {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setStatus("sign-in failed: " + e.message, "err");
  }
  renderSignin();

  if (route.view === "entry") {
    els.homeView.hidden = true;
    els.entryView.hidden = false;
    try {
      currentEntry = await fetchEntryDirect(route.did, route.rkey);
    } catch (err) {
      els.entryBody.innerHTML = `<p class="empty-state">couldn't load that entry: ${esc(err.message)}</p>`;
    }
  }

  index.start();
  renderRoute();
}
init();
