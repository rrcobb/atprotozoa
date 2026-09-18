// Reading what a tag is actually pointing at.
//
// Rob quoted a post by @colin-fraser.net about OpenAI news and tagged
// "@listbot can you add colin to the ai news list". The bot replied "which
// colin? you don't follow anyone by that name and there's no thread to go on" —
// which was TRUE of what it could see. The quoted post was invisible.
//
// Two things were missing and both mattered. The quoted AUTHOR is usually who
// to add. The quoted TEXT is usually how you tell which list — a post about
// OpenAI is why "the ai news list" was the right target.
//
// The trap underneath: embeds are only on the HYDRATED view, never on the raw
// record. A notification carries the raw record, where an
// app.bsky.embed.record is just a uri and a cid — no author, no text. So a
// quote has to be fetched. buildthis documents the same thing at its own
// getPostThread call.
import { test } from "node:test";
import assert from "node:assert/strict";

// --- mirrors of src/index.ts -------------------------------------------------

function quotedUri(rec) {
  const embed = rec.embed;
  if (!embed?.$type?.startsWith("app.bsky.embed.record")) return undefined;
  return embed.record?.record?.uri ?? embed.record?.uri;
}

function describeEmbed(embed, depth = 0) {
  if (!embed || depth > 1) return [];
  const t = embed.$type ?? "";
  const out = [];
  if (t.startsWith("app.bsky.embed.images")) {
    for (const img of embed.images ?? []) {
      const alt = (img.alt ?? "").trim();
      out.push(alt ? `[image, alt text: ${alt}]` : `[image, no alt text]`);
    }
  } else if (t.startsWith("app.bsky.embed.video")) {
    const alt = (embed.alt ?? "").trim();
    out.push(alt ? `[video, alt text: ${alt}]` : `[video, no alt text]`);
  } else if (t.startsWith("app.bsky.embed.external")) {
    const e = embed.external;
    if (e?.uri) {
      const bits = [e.title, e.description].map((x) => (x ?? "").trim()).filter(Boolean);
      out.push(`[link: ${e.uri}${bits.length ? ` — ${bits.join(" — ")}` : ""}]`);
    }
  } else if (t.startsWith("app.bsky.embed.record")) {
    const rec = embed.record?.record ?? embed.record;
    const handle = rec?.author?.handle;
    const text = (rec?.value?.text ?? "").trim();
    if (handle || text) out.push(`[quoting @${handle ?? "someone"}: ${text}]`);
    out.push(...describeEmbed(embed.media, depth + 1));
  }
  return out;
}

// --- the real case -----------------------------------------------------------

const REAL_RAW_EMBED = {
  $type: "app.bsky.embed.record",
  record: {
    cid: "bafyreiexy4mqezmvrxvihvitcd6y4x3zfto3hl7qsb2sqwyev3ult3akee",
    uri: "at://did:plc:6rdthm3ihpqfd7vn2q2ktjrz/app.bsky.feed.post/3mvrhbjh6kk2z",
  },
};

test("a quote's uri is found on the raw record a notification carries", () => {
  const uri = quotedUri({ text: "can you add colin to the ai news list", embed: REAL_RAW_EMBED });
  assert.equal(uri, "at://did:plc:6rdthm3ihpqfd7vn2q2ktjrz/app.bsky.feed.post/3mvrhbjh6kk2z");
});

test("the raw embed carries no author and no text — hence the fetch", () => {
  // This is the whole reason quotedPost exists. If this ever stops being true,
  // the fetch can go.
  assert.equal(REAL_RAW_EMBED.record.author, undefined);
  assert.equal(REAL_RAW_EMBED.record.value, undefined);
});

test("a post with no embed yields no quoted uri", () => {
  assert.equal(quotedUri({ text: "just a tag" }), undefined);
});

test("an images embed is not mistaken for a quote", () => {
  const rec = { text: "x", embed: { $type: "app.bsky.embed.images", images: [{ alt: "a" }] } };
  assert.equal(quotedUri(rec), undefined);
});

test("recordWithMedia — a quote that also has an image — still yields the quote", () => {
  const rec = {
    text: "x",
    embed: {
      $type: "app.bsky.embed.recordWithMedia",
      record: { record: { uri: "at://did:plc:someone/app.bsky.feed.post/abc" } },
    },
  };
  assert.equal(quotedUri(rec), "at://did:plc:someone/app.bsky.feed.post/abc");
});

// --- describing what a reader sees -------------------------------------------

test("an image's alt text reaches the agent", () => {
  const out = describeEmbed({
    $type: "app.bsky.embed.images#view",
    images: [{ alt: "a chart of model releases" }],
  });
  assert.deepEqual(out, ["[image, alt text: a chart of model releases]"]);
});

test("an image with no alt text still says there's an image", () => {
  // "add whoever posted the chart" needs to know a chart exists even when
  // nobody wrote alt text.
  const out = describeEmbed({ $type: "app.bsky.embed.images#view", images: [{}] });
  assert.deepEqual(out, ["[image, no alt text]"]);
});

test("a link card comes through with its title", () => {
  const out = describeEmbed({
    $type: "app.bsky.embed.external#view",
    external: { uri: "https://example.com/x", title: "Big News", description: "about ai" },
  });
  assert.equal(out[0], "[link: https://example.com/x — Big News — about ai]");
});

test("a quoted post is rendered with its author and words", () => {
  const out = describeEmbed({
    $type: "app.bsky.embed.record#view",
    record: { author: { handle: "colin-fraser.net" }, value: { text: "OpenAI is cooking" } },
  });
  assert.equal(out[0], "[quoting @colin-fraser.net: OpenAI is cooking]");
});

test("nesting stops rather than recursing forever", () => {
  // A quote of a quote of a quote. depth > 1 bails.
  const deep = {
    $type: "app.bsky.embed.recordWithMedia#view",
    record: { author: { handle: "a" }, value: { text: "one" } },
    media: {
      $type: "app.bsky.embed.recordWithMedia#view",
      record: { author: { handle: "b" }, value: { text: "two" } },
      media: {
        $type: "app.bsky.embed.record#view",
        record: { author: { handle: "c" }, value: { text: "three" } },
      },
    },
  };
  const out = describeEmbed(deep);
  assert.ok(out.length <= 3, `recursed too far: ${out.length}`);
  assert.ok(!out.some((l) => l.includes("@c")), "should have stopped before the third level");
});

test("an unknown embed type is ignored rather than throwing", () => {
  assert.deepEqual(describeEmbed({ $type: "app.bsky.embed.somethingnew" }), []);
  assert.deepEqual(describeEmbed(undefined), []);
});
