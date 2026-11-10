import test from "node:test";
import assert from "node:assert/strict";
import { deriveKey, newSalt, seal, open, chunkAad, chunkCount, sealMeta, openMeta, b64, unb64 } from "../public/lib/vault.js";

const iter = 1000; // fast for tests

test("chunk roundtrip", async () => {
  const salt = newSalt();
  const key = await deriveKey("hunter2", salt, iter);
  const data = crypto.getRandomValues(new Uint8Array(5000));
  const sealed = await seal(key, data, chunkAad(0, 1));
  assert.deepEqual(await open(key, sealed, chunkAad(0, 1)), data);
});

test("wrong passphrase fails", async () => {
  const salt = newSalt();
  const k1 = await deriveKey("a", salt, iter);
  const k2 = await deriveKey("b", salt, iter);
  const sealed = await seal(k1, new Uint8Array([1, 2, 3]), "0/1");
  await assert.rejects(open(k2, sealed, "0/1"));
});

test("reordered chunk fails", async () => {
  const key = await deriveKey("a", newSalt(), iter);
  const sealed = await seal(key, new Uint8Array([9]), chunkAad(0, 2));
  await assert.rejects(open(key, sealed, chunkAad(1, 2)));
});

test("meta roundtrip + base64", async () => {
  const key = await deriveKey("a", newSalt(), iter);
  const meta = { name: "ünï.txt", type: "text/plain", size: 3 };
  assert.deepEqual(await openMeta(key, await sealMeta(key, meta)), meta);
  const big = crypto.getRandomValues(new Uint8Array(60000));
  assert.deepEqual(unb64(b64(big)), big);
});

test("chunkCount", () => {
  assert.equal(chunkCount(0), 1);
  assert.equal(chunkCount(50 * 1024 * 1024), 1);
  assert.equal(chunkCount(50 * 1024 * 1024 + 1), 2);
});
