// builtbybot — builtbybot.bisks.net
//
// A real Bluesky labeler. It publishes one label value, `gift-link`, on posts
// whose links carry a publisher's unlock token.
//
// The service was built for a different label. `built-by-bot` marked
// @buildthis.bisks.net's own output, and Rob's read — recorded in
// notes/ideas/labeler-candidates.md — was that it said nothing: the labeled
// posts already contained the bot's handle and its reply, so the label restated
// what the post showed. The test a label has to pass is that it tells a
// subscriber something they could not have worked out by looking. Gift links
// pass it, because a gift link and a paywalled link are indistinguishable
// unless you read the query string.
//
// The machinery below is unchanged from that first label and was always the
// point of it: signed labels, a real queryLabels, low-S normalization, the
// key-rotation fingerprint, the "never serve what you can't sign" guard,
// canonical dag-cbor. What was replaced is the subject set (discover.ts,
// giftdetect.ts) and LABEL_VALUE.
//
// WHAT THE LABEL CLAIMS, exactly:
//
//   This link carried an unlock token when this service saw it.
//
// Not "this article is free", not "this link still works". Gift tokens expire
// and get revoked, and nothing here re-checks one. The label is a dated
// observation about a URL, and /policy says so in those words.
//
// THE SUBJECT RULE IS GONE, and that's the cost of making the label useful.
// built-by-bot only ever labeled this project's own output, which is what made
// it safe and also what made it pointless. Gift links are other people's posts,
// so the safety has to come from somewhere else: from the claim being a fact
// about a URL rather than a judgment about a person. Being wrong here means a
// token expired, not that we mislabeled someone. The label value is descriptive
// and carries no evaluation — it does not say the post is good, generous,
// paywall-evading or against a publisher's terms, and it must not grow to.
//
// NO DURABLE OBJECTS (notes/11), which shapes two things:
//
//   - Discovery is a cron sweep over searchPosts, not a Jetstream subscription.
//     See discover.ts for why, and for what that costs in coverage.
//   - A canonical labeler serves com.atproto.label.subscribeLabels, a
//     long-lived websocket, which is exactly the standing-connection shape this
//     repo doesn't do. What's served instead:
//
//   - com.atproto.label.queryLabels — the polled, request/response half of the
//     label API. Public, unauthenticated, and enough for a client to resolve
//     labels on a subject it's looking at.
//   - com.atproto.label.subscribeLabels — accepted and answered with a clean
//     close rather than left hanging, so a subscriber gets an immediate,
//     legible "this service doesn't stream" instead of a timeout.
//
// The honest consequence, stated on /policy too: consumers that only ingest
// the firehose-style label stream (Ozone-style mirrors) will see nothing.
// Clients that call queryLabels see every label. This is a real limitation of
// serving a labeler from a stateless Worker, not something papered over.
//
// Labels are signed for real. atproto accepts P-256 (notes: atproto.com/specs/
// cryptography lists p256 and k256), and P-256 ECDSA is native to Workers'
// WebCrypto — so signing happens in-Worker with no crypto dependency. The
// signature covers the dag-cbor encoding of the label WITHOUT its `sig` field,
// per the spec, which is why dagCborEncodeLabel below is hand-rolled: we only
// ever encode one flat, known-shape map, so a full CBOR library would be a
// dependency for about forty lines of work.

import { sweep, searchDomains, login, type FoundPost } from "./discover.ts";
import { GIFT_SOURCES } from "./giftdetect.ts";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  LABELS: KVNamespace;
  // The labeler account's DID — the `src` of every label it emits, and the
  // repo holding the app.bsky.labeler.service record. Rob provisions this;
  // see /policy and notes/87-labeler.md for the exact setup steps.
  LABELER_DID: string;
  // Secret, set with `wrangler secret put LABELER_PRIVATE_KEY`: the labeler
  // signing key as base64url-encoded PKCS#8, P-256. Never in wrangler.toml.
  LABELER_PRIVATE_KEY?: string;
  // The labeler account's handle, and a secret app password for it. Needed
  // because app.bsky.feed.searchPosts requires a session — the public AppView
  // 403s it unauthenticated (verified 2026-09-17; getPosts answers fine). This
  // is discovery credentials only: the labeler never writes to its repo from
  // the Worker.
  LABELER_IDENTIFIER: string;
  LABELER_APP_PASSWORD?: string;
}

