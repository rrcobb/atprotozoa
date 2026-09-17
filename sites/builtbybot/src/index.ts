// builtbybot — builtbybot.bisks.net
//
// A real Bluesky labeler. It publishes one label value, `built-by-bot`, on the
// posts that announce a site @buildthis.bisks.net shipped, plus on the bot
// account itself.
//
// Why this exists, and why it's this narrow: notes/ideas/feeds-and-labels.md
// argued the labeler is the higher-commitment half of the feed/labeler
// primitive — "a bad feed gets unsubscribed, a bad label lands on someone
// else's post" — and picked `built-by-bot` as the first label precisely
// because it's descriptive rather than judgmental and hard to be harmfully
// wrong about. The feed half shipped first (sites/homemixer, and buildthis's
// own /shipped feed); this is the deferred half, unblocked once Rob
// provisioned a signing key.
//
// THE SUBJECT RULE, which is the whole safety story:
//
//   This labeler only ever labels things the bisks.net project itself
//   produced — buildthis's own announcement posts and buildthis's own
//   account. It never labels a third party.
//
// That's a deliberately smaller claim than "mark bot-built sites across the
// network," which is what ver.ooo's original ask ("exclude accounts marked as
// automated/bots") gestured at. The wider version requires deciding whether
// somebody ELSE's account is a bot, which is exactly the judgment call that
// makes labelers risky, and it's a claim we'd frequently get wrong. Labeling
// our own output is a fact we hold first-hand: the KV event log records every
// ship, so every label traces to a build this project actually ran. Widening
// the subject set is a policy change, not a config change — see /policy.
//
// NO DURABLE OBJECTS (notes/11). A canonical labeler serves
// com.atproto.label.subscribeLabels, a long-lived websocket, which is exactly
// the standing-connection shape this repo doesn't do. What's served instead:
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

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  LABELS: KVNamespace;
  // The labeler account's DID — the `src` of every label it emits, and the
  // repo holding the app.bsky.labeler.service record. Rob provisions this;
  // see /policy and notes/87-labeler.md for the exact setup steps.
  LABELER_DID: string;
  // The DID of the bot whose output gets labeled (buildthis).
  BUILDER_DID: string;
  // buildthis's event-log endpoint, the source of which posts announced a ship.
  BUILDER_EVENTS_URL: string;
  // Secret, set with `wrangler secret put LABELER_PRIVATE_KEY`: the labeler
  // signing key as base64url-encoded PKCS#8, P-256. Never in wrangler.toml.
  LABELER_PRIVATE_KEY?: string;
}

const LABEL_VALUE = "built-by-bot";

// Cache of the signed label set, rebuilt from buildthis's event log. KV, not a
// DO: a stale or duplicated rebuild is harmless here (notes/11) — the worst
// case is a label for a just-shipped site appearing on the next rebuild rather
// than instantly.
const LABELS_KEY = "labels:built-by-bot";
const LABELS_BUILT_AT_KEY = "labels:built-at";
const LABELS_TRUNCATED_KEY = "labels:truncated";
const REBUILD_INTERVAL_MS = 15 * 60 * 1000;

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

interface BuilderEvent {
  mentionUri?: string;
  outcome?: { status?: string; builtName?: string; at?: string };
}

// buildthis's /logs.json answers `{events, total}` and caps `limit` at 500
// (handleLogsRead). The log passed 500 on 2026-09-17 — 596 events, 408 of them
// shipped — so a single request now silently truncates the oldest entries, and
// the truncated ones are exactly the earliest ships. There's no cursor, so the
// honest read is: ask for the cap, compare against `total`, and say so when the
// tail is out of reach rather than quietly labeling a prefix.
const LOGS_LIMIT = 500;

async function fetchBuilderEvents(
  env: Env,
): Promise<{ events: BuilderEvent[]; total: number; truncated: boolean }> {
  const url = new URL(env.BUILDER_EVENTS_URL);
  url.searchParams.set("limit", String(LOGS_LIMIT));
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`event log fetch failed: ${res.status}`);

  const body = (await res.json()) as { events?: BuilderEvent[]; total?: number };
  const events = Array.isArray(body.events) ? body.events : [];
  const total = typeof body.total === "number" ? body.total : events.length;
  return { events, total, truncated: total > events.length };
}

