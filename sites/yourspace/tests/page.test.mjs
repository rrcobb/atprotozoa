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

// The lexicon JSON is the contract: a record we write must validate against it.
import { readFileSync } from "node:fs";
import { toRecord, PAGE_COLLECTION, WIDGET_COLLECTION } from "../public/lib/page.js";
const lex = (id) => JSON.parse(readFileSync(new URL(`../public/lexicons/${id}.json`, import.meta.url))).defs.main.record;

function check(schema, rec) {
  const errs = [];
  for (const k of schema.required || []) if (!(k in rec)) errs.push(`missing ${k}`);
  for (const [k, v] of Object.entries(rec)) {
    if (k === "$type") continue;
    const d = schema.properties[k];
    if (!d) { errs.push(`unknown field ${k}`); continue; }
    const bad = (m) => errs.push(`${k}: ${m}`);
    if (d.type === "string") {
      if (typeof v !== "string") bad("not a string");
      else {
        if (d.maxLength && Buffer.byteLength(v) > d.maxLength) bad("too long");
        if (d.knownValues && !d.knownValues.includes(v) && v !== "") bad("unknown value");
      }
    } else if (d.type === "integer") {
      if (!Number.isInteger(v) || v < (d.minimum ?? -Infinity) || v > (d.maximum ?? Infinity)) bad("bad integer");
    } else if (d.type === "boolean") { if (typeof v !== "boolean") bad("not boolean"); }
    else if (d.type === "array") {
      if (!Array.isArray(v) || v.length > (d.maxLength ?? Infinity)) bad("bad array");
      else for (const x of v) if (typeof x !== "string" || (d.items.maxLength && x.length > d.items.maxLength)) bad("bad item");
    }
  }
  return errs;
}

test("a saved page record validates against the page lexicon", () => {
  const rec = toRecord({ preset: "emo", panelAlpha: 0.92, friends: ["a.bsky.social"], pinned: ["at://did:plc:x/app.bsky.feed.post/3a"], css: "a{color:red}" });
  assert.equal(rec.$type, PAGE_COLLECTION);
  assert.equal(rec.panelAlpha, 92);
  assert.deepEqual(check(lex(PAGE_COLLECTION), rec), []);
  assert.deepEqual(check(lex(PAGE_COLLECTION), toRecord({})), []);
});

test("panelAlpha reads integer percents and legacy fractions", () => {
  assert.equal(normalizePage({ panelAlpha: 40 }).panelAlpha, 0.4);
  assert.equal(normalizePage({ panelAlpha: 0.4 }).panelAlpha, 0.4);
});

test("widget lexicon requires what the publisher writes", () => {
  assert.deepEqual(lex(WIDGET_COLLECTION).required, ["name", "embedUrl", "createdAt"]);
});
