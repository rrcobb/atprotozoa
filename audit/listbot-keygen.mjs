#!/usr/bin/env node
//
// Generate listbot's OAuth client-assertion keypair, in the two encodings the
// two places that consume it want:
//
//   - the PRIVATE half as base64url PKCS#8, which is what
//     `wrangler secret put CLIENT_PRIVATE_KEY` takes and what
//     sites/listbot/src/oauth.ts imports with crypto.subtle.importKey.
//   - the PUBLIC half as a JWK, which goes in wrangler.toml as
//     CLIENT_PUBLIC_JWK and is served at /jwks.json. Each PDS fetches that to
//     verify the client assertions listbot signs, so a mismatch means no user
//     can sign in.
//
// P-256 / ES256: the curve Workers' WebCrypto implements natively, so the
// Worker signs with no crypto dependency (same reasoning as
// audit/labeler-keygen.mjs).
//
// This is NOT the labeler signing key and NOT the session encryption key. It
// only proves "this request is from the client at listbot.bisks.net" to a PDS's
// token endpoint. See notes/88-listbot.md for all three secrets and what each
// one protects.
//
// Usage:
//   node audit/listbot-keygen.mjs
//
// The private key is printed to stdout and nowhere else — never written to disk
// by this script, never committed.

import { webcrypto as crypto } from "node:crypto";

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);

// Self-test: sign and verify, so a bad key never leaves this script.
const message = new TextEncoder().encode("listbot client assertion self-test");
const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, message);
const verified = await crypto.subtle.verify(
  { name: "ECDSA", hash: "SHA-256" },
  pair.publicKey,
  sig,
  message,
);
if (!verified) {
  console.error("self-test FAILED — not printing a key that can't verify");
  process.exit(1);
}

// Only the members a JWK needs for a public EC verification key. Exporting the
// whole thing would carry key_ops/ext into the published jwks for no reason.
const publicJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };

console.log(`self-test: ok (P-256 / ES256)

1. The private half — a SECRET. Set it as a Worker secret:

   cd sites/listbot
   pnpm dlx wrangler secret put CLIENT_PRIVATE_KEY

   paste:

${b64url(pkcs8)}

2. The public half — NOT a secret. Put it in sites/listbot/wrangler.toml as
   CLIENT_PUBLIC_JWK (one line, single-quoted), replacing the placeholder:

CLIENT_PUBLIC_JWK = '${JSON.stringify(publicJwk)}'

   It gets served at https://listbot.bisks.net/jwks.json, with the kid from
   CLIENT_KEY_KID attached.
`);
