// app.js — mutualpulse (mutualpulse.bisks.net). Every act is a plain
// net.bisks.mutualpulse.act record; there is no server-side feed at all. The
// GlobalIndex (lib/global-index.js) replays the whole network for this
// collection — a backfill via com.atproto.sync.listReposByCollection plus a
// live Jetstream subscription — straight in the browser, no login required
// to read any of it. Signing in only gates the "log a pulse" form.
//
// Deliberately no amount field, no per-person tally, no leaderboard: the
// thread this was built off ("care is the original cryptocurrency... don't
// let Silicon Valley monetize the good we do... grow the courage to act
// without being seen, to help because it's right, not because it will glow")
// asked for the opposite of a scoreboard. Each act just gets a dot on a
// shared sky — a pulse to notice, not a stat to chase.

import { login, getSession, clearSession, completeLoginIfCallback, dpopFetch, resolvePds } from "./lib/oauth.js";
import { GlobalIndex } from "./lib/global-index.js";

const COLLECTION = "net.bisks.mutualpulse.act";
const CATEGORIES = [
  { id: "food", label: "food", emoji: "🍞", color: "#e3a857" },
  { id: "ride", label: "ride", emoji: "🚗", color: "#5aa9e6" },
  { id: "repair", label: "repair", emoji: "🔧", color: "#d9784f" },
  { id: "care", label: "care", emoji: "💛", color: "#e07a9e" },
  { id: "skill", label: "skill", emoji: "📚", color: "#4fc3a1" },
  { id: "shelter", label: "shelter", emoji: "🏠", color: "#9b8cf2" },
  { id: "other", label: "other", emoji: "✨", color: "#c9c9d9" },
];
const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));
// Bounds how many entries get DOM nodes at once — a real browser-render cap,
// not a network cap. The "N pulses" count is always over the FULL index.
const RENDER_CAP = 300;
const SKY_DOT_CAP = 600;
const FRESH_MS = 60 * 60 * 1000; // dots glow brighter for their first hour

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function cleanStr(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
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

// A stable 32-bit hash so each (did, rkey) always lands in the same spot on
// the sky, across every visitor's browser and every reload — not real
// geography, just a deterministic place to glow. See the lexicon's own
// `place` field description: this is intentionally not a map of anyone's
// actual location.
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}
function coordFor(key) {
  const hx = hash32(key + ":x");
  const hy = hash32(key + ":y");
  return { x: 5 + (hx % 901) / 10, y: 8 + (hy % 841) / 10 }; // ~5-95%, ~8-92%
}

function normalize(did, rkey, record) {
  if (!record || typeof record !== "object") return null;
  const category = CATEGORY_MAP.has(record.category) ? record.category : null;
  if (!category) return null;
  const text = cleanStr(record.text, 300);
  if (!text) return null;
  const createdAtMs = Date.parse(record.createdAt || "");
  return {
    did,
    rkey,
    uri: `at://${did}/${COLLECTION}/${rkey}`,
    category,
    text,
    place: cleanStr(record.place, 100),
    createdAt: Number.isFinite(createdAtMs) ? createdAtMs : 0,
  };
}

const index = new GlobalIndex(COLLECTION, { normalize, onUpdate: () => renderRoute() });

// --- lazy profile / PDS resolution (rendered progressively, not blocking) ---

const profileCache = new Map(); // did -> {handle,displayName,avatar} | "pending"
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

// --- session / sign-in ------------------------------------------------------

let session = null;
let category = "food";
let filter = "";
let currentEntry = null; // the single act loaded for /pulse/<did>/<rkey>, else null
const seenKeys = new Set(); // keys already painted on the sky at least once — everything else flares in
const selectedKey = { current: null }; // the dot currently pinned in the readout line

