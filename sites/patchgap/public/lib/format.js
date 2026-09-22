// Pure formatting/scoring helpers pulled out of app.js so they're testable
// without a DOM — everything else in app.js touches document/localStorage
// at import time.

export function fmt(n) {
  if (n === null) return "—";
  if (n === undefined) return "";
  return n.toLocaleString("en-US");
}

// Bar length as a percentage of `max`, linear or log10. A non-zero value
// always gets at least 2% so it stays visible next to a much larger bar.
export function barScale(v, max, log = false) {
  if (typeof v !== "number") return 0;
  if (!log) return Math.max((v / max) * 100, v > 0 ? 2 : 0);
  const lv = Math.log10(v + 1);
  const lmax = Math.log10(max + 1) || 1;
  return Math.max((lv / lmax) * 100, v > 0 ? 2 : 0);
}

export function severityClass(cve) {
  const metrics = cve?.metrics || {};
  const list = metrics.cvssMetricV31 || metrics.cvssMetricV30 || metrics.cvssMetricV2 || [];
  const sev = list[0]?.cvssData?.baseSeverity || list[0]?.baseSeverity;
  return sev ? sev.toLowerCase() : "unknown";
}

export function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Combines NVD query bodies for the same OS's several CPEs (see Debian's
// rollup in os-data.js) into one total and one item list. Sums totalResults
// across every body as-is (see os-data.js's DEBIAN_PACKAGE_CPES comment for
// why that isn't ID-deduped), but the returned *item* list — the one that
// actually renders as CVE cards in the live feed — is deduped by CVE ID, so
// a CVE cross-referenced under two of an OS's CPEs doesn't render twice.
// `bodies` may contain `null` entries for CPEs whose query failed; those are
// skipped. Returns `null` if every body failed.
export function mergeCveBodies(bodies) {
  let total = 0;
  let gotAny = false;
  const items = [];
  const seenIds = new Set();
  for (const body of bodies) {
    if (!body) continue;
    gotAny = true;
    total += body.totalResults;
    for (const item of body.vulnerabilities || []) {
      const id = item.cve?.id;
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      items.push(item);
    }
  }
  return gotAny ? { total, items } : null;
}
