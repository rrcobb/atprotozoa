// Tests for the crypto listbot's whole security story rests on. These mirror
// src/oauth.ts and src/store.ts rather than importing them (those are .ts and
// use Workers globals), so the shapes are asserted here and any edit to either
// file has to be made in both places deliberately.
//
// What they're guarding, concretely:
//   - a client assertion that doesn't verify under the published /jwks.json
//     means nobody can sign in, and the failure surfaces as an opaque 401 from
//     someone else's PDS;
//   - a DPoP proof whose embedded jwk isn't the signing key is rejected the
//     same opaque way;
//   - the session encryption is the ONLY thing standing between a KV dump and
//     every user's refresh token (notes/11: KV is not an auth boundary).
import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto as crypto } from "node:crypto";

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const b64urlToBytes = (s) => new Uint8Array(Buffer.from(s, "base64url"));
const jwtPart = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

async function signES256(key, header, payload) {
  const input = `${jwtPart(header)}.${jwtPart(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

async function verifyJwt(jwt, publicKey) {
  const [h, p, s] = jwt.split(".");
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
}

async function freshClientKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const pkcs8 = b64url(new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)));
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  // Exactly what audit/listbot-keygen.mjs prints and wrangler.toml carries.
  return { pkcs8, publishedJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } };
}

test("a client assertion signed by the imported key verifies under the published jwks", async () => {
  const { pkcs8, publishedJwk } = await freshClientKey();

  // Imported non-extractable from base64url PKCS#8, as importClientKeys does.
  const signing = await crypto.subtle.importKey(
    "pkcs8",
    b64urlToBytes(pkcs8),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signES256(
    signing,
    { alg: "ES256", kid: "listbot-client-1", typ: "JWT" },
    {
      iss: "https://listbot.bisks.net/client-metadata.json",
      sub: "https://listbot.bisks.net/client-metadata.json",
      aud: "https://bsky.social",
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 60,
    },
  );

  // What a PDS does after fetching /jwks.json.
  const verifying = await crypto.subtle.importKey(
    "jwk",
    { ...publishedJwk, use: "sig", alg: "ES256" },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  assert.equal(await verifyJwt(assertion, verifying), true);

  // And a tampered one must not.
  const [header, , sig] = assertion.split(".");
  const forged = jwtPart({
    iss: "https://evil.example/client-metadata.json",
    aud: "https://bsky.social",
    iat: now,
    exp: now + 60,
  });
  assert.equal(await verifyJwt(`${header}.${forged}.${sig}`, verifying), false);
});

test("a DPoP proof verifies under the jwk embedded in its own header", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const proofJwk = { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y };

  const proof = await signES256(
    pair.privateKey,
    { alg: "ES256", typ: "dpop+jwt", jwk: proofJwk },
    {
      jti: crypto.randomUUID(),
      htm: "POST",
      htu: "https://bsky.social/xrpc/com.atproto.repo.createRecord",
      iat: Math.floor(Date.now() / 1000),
    },
  );

  const header = JSON.parse(Buffer.from(proof.split(".")[0], "base64url").toString());
  const embedded = await crypto.subtle.importKey(
    "jwk",
    header.jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  assert.equal(await verifyJwt(proof, embedded), true);
});

// generateDpopKey deliberately rebuilds the jwk from four members rather than
// passing the exported one through: `key_ops` and `ext` ride along on a
// WebCrypto export, and some PDSes reject a proof whose jwk carries them.
test("the DPoP jwk carries only the four thumbprint members", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const trimmed = { kty: exported.kty, crv: exported.crv, x: exported.x, y: exported.y };
  assert.deepEqual(Object.keys(trimmed).sort(), ["crv", "kty", "x", "y"]);
  // The raw export really does carry extras, which is why the trim exists.
  assert.ok(Object.keys(exported).length > 4);
});

test("htu drops query and fragment", () => {
  const htu = (url) => url.split("?")[0].split("#")[0];
  assert.equal(htu("https://bsky.social/xrpc/foo?a=1#frag"), "https://bsky.social/xrpc/foo");
  assert.equal(htu("https://bsky.social/xrpc/foo"), "https://bsky.social/xrpc/foo");
});

// --- session encryption (src/store.ts) --------------------------------------

async function aesKey(secret) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(secret, text) {
  const key = await aesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return Buffer.from(out).toString("base64");
}

async function decrypt(secret, encoded) {
  const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
  const key = await aesKey(secret);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12),
  );
  return new TextDecoder().decode(plain);
}

const SECRET = "a-worker-secret";
const SESSION = JSON.stringify({ refreshToken: "refresh-abc", did: "did:plc:example" });

test("a stored session round-trips", async () => {
  assert.equal(await decrypt(SECRET, await encrypt(SECRET, SESSION)), SESSION);
});

test("the stored blob does not contain the refresh token", async () => {
  const blob = await encrypt(SECRET, SESSION);
  assert.ok(!blob.includes("refresh-abc"));
  // Nor after base64-decoding it — the whole point is that a KV dump is inert.
  assert.ok(!Buffer.from(blob, "base64").toString("latin1").includes("refresh-abc"));
});

test("the wrong key cannot decrypt, so a KV dump alone is useless", async () => {
  const blob = await encrypt(SECRET, SESSION);
  await assert.rejects(() => decrypt("the-wrong-secret", blob));
});

// GCM fails catastrophically on IV reuse, so a fresh 12 random bytes per write
// is load-bearing, not decoration.
test("the same session encrypts differently every time", async () => {
  const a = await encrypt(SECRET, SESSION);
  const b = await encrypt(SECRET, SESSION);
  assert.notEqual(a, b);
  assert.notEqual(a.slice(0, 16), b.slice(0, 16));
});

test("a tampered ciphertext is rejected rather than decrypting to garbage", async () => {
  const blob = await encrypt(SECRET, SESSION);
  const bytes = new Uint8Array(Buffer.from(blob, "base64"));
  bytes[bytes.length - 1] ^= 0xff;
  await assert.rejects(() => decrypt(SECRET, Buffer.from(bytes).toString("base64")));
});