// Descriptive and non-evaluative, deliberately. This labels strangers' posts,
// so the value names what was observed about the URL and nothing about the
// person who posted it.
const LABEL_VALUE = "gift-link";

// The signed label set, derived from the accumulated subject store below. KV,
// not a DO: a stale or duplicated rebuild is harmless here (notes/11) — the
// worst case is a just-found post getting its label on the next rebuild rather
// than instantly.
const LABELS_KEY = "labels:gift-link";
const LABELS_BUILT_AT_KEY = "labels:built-at";
// Which DID + public key the cached labels were signed under. A fingerprint of
// public values only — never the secret.
const LABELS_KEYID_KEY = "labels:key-fingerprint";
const REBUILD_INTERVAL_MS = 15 * 60 * 1000;
// How stale the last sweep may get before a request kicks one off itself.
// Longer than the cron interval, so the lazy path only fires when the cron
// actually isn't running.
const SWEEP_INTERVAL_MS = 30 * 60 * 1000;

interface StoredLabel {
  src: string;
  uri: string;
  cid?: string;
  val: string;
  cts: string;
  sig: string; // base64, as stored; re-emitted as $bytes in JSON
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

// A labeler's DID document must carry an `#atproto_label` verification method
// holding the PUBLIC half of the signing key, or nothing can verify a label
// this service signs — a document without it is decorative.
//
// Which identity is live depends on how Rob provisions (notes/87-labeler.md):
// a did:plc account keeps its keys in PLC and this document is unused, while
// did:web:builtbybot.bisks.net is served right here. The did:web path is the
// one that needs the key inline, so it's derived at request time from the
// signing secret rather than configured separately — one fewer thing to keep
// in sync, and it can't drift from the key actually doing the signing.

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58btc(bytes: Uint8Array): string {
  const digits = [0];
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
  let out = "";
  for (const byte of bytes) {
    if (byte === 0) out += "1";
    else break;
  }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

// The public half as a multikey string: P-256's multicodec (0x1200, varint
// 0x80 0x24) prepended to the 33-byte compressed point, base58btc, 'z'-prefixed.
// Mirrors audit/labeler-keygen.mjs, which prints the same value offline.
async function publicMultikey(env: Env): Promise<string | null> {
  if (!env.LABELER_PRIVATE_KEY) return null;
  try {
    const priv = await crypto.subtle.importKey(
      "pkcs8",
      base64urlToBytes(env.LABELER_PRIVATE_KEY),
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
    if (raw.length !== 65 || raw[0] !== 0x04) return null;
    const y = raw.slice(33, 65);
    const compressed = new Uint8Array(33);
    compressed[0] = (y[31] & 1) === 0 ? 0x02 : 0x03;
    compressed.set(raw.slice(1, 33), 1);
    return "z" + base58btc(new Uint8Array([0x80, 0x24, ...compressed]));
  } catch (err) {
    console.error(`public key derivation failed: ${err}`);
    return null;
  }
}

async function didDocument(env: Env, host: string): Promise<Response> {
  const id = `did:web:${host}`;
  const multikey = await publicMultikey(env);
  return jsonResponse({
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/multikey/v1",
    ],
    id,
    // Omitted entirely when no key is configured, rather than emitted empty —
    // a labeler advertising an unverifiable key is worse than one that plainly
    // isn't set up yet.
    ...(multikey
      ? {
          verificationMethod: [
            {
              id: `${id}#atproto_label`,
              type: "Multikey",
              controller: id,
              publicKeyMultibase: multikey,
            },
          ],
        }
      : {}),
    service: [
      {
        id: "#atproto_labeler",
        type: "AtprotoLabeler",
        serviceEndpoint: `https://${host}`,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const raw = atob(b64 + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function importSigningKey(env: Env): Promise<CryptoKey | null> {
  if (!env.LABELER_PRIVATE_KEY) return null;
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      base64urlToBytes(env.LABELER_PRIVATE_KEY),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  } catch (err) {
    console.error(`signing key import failed: ${err}`);
    return null;
  }
}

// Minimal dag-cbor for the one shape we encode: a flat map of string keys to
// string values. dag-cbor requires canonical ordering — keys sorted by length
// first, then bytewise — which is what sortDagCborKeys does. Anything richer
// (nested maps, ints, bytes) would need a real encoder; we never emit one.
function dagCborEncodeLabel(fields: Record<string, string>): Uint8Array {
  const keys = Object.keys(fields).sort((a, b) =>
    a.length !== b.length ? a.length - b.length : (a < b ? -1 : a > b ? 1 : 0),
  );
  const parts: number[] = [];

  const pushHead = (major: number, len: number) => {
    const m = major << 5;
    if (len < 24) parts.push(m | len);
    else if (len < 256) parts.push(m | 24, len);
    else if (len < 65536) parts.push(m | 25, len >> 8, len & 0xff);
    else parts.push(m | 26, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
  };
  const pushText = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    pushHead(3, bytes.length);
    for (const b of bytes) parts.push(b);
  };

  pushHead(5, keys.length); // map
  for (const k of keys) {
    pushText(k);
    pushText(fields[k]);
  }
  return new Uint8Array(parts);
}

// atproto requires the "low-S" variant of an ECDSA signature: of the two
// mathematically valid S values for any signature, only S <= n/2 is accepted.
// WebCrypto does NOT normalize — measured on this repo's own check, ~45% of
// P-256 signatures come back high-S — so roughly half of every label we emit
// would fail verification without this step. The fix is the standard one:
// replace S with n-S and leave R alone, which yields an equally valid
// signature over the same message.
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

function toLowS(sig: Uint8Array): Uint8Array {
  const r = sig.slice(0, 32);
  let s = 0n;
  for (const b of sig.slice(32)) s = (s << 8n) | BigInt(b);
  if (s <= P256_N / 2n) return sig;

  const flipped = P256_N - s;
  const sBytes = new Uint8Array(32);
  let v = flipped;
  for (let i = 31; i >= 0; i--) {
    sBytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(sBytes, 32);
  return out;
}

// Sign the label's dag-cbor WITHOUT `sig` (a signature can't cover itself).
// Returns base64; `ver` is omitted because the unsigned-field set we encode is
// exactly what a verifier reconstructs from the emitted JSON.
async function signLabel(key: CryptoKey, fields: Record<string, string>): Promise<string> {
  const payload = dagCborEncodeLabel(fields);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    payload,
  );
  return bytesToBase64(toLowS(new Uint8Array(sig)));
}

// ---------------------------------------------------------------------------
// Which subjects get labeled
// ---------------------------------------------------------------------------

// This is the part that changed when the labeler was repointed, and the part
// whose shape the rest of the file was already built for.
//
// built-by-bot re-derived its whole subject set on every rebuild, from
// buildthis's event log — "store what's ours, re-derive the rest". Gift links
// can't work that way. There is no queryable "all posts that ever carried a
// gift link" endpoint; there's a search index that reaches back a few days and
// a firehose we can't hold open. So the subject set is ACCUMULATED: each sweep
// adds what it found, and what was found before stays found.
//
// That makes the store the authoritative record rather than a cache, which is
// a real change in kind. Two consequences, both deliberate:
//
//   - Losing the KV key loses labels we can't re-derive. Accepted: a lost label
//     is a post that stops being marked, which is the harmless direction.
//   - The set is bounded (MAX_SUBJECTS). A labeler that grows without limit
//     eventually can't sign its set inside a request. Oldest-first eviction, so
//     what falls off is what nobody is looking at any more.

// Accumulated, not a cache. See above.
const SUBJECTS_KEY = "subjects:gift-link";
const LAST_SWEEP_KEY = "sweep:last-at";
const LAST_SWEEP_FOUND_KEY = "sweep:last-found";
const LAST_SWEEP_ERRORS_KEY = "sweep:last-errors";
// Accounts that asked never to be labeled, and individual posts that asked to
// be dropped. /policy promises both, so they're enforced here rather than left
// as a promise to honor by hand. Written out of band (wrangler kv key put);
// there's no endpoint that edits them, because a public write path on an
// opt-out list is a way for someone to opt SOMEONE ELSE out.
const OPTOUT_DIDS_KEY = "optout:dids";
const OPTOUT_URIS_KEY = "optout:uris";

// How many posts to pull per publisher per sweep. The sweep runs every 15
// minutes over ~12 domains; 100 each is well inside what a cron invocation can
// do and far more headroom than the actual volume of gift links needs.
const SEARCH_LIMIT_PER_DOMAIN = 100;

// The ceiling on the subject set. Signing is ~1ms per label, so this is about
// keeping a rebuild inside a request, not about storage.
const MAX_SUBJECTS = 5000;

// How far back before the last sweep to re-ask, to cover search-index lag.
const SWEEP_OVERLAP_MS = 30 * 60 * 1000;

export interface Subject {
  uri: string;
  // The post's CID at the time it was seen. Labels carry it so the claim binds
  // to the exact version of the record we read — an edited post gets a new CID,
  // and the label then plainly refers to the version that had the link rather
  // than silently following the edit.
  cid: string;
  sourceKey: string;
  // When this labeler first saw it. Becomes the label's `cts` and never moves.
  seenAt: string;
}

async function loadOptOut(env: Env): Promise<{ dids: Set<string>; uris: Set<string> }> {
  const parse = async (key: string) => {
    const raw = await env.LABELS.get(key);
    if (!raw) return new Set<string>();
    try {
      const arr = JSON.parse(raw) as string[];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set<string>();
    }
  };
  return { dids: await parse(OPTOUT_DIDS_KEY), uris: await parse(OPTOUT_URIS_KEY) };
}

// at://did:plc:xyz/app.bsky.feed.post/rkey -> did:plc:xyz
function authorDid(uri: string): string {
  return uri.slice(5).split("/")[0] || "";
}

// Applied on the read path, not only at merge time, so adding someone to the
// list retracts labels they already have instead of only preventing new ones.
export function applyOptOut(
  subjects: Subject[],
  optOut: { dids: Set<string>; uris: Set<string> },
): Subject[] {
  return subjects.filter((s) => !optOut.uris.has(s.uri) && !optOut.dids.has(authorDid(s.uri)));
}

async function loadSubjects(env: Env): Promise<Subject[]> {
  const raw = await env.LABELS.get(SUBJECTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Subject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Fold a sweep's findings into the stored set. Idempotent by URI: seeing the
// same post again is the normal case (searchPosts windows overlap), and it must
// not move the post's `seenAt`, because that's the label's `cts` and a changing
// cts would re-sign to different bytes and invalidate any copy a consumer
// already holds.
export function mergeSubjects(existing: Subject[], found: FoundPost[], max: number): Subject[] {
  const byUri = new Map(existing.map((s) => [s.uri, s]));
  for (const f of found) {
    if (byUri.has(f.uri)) continue;
    byUri.set(f.uri, { uri: f.uri, cid: f.cid, sourceKey: f.sourceKey, seenAt: new Date().toISOString() });
  }
  const all = [...byUri.values()].sort((a, b) => (a.seenAt < b.seenAt ? -1 : a.seenAt > b.seenAt ? 1 : 0));
  return all.length > max ? all.slice(all.length - max) : all;
}

// One sweep: search, detect, merge, store. Called from the cron and lazily from
// currentLabels when the last sweep is stale, so the labeler still advances if
// the cron is disabled or misfires (notes/11: no alarms, state advances on
// request).
async function runSweep(env: Env): Promise<{ found: number; errors: number }> {
  if (!env.LABELER_IDENTIFIER || !env.LABELER_APP_PASSWORD) {
    // Not provisioned. Stamp the clock so the lazy path doesn't retry on every
    // request for credentials that aren't there.
    await env.LABELS.put(LAST_SWEEP_KEY, String(Date.now()));
    return { found: 0, errors: 0 };
  }
  const session = await login(env.LABELER_IDENTIFIER, env.LABELER_APP_PASSWORD);
  // Overlap the window a little: search indexing lags behind posting, so a
  // sweep that asked only for "since the last sweep" would miss posts indexed
  // after the cursor moved past them.
  const lastSweep = parseInt((await env.LABELS.get(LAST_SWEEP_KEY)) || "0", 10);
  const since = lastSweep
    ? new Date(lastSweep - SWEEP_OVERLAP_MS).toISOString()
    : undefined;

  const { found, errors } = await sweep(session, SEARCH_LIMIT_PER_DOMAIN, since);
  const merged = mergeSubjects(await loadSubjects(env), found, MAX_SUBJECTS);
  await env.LABELS.put(SUBJECTS_KEY, JSON.stringify(merged));
  await env.LABELS.put(LAST_SWEEP_KEY, String(Date.now()));
  await env.LABELS.put(LAST_SWEEP_FOUND_KEY, String(found.length));
  await env.LABELS.put(LAST_SWEEP_ERRORS_KEY, String(errors));
  return { found: found.length, errors };
}

async function rebuildLabels(env: Env, fingerprint?: string): Promise<StoredLabel[]> {
  const key = await importSigningKey(env);
  if (!key || !env.LABELER_DID) {
    // Not provisioned yet — the state this ships in. Stamp the clock anyway, or
    // currentLabels sees a stale cache on every single request and re-signs a
    // set it can't sign.
    await env.LABELS.put(LABELS_BUILT_AT_KEY, String(Date.now()));
    return [];
  }

  const subjects = applyOptOut(await loadSubjects(env), await loadOptOut(env));
  // No "hold the old set on a fetch failure" branch any more, and none needed:
  // the subject set is stored, not re-derived, so a failed search can only
  // leave it un-grown. built-by-bot needed that guard because a transient 500
  // from buildthis would have retracted every label at once.
  const labels: StoredLabel[] = [];
  for (const s of subjects) {
    const fields: Record<string, string> = {
      cts: s.seenAt,
      src: env.LABELER_DID,
      uri: s.uri,
      val: LABEL_VALUE,
    };
    // `cid` is part of the signed bytes when present, so it goes in before
    // signing, not after.
    if (s.cid) fields.cid = s.cid;
    try {
      labels.push({ ...fields, sig: await signLabel(key, fields) } as StoredLabel);
    } catch (err) {
      console.error(`signing failed for ${s.uri}: ${err}`);
    }
  }

  await env.LABELS.put(LABELS_KEY, JSON.stringify(labels));
  await env.LABELS.put(LABELS_BUILT_AT_KEY, String(Date.now()));
  // Last: records which key/DID these labels were signed under, so the next
  // request can tell a rotation happened. Written after the labels themselves,
  // so a failure between the two leaves a stale fingerprint (triggering another
  // rebuild) rather than a fresh one vouching for labels that weren't stored.
  if (fingerprint !== undefined) await env.LABELS.put(LABELS_KEYID_KEY, fingerprint);
  return labels;
}

async function loadLabels(env: Env): Promise<StoredLabel[]> {
  const raw = await env.LABELS.get(LABELS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StoredLabel[];
  } catch {
    return [];
  }
}

// The set advances on request as well as on the cron. Keeping the lazy path
// means a misfiring or disabled cron degrades to "labels appear when someone
// asks" rather than to "labels stop appearing" — the pattern notes/11
// describes for everything that used to need a DO alarm.
async function currentLabels(env: Env, ctx?: ExecutionContext): Promise<StoredLabel[]> {
  // Serve nothing unless the service can currently sign. Labels persist in KV
  // across config changes, so without this a Worker that lost its key (or whose
  // LABELER_DID was cleared) keeps serving labels attributed to a DID it no
  // longer claims, signed by a key nothing can check — unverifiable claims
  // presented as valid, which is the one failure mode a labeler must not have.
  // Gating here rather than at each caller covers queryLabels, /api/labels and
  // /status.json in one place.
  if (!env.LABELER_DID || !env.LABELER_PRIVATE_KEY) return [];

  // Rebuild immediately when the signing key or the DID has changed, instead of
  // waiting out the interval. Cached labels are bound to the key that signed
  // them and the DID they name, so after a rotation every cached label is
  // unverifiable against the public key this service now publishes — observed
  // in testing, where a rotated key left 100/100 labels failing verification
  // until the window expired. Fingerprint, not the key itself: this is written
  // to KV, and the secret must not be.
  const fingerprint = `${env.LABELER_DID}:${(await publicMultikey(env)) || "none"}`;
  const cachedFingerprint = await env.LABELS.get(LABELS_KEYID_KEY);
  if (cachedFingerprint !== fingerprint) {
    return await rebuildLabels(env, fingerprint);
  }

  // If the cron hasn't swept in a while, sweep in the background rather than
  // making this request wait on twelve searchPosts calls. The reader gets the
  // current set now; what the sweep finds lands in the next rebuild.
  const sweptAt = parseInt((await env.LABELS.get(LAST_SWEEP_KEY)) || "0", 10);
  if (ctx && Date.now() - sweptAt > SWEEP_INTERVAL_MS) {
    ctx.waitUntil(runSweep(env).catch((err) => console.error(`lazy sweep failed: ${err}`)));
  }

  const builtAt = parseInt((await env.LABELS.get(LABELS_BUILT_AT_KEY)) || "0", 10);
  if (Date.now() - builtAt > REBUILD_INTERVAL_MS) {
    return await rebuildLabels(env, fingerprint);
  }
  return await loadLabels(env);
}

// ---------------------------------------------------------------------------
// The label API
// ---------------------------------------------------------------------------

// uriPatterns entries are either exact URIs or prefixes ending in '*'.
function matchesPattern(uri: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) return uri.startsWith(pattern.slice(0, -1));
  return uri === pattern;
}

async function queryLabels(env: Env, url: URL): Promise<Response> {
  const patterns = url.searchParams.getAll("uriPatterns");
  if (patterns.length === 0) {
    return jsonResponse(
      { error: "InvalidRequest", message: "uriPatterns is required" },
      400,
    );
  }
  const sources = url.searchParams.getAll("sources");
  if (sources.length > 0 && !sources.includes(env.LABELER_DID)) {
    return jsonResponse({ labels: [] });
  }

  const limit = Math.max(
    1,
    Math.min(250, parseInt(url.searchParams.get("limit") || "", 10) || 50),
  );
  const offset = Math.max(0, parseInt(url.searchParams.get("cursor") || "0", 10) || 0);

  const all = await currentLabels(env);
  const matched = all.filter((l) => patterns.some((p) => matchesPattern(l.uri, p)));
  const page = matched.slice(offset, offset + limit);

  return jsonResponse({
    labels: page.map((l) => ({
      ver: 1,
      src: l.src,
      uri: l.uri,
      val: l.val,
      cts: l.cts,
      // atproto's JSON encoding for the `bytes` type.
      sig: { $bytes: l.sig },
    })),
    cursor: offset + limit < matched.length ? String(offset + limit) : undefined,
  });
}

// The stream this service deliberately doesn't hold open. Answering the
// upgrade and closing immediately is friendlier than a hanging socket: a
// subscriber learns right away to poll queryLabels instead.
function subscribeLabels(request: Request): Response {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return jsonResponse(
      {
        error: "NotImplemented",
        message:
          "This labeler does not stream labels. It is a stateless Worker with no standing connections; poll com.atproto.label.queryLabels instead. See /policy.",
      },
      501,
    );
  }
  const pair = new WebSocketPair();
  const server = pair[1];
  server.accept();
  server.close(
    1011,
    "no label stream; poll com.atproto.label.queryLabels — see https://builtbybot.bisks.net/policy",
  );
  return new Response(null, { status: 101, webSocket: pair[0] });
}

export default {
  // The sweep the labeler runs on a schedule. This is the piece that replaces
  // a standing Jetstream subscription (discover.ts explains why there isn't
  // one): every 15 minutes, ask searchPosts what's been linked lately, keep
  // what carries a token, and fold it into the subject store.
  //
  // Deliberately NOT signing here. The sweep only grows the subject set; the
  // labels themselves are rebuilt on the read path, which is where the key
  // and the rotation check already live.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runSweep(env)
        .then(({ found, errors }) => console.log(`sweep: ${found} gift links, ${errors} domain errors`))
        .catch((err) => console.error(`sweep failed: ${err}`)),
    );
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/.well-known/did.json") {
      return await didDocument(env, url.host);
    }
    if (url.pathname === "/xrpc/com.atproto.label.queryLabels") {
      return queryLabels(env, url, ctx).catch((err) =>
        jsonResponse({ error: "InternalError", message: String(err) }, 500),
      );
    }
    if (url.pathname === "/xrpc/com.atproto.label.subscribeLabels") {
      return subscribeLabels(request);
    }
    // The catalog/status document `notes/ideas/other-bots.md` asks every new
    // bot here to publish on day one: CORS-open JSON that says what this
    // service is and where its endpoints are, so another bot can find and use
    // it without a thread negotiation (the lesson from the buildthis/mino
    // registry exchange). /api/labels is the DATA; this is the description of
    // the service, which is the part a stranger needs first.
    if (url.pathname === "/status.json") {
      const configured = Boolean(env.LABELER_DID && env.LABELER_PRIVATE_KEY);
      // Empty whenever the service can't sign — currentLabels enforces that, so
      // the count here can never disagree with what queryLabels will serve.
      const labels = await currentLabels(env, ctx);
      return jsonResponse({
        name: "builtbybot",
        kind: "labeler",
        url: "https://builtbybot.bisks.net/",
        description:
          "Publishes one descriptive label, gift-link, on posts whose links carry a publisher's unlock token. The claim is about the URL, not the author: it records that a token was present when the link was seen. Tokens expire, so the label is not a promise that the article is still readable.",
        // Live if and only if it can actually sign. A consumer should branch on
        // this rather than on the presence of the endpoints, which answer
        // either way.
        live: configured,
        labeler: {
          did: env.LABELER_DID || null,
          labelValues: [LABEL_VALUE],
          subjectPolicy: "third-party-posts",
          labelCount: labels.length,
          // Stated up front rather than discovered by a subscriber who gets
          // silence: this service has no websocket label stream.
          streaming: false,
          policy: "https://builtbybot.bisks.net/policy",
        },
        endpoints: {
          queryLabels: "/xrpc/com.atproto.label.queryLabels",
          subscribeLabels: null,
          didDocument: "/.well-known/did.json",
          labels: "/api/labels",
          status: "/status.json",
        },
        // What this labeler is derived from, so the provenance chain is
        // followable without reading the source. `coverage` is stated as
        // best-effort because it is: discovery is a search sweep, so an
        // unlabeled post means "not seen", never "checked and found clean".
        source: {
          discovery: "app.bsky.feed.searchPosts",
          domains: searchDomains(),
          publishers: GIFT_SOURCES.map((s) => ({ key: s.key, name: s.name })),
          coverage: "best-effort",
          lastSweepAt: parseInt((await env.LABELS.get(LAST_SWEEP_KEY)) || "0", 10) || null,
          lastSweepFound: parseInt((await env.LABELS.get(LAST_SWEEP_FOUND_KEY)) || "0", 10),
          lastSweepErrors: parseInt((await env.LABELS.get(LAST_SWEEP_ERRORS_KEY)) || "0", 10),
        },
      });
    }
    // What the labeler currently asserts, for the page and for eyeballs.
    if (url.pathname === "/api/labels") {
      const labels = await currentLabels(env, ctx);
      return jsonResponse({
        src: env.LABELER_DID || null,
        configured: Boolean(env.LABELER_DID && env.LABELER_PRIVATE_KEY),
        value: LABEL_VALUE,
        claim: "this link carried an unlock token when this service saw it",
        count: labels.length,
        subjectCount: (await loadSubjects(env)).length,
        lastSweepAt: parseInt((await env.LABELS.get(LAST_SWEEP_KEY)) || "0", 10) || null,
        labels: labels.slice(0, 200),
      });
    }

    return env.ASSETS.fetch(request);
  },
};
