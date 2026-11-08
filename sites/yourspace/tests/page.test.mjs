import test from "node:test";
import assert from "node:assert";
import { sanitizeCss, parseTrackRef, parsePostRef, normalizePage, widgetFrame, safeHttps } from "../public/lib/page.js";

test("sanitizeCss strips fetching and breakout constructs", () => {
  const out = sanitizeCss("@import 'x.css'; body{background:url(http://e/x.png)} a{behavior:url(x)} </style><script>");
  assert.ok(!/@import/i.test(out));
  assert.ok(!/url\s*\(/i.test(out));
  assert.ok(!/behavior\s*:/i.test(out));
  assert.ok(!/[<>]/.test(out));
});

test("parseTrackRef", () => {
  assert.deepEqual(parseTrackRef("https://plyr.fm/track/1683"), { id: "1683" });
  assert.deepEqual(parseTrackRef("1683"), { id: "1683" });
  assert.equal(parseTrackRef("nope"), null);
});

test("parsePostRef", () => {
  assert.deepEqual(parsePostRef("https://bsky.app/profile/a.bsky.social/post/3abc"), { actor: "a.bsky.social", rkey: "3abc" });
  assert.deepEqual(parsePostRef("at://did:plc:x/app.bsky.feed.post/3abc"), { actor: "did:plc:x", rkey: "3abc" });
  assert.equal(parsePostRef("hello"), null);
});

test("normalizePage rejects bad colours, non-https images, unknown sections", () => {
  const p = normalizePage({ bg: "red", bgImage: "http://x/y.png", sections: ["about", "evil", "about"], font: "nope" });
  assert.equal(p.bg, "#6d9bd6");
  assert.equal(p.bgImage, "");
  assert.deepEqual(p.sections, ["about"]);
  assert.equal(p.font, "verdana");
});

test("widgetFrame fills placeholders and requires https", () => {
  const f = widgetFrame({ embedUrl: "https://w.example/e?d={did}", height: 5000 }, { did: "did:plc:x", handle: "a.b" });
  assert.equal(f.src, "https://w.example/e?d=did%3Aplc%3Ax");
  assert.equal(f.height, 800);
  assert.equal(widgetFrame({ embedUrl: "http://w.example/" }, {}), null);
  assert.equal(safeHttps("javascript:alert(1)"), "");
});