// --- routing: /pulse/<did>/<rkey> is a real, shareable permalink to one act
// (notes/45-sharing-and-virality.md tier 4) — the Worker (src/index.ts)
// stamps its og:title/description for link unfurlers, and this reads
// location.pathname to render the same detail view for a real browser.
function parseRoute() {
  const m = location.pathname.match(/^\/pulse\/([^/]+)\/([^/]+)\/?$/);
  if (m) return { view: "entry", did: decodeURIComponent(m[1]), rkey: decodeURIComponent(m[2]) };
  return { view: "feed" };
}
let route = parseRoute();

function buildEntryUrl(entry) {
  return `https://mutualpulse.bisks.net/pulse/${entry.did}/${entry.rkey}`;
}
function buildEntryShareText(entry) {
  const cat = CATEGORY_MAP.get(entry.category);
  return `a pulse on mutualpulse: ${cat.emoji} "${entry.text}" — ${buildEntryUrl(entry)}`;
}

// A direct, unauthenticated com.atproto.repo.getRecord read off the poster's
// own PDS — no need to wait for the full network-wide GlobalIndex backfill
// just to render one already-known (did, rkey) permalink.
async function fetchEntryDirect(did, rkey) {
  const pds = await resolvePds(did);
  if (!pds) throw new Error("could not resolve that account's PDS");
  const qs = new URLSearchParams({ repo: did, collection: COLLECTION, rkey }).toString();
  const res = await fetch(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord?${qs}`);
  if (!res.ok) throw new Error("that pulse doesn't exist — deleted, or a bad link");
  const data = await res.json();
  const entry = normalize(did, rkey, data.value);
  if (!entry) throw new Error("that record isn't a valid mutualpulse act");
  return entry;
}

const els = {
  homeView: document.getElementById("homeView"),
  entryView: document.getElementById("entryView"),
  entryBody: document.getElementById("entryBody"),
  sky: document.getElementById("sky"),
  skyDots: document.getElementById("skyDots"),
  skyEmpty: document.getElementById("skyEmpty"),
  skyReadout: document.getElementById("skyReadout"),
  form: document.getElementById("f"),
  text: document.getElementById("text"),
  place: document.getElementById("place"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  signinBar: document.getElementById("signinBar"),
  composeHint: document.getElementById("composeHint"),
  catRow: document.getElementById("catRow"),
  tabs: document.getElementById("tabs"),
  feedEmpty: document.getElementById("feedEmpty"),
  feedMeta: document.getElementById("feedMeta"),
  feedList: document.getElementById("feedList"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareCopy: document.getElementById("shareCopy"),
};

// --- category picker + filter tabs (built once, from the CATEGORIES table) -

els.catRow.innerHTML = CATEGORIES
  .map((c) => `<button type="button" class="catbtn${c.id === category ? " active" : ""}" data-cat="${c.id}" style="--cat-color:${c.color}">${c.emoji} ${c.label}</button>`)
  .join("");
[...els.catRow.querySelectorAll(".catbtn")].forEach((btn) => {
  btn.addEventListener("click", () => {
    category = btn.dataset.cat;
    els.catRow.querySelectorAll(".catbtn").forEach((b) => b.classList.toggle("active", b === btn));
  });
});

els.tabs.innerHTML =
  `<button type="button" class="active" data-filter="">all</button>` +
  CATEGORIES.map((c) => `<button type="button" data-filter="${c.id}" style="--cat-color:${c.color}">${c.emoji} ${c.label}</button>`).join("");
[...els.tabs.querySelectorAll("button")].forEach((btn) => {
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    els.tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    renderAll();
  });
});

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
    els.composeHint.textContent = "This writes a real net.bisks.mutualpulse.act record to your own repo, then mutualpulse reads it back into the sky above.";
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
  els.composeHint.textContent = "Sign in with Bluesky (or any atproto PDS). This writes a real record to your own repo — mutualpulse never stores it, only reads it back off the network.";
}

function shareText() {
  return "mutualpulse: a live pulse-board of mutual aid. food shared, rides given, fences fixed — no ledger, no amounts, no leaderboard.\n\nhttps://mutualpulse.bisks.net/";
}
els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText());
els.shareCopy.addEventListener("click", () => {
  navigator.clipboard?.writeText("https://mutualpulse.bisks.net/")
    .then(() => setStatus("link copied.", "ok"))
    .catch(() => {});
});

// --- submit ------------------------------------------------------------------

async function postEntry() {
  const text = els.text.value.trim();
  if (!text) { setStatus("say what happened, first.", "err"); return; }
  if (!session) { setStatus("sign in above first.", "err"); return; }

  els.go.disabled = true;
  setStatus("writing to your PDS...");

  try {
    const record = {
      $type: COLLECTION,
      category,
      text: text.slice(0, 140),
      createdAt: new Date().toISOString(),
    };
    const place = els.place.value.trim();
    if (place) record.place = place.slice(0, 100);

    const writeRes = await dpopFetch(session, `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: COLLECTION, record }),
    });
    const written = await writeRes.json().catch(() => ({}));
    if (!writeRes.ok) throw new Error(written.message || "couldn't write that record to your PDS");

    const rkey = String(written.uri || "").split("/").pop();
    if (rkey) index.applyOwn(session.did, rkey, record);

    setStatus("sent. it's glowing.", "ok");
    els.form.reset();
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

