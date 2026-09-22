import { OSES, fetchAllTime, fetchRecent } from "./lib/os-data.js";
import { fmt, barScale, severityClass, truncate, escapeHtml } from "./lib/format.js";

const RECENT_WINDOW_DAYS = 90;
const LIVE_WINDOW_DAYS = 1;
const LIVE_POLL_MS = 6 * 60 * 1000; // 6 min — well clear of NVD's rate limit even with 5 OSes polled every cycle
const LIVE_TTL_MS = LIVE_POLL_MS - 30000; // cache expires just before the next poll tick, so a manual refresh in between still hits the network

const state = {
  recent: {}, // osId -> number | null | undefined(loading)
  alltime: {}, // osId -> number | null | undefined
  critical: {}, // osId -> number | null | undefined
  liveTotal: {}, // osId -> number | null | undefined
  liveItems: [], // merged recent-sample feed, newest first
  lastLiveCheck: null,
};

function $(sel) {
  return document.querySelector(sel);
}

// Horizontal bar chart, redrawn from current `state` each time a value
// arrives — simpler than patching individual bars, and cheap at 2-3 rows.
function renderBarGroup(containerEl, axis, valuesById, { log = false, suffix = "" } = {}) {
  const rows = OSES.filter((os) => os.axis === axis);
  const known = rows.map((os) => valuesById[os.id]).filter((v) => typeof v === "number");
  const max = known.length ? Math.max(...known, 1) : 1;
  const scale = (v) => barScale(v, max, log);

  containerEl.innerHTML = rows
    .map((os) => {
      const v = valuesById[os.id];
      const loading = v === undefined;
      const failed = v === null;
      const pct = scale(v);
      return `<div class="bar-row ${failed ? "is-failed" : ""}" data-os="${os.id}">
        <div class="bar-label">
          <span class="dot dot-${os.openness}"></span>
          <span>${os.label}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill fill-${os.openness}" style="width:${loading ? 4 : pct}%"></div>
        </div>
        <div class="bar-value">${loading ? '<span class="pulse">…</span>' : failed ? "n/a" : fmt(v) + suffix}</div>
      </div>`;
    })
    .join("");
}

function renderAll() {
  renderBarGroup($("#desktop-recent"), "desktop", state.recent);
  renderBarGroup($("#mobile-recent"), "mobile", state.recent);
  renderBarGroup($("#desktop-alltime"), "desktop", state.alltime, { log: true });
  renderBarGroup($("#mobile-alltime"), "mobile", state.alltime, { log: true });
  renderBarGroup($("#desktop-critical"), "desktop", state.critical);
  renderBarGroup($("#mobile-critical"), "mobile", state.critical);
  renderBarGroup($("#desktop-live"), "desktop", state.liveTotal);
  renderBarGroup($("#mobile-live"), "mobile", state.liveTotal);
  renderLiveFeed();
  renderShareLink();
}

function renderLiveFeed() {
  const list = $("#live-feed-list");
  const checkedEl = $("#live-checked");
  checkedEl.textContent = state.lastLiveCheck
    ? `last checked ${new Date(state.lastLiveCheck).toLocaleTimeString()}`
    : "checking…";

  if (!state.liveItems.length) {
    list.innerHTML = `<li class="feed-empty">no CVEs published for any tracked OS in the last ${LIVE_WINDOW_DAYS === 1 ? "24 hours" : LIVE_WINDOW_DAYS + " days"} — quiet stretch, or NVD hasn't been reachable yet.</li>`;
    return;
  }

  list.innerHTML = state.liveItems
    .slice(0, 12)
    .map((row) => {
      const cve = row.cve.cve;
      const id = cve.id;
      const desc = (cve.descriptions || []).find((d) => d.lang === "en")?.value || "";
      const sev = severityClass(cve);
      return `<li class="feed-item">
        <div class="feed-top">
          <a href="https://nvd.nist.gov/vuln/detail/${id}" target="_blank" rel="noopener">${id}</a>
          <span class="sev sev-${sev}">${sev}</span>
          <span class="feed-os">${row.osLabel}</span>
        </div>
        <p class="feed-desc">${escapeHtml(truncate(desc, 160))}</p>
      </li>`;
    })
    .join("");
}

function renderShareLink() {
  const known = OSES.map((os) => [os.label, state.recent[os.id]]).filter(([, v]) => typeof v === "number");
  let text;
  if (known.length) {
    const parts = known.map(([label, v]) => `${label} ${v}`).join(", ");
    text = `patchgap: CVEs published in the last ${RECENT_WINDOW_DAYS} days by OS — ${parts}. Live dashboard: https://patchgap.bisks.net/`;
  } else {
    text = `patchgap: a live dashboard charting CVEs by OS — Windows, macOS, Debian, iOS, Android — straight from NVD. https://patchgap.bisks.net/`;
  }
  $("#shareBtn").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

async function loadHeadline() {
  // Recent-activity bars first — the number people care about most, and the
  // one the live poll keeps current — then all-time, then critical severity.
  await Promise.all(
    OSES.map(async (os) => {
      const r = await fetchRecent(os, RECENT_WINDOW_DAYS);
      state.recent[os.id] = r ? r.total : null;
      renderAll();
    })
  );
  await Promise.all(
    OSES.map(async (os) => {
      state.alltime[os.id] = await fetchAllTime(os);
      renderAll();
    })
  );
  await Promise.all(
    OSES.map(async (os) => {
      const r = await fetchRecent(os, RECENT_WINDOW_DAYS, { severity: "CRITICAL" });
      state.critical[os.id] = r ? r.total : null;
      renderAll();
    })
  );
}

async function pollLive() {
  const merged = [];
  await Promise.all(
    OSES.map(async (os) => {
      const r = await fetchRecent(os, LIVE_WINDOW_DAYS, { sample: 10, ttlMs: LIVE_TTL_MS });
      state.liveTotal[os.id] = r ? r.total : null;
      if (r) {
        for (const item of r.items) merged.push({ cve: item, osId: os.id, osLabel: os.label });
      }
      renderAll();
    })
  );
  merged.sort((a, b) => (b.cve.cve.published || "").localeCompare(a.cve.cve.published || ""));
  state.liveItems = merged;
  state.lastLiveCheck = Date.now();
  renderAll();
}

async function main() {
  renderAll(); // paint loading skeletons immediately
  await loadHeadline();
  await pollLive();
  setInterval(pollLive, LIVE_POLL_MS);

  $("#live-refresh").addEventListener("click", async () => {
    $("#live-refresh").disabled = true;
    await pollLive();
    $("#live-refresh").disabled = false;
  });
}

main();
