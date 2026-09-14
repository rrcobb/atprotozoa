// app.js — mutechella.bisks.net client logic.
//
// Read-only: the only atproto call this site ever makes on your behalf is
// app.bsky.graph.getMutes (account-side AppView state, proxied through your
// own PDS — same recipe as sites/blocknotes' fetchAllMutes). "Biggest name,
// biggest font" needs follower counts, which getMutes' ProfileView doesn't
// carry, so each muted account's follower count comes from a second,
// unauthenticated call to the public app.bsky.actor.getProfiles.

import { login, completeLoginIfCallback, getSession, clearSession, dpopFetch } from "/lib/oauth.js";

const APPVIEW_PROXY = "did:web:api.bsky.app#bsky_appview";
const PUBLIC_API = "https://api.bsky.app";

let session = null;
let lineup = []; // [{ did, handle, displayName, avatar, followersCount }], sorted desc

const els = {
  authBar: document.getElementById("authBar"),
  authMsg: document.getElementById("authMsg"),
  poster: document.getElementById("poster"),
  posterBody: document.getElementById("posterBody"),
  billedTo: document.getElementById("billedTo"),
  headcount: document.getElementById("headcount"),
  shareBar: document.getElementById("shareBar"),
  shareLink: document.getElementById("shareLink"),
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Mutes have no bulk-download equivalent (account-side AppView state, not a
// repo record), so this paginates. Loops until the cursor is exhausted —
// no arbitrary page cap (see notes/25-08-28 "question every cap"); the
// empty-page break is a runaway-safety backstop, not a speed knob, so it
// applies regardless of how big someone's mute list is.
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

// Public, unauthenticated, CORS-open — batches of 25 (getProfiles' own cap).
// getMutes' ProfileView has no followersCount; ProfileViewDetailed (from
// getProfiles) does, and follower counts are public regardless of whose
// mute list they showed up on.
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

async function loadLineup() {
  setAuthMsg("booking the lineup…");
  els.poster.hidden = true;
  els.shareBar.hidden = true;
  try {
    const muteActors = await fetchAllMutes(session);
    const profiles = await fetchProfiles(muteActors.map((a) => a.did));
    lineup = muteActors
      .map((a) => {
        const p = profiles.get(a.did);
        return {
          did: a.did,
          handle: a.handle || p?.handle || a.did,
          displayName: p?.displayName || a.displayName || "",
          avatar: p?.avatar || a.avatar || "",
          followersCount: p?.followersCount ?? 0,
        };
      })
      .sort((a, b) => b.followersCount - a.followersCount);
    setAuthMsg("");
    renderPoster();
  } catch (e) {
    setAuthMsg("couldn't book the lineup: " + (e.message || e), true);
  }
}

// --- poster layout -------------------------------------------------------
//
// Real festival posters tier acts into rows: a handful of headliners in huge
// type up top, then rows that both grow in count and shrink in size as you
// read down — by the bottom you're squinting at a wall of "also playing"
// names. ROW_PLAN mimics that shape: each row's font is a fixed ratio
// smaller than the last, floored at MIN_FONT (still legible), and row size
// grows geometrically. If the mute list outruns ROW_PLAN, the final tier
// just keeps absorbing names at MIN_FONT — no cap on how big a lineup can
// get, same as the "biggest" and "question every cap" rules ask for.
const ROW_PLAN = [1, 2, 3, 4, 5, 6, 8, 10, 13, 17, 22, 29, 38, 50, 65, 85, 110];
const MAX_FONT = 88; // px, headliner row
const MIN_FONT = 13; // px, floor for the deepest undercard
const FONT_DECAY = 0.74;

function buildRows(sorted) {
  const rows = [];
  let i = 0;
  let rowIndex = 0;
  while (i < sorted.length) {
    const planSize = ROW_PLAN[Math.min(rowIndex, ROW_PLAN.length - 1)];
    const remaining = sorted.length - i;
    // Once past the plan, the last row just keeps growing to absorb everyone
    // left rather than spawning endless near-empty rows at the floor size.
    const size = rowIndex >= ROW_PLAN.length - 1 ? remaining : Math.min(planSize, remaining);
    const fontPx = Math.max(MIN_FONT, Math.round(MAX_FONT * Math.pow(FONT_DECAY, rowIndex)));
    rows.push({ fontPx, names: sorted.slice(i, i + size) });
    i += size;
    rowIndex++;
  }
  return rows;
}

function nameFor(entry) {
  return entry.displayName || entry.handle;
}

function renderPoster() {
  els.billedTo.textContent = session ? `@${session.handle}` : "";
  els.headcount.textContent = lineup.length
    ? `${lineup.length} act${lineup.length === 1 ? "" : "s"} on the bill`
    : "";

  if (!lineup.length) {
    els.posterBody.innerHTML = `<div class="tba">lineup TBA — you haven't muted anyone (yet).</div>`;
    els.poster.hidden = false;
    els.shareBar.hidden = true;
    return;
  }

  const rows = buildRows(lineup);
  els.posterBody.innerHTML = rows
    .map(
      (row) => `<div class="row" style="font-size:${row.fontPx}px">${row.names
        .map(
          (n) =>
            `<a class="act" href="https://bsky.app/profile/${esc(n.handle)}" target="_blank" rel="noopener" title="${esc(n.followersCount.toLocaleString())} followers">${esc(nameFor(n))}</a>`,
        )
        .join('<span class="sep">•</span>')}</div>`,
    )
    .join("");
  els.poster.hidden = false;

  const shareText = `my mute list, reimagined as a festival lineup poster 🎪 headliner: ${nameFor(lineup[0])}\n\nmutechella.bisks.net`;
  els.shareLink.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;
  els.shareBar.hidden = false;
}

// --- auth bar --------------------------------------------------------------

function renderAuthBar() {
  if (session) {
    els.authBar.innerHTML = `signed in as <b>@${esc(session.handle)}</b> · <a id="signOutLink">sign out</a>`;
    document.getElementById("signOutLink").onclick = async () => {
      await clearSession();
      session = null;
      lineup = [];
      renderAuthBar();
      els.poster.hidden = true;
      els.shareBar.hidden = true;
    };
  } else {
    els.authBar.innerHTML = `
      <input id="signinHandle" placeholder="you.bsky.social" autocomplete="username" />
      <button id="signInBtn" class="btn primary">sign in to see your bill</button>
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
    if (window.attachHandleTypeahead) window.attachHandleTypeahead(handleInput);
  }
}

function setAuthMsg(text, isErr) {
  els.authMsg.textContent = text || "";
  els.authMsg.style.color = isErr ? "var(--bad)" : "var(--dim)";
}

// --- boot --------------------------------------------------------------

async function boot() {
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
  if (session) await loadLineup();
}

boot();