// --- render: the sky (ambient, deterministic dot field) ---------------------

function readoutFor(entry) {
  const cat = CATEGORY_MAP.get(entry.category);
  const profile = profileFor(entry.did);
  const who = profile ? `@${esc(profile.handle)}` : entry.did.slice(0, 16) + "…";
  const place = entry.place ? ` · ${esc(entry.place)}` : "";
  return `${cat.emoji} <b>${esc(cat.label)}</b> — ${esc(entry.text)} <span class="dim">— ${who}${place} · ${timeAgo(entry.createdAt || Date.now())}</span> <a href="/pulse/${esc(entry.did)}/${esc(entry.rkey)}">permalink →</a>`;
}

function renderSky(entries) {
  const byRecency = entries.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, SKY_DOT_CAP);
  els.skyEmpty.hidden = byRecency.length > 0;
  const now = Date.now();
  const frag = document.createDocumentFragment();
  // Keeps the pinned readout's handle fresh once its lazy profileFor()
  // lookup resolves — otherwise a pinned pulse keeps showing the raw DID
  // forever, since nothing else re-derives its text after the initial click.
  if (selectedKey.current) {
    const pinned = byRecency.find((e) => `${e.did}::${e.rkey}` === selectedKey.current);
    if (pinned) els.skyReadout.innerHTML = readoutFor(pinned);
  }
  for (const entry of byRecency) {
    const key = `${entry.did}::${entry.rkey}`;
    const { x, y } = coordFor(key);
    const cat = CATEGORY_MAP.get(entry.category);
    const fresh = entry.createdAt && now - entry.createdAt < FRESH_MS;
    const isNew = !seenKeys.has(key);
    seenKeys.add(key);
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "dot" + (fresh ? " fresh" : "") + (isNew ? " flare" : "") + (selectedKey.current === key ? " selected" : "");
    dot.style.setProperty("--x", x + "%");
    dot.style.setProperty("--y", y + "%");
    dot.style.setProperty("--cat-color", cat.color);
    dot.setAttribute("aria-label", `${cat.label}: ${entry.text}`);
    dot.addEventListener("click", () => {
      selectedKey.current = key;
      els.skyReadout.innerHTML = readoutFor(entry);
      renderAll();
    });
    dot.addEventListener("mouseenter", () => {
      if (!selectedKey.current) els.skyReadout.innerHTML = readoutFor(entry);
    });
    dot.addEventListener("mouseleave", () => {
      if (!selectedKey.current) els.skyReadout.textContent = "hover or tap a pulse to see what it was.";
    });
    frag.appendChild(dot);
  }
  els.skyDots.innerHTML = "";
  els.skyDots.appendChild(frag);
}

