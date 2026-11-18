import test from "node:test";
import assert from "node:assert/strict";
import { classify, linkSignal, hostOf } from "../public/lib/classify.js";

test("github repo link is software", () => {
  const r = classify({ text: "made a thing", links: ["https://github.com/a/b"] });
  assert.ok(r.isSoftware);
});
test("github homepage isn't", () => {
  assert.equal(linkSignal("https://github.com/"), null);
  assert.equal(linkSignal("https://github.com/sponsors/x"), null);
});
test("i built a game", () => {
  const r = classify({ text: "I just built a tiny puzzle game you can play in the browser", links: [] });
  assert.ok(r.isSoftware);
  assert.ok(r.kinds.includes("game"));
});
test("personal thought is not", () => {
  assert.ok(!classify({ text: "i feel so tired today, can't sleep lol", links: [] }).isSoftware);
});
test("politics is not", () => {
  assert.ok(!classify({ text: "The senate vote on tariffs is a disaster, congress should resign", links: [] }).isSoftware);
});
test("ai debate is not", () => {
  assert.ok(!classify({ text: "AI slop is ruining everything, the ai bubble will pop and llms can't reason", links: [] }).isSoftware);
});
test("itch.io link in a reply still counts", () => {
  const r = classify({ text: "try it here", links: ["https://someone.itch.io/thing"], isReply: true });
  assert.ok(r.isSoftware);
});
test("plain reply without link is not", () => {
  assert.ok(!classify({ text: "yeah I use rust for that too", links: [], isReply: true }).isSoftware);
});
test("hostOf strips www", () => assert.equal(hostOf("https://www.Example.com/x"), "example.com"));
