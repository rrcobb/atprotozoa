// Tests for the gift-link detection that underwrites the label. This is the
// part where being wrong lands a public claim on someone else's post, so the
// negative cases matter at least as much as the positive ones.

import { test } from "node:test";
import assert from "node:assert";
import { detectGiftSource, detectInPost, postLinkUrls } from "../src/giftdetect.ts";

test("nyt unlocked_article_code is a gift link", () => {
  const s = detectGiftSource("https://www.nytimes.com/2026/01/01/x.html?unlocked_article_code=abc123");
  assert.equal(s?.key, "nyt");
});

test("a plain nyt article is not", () => {
  assert.equal(detectGiftSource("https://www.nytimes.com/2026/01/01/x.html"), null);
});

test("wsj st param is a gift link", () => {
  assert.equal(detectGiftSource("https://www.wsj.com/articles/x?st=abc")?.key, "wsj");
});

test("wapo.st is a gift link on host alone", () => {
  assert.equal(detectGiftSource("https://wapo.st/3abcdef")?.key, "wapo");
});

test("washingtonpost.com without a token is not", () => {
  assert.equal(detectGiftSource("https://www.washingtonpost.com/x/"), null);
});

test("a gift-ish param counts on a listed publisher", () => {
  assert.equal(detectGiftSource("https://www.theatlantic.com/x/?gift=abc")?.key, "atlantic");
  assert.equal(detectGiftSource("https://www.ft.com/content/x?shareToken=gift-abc")?.key, "ft");
});

test("a gift param on an unlisted host is ignored", () => {
  assert.equal(detectGiftSource("https://example.com/x?gift=abc"), null);
});

test("a lookalike domain does not match", () => {
  assert.equal(detectGiftSource("https://notnytimes.com/x?unlocked_article_code=abc"), null);
  assert.equal(detectGiftSource("https://nytimes.com.evil.example/x?unlocked_article_code=abc"), null);
});

test("a subdomain of a listed host does match", () => {
  assert.equal(detectGiftSource("https://cooking.nytimes.com/x?unlocked_article_code=abc")?.key, "nyt");
});

test("non-http schemes are rejected", () => {
  assert.equal(detectGiftSource("javascript:alert(1)?gift=1"), null);
  assert.equal(detectGiftSource("not a url at all"), null);
});

test("a link facet is read, not just the embed card", () => {
  const record = {
    text: "here you go",
    facets: [
      {
        features: [
          { $type: "app.bsky.richtext.facet#link", uri: "https://www.nytimes.com/x?unlocked_article_code=abc" },
        ],
      },
    ],
  };
  assert.equal(detectInPost(record)?.key, "nyt");
});

test("an external embed card is read", () => {
  const record = {
    embed: { $type: "app.bsky.embed.external", external: { uri: "https://wapo.st/3abc" } },
  };
  assert.equal(detectInPost(record)?.key, "wapo");
});

test("recordWithMedia external embeds are read", () => {
  const record = {
    embed: {
      $type: "app.bsky.embed.recordWithMedia",
      media: { $type: "app.bsky.embed.external", external: { uri: "https://wapo.st/3abc" } },
    },
  };
  assert.equal(detectInPost(record)?.key, "wapo");
});

test("a post with no links detects nothing", () => {
  assert.equal(detectInPost({ text: "hello" }), null);
  assert.equal(detectInPost(null), null);
  assert.equal(detectInPost({ facets: [{}] }), null);
});

test("mention facets are not treated as links", () => {
  const record = {
    facets: [{ features: [{ $type: "app.bsky.richtext.facet#mention", did: "did:plc:x" }] }],
  };
  assert.deepEqual(postLinkUrls(record), []);
});
