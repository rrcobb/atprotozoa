// vulnwatch — every CVE published since START, straight from the NVD in the browser.
const START = "2026-10-20T00:00:00.000";
const API = "https://services.nvd.nist.gov/rest/json/cves/2.0";
// NVD rejects a pubStartDate..pubEndDate window longer than 120 days; that's a
// hard API limit, so the window is clamped to it (see windowEnd()).
const MAX_WINDOW_MS = 119 * 864e5;
// Pages are small on purpose: NVD is slow per request, so smaller pages let the
// dashboard fill in progressively instead of staring at a spinner.
const PAGE = 500;
const SHOW = 50;
const SEVS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];
const SEV_COLOR = { CRITICAL: "#ff3b5c", HIGH: "#ff8a3d", MEDIUM: "#f5c542", LOW: "#4fc3a1", NONE: "#6b7785" };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (d) => d.toISOString().slice(0, 23);

let all = [];
let shown = SHOW;

function windowEnd() {
  const start = Date.parse(START + "Z");
  return new Date(Math.min(Date.now(), start + MAX_WINDOW_MS));
}

function pickMetric(m) {
  for (const k of ["cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"]) {
    const list = m && m[k];
    if (list && list.length) {
      const x = list.find((e) => e.type === "Primary") || list[0];
      const sev = (x.cvssData.baseSeverity || x.baseSeverity || "").toUpperCase();
      return { score: x.cvssData.baseScore, sev: SEVS.includes(sev) ? sev : "NONE" };
    }
  }
  return { score: null, sev: "NONE" };
}

function vendorOf(c) {
  const a = c.affected && c.affected[0] && c.affected[0].affectedData && c.affected[0].affectedData[0];
  if (a && a.vendor && a.vendor !== "n/a") return a.vendor;
  const cfg = JSON.stringify(c.configurations || "");
  const m = cfg.match(/cpe:2\.3:[aoh]:([^:]+):/);
  return m ? m[1] : null;
}

function slim(c) {
  const { score, sev } = pickMetric(c.metrics);
  let cwe = null;
  for (const w of c.weaknesses || []) for (const d of w.description || []) if (/^CWE-\d+$/.test(d.value)) { cwe = d.value; break; }
  const desc = ((c.descriptions || []).find((d) => d.lang === "en") || {}).value || "";
  return {
    id: c.id, pub: c.published, score, sev, cwe, vendor: vendorOf(c), desc,
    kev: !!c.cisaExploitAdd, rejected: /^\*\* REJECT/.test(desc),
  };
}

async function getPage(startIndex, end) {
  const qs = new URLSearchParams({ pubStartDate: START, pubEndDate: fmt(end), resultsPerPage: PAGE, startIndex });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + "?" + qs);
    if (res.ok) return res.json();
    // unkeyed NVD access is rate limited (403/429/503); back off and retry
    if (attempt >= 5) throw new Error("NVD answered " + res.status);
    $("status").textContent = "NVD is rate limiting us, waiting… (" + res.status + ")";
    await sleep(8000 * (attempt + 1));
  }
}

async function load() {
  $("error").hidden = true;
  $("refresh").disabled = true;
  $("status").textContent = "loading…";
  try {
    const end = windowEnd();
    const out = [];
    let idx = 0, total = Infinity;
    // Page until we've read every result NVD says exists for the window.
    while (idx < total) {
      const d = await getPage(idx, end);
      total = d.totalResults;
      for (const v of d.vulnerabilities) out.push(slim(v.cve));
      idx += d.resultsPerPage || d.vulnerabilities.length;
      if (!d.vulnerabilities.length) break;
      $("status").textContent = "loaded " + out.length + " of " + total + "…";
      all = out.filter((c) => !c.rejected);
      renderAll();
      if (idx < total) await sleep(6500); // 5 requests / 30s is the unkeyed public rate limit
    }
    all = out.filter((c) => !c.rejected);
    $("status").textContent = all.length + " CVEs · updated " + new Date().toLocaleTimeString();
    renderAll();
  } catch (e) {
    $("error").hidden = false;
    $("error").textContent = "couldn't read the NVD: " + e.message + ". hit refresh to try again.";
    $("status").textContent = all.length ? all.length + " CVEs (stale)" : "";
    if (all.length) renderAll();
  } finally {
    $("refresh").disabled = false;
  }
}

