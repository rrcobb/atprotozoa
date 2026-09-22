// Thin client for the NVD CVE API 2.0 (services.nvd.nist.gov), used
// keyless and straight from the browser — it's CORS-open
// (access-control-allow-origin: *), which is exactly the shape of use it's
// built for. Two jobs live here:
//
// 1. Rate limiting. NVD's documented unauthenticated policy is 5 requests
//    per rolling 30 seconds; this queues every call through one global,
//    serial gate spaced well under that (1 request per ~7.5s) so a page with
//    five OSes and several metrics never bursts the limit, no matter how
//    many components ask for data at once.
// 2. Caching. Every response is cached in localStorage against its exact
//    query + a per-call TTL, so re-renders, repeat visits, and the live-poll
//    loop only ever hit the network for data that's actually gone stale.
//
// A query that keeps failing (NVD rate-limiting this client, or a transient
// Cloudflare block in front of it — both observed in practice) resolves to
// null after a few retries rather than throwing. Callers must treat null as
// "temporarily unavailable," never as "zero" — the two look nothing alike
// on a CVE dashboard.

const BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const MIN_GAP_MS = 7500; // NVD allows 5/30s (6s/req); padded for real margin
const MAX_RETRIES = 3;
const CACHE_PREFIX = "patchgap:v1:";

let queueTail = Promise.resolve();
let lastDispatch = 0;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttledFetch(url) {
  const gap = Date.now() - lastDispatch;
  if (gap < MIN_GAP_MS) await wait(MIN_GAP_MS - gap);
  lastDispatch = Date.now();
  return fetch(url, { headers: { accept: "application/json" } });
}

// Runs fn after everything already queued, one at a time, regardless of
// which caller's promise settles first — this is the single choke point
// that makes every NVD call in the app share one rate limit.
function enqueue(fn) {
  const result = queueTail.then(fn, fn);
  queueTail = result.then(
    () => {},
    () => {}
  );
  return result;
}

function cacheGet(key, ttlMs) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > ttlMs) return null;
    return parsed.value;
  } catch (_) {
    return null;
  }
}

function cacheSet(key, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ value, ts: Date.now() }));
  } catch (_) {
    // localStorage full or unavailable (private browsing) — fine, just skip
  }
}

// Runs one NVD query, queued + rate-limited + cached.
// params: query params for the CVE API (virtualMatchString, pubStartDate, …)
// opts.ttlMs: how long a cached response stays fresh
// opts.cacheKey: override the cache key (defaults to the query string)
// Returns the parsed response body, or null if every retry was exhausted.
export function nvdQuery(params, opts = {}) {
  const ttlMs = opts.ttlMs ?? 60 * 60 * 1000;
  const qs = new URLSearchParams(params).toString();
  const key = opts.cacheKey || qs;

  const cached = cacheGet(key, ttlMs);
  if (cached) return Promise.resolve(cached);

  return enqueue(async () => {
    // another caller queued for the same key may have just filled it
    const cachedAgain = cacheGet(key, ttlMs);
    if (cachedAgain) return cachedAgain;

    const url = `${BASE}?${qs}`;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await throttledFetch(url);
        if (res.status === 429 || res.status === 403 || res.status >= 500) {
          await wait(20000 * (attempt + 1));
          continue;
        }
        if (!res.ok) return null; // a real request problem, not transient — don't retry
        const body = await res.json();
        cacheSet(key, body);
        return body;
      } catch (_) {
        await wait(15000 * (attempt + 1));
      }
    }
    return null;
  });
}

export function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().replace("Z", "");
}

export function isoNow() {
  return new Date().toISOString().replace("Z", "");
}
