#!/usr/bin/env node
//
// Generate a labeler signing keypair, in exactly the encodings the two places
// that consume it want:
//
//   - the PRIVATE half as base64url PKCS#8, which is what
//     `wrangler secret put LABELER_PRIVATE_KEY` takes and what
//     sites/builtbybot/src/index.ts imports with crypto.subtle.importKey.
//   - the PUBLIC half as a did:key multikey string, which is what goes in the
//     labeler account's DID document as the #atproto_label verification
//     method. Without that, nothing can verify a label this key signs.
//
// P-256, not K-256. atproto accepts both (atproto.com/specs/cryptography), and
// P-256 is the one Workers' WebCrypto implements natively — so the Worker signs
// with no crypto dependency at all. Bluesky's own labeler tooling defaults to
// K-256; if you provision through Ozone and it hands you a K-256 key, use that
// key and this script isn't the path — see notes/87-labeler.md.
//
// Usage:
//   node audit/labeler-keygen.mjs            # print a fresh keypair
//   node audit/labeler-keygen.mjs --public-only <base64url-pkcs8>
//                                            # re-derive the public half
//
// The private key is printed to stdout and nowhere else. It is never written to
// disk by this script, and must not be committed — it goes into
// `wrangler secret put`, and wherever you keep secrets.

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58btc(bytes) {
  let digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  // Preserve leading zero bytes as leading '1's.
  let out = "";
  for (const byte of bytes) {
    if (byte === 0) out += "1";
    else break;
  }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

// Compress an uncompressed P-256 point (0x04 || X || Y) to 33 bytes:
// a parity prefix plus X. This is the form the multikey encoding wants.
function compressP256(raw) {
  if (raw.length !== 65 || raw[0] !== 0x04) {
    throw new Error(`expected a 65-byte uncompressed point, got ${raw.length}`);
  }
  const x = raw.slice(1, 33);
  const y = raw.slice(33, 65);
  const prefix = (y[31] & 1) === 0 ? 0x02 : 0x03;
  return new Uint8Array([prefix, ...x]);
}

// multikey = varint codec || compressed point, base58btc, 'z'-prefixed.
// P-256's multicodec is 0x1200, which varint-encodes to 0x80 0x24.
function toMultikey(compressed) {
  return "z" + base58btc(new Uint8Array([0x80, 0x24, ...compressed]));
}

async function publicFromPrivate(pkcs8B64url) {
  const pkcs8 = Buffer.from(pkcs8B64url, "base64url");
  // Import as a private key, then re-export the public half via JWK — WebCrypto
  // won't export a public key directly from a PKCS#8 private import.
  const priv = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", priv);
  const pub = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pub));
  return toMultikey(compressP256(raw));
}

const args = process.argv.slice(2);

if (args[0] === "--public-only") {
  const key = args[1];
  if (!key) {
    console.error("usage: node audit/labeler-keygen.mjs --public-only <base64url-pkcs8>");
    process.exit(1);
  }
  console.log(await publicFromPrivate(key));
  process.exit(0);
}

const kp = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
const privB64url = Buffer.from(pkcs8).toString("base64url");
const multikey = await publicFromPrivate(privB64url);

// Prove the pair actually works before handing it over, so a bad key is caught
// here rather than as silently-unverifiable labels in production.
const msg = new TextEncoder().encode("labeler-keygen self-test");
const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, msg);
const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, kp.publicKey, sig, msg);
if (!ok) {
  console.error("self-test failed: generated key did not verify its own signature");
  process.exit(1);
}

console.log(`
P-256 labeler keypair — self-test passed.

PRIVATE (secret; do not commit, do not paste into a file in the repo):

  ${privB64url}

  Install it:  cd sites/builtbybot && pnpm dlx wrangler secret put LABELER_PRIVATE_KEY
               (paste the string above when prompted)

PUBLIC (goes in the labeler account's DID document as #atproto_label):

  ${multikey}

  did:key form: did:key:${multikey}

Next: set LABELER_DID in sites/builtbybot/wrangler.toml to the labeler
account's DID. See notes/87-labeler.md for the full sequence.
`);
