// Counting posts per time bucket via the public AppView's searchPosts
// (unauthenticated, CORS open). There is no "total hits" field, so a count is
// made by paging a bucket's cursor until it comes back empty.
const API = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts";

export function parseTerms(raw) {
  return [...new Set(raw.split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean))];
}

// Multi-word phrases are sent quoted so the search is for the exact phrase.
export function queryFor(term) {
  const t = term.replace(/"/g, "");
  return /\s/.test(t) ? `"${t}"` : t;
}

const DAY = 86400000;
export function makeBuckets(startMs, endMs, gran) {
  const out = [];
  let d = new Date(startMs);
  d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), gran === "month" ? 1 : d.getUTCDate()));
  if (gran === "week") d = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY); // monday
  while (d.getTime() < endMs) {
    let n;
    if (gran === "month") n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    else n = new Date(d.getTime() + (gran === "week" ? 7 : 1) * DAY);
    out.push({ from: d.getTime(), to: Math.min(n.getTime(), endMs) });
    d = n;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(q, from, to, cursor, signal) {
  const u = new URL(API);
  u.searchParams.set("q", q);
  u.searchParams.set("sort", "latest");
  u.searchParams.set("limit", "100");
  u.searchParams.set("since", new Date(from).toISOString());
  u.searchParams.set("until", new Date(to).toISOString());
  if (cursor) u.searchParams.set("cursor", cursor);
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(u, { signal });
    if (r.ok) return r.json();
    // 429/5xx: back off and retry; anything else is a real error.
    if ((r.status === 429 || r.status >= 500) && attempt < 8) {
      await sleep(Math.min(30000, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error("search failed: HTTP " + r.status);
  }
}

// Count one bucket, paging to exhaustion. onProgress(count) fires per page.
export async function countBucket(term, b, signal, onProgress) {
  const q = queryFor(term);
  let cursor, n = 0;
  do {
    const d = await page(q, b.from, b.to, cursor, signal);
    n += (d.posts || []).length;
    cursor = d.cursor;
    onProgress(n);
  } while (cursor);
  return n;
}