// --- render: the feed ---------------------------------------------------------

function renderEntry(entry) {
  const cat = CATEGORY_MAP.get(entry.category);
  const div = document.createElement("div");
  div.className = `entry cat-${entry.category}`;
  div.style.setProperty("--cat-color", cat.color);

  const profile = profileFor(entry.did);
  const who = profile ? `@${esc(profile.handle)}` : entry.did.slice(0, 16) + "…";

  div.innerHTML = `
    <div class="top">
      <span class="badge">${cat.emoji} ${esc(cat.label)}</span>
      <span class="who">${who} · ${timeAgo(entry.createdAt || Date.now())}</span>
    </div>
    <div class="title">${esc(entry.text)}</div>
    ${entry.place ? `<div class="facts"><span><b>place:</b> ${esc(entry.place)}</span></div>` : ""}
    <div class="foot"><a href="/pulse/${esc(entry.did)}/${esc(entry.rkey)}">permalink →</a></div>
  `;
  return div;
}

// --- single-act permalink page (/pulse/<did>/<rkey>) -------------------------

function renderEntryDetail(entry) {
  const cat = CATEGORY_MAP.get(entry.category);
  const profile = profileFor(entry.did);
  const who = profile ? `@${esc(profile.handle)}` : entry.did.slice(0, 16) + "…";

  const url = buildEntryUrl(entry);
  const shareHref = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildEntryShareText(entry));

  els.entryBody.innerHTML = `
    <div class="entry entry-detail cat-${entry.category}" style="--cat-color:${cat.color}">
      <div class="top">
        <span class="badge">${cat.emoji} ${esc(cat.label)}</span>
        <span class="who">${who} · ${timeAgo(entry.createdAt || Date.now())}</span>
      </div>
      <div class="title">${esc(entry.text)}</div>
      ${entry.place ? `<div class="facts"><span><b>place:</b> ${esc(entry.place)}</span></div>` : ""}
      <div class="foot">
        <a href="${esc(shareHref)}" target="_blank" rel="noopener">🦋 share</a>
        <button type="button" id="copyEntryLink">🔗 copy link</button>
      </div>
    </div>
  `;
  document.getElementById("copyEntryLink").addEventListener("click", (e) => {
    navigator.clipboard?.writeText(url)
      .then(() => {
        e.target.textContent = "🔗 copied";
        setTimeout(() => { e.target.textContent = "🔗 copy link"; }, 1500);
      })
      .catch(() => {});
  });
}

// Dispatches to the act-permalink view or the normal feed depending on
// `route` — the one thing the index's onUpdate handler calls on every
// backfill page and every live commit.
function renderRoute() {
  if (route.view === "entry") {
    if (currentEntry) renderEntryDetail(currentEntry);
    return;
  }
  renderAll();
}

function renderAll() {
  const snapshot = index.snapshot();
  const entries = snapshot.entries.slice().sort((a, b) => b.createdAt - a.createdAt);

  renderSky(entries);

  const filtered = filter ? entries.filter((e) => e.category === filter) : entries;
  els.feedEmpty.hidden = !!entries.length;
  const statusBits = [`${entries.length} pulse${entries.length === 1 ? "" : "s"}`];
  if (!snapshot.backfillDone) statusBits.push("loading history…");
  if (snapshot.connected) statusBits.push("live");
  els.feedMeta.textContent = statusBits.join(" · ");

  els.feedList.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const entry of filtered.slice(0, RENDER_CAP)) frag.appendChild(renderEntry(entry));
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
      els.entryBody.innerHTML = `<p class="empty-state">couldn't load that pulse: ${esc(err.message)}</p>`;
    }
  }

  index.start();
  renderRoute();
}
init();
