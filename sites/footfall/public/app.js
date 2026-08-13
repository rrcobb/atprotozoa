// footfall leaderboard page — fetches live counts from /api/leaderboard and
// the static site->prompter manifest snapshot, joins them client-side, and
// renders whichever view is selected. No fabricated rows: a site or prompter
// with zero reported visits simply doesn't appear until it has some.

const boardHead = document.getElementById("boardHead");
const boardBody = document.getElementById("boardBody");
const boardTable = document.getElementById("board");
const emptyEl = document.getElementById("empty");
const loadingEl = document.getElementById("loading");
const searchEl = document.getElementById("search");
const tabsEl = document.getElementById("tabs");
const rangeEl = document.getElementById("range");
const worstFirstEl = document.getElementById("worstFirst");

let view = "sites-visits";
let query = "";
let worstFirst = false;
let siteRows = [];   // from /api/leaderboard, keyed by site
let manifests = [];  // from data/manifests.json: {name, url, title, by, type}
let manifestBySite = new Map();

function fmtMs(ms) {
  if (!ms || ms <= 0) return "0s";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
function fmtNum(n) {
  return new Intl.NumberFormat("en-US").format(n || 0);
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function loadData() {
  const [lbRes, manRes] = await Promise.all([
    fetch("/api/leaderboard").then((r) => r.json()).catch(() => ({ sites: [], totals: { visits: 0, dwellMs: 0 } })),
    fetch("data/manifests.json").then((r) => r.json()).catch(() => []),
  ]);

  manifests = Array.isArray(manRes) ? manRes : [];
  manifestBySite = new Map(manifests.map((m) => [m.name, m]));

  siteRows = (lbRes.sites || []).map((s) => ({
    ...s,
    title: manifestBySite.get(s.site)?.title || s.site,
    url: manifestBySite.get(s.site)?.url || `https://${s.site}.bisks.net/`,
    by: manifestBySite.get(s.site)?.by || null,
  }));

  document.getElementById("totalVisits").textContent = fmtNum(lbRes.totals?.visits);
  document.getElementById("totalTime").textContent = fmtMs(lbRes.totals?.dwellMs);
  document.getElementById("totalSites").textContent = fmtNum(lbRes.trackedSites ?? siteRows.length);
  const prompterCount = new Set(siteRows.filter((r) => r.by).map((r) => r.by)).size;
  document.getElementById("totalPrompters").textContent = fmtNum(prompterCount);

  render();
}

function prompterRows() {
  const byPrompter = new Map();
  for (const r of siteRows) {
    if (!r.by) continue;
    let p = byPrompter.get(r.by);
    if (!p) {
      p = { by: r.by, visits: 0, dwellMs: 0, siteCount: 0 };
      byPrompter.set(r.by, p);
    }
    p.visits += r.visits;
    p.dwellMs += r.dwellMs;
    p.siteCount += 1;
  }
  return [...byPrompter.values()];
}

function currentRows() {
  const q = query.trim().toLowerCase();
  const dir = worstFirst ? -1 : 1; // flips b-a (descending/best-first) into a-b (ascending/worst-first)

  if (view.startsWith("prompters-")) {
    let rows = prompterRows().filter((r) => r.visits > 0 || r.dwellMs > 0);
    if (q) rows = rows.filter((r) => r.by.toLowerCase().includes(q));
    rows.sort((a, b) => dir * ((view === "prompters-time" ? b.dwellMs - a.dwellMs : b.visits - a.visits)));
    return { kind: "prompters", rows };
  }

  let rows = siteRows.filter((r) => r.visits > 0 || r.dwellMs > 0);
  if (q) {
    rows = rows.filter(
      (r) => r.site.toLowerCase().includes(q) || (r.by || "").toLowerCase().includes(q) || (r.title || "").toLowerCase().includes(q),
    );
  }
  if (view === "sites-time") rows = [...rows].sort((a, b) => dir * (b.dwellMs - a.dwellMs));
  else if (view === "sites-avg") rows = [...rows].filter((r) => r.dwellSamples > 0).sort((a, b) => dir * (b.avgDwellMs - a.avgDwellMs));
  else rows = [...rows].sort((a, b) => dir * (b.visits - a.visits));
  return { kind: "sites", rows };
}

function render() {
  loadingEl.hidden = true;
  const { kind, rows } = currentRows();

  if (!rows.length) {
    boardTable.hidden = true;
    emptyEl.hidden = false;
    return;
  }
  boardTable.hidden = false;
  emptyEl.hidden = true;

  if (kind === "sites") {
    boardHead.innerHTML = `<tr><th>#</th><th>site</th><th>prompted by</th><th>visits</th><th>total time</th><th>avg / visit</th></tr>`;
    boardBody.innerHTML = rows
      .map(
        (r, i) => `<tr>
          <td class="rank">${i + 1}</td>
          <td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></td>
          <td class="dim">${r.by ? esc(r.by) : "—"}</td>
          <td class="num">${fmtNum(r.visits)}</td>
          <td class="num">${fmtMs(r.dwellMs)}</td>
          <td class="num">${r.dwellSamples > 0 ? fmtMs(r.avgDwellMs) : "—"}</td>
        </tr>`,
      )
      .join("");
  } else {
    boardHead.innerHTML = `<tr><th>#</th><th>prompter</th><th>sites</th><th>total visits</th><th>total time</th></tr>`;
    boardBody.innerHTML = rows
      .map(
        (r, i) => `<tr>
          <td class="rank">${i + 1}</td>
          <td>${esc(r.by)}</td>
          <td class="num">${fmtNum(r.siteCount)}</td>
          <td class="num">${fmtNum(r.visits)}</td>
          <td class="num">${fmtMs(r.dwellMs)}</td>
        </tr>`,
      )
      .join("");
  }
}

tabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  view = btn.dataset.view;
  for (const t of tabsEl.querySelectorAll(".tab")) t.classList.toggle("active", t === btn);
  render();
});

searchEl.addEventListener("input", () => {
  query = searchEl.value;
  render();
});

worstFirstEl.addEventListener("change", () => {
  worstFirst = worstFirstEl.checked;
  render();
});

// Only "all-time" is a real option — every other value is disabled in the
// markup because the board never stored per-visit timestamps, just a running
// total per site. Nothing to wire up here; this listener exists so a future
// per-period data source has a single place to plug in.
rangeEl.addEventListener("change", () => {
  rangeEl.value = "all";
});

loadData();
