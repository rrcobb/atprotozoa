// Unit tests for public/lib/mnemonic.js's describePair — the rule-based
// logic that decides which visual trait (color, then brightness, then
// saturation, then highlight position, then just the names) is worth
// telling a human about for a given pair of avatars.
import { test } from "node:test";
import assert from "node:assert/strict";
import { describePair, posterHint, buildContentFact, toThirdPerson } from "../public/lib/mnemonic.js";

const person = (handle) => ({ handle, displayName: handle });
const feat = (h, s, l, quadrants = [128, 128, 128, 128]) => ({ hsl: { h, s, l }, quadrants });

test("leads with color when the two avatars are in different color families", () => {
  const a = person("alice"), b = person("bob");
  const red = feat(0, 70, 50);
  const blue = feat(220, 70, 50);
  const { mnemonic, lineA, lineB } = describePair(a, b, red, blue, 4);
  assert.match(lineA, /red/);
  assert.match(lineB, /blue/);
  assert.match(mnemonic, /alice/);
  assert.match(mnemonic, /bob/);
});

test("falls back to brightness when both avatars are the same color family", () => {
  const a = person("alice"), b = person("bob");
  const dark = feat(220, 70, 20);
  const bright = feat(220, 70, 78);
  const { mnemonic } = describePair(a, b, dark, bright, 4);
  assert.match(mnemonic, /dark|bright/);
});

test("falls all the way back to alphabetical names when nothing visual differs", () => {
  const a = person("zeta"), b = person("alpha");
  const same = feat(220, 40, 50);
  const { mnemonic } = describePair(a, b, same, same, 4);
  assert.match(mnemonic, /alpha before zeta/);
});

test("pct reflects the Hamming distance out of 64 bits", () => {
  const a = person("alice"), b = person("bob");
  const red = feat(0, 70, 50);
  const blue = feat(220, 70, 50);
  const { pct } = describePair(a, b, red, blue, 0);
  assert.equal(pct, 100);
  const { pct: pctHalf } = describePair(a, b, red, blue, 32);
  assert.equal(pctHalf, 50);
});

test("posterNote is null with no enriched profile data", () => {
  const a = person("alice"), b = person("bob");
  const red = feat(0, 70, 50);
  const blue = feat(220, 70, 50);
  const { posterNote } = describePair(a, b, red, blue, 4);
  assert.equal(posterNote, null);
});

test("posterHint prefers differing bios over anything else", () => {
  const a = { handle: "alice.bsky.social", description: "photographer in nyc" };
  const b = { handle: "bob.bsky.social", description: "software engineer" };
  const hint = posterHint(a, b);
  assert.match(hint, /photographer in nyc/);
  assert.match(hint, /software engineer/);
});

test("posterHint flags when only one side has a bio", () => {
  const a = { handle: "alice.bsky.social", description: "photographer" };
  const b = { handle: "bob.bsky.social", description: "" };
  const hint = posterHint(a, b);
  assert.match(hint, /only @alice\.bsky\.social/);
});

test("posterHint falls back to account age when bios don't help", () => {
  const a = { handle: "alice.bsky.social", createdAt: "2023-01-01T00:00:00Z" };
  const b = { handle: "bob.bsky.social", createdAt: "2024-06-01T00:00:00Z" };
  const hint = posterHint(a, b);
  assert.match(hint, /2023/);
  assert.match(hint, /2024/);
});

test("posterHint falls back to handle domain when nothing else differs", () => {
  const a = { handle: "alice.bsky.social" };
  const b = { handle: "bob.example.com" };
  const hint = posterHint(a, b);
  assert.match(hint, /bsky\.social/);
  assert.match(hint, /custom domain/);
});

test("posterHint returns null when there's genuinely nothing to add", () => {
  const a = { handle: "alice.bsky.social" };
  const b = { handle: "bob.bsky.social" };
  assert.equal(posterHint(a, b), null);
});

test("toThirdPerson rewrites a first-person bio into a fact about the person, pseudo-conjugating the verb", () => {
  assert.equal(toThirdPerson("Kira", "i work on eurosky"), "Kira works on eurosky");
  assert.equal(toThirdPerson("Kira", "i'm the trans catgirl who can't stop buying dgx sparks"), "Kira is the trans catgirl who can't stop buying dgx sparks");
  assert.equal(toThirdPerson("Kira", "my whole timeline is just gpus"), "Kira's whole timeline is just gpus");
});

