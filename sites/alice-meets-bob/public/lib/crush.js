// crush.js — the "no amorous messages floating around the open web" crypto
// for Alice Meets Bob.
//
// Everyone publishes a public ECDH (P-256) key to their own repo. To like
// someone, you fetch their public key and derive a shared secret via
// ECDH(myPrivate, theirPublic) — which equals ECDH(theirPrivate, myPublic).
// HKDF splits that shared secret into two independent values:
//
//   - a "tag": a keyed pseudorandom value that only the two of you can ever
//     compute. It's stored on the crush record in place of a subject field,
//     so a repo browser can't tell who a record is "about" — only whoever
//     shares the ECDH secret with the author can recognize their own tag.
//   - an AES-GCM key, used to encrypt the note itself.
//
// So a crush record sitting in someone's public PDS repo is unlinkable *and*
// unreadable to a third party — including the AppView and the PDS operator —
// right up until the other person computes the same tag and key and finds
// it. It's still metadata-public that repo X has *some* crush record filed
// somewhere; there's no hiding that atproto records are public. What's
// hidden is who it's for and what it says.

const CURVE = "P-256";
const TE = new TextEncoder();
const TD = new TextDecoder();

export async function generateKeyPair() {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: CURVE }, true, [
    "deriveKey",
    "deriveBits",
  ]);
}

export async function exportPublicJwk(publicKey) {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

export async function importPublicJwk(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    { ...jwk, key_ops: [], ext: true },
    { name: "ECDH", namedCurve: CURVE },
    true,
    [],
  );
}

// Derive the shared HKDF base key for a (me, them) pair. Symmetric: the same
// value comes out whichever side computes it, since ECDH(privA, pubB) ==
// ECDH(privB, pubA).
async function hkdfBase(myPrivateKey, theirPublicKey) {
  const rawSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    256,
  );
  return crypto.subtle.importKey("raw", rawSecret, "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ]);
}

const SALT = new Uint8Array(); // fixed context; the `info` label separates uses

async function deriveTagHex(base) {
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: TE.encode("net.bisks.alicemeetsbob:tag") },
    base,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deriveAesKey(base) {
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: TE.encode("net.bisks.alicemeetsbob:aead") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// The tag+key pair for a specific (me, them) relationship. Used both to file
// my own crush (rkey = tag, ciphertext = enc(key, note)) and to check theirs
// (does their crush collection contain a record with this same tag?).
export async function pairMaterial(myPrivateKey, theirPublicKey) {
  const base = await hkdfBase(myPrivateKey, theirPublicKey);
  const [tag, key] = await Promise.all([deriveTagHex(base), deriveAesKey(base)]);
  return { tag, key };
}

export async function encryptNote(aesKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, TE.encode(plaintext));
  return { ciphertext: bufToB64(ct), iv: bufToB64(iv) };
}

export async function decryptNote(aesKey, ciphertextB64, ivB64) {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBuf(ivB64) },
    aesKey,
    b64ToBuf(ciphertextB64),
  );
  return TD.decode(pt);
}

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// --- local key + bookkeeping storage (IndexedDB) -----------------------------
//
// The private key never leaves the browser — it's generated here, stored as
// a CryptoKey object (structured-clonable), and only its exported public JWK
// ever goes to the PDS. The "who have I sent a crush to" list is likewise
// purely local bookkeeping: since crush records carry no subject field, that
// mapping exists nowhere but the sender's own device (and the recipient's,
// once they've matched it).

const DB_NAME = "alice-meets-bob";
const KEY_STORE = "keys";
const SENT_STORE = "sent";

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
      if (!db.objectStoreNames.contains(SENT_STORE)) db.createObjectStore(SENT_STORE, { keyPath: "did" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(store, key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly").objectStore(store).get(key);
    tx.onsuccess = () => resolve(tx.result ?? null);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbPut(store, value, key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite").objectStore(store).put(value, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbAll(store) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly").objectStore(store).getAll();
    tx.onsuccess = () => resolve(tx.result || []);
    tx.onerror = () => reject(tx.error);
  });
}

// Returns a CryptoKeyPair, generating + persisting a new one on first use per
// account DID (so switching accounts on the same device doesn't cross wires).
export async function getOrCreateKeyPair(did) {
  const existing = await idbGet(KEY_STORE, did);
  if (existing) return existing;
  const pair = await generateKeyPair();
  await idbPut(KEY_STORE, pair, did);
  return pair;
}

// Local record of a crush I've sent: { did, handle, rkey, sentAt, matched, note }.
export async function recordSent(entry) {
  return idbPut(SENT_STORE, entry);
}
export async function listSent() {
  const all = await idbAll(SENT_STORE);
  return all.sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || ""));
}
