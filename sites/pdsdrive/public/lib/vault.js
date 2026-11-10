// vault.js — passphrase -> AES-GCM key, chunked file encryption, base64 helpers.
// Pure Web Crypto, no DOM, so node --test can import it.
//
// Layout of an encrypted file in a record:
//   salt   16 random bytes per file (PBKDF2-SHA256 -> AES-256-GCM key)
//   meta   iv(12) || AES-GCM({name,type,size,lastModified}) — filename is hidden too
//   chunks one blob per CHUNK_BYTES of plaintext, each iv(12) || ciphertext||tag(16)
// Every ciphertext binds its position through AES-GCM additional data
// ("meta", or "<index>/<total>"), so a PDS (or anyone) can't reorder, drop or
// swap chunks between files without decryption failing.

export const CHUNK_BYTES = 50 * 1024 * 1024; // the 50MB the ask specified
// OWASP's 2023 floor for PBKDF2-HMAC-SHA256; ~0.3s in a browser, once per file.
export const PBKDF2_ITER = 600000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64(bytes) {
  let s = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(s);
}
export function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function newSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function deriveKey(passphrase, salt, iterations = PBKDF2_ITER) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(key, bytes, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, bytes),
  );
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

export async function open(key, sealed, aad) {
  const iv = sealed.subarray(0, 12);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
      key,
      sealed.subarray(12),
    ),
  );
}

export const chunkAad = (i, total) => `${i}/${total}`;

export function chunkCount(size, chunkBytes = CHUNK_BYTES) {
  return Math.max(1, Math.ceil(size / chunkBytes)); // an empty file still gets one (empty) chunk
}

export async function sealMeta(key, meta) {
  return b64(await seal(key, enc.encode(JSON.stringify(meta)), "meta"));
}

export async function openMeta(key, metaB64) {
  return JSON.parse(dec.decode(await open(key, unb64(metaB64), "meta")));
}