function tally(list, key) {
  const m = new Map();
  for (const c of list) { const k = key(c); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function bars(rows, colorFor) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return rows.map(([l, n]) =>
    `<div class="row"><span class="l" title="${esc(l)}">${esc(l)}</span><span class="track"><span class="fill" style="display:block;width:${(n / max) * 100}%;background:${colorFor ? colorFor(l) : "#8794a3"}"></span></span><span class="n">${n}</span></div>`).join("");
}

function renderStats() {
  const bySev = Object.fromEntries(SEVS.map((s) => [s, 0]));
  for (const c of all) bySev[c.sev]++;
  const kev = all.filter((c) => c.kev).length;
  const rce = all.filter((c) => /remote code execution|arbitrary code|command injection/i.test(c.desc)).length;
  $("tiles").innerHTML = [
    ["total CVEs", all.length], ["critical", bySev.CRITICAL], ["high", bySev.HIGH],
    ["exploited in the wild", kev], ["mention code execution", rce],
  ].map(([l, n]) => `<div class="tile"><b>${n.toLocaleString()}</b><span>${l}</span></div>`).join("");

  $("sev").innerHTML = bars(SEVS.map((s) => [s === "NONE" ? "unscored" : s.toLowerCase(), bySev[s]]), (l) => SEV_COLOR[l === "unscored" ? "NONE" : l.toUpperCase()]);

  const days = tally(all, (c) => c.pub.slice(0, 10)).sort((a, b) => a[0].localeCompare(b[0]));
  $("days").innerHTML = bars(days);
  $("vendors").innerHTML = bars(tally(all, (c) => c.vendor).slice(0, 12));
  $("cwes").innerHTML = bars(tally(all, (c) => c.cwe).slice(0, 12));

  const text = `${all.length.toLocaleString()} new CVEs since 20 Oct 2026 — ${bySev.CRITICAL} critical, ${bySev.HIGH} high, ${kev} exploited in the wild.\n\nhttps://vulnwatch.bisks.net/`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

function filtered() {
  const q = $("q").value.trim().toLowerCase();
  const sev = $("fsev").value;
  const kev = $("kev").checked;
  let list = all.filter((c) =>
    (!sev || c.sev === sev) && (!kev || c.kev) &&
    (!q || c.id.toLowerCase().includes(q) || (c.vendor || "").toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)));
  if ($("sort").value === "new") list.sort((a, b) => b.pub.localeCompare(a.pub));
  else list.sort((a, b) => (b.kev - a.kev) || ((b.score ?? -1) - (a.score ?? -1)) || b.pub.localeCompare(a.pub));
  return list;
}

function renderFeed() {
  const list = filtered();
  $("count").textContent = "· " + list.length.toLocaleString();
  $("feed").innerHTML = list.slice(0, shown).map((c) => `<li>
    <div class="top"><span class="badge ${c.sev}">${c.score != null ? c.score.toFixed(1) + " " : ""}${c.sev === "NONE" ? "UNSCORED" : c.sev}</span>
    ${c.kev ? '<span class="kevb">EXPLOITED</span>' : ""}
    <a href="https://nvd.nist.gov/vuln/detail/${esc(c.id)}" target="_blank" rel="noopener">${esc(c.id)}</a>
    <span class="meta">${esc(c.vendor || "unknown vendor")}${c.cwe ? " · " + c.cwe : ""} · ${esc(c.pub.slice(0, 10))}</span></div>
    <p class="desc">${esc(c.desc.length > 360 ? c.desc.slice(0, 359) + "…" : c.desc)}</p></li>`).join("");
  $("more").hidden = list.length <= shown;
}

function renderAll() { renderStats(); renderFeed(); }

for (const id of ["q", "fsev", "sort", "kev"]) $(id).addEventListener(id === "q" ? "input" : "change", () => { shown = SHOW; renderFeed(); });
$("more").addEventListener("click", () => { shown += SHOW; renderFeed(); });
$("refresh").addEventListener("click", load);
load();
// keep it live: re-read every 15 minutes while the tab is open
setInterval(load, 15 * 60 * 1000);