test("toThirdPerson stitches a bare fragment onto \"<name> is\"", () => {
  assert.equal(toThirdPerson("Bar", "the trans catgirl who cant stop buying dgx sparks"), "Bar is the trans catgirl who cant stop buying dgx sparks");
});

test("toThirdPerson doesn't add an -s to auxiliary/modal verbs", () => {
  assert.equal(toThirdPerson("Kira", "i can't stop thinking about eurosky"), "Kira can't stop thinking about eurosky");
});

test("buildContentFact picks the bio sentence with words the other person never used", () => {
  const kira = { handle: "kira", displayName: "Kira", description: "i work on eurosky." };
  const otherCorpus = "just here posting about cats and coffee, nothing to do with protocols.";
  const fact = buildContentFact(kira, otherCorpus);
  assert.match(fact, /Kira works on eurosky/);
});

test("buildContentFact prefers bio over posts when the two are similarly distinctive", () => {
  const kira = {
    handle: "kira",
    displayName: "Kira",
    description: "i build eurosky in my spare time.",
    posts: ["just had the best sandwich today"],
  };
  const fact = buildContentFact(kira, "cats coffee sandwiches nothing about protocols");
  assert.match(fact, /eurosky/);
});

test("buildContentFact lets a post win over the bio when it's genuinely more distinctive", () => {
  const kira = {
    handle: "kira",
    displayName: "Kira",
    description: "i build eurosky.",
    posts: ["just had the best sandwich of my entire life today, ten out of ten"],
  };
  const fact = buildContentFact(kira, "cats coffee nothing about protocols");
  assert.match(fact, /sandwich/);
});

test("buildContentFact falls back to a distinctive post when there's no bio", () => {
  const kira = {
    handle: "kira",
    displayName: "Kira",
    description: "",
    posts: ["can't stop buying dgx sparks, it's a problem at this point"],
  };
  const fact = buildContentFact(kira, "just a normal bluesky user talking about weather");
  assert.match(fact, /dgx sparks/);
});

test("buildContentFact returns null when there's no bio/post text to draw from", () => {
  const kira = { handle: "kira", displayName: "Kira" };
  assert.equal(buildContentFact(kira, "whatever"), null);
});

test("buildContentFact returns null when nothing in the text is distinctive from the other person", () => {
  const kira = { handle: "kira", displayName: "Kira", description: "just vibing on bluesky today." };
  // every content word in kira's bio also shows up in the other corpus
  const fact = buildContentFact(kira, "just vibing on bluesky today, same as everyone else honestly.");
  assert.equal(fact, null);
});

test("describePair's mnemonic prefers bio/post content over pfp traits, and always rhymes", () => {
  const a = { handle: "kira.bsky.social", displayName: "Kira", description: "i work on eurosky." };
  const b = { handle: "moss.bsky.social", displayName: "Moss", description: "i'm the trans catgirl who can't stop buying dgx sparks." };
  const red = { hsl: { h: 0, s: 70, l: 50 }, quadrants: [128, 128, 128, 128] };
  const blue = { hsl: { h: 220, s: 70, l: 50 }, quadrants: [128, 128, 128, 128] };
  const { mnemonic } = describePair(a, b, red, blue, 4);
  assert.match(mnemonic, /Kira works on eurosky/);
  assert.match(mnemonic, /Moss is the trans catgirl who can't stop buying dgx sparks/);
  // whatever rhyme pair got picked, both halves land in the mnemonic text
  assert.equal(mnemonic.includes(";"), true);
});

test("describePair's rhyme tag choice is deterministic for the same pair", () => {
  const a = { handle: "kira.bsky.social", displayName: "Kira" };
  const b = { handle: "moss.bsky.social", displayName: "Moss" };
  const feat = { hsl: { h: 220, s: 40, l: 50 }, quadrants: [128, 128, 128, 128] };
  const first = describePair(a, b, feat, feat, 4).mnemonic;
  const second = describePair(a, b, feat, feat, 4).mnemonic;
  assert.equal(first, second);
});
