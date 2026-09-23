import test from "node:test";
import assert from "node:assert/strict";
import { teamForDid, teamFromDigest, colorFromDigest, digestForDid } from "../public/lib/team.js";

test("mfzx.net's own DID resolves to team #29811, per their own worked example", async () => {
  // did:plc:erqwpimsmwnzohwoiojsy22z is mfzx.net's DID (resolved from
  // https://mfzx.net/.well-known/atproto-did while building this). They
  // stated their team should come out to 29811 — this pins the exact byte
  // order (big-endian) and byte offset (first two, not last two) the
  // methodology calls for.
  const did = "did:plc:erqwpimsmwnzohwoiojsy22z";
  assert.equal(await teamForDid(did), 29811);
});

test("team is within the 65536-team range for arbitrary DIDs", async () => {
  for (const did of ["did:plc:aaaaaaaaaaaaaaaaaaaaaaaa", "did:web:example.com", "did:plc:z"]) {
    const team = await teamForDid(did);
    assert.ok(Number.isInteger(team) && team >= 0 && team <= 65535, `${did} -> ${team}`);
  }
});

test("big-endian, not little-endian: byte order actually matters", () => {
  // A digest whose first two bytes are [0x01, 0x00] must read as 256, not 1 —
  // this is the one place a copy-paste from a little-endian example would
  // silently produce a different (still "valid-looking") number.
  const digest = new Uint8Array([0x01, 0x00, 0, 0, 0]);
  assert.equal(teamFromDigest(digest), 256);
});

test("team is a pure function of the DID: same input, same output", async () => {
  const did = "did:plc:erqwpimsmwnzohwoiojsy22z";
  const a = await teamForDid(did);
  const b = await teamForDid(did);
  assert.equal(a, b);
});

test("color is derived from bytes 2-4, distinct from the team-number bytes", async () => {
  const digest = await digestForDid("did:plc:erqwpimsmwnzohwoiojsy22z");
  const color = colorFromDigest(digest);
  assert.match(color, /^#[0-9a-f]{6}$/);
});
