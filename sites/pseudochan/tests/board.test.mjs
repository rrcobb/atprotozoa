import test from "node:test";
import assert from "node:assert/strict";
import { tidToMs, renderBody, posterId, postLabel, buildBoard } from "../public/lib/board.js";

const ALPHA = "234567abcdefghijklmnopqrstuvwxyz";
function msToTid(ms) {
  let v = (BigInt(ms) * 1000n) << 10n;
  let s = "";
  for (let i = 0; i < 13; i++) { s = ALPHA[Number(v & 31n)] + s; v >>= 5n; }
  return s;
}

test("tid round trip", () => {
  const ms = 1727812345678;
  assert.equal(tidToMs(msToTid(ms)), ms);
  assert.equal(tidToMs("self"), null);
});

test("greentext + facets with multibyte text", () => {
  const text = "😀 see example.com\n>be me";
  const start = new TextEncoder().encode("😀 see ").length;
  const facets = [{ index: { byteStart: start, byteEnd: start + 11 }, features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://example.com" }] }];
  const html = renderBody(text, facets);
  assert.match(html, /<a href="https:\/\/example.com"[^>]*>example.com<\/a>/);
  assert.match(html, /<span class="green">&gt;be me<\/span>/);
});

test("html is escaped, javascript: links dropped", () => {
  const html = renderBody("<b>x</b>", [{ index: { byteStart: 0, byteEnd: 3 }, features: [{ $type: "app.bsky.richtext.facet#link", uri: "javascript:alert(1)" }] }]);
  assert.ok(!html.includes("<b>"));
  assert.ok(!html.includes("href"));
});

test("poster id stable, labels swap", () => {
  assert.deepEqual(posterId("did:plc:abc"), posterId("did:plc:abc"));
  const p = { uri: "at://did:plc:abc/app.bsky.feed.post/" + msToTid(1727812345678), did: "did:plc:abc", rkey: msToTid(1727812345678), seq: 7 };
  assert.equal(postLabel(p, "no"), "1727812345678");
  assert.equal(postLabel(p, "seq"), "7");
  assert.equal(postLabel(p, "rkey"), p.rkey);
  assert.equal(postLabel(p, "did"), "did:plc:abc");
});

test("threads group own replies and bump", () => {
  const mk = (n, createdAt, root) => ({ uri: `at://d/app.bsky.feed.post/${n}`, did: "d", rkey: n, createdAt, root: root ? `at://d/app.bsky.feed.post/${root}` : null });
  const b = buildBoard({}, [mk("c", "2024-03", "a"), mk("a", "2024-01"), mk("x", "2024-02", "zzz")]);
  assert.equal(b.threads.length, 2);
  const t = b.threads.find((t) => t.op.rkey === "a");
  assert.equal(t.replies.length, 1);
  assert.equal(t.bump, "2024-03");
  assert.ok(b.threads.find((t) => t.foreign));
});
