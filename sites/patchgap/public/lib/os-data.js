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
// `cpes` is the list of NVD CPE 2.3 vendor:product strings summed for the
// live metrics (recent activity, critical severity, last-24h feed) and, by
// default, the all-time total too. NVD's virtualMatchString does
// left-to-right component matching, so a vendor:product string with no
// version component matches every version under it — e.g.
// "cpe:2.3:o:microsoft:windows" alone matches windows_10, windows_11,
// windows_server_2019, etc. in one query, which is what makes a single query
// per shipped OS possible instead of one per version. Every OS here has a
// single-entry `cpes` list except Debian — see below.
//
// `allTimeCpes` defaults to `cpes`; the one exception is macOS: Apple's
// desktop OS is catalogued in NVD's CPE dictionary under two different
// product strings depending on CVE age ("mac_os_x" pre-rename, "macos"
// since) that don't share a prefix, so the all-time total sums both. Recent
// metrics only query "macos" — CVEs published in the last year overwhelmingly
// use the current name, and the gap this leaves is noted in the page copy.
//
// Debian's `cpes` is a rollup, not a single CPE — see DEBIAN_PACKAGE_CPES
// below for why.

// @fubarchitect.com, follow-up to the original build: "for debian we do
// probably gotta pick like, a set of mandatory packages (including the
// linux kernel itself) to roll up into the count, most debian cves wont
// have debian on the tin." Confirmed by hand against the live API before
// writing this: querying "debian_linux" alone over the trailing 90 days
// returns single digits, while "linux_kernel" alone over the same window
// returns in the thousands — almost every real CVE that ships to a Debian
// box files under the affected package's own CPE, not a distro-wide one.
//
// This list is every package on Debian's own "Priority: required" set (the
// packages `debootstrap` installs on literally every Debian system, per the
// Debian Policy Manual) that both (a) has an independent, non-generic CPE
// vendor:product pair in NVD's dictionary and (b) actually has CVEs filed
// against it there — plus the kernel, systemd, and OpenSSL. The kernel
// isn't part of the required-package set (it's the boot component, not an
// apt package) but is obviously mandatory, and the brief named it
// explicitly. systemd is Priority: important, not required — Debian's
// required set names an init system only as "sysvinit-core OR
// systemd-sysv" — but systemd has been the default init on every Debian
// release since Jessie (2015), so on the overwhelming majority of live
// Debian systems it's the one actually installed. OpenSSL is Priority:
// standard rather than required, but it's pulled in transitively by apt's
// own HTTPS transport and by most of the required set besides, making it
// present on Debian installs closely enough to universal to count — and
// it's the single highest-profile source of Linux userspace CVEs
// historically (Heartbleed among them), so leaving it out to keep the list
// purely policy-clean would undercount on purpose. Packages considered and
// left out: the rest of Priority: required (grep, sed, gzip, hostname,
// findutils, diffutils, …) either have no independently-tracked NVD CPE or
// return zero/near-zero results there — adding them would add query load
// for the live poll (each one is another rate-limited NVD call, serialized
// through the same 1-req/~7.5s queue every other metric shares) without
// adding real count.
//
// Read the totals from this list as one summed number, not as eight
// independent counts: summing per-CPE totalResults does NOT dedupe a CVE ID that happens to be
// filed against more than one of these CPEs (e.g. a Debian Security
// Advisory covering a kernel CVE could in principle be cross-referenced
// under both "debian_linux" and "linux_kernel"). That overlap is real but
// small relative to the totals involved; true ID-level dedup would mean
// paginating every package's full CVE list instead of reading one
// totalResults per query, which isn't viable within NVD's unauthenticated
// rate limit for an all-time total in the tens of thousands. Disclosed here
// and in the page's "how to read this" copy rather than quietly averaged
// away.
const DEBIAN_PACKAGE_CPES = [
  "cpe:2.3:o:debian:debian_linux",
  "cpe:2.3:o:linux:linux_kernel",
  "cpe:2.3:a:gnu:glibc",
  "cpe:2.3:a:gnu:bash",
  "cpe:2.3:a:gnu:coreutils",
  "cpe:2.3:a:debian:dpkg",
  "cpe:2.3:a:systemd_project:systemd",
  "cpe:2.3:a:openssl:openssl",
];

export const OSES = [
  {
    id: "windows",
    label: "Windows",
    vendor: "Microsoft",
    axis: "desktop",
    openness: "closed",
    opennessLabel: "closed source",
    cpes: ["cpe:2.3:o:microsoft:windows"],
  },
  {
    id: "macos",
    label: "macOS",
    vendor: "Apple",
    axis: "desktop",
    openness: "closed",
    opennessLabel: "closed source",
    cpes: ["cpe:2.3:o:apple:macos"],
    allTimeCpes: ["cpe:2.3:o:apple:macos", "cpe:2.3:o:apple:mac_os_x"],
  },
  {
    id: "debian",
    label: "Debian",
    vendor: "Debian Project",
    axis: "desktop",
    openness: "open",
    opennessLabel: "open source",
    cpes: DEBIAN_PACKAGE_CPES,
  },
  {
    id: "ios",
    label: "iOS",
    vendor: "Apple",
    axis: "mobile",
    openness: "closed",
    opennessLabel: "closed source",
    cpes: ["cpe:2.3:o:apple:iphone_os"],
  },
  {
    id: "android",
    label: "Android",
    vendor: "Google / AOSP",
    axis: "mobile",
    openness: "open-core",
    opennessLabel: "open-source core",
    cpes: ["cpe:2.3:o:google:android"],
  },
];

import { nvdQuery, isoDaysAgo, isoNow } from "./nvd.js";
import { mergeCveBodies } from "./format.js";

const DAY = 86400000;

// All-time total CVEs ever catalogued against this OS. Cached a full day —
// this number moves slowly and there's no reason to re-earn it every visit.
// `allTimeCpes` defaults to `cpes` (see OSES above) — macOS is the only OS
// where the two lists differ.
export async function fetchAllTime(os) {
  let total = 0;
  let gotAny = false;
  for (const cpe of os.allTimeCpes || os.cpes) {
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
//
// Most OSes have one CPE, so this is one NVD call. Debian has several (see
// DEBIAN_PACKAGE_CPES) — mergeCveBodies (format.js) sums their totals and
// dedupes their live-feed items by CVE ID.
export async function fetchRecent(os, days, { severity, sample = 0, ttlMs = 3600 * 1000 } = {}) {
  const bodies = [];
  for (const cpe of os.cpes) {
    const params = {
      virtualMatchString: cpe,
      pubStartDate: isoDaysAgo(days),
      pubEndDate: isoNow(),
      resultsPerPage: String(sample || 1),
    };
    if (severity) params.cvssV3Severity = severity;
    const cacheKey = `recent:${os.id}:${cpe}:${days}:${severity || "any"}:${sample}`;
    bodies.push(await nvdQuery(params, { ttlMs, cacheKey }));
  }
  return mergeCveBodies(bodies);
}
