import test from "node:test";
import assert from "node:assert";
import { World, makeSword, duel, L } from "../public/lib/world.js";
import { runCommand } from "../public/lib/commands.js";
import { builtins } from "../public/lib/plugins.js";

const A = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa", B = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const post = (did, text) => ({ did, kind: "commit", commit: { operation: "create", collection: "app.bsky.feed.post", record: { text } } });

test("swords are deterministic per DID", () => {
  assert.deepStrictEqual(makeSword(A), makeSword(A));
  assert.notDeepStrictEqual(makeSword(A), makeSword(B));
});

test("duel gives the same winner whichever way round it is asked", () => {
  const w = new World();
  const a = w.ent(A), b = w.ent(B);
  assert.strictEqual(duel(a, b).winner, duel(b, a).winner);
});

test("ingest builds buildings, signs, and credit for likes", () => {
  const w = new World();
  for (const p of builtins) w.use(p);
  w.ingest(post(A, "hello   street"));
  w.ingest({ did: B, kind: "commit", commit: { operation: "create", collection: "app.bsky.feed.like", record: { subject: { uri: `at://${A}/app.bsky.feed.post/x` } } } });
  w.ingest({ did: B, kind: "commit", commit: { operation: "create", collection: "app.bsky.graph.follow", record: { subject: A } } });
  const a = w.ents.get(A);
  assert.strictEqual(a.signs[0].text, "hello street");
  assert.strictEqual(a.given, 1);
  assert.ok(a.x >= 0 && a.x < L);
  assert.deepStrictEqual(w.counts, { post: 1, like: 1, repost: 0, follow: 1 });
  assert.strictEqual(builtins.find((p) => p.id === "bridges").arcs.length, 1);
});

test("a crashing plugin is switched off, not fatal", () => {
  const w = new World();
  w.use({ id: "bad", onEvent() { throw new Error("boom"); } });
  w.ingest(post(A, "x"));
  assert.strictEqual(w.plugins.get("bad").enabled, false);
});

test("terminal commands run against the world", async () => {
  const w = new World();
  for (const p of builtins) w.use(p);
  w.ingest(post(A, "first"));
  w.ingest(post(B, "second"));
  assert.match((await runCommand(w, "who")).join("\n"), /posts|p /);
  assert.match((await runCommand(w, "duel " + A + " " + B)).join("\n"), /wins/);
  assert.match((await runCommand(w, "sword " + A)).join("\n"), /forged from/);
  assert.match((await runCommand(w, "nonsense"))[0], /unknown command/);
  await runCommand(w, "disable katana");
  assert.match((await runCommand(w, "duel x"))[0], /unknown command/);
});
