// The five operating systems this dashboard compares, and the NVD CVE API
// queries behind each metric. See ../../builder brief: Windows and macOS as
// "the two major closed-source OSes," a relatively minimal, actively-updated
// open-source Linux distro, plus iOS and Android as the mobile pair —
// grouped below by axis (desktop/mobile) so each is compared against its
// like-for-like counterpart rather than lumped into one undifferentiated bar
// chart.
//
// The Linux pick is Debian, not something more minimal like Alpine or
// Fedora: NVD catalogues most Linux CVEs against the affected *package*
// (openssl, the kernel, curl, …), not against a distro-wide CPE, so an
// OS-level query for Alpine's or Fedora's product string returns close to
// nothing regardless of how many real CVEs shipped in their repos that
// week — not because those distros are that much safer, but because NVD's
// analysts don't consistently attach a distro-version match node for them.
// Debian is the one major distro where that node gets attached often enough
// (via cross-referenced Debian Security Advisories) that a query against
// "debian_linux" returns a real, if still small, live number instead of a
// structurally-guaranteed zero. This asymmetry is exactly the kind of thing
// the page's "how to read this" note exists to flag.
//
// `cpe` is the NVD CPE 2.3 vendor:product string used for the live metrics
// (recent activity, critical severity, last-24h feed). NVD's virtualMatchString
// does left-to-right component matching, so a vendor:product string with no
// version component matches every version under it — e.g.
// "cpe:2.3:o:microsoft:windows" alone matches windows_10, windows_11,
// windows_server_2019, etc. in one query, which is what makes a single query
// per OS possible instead of one per shipped version.
//
// `allTimeCpes` is almost always the same single entry, except macOS: Apple's
// desktop OS is catalogued in NVD's CPE dictionary under two different
// product strings depending on CVE age ("mac_os_x" pre-rename, "macos"
// since) that don't share a prefix, so the all-time total sums both. Recent
// metrics only query "macos" — CVEs published in the last year overwhelmingly
// use the current name, and the gap this leaves is noted in the page copy.
export const OSES = [
  {
    id: "windows",
    label: "Windows",
    vendor: "Microsoft",
    axis: "desktop",
    openness: "closed",
    opennessLabel: "closed source",
    cpe: "cpe:2.3:o:microsoft:windows",
    allTimeCpes: ["cpe:2.3:o:microsoft:windows"],
  },
  {
    id: "macos",
    label: "macOS",
    vendor: "Apple",
    axis: "desktop",
    openness: "closed",
    opennessLabel: "closed source",
    cpe: "cpe:2.3:o:apple:macos",
    allTimeCpes: ["cpe:2.3:o:apple:macos", "cpe:2.3:o:apple:mac_os_x"],
  },
  {
    id: "debian",
    label: "Debian",
    vendor: "Debian Project",
    axis: "desktop",
    openness: "open",
    opennessLabel: "open source",
    cpe: "cpe:2.3:o:debian:debian_linux",
    allTimeCpes: ["cpe:2.3:o:debian:debian_linux"],
  },
  {
    id: "ios",
    label: "iOS",
    vendor: "Apple",
    axis: "mobile",
    openness: "closed",
    opennessLabel: "closed source",
    cpe: "cpe:2.3:o:apple:iphone_os",
    allTimeCpes: ["cpe:2.3:o:apple:iphone_os"],
  },
  {
    id: "android",
    label: "Android",
    vendor: "Google / AOSP",
    axis: "mobile",
    openness: "open-core",
    opennessLabel: "open-source core",
    cpe: "cpe:2.3:o:google:android",
    allTimeCpes: ["cpe:2.3:o:google:android"],
  },
];

import { nvdQuery, isoDaysAgo, isoNow } from "./nvd.js";

const DAY = 86400000;

// All-time total CVEs ever catalogued against this OS. Cached a full day —
// this number moves slowly and there's no reason to re-earn it every visit.
export async function fetchAllTime(os) {
  let total = 0;
  let gotAny = false;
  for (const cpe of os.allTimeCpes) {
    const body = await nvdQuery(
      { virtualMatchString: cpe, resultsPerPage: "1" },
      { ttlMs: 24 * 3600 * 1000, cacheKey: `alltime:${cpe}` }
    );
    if (body) {
      total += body.totalResults;
      gotAny = true;
    }
  }
  return gotAny ? total : null;
}

// CVEs published in the trailing `days` (max 120 — NVD's own limit on a
// pubStartDate/pubEndDate span), optionally filtered to one CVSS v3
// severity. resultsPerPage stays at 1 (or `sample` when the caller wants
// actual records) since only the aggregate totalResults is needed for the
// bar charts — NVD returns that count directly, so there's no reason to
// page through the underlying list just to count it.
export async function fetchRecent(os, days, { severity, sample = 0, ttlMs = 3600 * 1000 } = {}) {
  const params = {
    virtualMatchString: os.cpe,
    pubStartDate: isoDaysAgo(days),
    pubEndDate: isoNow(),
    resultsPerPage: String(sample || 1),
  };
  if (severity) params.cvssV3Severity = severity;
  const cacheKey = `recent:${os.id}:${days}:${severity || "any"}:${sample}`;
  const body = await nvdQuery(params, { ttlMs, cacheKey });
  if (!body) return null;
  return { total: body.totalResults, items: body.vulnerabilities || [] };
}