// The subject set, derived fresh from buildthis's own event log — "store
// what's ours, re-derive the rest" (notes/ideas/store-ours-rederive-theirs.md).
// Every subject here is the project's own output:
//
//   - the buildthis account itself (it IS a bot; it self-labels today, this
//     makes that claim subscribable), and
//   - each tagging post that led to a shipped site.
//
// Note on that second one, because it's the one place this could drift into
// labeling someone else: the tagging post is authored by the REQUESTER, not by
// the bot. Labeling it says "a bot built the thing this post asked for," which
// is true and is about the site, but it does put a label on a third party's
// post. That's the narrowest defensible version — it's the same URI buildthis
// already publishes in its own public /shipped feed, so it reveals nothing new
// and asserts nothing about the author. If even that reads as too much, the
// fallback is labeling only the bot account; /policy says so, and flipping it
// is deleting one branch below.
async function subjectsToLabel(
  env: Env,
): Promise<{ subjects: string[]; truncated: boolean; reachable: boolean }> {
  const subjects: string[] = [];
  if (env.BUILDER_DID) subjects.push(env.BUILDER_DID);

  try {
    const { events, truncated } = await fetchBuilderEvents(env);
    for (const e of events) {
      if (e.outcome?.status === "success" && e.outcome.builtName && e.mentionUri) {
        subjects.push(e.mentionUri);
      }
    }
    return { subjects, truncated, reachable: true };
  } catch (err) {
    // Keep whatever labels already exist rather than dropping them all because
    // one fetch failed — rebuildLabels treats an unreachable log as "no change".
    console.error(`event log fetch failed: ${err}`);
    return { subjects, truncated: false, reachable: false };
  }
}

async function rebuildLabels(env: Env): Promise<StoredLabel[]> {
  const key = await importSigningKey(env);
  if (!key || !env.LABELER_DID) return [];

  const { subjects, truncated, reachable } = await subjectsToLabel(env);
  const existing = await loadLabels(env);

  // A failed log fetch must not retract labels. Labels are a public claim; a
  // transient 500 upstream silently un-labeling 400 posts would be a much worse
  // failure than serving a slightly stale set, so hold what we have and retry
  // on the next request. (Deliberately no `neg` labels here — this service has
  // no retraction path, because nothing it labels ever stops being bot-built.)
  if (!reachable && existing.length > 0) {
    await env.LABELS.put(LABELS_BUILT_AT_KEY, String(Date.now()));
    return existing;
  }
  await env.LABELS.put(LABELS_TRUNCATED_KEY, truncated ? "1" : "");
  // Keep each label's original `cts`: a label's creation timestamp shouldn't
  // move every time the set is rebuilt, and a changing cts would change the
  // signed bytes and invalidate any copy a consumer already holds.
  const ctsByUri = new Map(existing.map((l) => [l.uri, l.cts]));

  const labels: StoredLabel[] = [];
  for (const uri of subjects) {
    const cts = ctsByUri.get(uri) || new Date().toISOString();
    const fields: Record<string, string> = {
      cts,
      src: env.LABELER_DID,
      uri,
      val: LABEL_VALUE,
    };
    try {
      labels.push({ ...fields, sig: await signLabel(key, fields) } as StoredLabel);
    } catch (err) {
      console.error(`signing failed for ${uri}: ${err}`);
    }
  }

  await env.LABELS.put(LABELS_KEY, JSON.stringify(labels));
  await env.LABELS.put(LABELS_BUILT_AT_KEY, String(Date.now()));
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

// There's no alarm and no cron here, so the set advances on request — the
// pattern notes/11 describes for everything that used to need a DO alarm.
async function currentLabels(env: Env): Promise<StoredLabel[]> {
  const builtAt = parseInt((await env.LABELS.get(LABELS_BUILT_AT_KEY)) || "0", 10);
  if (Date.now() - builtAt > REBUILD_INTERVAL_MS) {
    return await rebuildLabels(env);
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/.well-known/did.json") {
      return await didDocument(env, url.host);
    }
    if (url.pathname === "/xrpc/com.atproto.label.queryLabels") {
      return queryLabels(env, url).catch((err) =>
        jsonResponse({ error: "InternalError", message: String(err) }, 500),
      );
    }
    if (url.pathname === "/xrpc/com.atproto.label.subscribeLabels") {
      return subscribeLabels(request);
    }
    // What the labeler currently asserts, for the page and for eyeballs.
    if (url.pathname === "/api/labels") {
      const labels = await currentLabels(env);
      return jsonResponse({
        src: env.LABELER_DID || null,
        configured: Boolean(env.LABELER_DID && env.LABELER_PRIVATE_KEY),
        value: LABEL_VALUE,
        count: labels.length,
        // True when buildthis's log has more events than one request returns,
        // so the earliest ships aren't labeled. Surfaced rather than hidden.
        truncated: Boolean(await env.LABELS.get(LABELS_TRUNCATED_KEY)),
        labels: labels.slice(0, 200),
      });
    }

    return env.ASSETS.fetch(request);
  },
};
