// crypto.js — real symmetric encryption for Shadow Simcluster ciphers.
// AES-256-GCM, key derived from a passphrase with PBKDF2 (100k rounds,
// SHA-256), all via the browser's native Web Crypto (crypto.subtle) — no
// library, no server round-trip. Output is a single opaque blob:
//   salt(16 bytes) || iv(12 bytes) || ciphertext(+16-byte GCM tag)
// which callers base64-encode for text posts or feed straight to stego.js
// for image embedding. Wrong passphrase → decrypt throws (GCM's tag check
// fails), which is the whole point: it's cryptographic, not just obfuscated.

const SALT_LEN = 16;
const IV_LEN = 12;
const PBKDF2_ITERATIONS = 100_000;

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Encrypt raw bytes with a passphrase. Returns Uint8Array: salt||iv||ciphertext.
export async function encryptBytes(bytes, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(passphrase, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes),
  );
  const out = new Uint8Array(SALT_LEN + IV_LEN + ct.length);
  out.set(salt, 0);
  out.set(iv, SALT_LEN);
  out.set(ct, SALT_LEN + IV_LEN);
  return out;
}

// Decrypt bytes produced by encryptBytes. Throws if the passphrase is wrong
// (GCM authentication tag fails to verify) or the blob is too short/corrupt.
export async function decryptBytes(blob, passphrase) {
  if (blob.length < SALT_LEN + IV_LEN + 16) {
    throw new Error("not a Shadow Simcluster cipher (too short)");
  }
  const salt = blob.slice(0, SALT_LEN);
  const iv = blob.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ct = blob.slice(SALT_LEN + IV_LEN);
  const key = await deriveKey(passphrase, salt);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new Uint8Array(pt);
}

export async function encryptText(plaintext, passphrase) {
  return encryptBytes(new TextEncoder().encode(plaintext), passphrase);
}
export async function decryptText(blob, passphrase) {
  return new TextDecoder().decode(await decryptBytes(blob, passphrase));
}

// --- base64 helpers, for embedding a cipher blob in post text -----------

export function bytesToBase64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function base64ToBytes(b64) {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
