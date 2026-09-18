// Tests for the browser session — the cookie that logs someone into the web UI
// at /lists, where they can take people off their lists.
//
// These mirror the helpers in src/store.ts rather than importing them (that's
// .ts and uses Workers globals), same as tests/crypto.test.mjs.
//
// What they're guarding: the cookie is the ONLY thing that says which repo the
// UI may edit. The design keeps nothing but a random token in it, so the risk
// isn't forgery, it's a lookup that accepts something it shouldn't — a token
// that doesn't match the expected shape must never reach KV, and an unknown
// token must read as "not logged in" rather than as anybody.
import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto as crypto } from "node:crypto";

const COOKIE_NAME = "listbot_session";
const TOKEN_RE = /^[0-9a-f]{64}$/;

// --- mirrors of src/store.ts -------------------------------------------------

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

// A KV stand-in that records every key it was asked for, so a test can assert
// the shape guard ran BEFORE the lookup rather than after.
function fakeKv(entries = {}) {
  return {
    reads: [],
    async get(key) {
      this.reads.push(key);
      return entries[key] ?? null;
    },
  };
}

async function browserSessionDid(kv, token) {
  if (!token) return null;
  if (!TOKEN_RE.test(token)) return null;
  return (await kv.get("browser:" + token)) ?? null;
}

// --- the token ---------------------------------------------------------------

test("a token is 256 bits of hex", () => {
  const t = newToken();
  assert.match(t, TOKEN_RE);
  assert.equal(t.length, 64);
});

test("tokens don't repeat", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(newToken());
  assert.equal(seen.size, 200);
});

// --- the lookup --------------------------------------------------------------

test("a known token resolves to its DID", async () => {
  const token = newToken();
  const kv = fakeKv({ ["browser:" + token]: "did:plc:alice" });
  assert.equal(await browserSessionDid(kv, token), "did:plc:alice");
});

test("an unknown token is not logged in, not an error", async () => {
  const kv = fakeKv({});
  assert.equal(await browserSessionDid(kv, newToken()), null);
});

test("no cookie at all is not logged in", async () => {
  const kv = fakeKv({});
  assert.equal(await browserSessionDid(kv, null), null);
});

// The load-bearing one. Anything not matching the token shape must be refused
// without touching KV, so a crafted cookie can't be used to probe or to build a
// key of its own choosing.
test("a malformed token never reaches KV", async () => {
  const kv = fakeKv({});
  const bad = [
    "",
    "short",
    "../../session:did:plc:alice",
    "browser:" + "a".repeat(64),
    "A".repeat(64), // uppercase hex: not what we mint
    "g".repeat(64), // not hex at all
    "a".repeat(63),
    "a".repeat(65),
    "a".repeat(64) + "\n",
  ];
  for (const t of bad) {
    assert.equal(await browserSessionDid(kv, t), null, `should refuse ${JSON.stringify(t)}`);
  }
  assert.deepEqual(kv.reads, [], "no malformed token should have hit KV");
});

// --- cookie parsing ----------------------------------------------------------

test("the session cookie is read out of a crowded header", () => {
  const token = newToken();
  const header = `other=1; ${COOKIE_NAME}=${token}; another=xyz`;
  assert.equal(readCookie(header, COOKIE_NAME), token);
});

test("a cookie whose name merely contains ours isn't mistaken for it", () => {
  const header = `not_${COOKIE_NAME}=abc; ${COOKIE_NAME}_old=def`;
  assert.equal(readCookie(header, COOKIE_NAME), null);
});

test("no cookie header reads as absent", () => {
  assert.equal(readCookie(null, COOKIE_NAME), null);
  assert.equal(readCookie("", COOKIE_NAME), null);
});

// --- the cookie's own attributes ---------------------------------------------

const cookieFor = (t) =>
  `${COOKIE_NAME}=${t}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`;

test("the cookie is HttpOnly, Secure, and SameSite=Lax", () => {
  const c = cookieFor(newToken());
  assert.match(c, /HttpOnly/);
  assert.match(c, /Secure/);
  // Lax, not Strict: the OAuth callback is a cross-site redirect back into this
  // origin, and Strict would drop the cookie on exactly that hop. Lax still
  // stops another origin driving a state-changing POST.
  assert.match(c, /SameSite=Lax/);
});

test("the cookie carries the token and nothing else", () => {
  const token = newToken();
  const c = cookieFor(token);
  // No DID, no handle, no tokens — a forged cookie can't name a repo to edit.
  assert.equal(readCookie(c.split(";")[0], COOKIE_NAME), token);
  assert.ok(!/did:/.test(c));
});

test("clearing the cookie expires it immediately", () => {
  const c = `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
  assert.match(c, /Max-Age=0/);
  assert.equal(readCookie(c.split(";")[0], COOKIE_NAME), "");
});
