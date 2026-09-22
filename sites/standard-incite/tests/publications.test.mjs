// Regression coverage for the three bugs @schlage.town reported on
// 2026-09-22: never-posted publications shouldn't be included, "last post"
// has to be tracked per publication (not one date for the whole mutual),
// and it has to actually be the newest document, not whichever one a
// listRecords page happens to return first. Mocks fetch so it runs without
// a browser or a real PDS.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scanForPublications } from "../public/lib/publications.js";

const DID = "did:plc:abc123";
const PDS = "https://pds.example";
const PUB1_URI = `at://${DID}/site.standard.publication/pub1`;
const PUB2_URI = `at://${DID}/site.standard.publication/pub2`;

function jsonRes(body) {
  return { ok: true, json: async () => body };
}

const originalFetch = global.fetch;

test("scanForPublications drops pubs that never posted, and picks the newest document per pub", async (t) => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u === `https://plc.directory/${DID}`) {
      return jsonRes({
        service: [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: PDS }],
      });
    }
    if (u.includes("com.atproto.repo.listRecords") && u.includes("collection=site.standard.publication")) {
      return jsonRes({
        records: [
          { uri: PUB1_URI, cid: "1", value: { name: "Pub One", url: "https://pub1.example/" } },
          { uri: PUB2_URI, cid: "2", value: { name: "Pub Two (never posted)", url: "https://pub2.example/" } },
        ],
      });
    }
    if (u.includes("com.atproto.repo.listRecords") && u.includes("collection=site.standard.document")) {
      // Deliberately oldest-first, so a naive "take the first record" would
      // pick the wrong one — the grouping logic must compare dates, not
      // trust array order.
      return jsonRes({
        records: [
          {
            uri: `at://${DID}/site.standard.document/old`,
            cid: "3",
            value: { site: PUB1_URI, publishedAt: "2020-01-01T00:00:00.000Z" },
          },
          {
            uri: `at://${DID}/site.standard.document/new`,
            cid: "4",
            value: { site: PUB1_URI, publishedAt: "2026-06-01T00:00:00.000Z" },
          },
        ],
      });
      // pub2 has no matching documents at all — it must be filtered out.
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
  t.after(() => { global.fetch = originalFetch; });

  const found = await scanForPublications([{ did: DID, handle: "moot.bsky.social" }]);

  assert.equal(found.length, 1);
  const mutual = found[0];

  assert.equal(mutual.publications.length, 1, "never-posted pub should be dropped");
  assert.equal(mutual.publications[0].name, "Pub One");
  assert.equal(mutual.publications[0].lastPublishedAt, "2026-06-01T00:00:00.000Z", "must pick the newest doc, not the first one in the page");
  assert.equal(mutual.lastPublishedAt, "2026-06-01T00:00:00.000Z");
});

test("scanForPublications returns nothing for a mutual whose only publication never posted", async (t) => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u === `https://plc.directory/${DID}`) {
      return jsonRes({
        service: [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: PDS }],
      });
    }
    if (u.includes("collection=site.standard.publication")) {
      return jsonRes({
        records: [{ uri: PUB1_URI, cid: "1", value: { name: "Empty Pub", url: "https://pub1.example/" } }],
      });
    }
    if (u.includes("collection=site.standard.document")) {
      return jsonRes({ records: [] });
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
  t.after(() => { global.fetch = originalFetch; });

  const found = await scanForPublications([{ did: DID, handle: "quiet.bsky.social" }]);
  assert.equal(found.length, 0);
});
