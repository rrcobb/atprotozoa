// plcwatch — a live client-side tail of the AT Protocol's PLC directory
// (https://plc.directory/export). No server, no persistence: every poll
// happens straight from this browser, and closing the tab forgets
// everything. See notes/ideas/bot-ideas-riff.md, "PLC audit log watcher" —
// "free, public, nobody's watching it."
//
// A did:plc operation record looks like:
//   { did, cid, createdAt, nullified, operation: {...} }
// operation.prev === null means the DID was just created (a brand new
// identity). Any other operation.prev means this DID already existed and
// something about it just changed — a PDS migration, a key rotation, a
// handle change, or (operation.type === "plc_tombstone") a deletion. The
// export stream doesn't hand us a diff against the previous operation, so
// rather than guess which field changed, we show what the operation *now*
// says (its resulting handle + PDS) and label it plainly as an update.

const EXPORT_URL = "https://plc.directory/export";
const POLL_MS = 4000;
const SEED_LOOKBACK_MS = 90 * 1000; // first poll: grab the last ~90s so the feed isn't empty on load
const MAX_ROWS = 150; // DOM row cap — a real render-cost/memory bound, not a habitual default: a ticker only ever needs to show the recent tail, and an unbounded DOM list on a page left open for hours would just grow forever for no visible benefit.
const SEEN_CAP = 4000; // dedup set cap, same reasoning: bounds memory on a long-lived tab, far bigger than any window where the export cursor could double-fetch

const els = {
  summary: document.getElementById("summary"),
  pauseBtn: document.getElementById("pauseBtn"),
  feed: document.getElementById("feed"),
  tallyNew: document.getElementById("tallyNew"),
  tallyUpdate: document.getElementById("tallyUpdate"),
  tallyPds: document.getElementById("tallyPds"),
  filterBtns: Array.from(document.querySelectorAll(".filterBtn")),
  handleFilter: document.getElementById("handleFilter"),
  shareBtn: document.getElementById("shareBtn"),
};

let cursor = new Date(Date.now() - SEED_LOOKBACK_MS).toISOString();
let paused = false;
let typeFilter = "all";
let textFilter = "";
let counts = { new: 0, update: 0 };
let pdsHosts = new Set();
const seen = new Set();

function shortDid(did) {
  return did.replace(/^did:plc:/, "").slice(0, 10) + "…";
}

function extractHandle(operation) {
  if (Array.isArray(operation.alsoKnownAs) && operation.alsoKnownAs[0]) {
    return operation.alsoKnownAs[0].replace(/^at:\/\//, "");
  }
  if (operation.handle) return operation.handle; // legacy v1 "create" op shape
  return null;
}

function extractPdsHost(operation) {
  const url = operation.services?.atproto_pds?.endpoint || operation.service || null;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function renderOp(rec) {
  const key = `${rec.did}:${rec.cid}`;
  if (seen.has(key)) return;
  seen.add(key);
  if (seen.size > SEEN_CAP) {
    // Set preserves insertion order; drop the oldest handful to stay bounded.
    let toDrop = seen.size - SEEN_CAP;
    for (const k of seen) {
      if (toDrop-- <= 0) break;
      seen.delete(k);
    }
  }

  const op = rec.operation;
  const tombstoned = op.type === "plc_tombstone";
  const isNew = op.prev === null && !tombstoned;
  const kind = isNew ? "new" : "update";
  const handle = tombstoned ? null : extractHandle(op);
  const pdsHost = tombstoned ? null : extractPdsHost(op);

  counts[kind]++;
  els.tallyNew.textContent = counts.new;
  els.tallyUpdate.textContent = counts.update;
  if (pdsHost) {
    pdsHosts.add(pdsHost);
    els.tallyPds.textContent = pdsHosts.size;
  }

  const row = document.createElement("div");
  row.className = `row ${kind}`;
  row.dataset.kind = kind;

  const detail = tombstoned
    ? `<span class="did">${shortDid(rec.did)}</span> — identity tombstoned (deleted)`
    : `${handle ? `<a class="handle" href="https://bsky.app/profile/${encodeURIComponent(handle)}" target="_blank" rel="noopener">@${handle}</a>` : `<span class="did">${shortDid(rec.did)}</span>`}${pdsHost ? ` <span class="pds">&rarr; ${pdsHost}</span>` : ""}`;

  row.innerHTML = `
    <span class="time">${formatTime(rec.createdAt)}</span>
    <span class="badge">${kind}</span>
    <span class="detail">${detail}</span>
  `;

  if (!rowMatchesFilters(row)) row.classList.add("hiddenByFilter");

  els.feed.prepend(row);
  while (els.feed.children.length > MAX_ROWS) {
    els.feed.removeChild(els.feed.lastElementChild);
  }
}

function rowMatchesFilters(row) {
  const kind = row.dataset.kind;
  if (typeFilter !== "all" && typeFilter !== kind) return false;
  if (textFilter) {
    const handleEl = row.querySelector(".handle");
    const didEl = row.querySelector(".did");
    const pdsEl = row.querySelector(".pds");
    const hay = `${handleEl ? handleEl.textContent : didEl ? didEl.textContent : ""} ${pdsEl ? pdsEl.textContent : ""}`.toLowerCase();
    if (!hay.includes(textFilter)) return false;
  }
  return true;
}

function applyFilters() {
  for (const row of els.feed.children) {
    row.classList.toggle("hiddenByFilter", !rowMatchesFilters(row));
  }
}

async function poll() {
  if (paused) return;
  try {
    const url = `${EXPORT_URL}?count=1000&after=${encodeURIComponent(cursor)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split("\n").filter(Boolean);
    for (const line of lines) {
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      renderOp(rec);
      cursor = rec.createdAt;
    }
    els.summary.innerHTML = `<span class="live">&#9679; live</span> — ${counts.new + counts.update} operations seen since you opened this`;
  } catch (err) {
    els.summary.textContent = `connection hiccup (${err.message}) — retrying…`;
  }
}

function scheduleNext() {
  setTimeout(async () => {
    await poll();
    scheduleNext();
  }, POLL_MS);
}

els.pauseBtn.addEventListener("click", () => {
  paused = !paused;
  els.pauseBtn.textContent = paused ? "resume" : "pause";
});

els.filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    typeFilter = btn.dataset.filter;
    els.filterBtns.forEach((b) => b.classList.toggle("active", b === btn));
    applyFilters();
  });
});

els.handleFilter.addEventListener("input", () => {
  textFilter = els.handleFilter.value.trim().toLowerCase();
  applyFilters();
});

els.shareBtn.addEventListener("click", () => {
  const total = counts.new + counts.update;
  const text = total > 0
    ? `Watched ${total} identity operations cross the AT Protocol's PLC directory live — ${counts.new} new accounts, ${counts.update} migrations/rotations/handle changes. https://plcwatch.bisks.net/`
    : `The AT Protocol's identity ledger, live, straight from your browser: https://plcwatch.bisks.net/`;
  window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`, "_blank", "noopener");
});

poll();
scheduleNext();
