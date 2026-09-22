import { test } from "node:test";
import assert from "node:assert/strict";
import { fmt, barScale, severityClass, truncate, escapeHtml } from "../public/lib/format.js";

test("fmt", () => {
  assert.equal(fmt(null), "—");
  assert.equal(fmt(undefined), "");
  assert.equal(fmt(1234567), "1,234,567");
  assert.equal(fmt(0), "0");
});

test("barScale linear", () => {
  assert.equal(barScale(50, 100, false), 50);
  assert.equal(barScale(0, 100, false), 0);
  assert.equal(barScale(1, 1000, false), 2); // non-zero floor so a tiny bar stays visible
  assert.equal(barScale(undefined, 100, false), 0);
});

test("barScale log", () => {
  assert.equal(barScale(0, 10000, true), 0);
  assert.equal(barScale(10000, 10000, true), 100);
  assert.ok(barScale(1, 10000, true) >= 2); // non-zero floor still applies on the log branch
  assert.ok(barScale(100, 10000, true) < barScale(1000, 10000, true));
});

test("severityClass reads v3.1 first, falls back down the chain", () => {
  assert.equal(
    severityClass({ metrics: { cvssMetricV31: [{ cvssData: { baseSeverity: "HIGH" } }] } }),
    "high"
  );
  assert.equal(
    severityClass({ metrics: { cvssMetricV2: [{ baseSeverity: "MEDIUM" }] } }),
    "medium"
  );
  assert.equal(severityClass({ metrics: {} }), "unknown");
  assert.equal(severityClass(undefined), "unknown");
});

test("truncate", () => {
  assert.equal(truncate("short", 10), "short");
  assert.equal(truncate("this is a long description", 10), "this is a…");
});

test("escapeHtml", () => {
  assert.equal(escapeHtml(`<script>alert("hi")</script>`), "&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt;");
});
