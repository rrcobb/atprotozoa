// Unit tests for the pure parts of the search/patient-zero logic — the
// stopping-condition rewrite prompted by @bisks.net flagging that a fixed
// page cap was cutting patient zero off mid-spike for high-volume phrases.
// Run with `node --test tests/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDate, postTime, pageRate, makeQuietDetector } from "../public/lib/search.js";

function post(iso) {
  return { record: { createdAt: iso } };
}

// A synthetic "page" of `count` posts evenly spread across `spanMs`,
// newest-first (as the real API returns a page), ending at `endIso`.
function pageOf(count, spanMs, endIso) {
  const end = Date.parse(endIso);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(post(new Date(end - (spanMs * i) / Math.max(1, count - 1)).toISOString()));
  }
  return out;
}

// ---- normalizeDate / postTime --------------------------------------------------

test("normalizeDate truncates extra fractional-second digits", () => {
  assert.equal(normalizeDate("2026-08-21T10:00:00.08081300Z"), "2026-08-21T10:00:00.080Z");
});
test("normalizeDate leaves a normal timestamp alone", () => {
  assert.equal(normalizeDate("2026-08-21T10:00:00.123Z"), "2026-08-21T10:00:00.123Z");
});
test("normalizeDate passes through nullish input", () => {
  assert.equal(normalizeDate(undefined), undefined);
  assert.equal(normalizeDate(""), "");
});

test("postTime prefers record.createdAt over indexedAt", () => {
  const t = postTime({ record: { createdAt: "2026-08-21T10:00:00Z" }, indexedAt: "2026-08-21T12:00:00Z" });
  assert.equal(t.toISOString(), "2026-08-21T10:00:00.000Z");
});
test("postTime falls back to indexedAt when record.createdAt is missing", () => {
  const t = postTime({ indexedAt: "2026-08-21T12:00:00Z" });
  assert.equal(t.toISOString(), "2026-08-21T12:00:00.000Z");
});
test("postTime survives the overlong-fraction timestamp bug", () => {
  const t = postTime({ record: { createdAt: "2026-08-21T10:00:00.08081300Z" } });
  assert.equal(Number.isNaN(t.getTime()), false);
});

// ---- pageRate --------------------------------------------------------------

test("pageRate is null for a page too short to have a rate", () => {
  assert.equal(pageRate([]), null);
  assert.equal(pageRate([post("2026-08-21T10:00:00Z")]), null);
});
test("pageRate is null when the page's span is under the meaningful-rate floor", () => {
  // 50 posts in 5 minutes — real signal, but too short a window to trust.
  assert.equal(pageRate(pageOf(50, 5 * 60_000, "2026-08-21T10:00:00Z")), null);
});
test("pageRate computes posts/ms for a page with enough span", () => {
  const batch = pageOf(100, 2 * 3600_000, "2026-08-21T12:00:00Z"); // 100 posts / 2h
  const rate = pageRate(batch);
  assert.ok(rate > 0);
  assert.ok(Math.abs(rate - 100 / (2 * 3600_000)) < 1e-12);
});
test("pageRate is higher for a busier page over the same span", () => {
  const busy = pageRate(pageOf(100, 3600_000, "2026-08-21T12:00:00Z"));
  const quiet = pageRate(pageOf(10, 3600_000, "2026-08-21T12:00:00Z"));
  assert.ok(busy > quiet);
});

// ---- makeQuietDetector: the actual stopping condition -----------------------

test("detector does not stop while every page is at or above peak rate (still deep in the spike)", () => {
  const d = makeQuietDetector();
  // 8 pages, each equally busy (100 posts / 1h) — a phrase still trending
  // hard as far back as we've paged. Should never fire.
  let stopped = false;
  for (let i = 0; i < 8 && !stopped; i++) {
    const end = new Date(Date.parse("2026-08-21T12:00:00Z") - i * 3600_000).toISOString();
    stopped = d.feed(pageOf(100, 3600_000, end));
  }
  assert.equal(stopped, false);
});

test("detector fires once the rate drops to the pre-spike baseline for a couple of pages", () => {
  const d = makeQuietDetector();
  const end = Date.parse("2026-08-21T12:00:00Z");
  // Pages 0-2: the viral spike, ~100 posts/hour. Pages 3-4: the quiet
  // baseline before the term existed, ~5 posts/hour — well under 15% of peak.
  const spikePages = [0, 1, 2].map((i) => pageOf(100, 3600_000, new Date(end - i * 3600_000).toISOString()));
  const quietPages = [3, 4].map((i) => pageOf(5, 3600_000, new Date(end - i * 3600_000).toISOString()));

  let stopped = false;
  let stoppedAt = -1;
  const allPages = [...spikePages, ...quietPages];
  for (let i = 0; i < allPages.length; i++) {
    if (d.feed(allPages[i])) {
      stopped = true;
      stoppedAt = i;
      break;
    }
  }
  assert.equal(stopped, true);
  // Should fire on the second consecutive quiet page (index 4), not before.
  assert.equal(stoppedAt, 4);
});

test("detector does not fire on a single quiet page — needs a streak", () => {
  const d = makeQuietDetector();
  const end = Date.parse("2026-08-21T12:00:00Z");
  assert.equal(d.feed(pageOf(100, 3600_000, new Date(end).toISOString())), false); // sets peak
  assert.equal(d.feed(pageOf(5, 3600_000, new Date(end - 3600_000).toISOString())), false); // one quiet page: not enough yet
  // A busy page again resets the streak — this was a lull, not the baseline.
  assert.equal(d.feed(pageOf(90, 3600_000, new Date(end - 2 * 3600_000).toISOString())), false);
});

test("detector ignores pages with no usable rate signal (keeps paging through them)", () => {
  const d = makeQuietDetector();
  const end = Date.parse("2026-08-21T12:00:00Z");
  d.feed(pageOf(100, 3600_000, new Date(end).toISOString())); // sets peak
  // A too-short-span page (below MIN_SPAN_MS) shouldn't count as quiet or reset anything.
  const noisy = d.feed(pageOf(10, 60_000, new Date(end - 3600_000).toISOString()));
  assert.equal(noisy, false);
});
