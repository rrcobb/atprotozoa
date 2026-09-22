import test from "node:test";
import assert from "node:assert/strict";
import { makeZip } from "../public/lib/zip.js";

// Manual ZIP reader — just enough to check the writer's own output, since
// Node has no built-in zip (only gzip/deflate streams).
async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  // find EOCD by scanning back from the end for its signature (no comment
  // written, so it's always the last 22 bytes)
  const eocdOffset = buf.length - 22;
  assert.equal(dv.getUint32(eocdOffset, true), 0x06054b50);
  const count = dv.getUint16(eocdOffset + 10, true);
  const centralStart = dv.getUint32(eocdOffset + 16, true);

  const entries = [];
  let p = centralStart;
  for (let i = 0; i < count; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const crc = dv.getUint32(p + 16, true);
    const compSize = dv.getUint32(p + 20, true);
    const uncompSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));

    // cross-check against the local header + data it points to
    assert.equal(dv.getUint32(localOffset, true), 0x04034b50);
    const localNameLen = dv.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLen;
    const data = buf.subarray(dataStart, dataStart + compSize);

    entries.push({ name, crc, compSize, uncompSize, data });
    p += 46 + nameLen;
  }
  return entries;
}

test("makeZip round-trips file names and bytes", async () => {
  const a = new TextEncoder().encode("hello");
  const b = new TextEncoder().encode("world!!");
  const blob = makeZip([
    { name: "a.txt", data: a },
    { name: "b.txt", data: b },
  ]);
  assert.equal(blob.type, "application/zip");

  const entries = await readZip(blob);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, "a.txt");
  assert.deepEqual([...entries[0].data], [...a]);
  assert.equal(entries[1].name, "b.txt");
  assert.deepEqual([...entries[1].data], [...b]);
});

test("makeZip stores data uncompressed (compSize === uncompSize === length)", () => {
  const data = new Uint8Array(500).fill(7); // repetitive, would shrink under real deflate
  const blob = makeZip([{ name: "x.bin", data }]);
  return readZip(blob).then((entries) => {
    assert.equal(entries[0].compSize, 500);
    assert.equal(entries[0].uncompSize, 500);
  });
});

test("makeZip produces the standard CRC-32 test vector for \"123456789\"", async () => {
  const data = new TextEncoder().encode("123456789");
  const blob = makeZip([{ name: "t", data }]);
  const entries = await readZip(blob);
  assert.equal(entries[0].crc, 0xcbf43926);
});

test("makeZip handles an empty entry list", async () => {
  const blob = makeZip([]);
  const entries = await readZip(blob);
  assert.equal(entries.length, 0);
});
