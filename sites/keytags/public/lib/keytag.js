// keytag.js — the actual "keyed hash set" primitive: hash(k, did) as hex,
// via Web Crypto's HMAC. `k` never leaves this tab: it's typed into an
// in-memory variable in index.html and passed straight in here, never
// written to localStorage/sessionStorage/IndexedDB or sent over the network.
// Only the hash (the rkey) and the tags (the record value) ever reach a PDS.

function hex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacHex(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return hex(sig);
}
