// The former shared tracker was retired. This page remains a static catalog;
// it deliberately does not turn browser-local visits into a shared ranking.

const boardHead = document.getElementById("boardHead");
const boardBody = document.getElementById("boardBody");
const boardTable = document.getElementById("board");
const emptyEl = document.getElementById("empty");
const loadingEl = document.getElementById("loading");
const searchEl = document.getElementById("search");
const tabsEl = document.getElementById("tabs");
const rangeEl = document.getElementById("range");
const worstFirstEl = document.getElementById("worstFirst");
const exportBtn = document.getElementById("exportCsv");

const VALID_VIEWS = new Set(["sites-visits", "sites-time", "sites-avg", "prompters-visits", "prompters-time"]);

let view = "sites-visits";
let query = "";
let worstFirst = false;
let siteRows = [];   // static manifest rows, keyed by site
let manifests = [];  // from data/manifests.json: {name, url, title, by, type}
let manifestBySite = new Map();
let lastRender = { kind: "sites", rows: [] };

// Deep-linkable state: ?view=sites-time&q=foo&worst=1 so a filtered/sorted
// board can be bookmarked or shared as-is, not just the board's front page.
function applyStateFromUrl() {
  const params = new URLSearchParams(location.search);
  const v = params.get("view");
  if (v && VALID_VIEWS.has(v)) {
    view = v;
    for (const t of tabsEl.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.view === v);
  }
  const q = params.get("q");
  if (q) {
    query = q;
    searchEl.value = q;
  }
  if (params.get("worst") === "1") {
    worstFirst = true;
    worstFirstEl.checked = true;
  }
}

function syncUrl() {
  const params = new URLSearchParams();
  if (view !== "sites-visits") params.set("view", view);
  if (query.trim()) params.set("q", query.trim());
  if (worstFirst) params.set("worst", "1");
  const qs = params.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

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
function fmtDate(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

async function loadData() {
  const manRes = await fetch("data/manifests.json").then((r) => r.json()).catch(() => []);

  manifests = Array.isArray(manRes) ? manRes : [];
  manifestBySite = new Map(manifests.map((m) => [m.name, m]));

  siteRows = manifests.map((m) => ({
    site: m.name, visits: 0, dwellMs: 0, dwellSamples: 0, avgDwellMs: 0,
    title: m.title || m.name, url: m.url || `https://${m.name}.bisks.net/`, by: m.by || null,
  }));

  document.getElementById("totalVisits").textContent = "—";
  document.getElementById("totalTime").textContent = "—";
  document.getElementById("totalSites").textContent = fmtNum(siteRows.length);
  const prompterCount = new Set(siteRows.filter((r) => r.by).map((r) => r.by)).size;
  document.getElementById("totalPrompters").textContent = fmtNum(prompterCount);

  // The board never stored per-visit timestamps, but it did keep a real
  // lastSeenAt per site — the latest of those is an honest "frozen as of"
  // date rather than a guess, so show it if the API returned any.
  const lastSeen = Math.max(0, ...siteRows.map((r) => r.lastSeenAt || 0));
  const trackedSinceEl = document.getElementById("trackedSince");
  const frozen = fmtDate(lastSeen);
  trackedSinceEl.textContent = frozen
    ? `historical data only, frozen as of ${frozen} — no new beacons are being sent.`
    : "historical data only — no new beacons are being sent.";

  applyStateFromUrl();
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

const MEDALS = ["🥇", "🥈", "🥉"];
function rankCell(i) {
  const medal = MEDALS[i];
  return medal ? `<td class="rank" title="#${i + 1}">${medal}</td>` : `<td class="rank">${i + 1}</td>`;
}

function render() {
  loadingEl.hidden = true;
  const { kind, rows } = currentRows();
  lastRender = { kind, rows };
  exportBtn.hidden = rows.length === 0;

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
          ${rankCell(i)}
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
          ${rankCell(i)}
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
  syncUrl();
  render();
});

searchEl.addEventListener("input", () => {
  query = searchEl.value;
  syncUrl();
  render();
});

worstFirstEl.addEventListener("change", () => {
  worstFirst = worstFirstEl.checked;
  syncUrl();
  render();
});

// Exports exactly what's on screen right now — current view, search filter,
// and sort direction — as CSV. The board is a frozen snapshot, so a download
// button doubles as a real "save this" instead of just a "look at this".
exportBtn.addEventListener("click", () => {
  const { kind, rows } = lastRender;
  if (!rows.length) return;
  const cols =
    kind === "sites"
      ? [
          ["site", (r) => r.title],
          ["url", (r) => r.url],
          ["prompted_by", (r) => r.by || ""],
          ["visits", (r) => r.visits],
          ["total_time_ms", (r) => r.dwellMs],
          ["avg_time_ms", (r) => r.avgDwellMs || 0],
        ]
      : [
          ["prompter", (r) => r.by],
          ["sites", (r) => r.siteCount],
          ["total_visits", (r) => r.visits],
          ["total_time_ms", (r) => r.dwellMs],
        ];
  const csvCell = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    cols.map(([name]) => name).join(","),
    ...rows.map((r) => cols.map(([, get]) => csvCell(get(r))).join(",")),
  ];
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `footfall-${view}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// Only "all-time" is a real option — every other value is disabled in the
// markup because the board never stored per-visit timestamps, just a running
// total per site. Nothing to wire up here; this listener exists so a future
// per-period data source has a single place to plug in.
rangeEl.addEventListener("change", () => {
  rangeEl.value = "all";
});

loadData();
