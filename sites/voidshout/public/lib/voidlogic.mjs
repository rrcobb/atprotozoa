// voidlogic.mjs — every rule of the Void that doesn't need a DOM or a
// network socket, in one pure ESM module. Imported directly by browser pages
// (<script type="module">) AND by tests/logic.test.mjs (`node --test`) —
// same code, same behavior, no mock of either side. This is the closest
// thing this static-site house style has to "generated types": the JSDoc
// typedefs below are the canonical shape of every net.bisks.void.* record,
// hand-kept in lockstep with lexicons/*.json (there's no server to run a
// codegen step against).
//
// @typedef {{id: string, name: string, emoji: string, lat: number, lng: number}} Place
// @typedef {{$type: "net.bisks.void.shout", text: string, place: Place, sourcePostUri?: string, createdAt: string}} ShoutRecord
// @typedef {{$type: "net.bisks.void.echo", rootUri: string, parentUri: string, place: Place, createdAt: string}} EchoRecord
// @typedef {{$type: "net.bisks.void.murmur", rootUri: string, parentUri: string, place: Place, text: string, createdAt: string}} MurmurRecord
// @typedef {{$type: "net.bisks.void.vote", subjectUri: string, value: 1|-1, createdAt: string}} VoteRecord
// @typedef {{$type: "net.bisks.void.participation", defaultPlace: Place, createdAt: string}} ParticipationRecord

export const COLLECTIONS = {
  shout: "net.bisks.void.shout",
  echo: "net.bisks.void.echo",
  murmur: "net.bisks.void.murmur",
  vote: "net.bisks.void.vote",
  participation: "net.bisks.void.participation",
};
export const ALL_COLLECTIONS = Object.values(COLLECTIONS);
// Collections a member's own content lives in — what "leave the Void"
// deletes (participation is handled separately, last).
export const OWNED_CONTENT_COLLECTIONS = [
  COLLECTIONS.shout,
  COLLECTIONS.echo,
  COLLECTIONS.murmur,
  COLLECTIONS.vote,
];

export const SHOUT_MAX_GRAPHEMES = 280;
export const MURMUR_MAX_GRAPHEMES = 140;
export const ECHO_COOLDOWN_MS = 60_000; // one carry per (author, root) per minute
export const DUPLICATE_ROOT_WINDOW_MS = 5 * 60_000; // near-duplicate shout guard
export const HIDE_THRESHOLD = -5; // score at/below this is hidden (and restorable)
export const ORPHAN_RETRY_LIMIT = 20; // times ingest.js retries an unresolved parentUri before giving up

// ---- grapheme-aware text helpers --------------------------------------------
// Plain .length counts UTF-16 code units, which double-counts emoji and
// misjudges "too long" for exactly the kind of text this app is full of.

const segmenter =
  typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

export function graphemeLength(s) {
  const str = String(s ?? "");
  if (segmenter) return [...segmenter.segment(str)].length;
  return [...str].length; // code-point fallback: still better than .length
}

export function truncateGraphemes(s, max) {
  const str = String(s ?? "");
  if (graphemeLength(str) <= max) return str;
  const units = segmenter ? [...segmenter.segment(str)].map((x) => x.segment) : [...str];
  return units.slice(0, max).join("");
}

// ---- validation --------------------------------------------------------------
// Returns {ok: true} or {ok: false, reason}. `reason` is exactly what the
// audit page shows next to a rejected record's URI. This function only
// checks the record's own shape — cross-record rules (duplicate-root,
// echo-cooldown, orphan-parent, self-vote) live in ingest.js, which has the
// rest of the ingested set to check against.

export function isValidPlace(place) {
  return (
    place &&
    typeof place === "object" &&
    typeof place.id === "string" &&
    place.id.length > 0 &&
    place.id.length <= 64 &&
    typeof place.name === "string" &&
    place.name.length > 0 &&
    place.name.length <= 128 &&
    typeof place.emoji === "string" &&
    place.emoji.length > 0 &&
    place.emoji.length <= 16 &&
    typeof place.lat === "number" &&
    Number.isFinite(place.lat) &&
    place.lat >= -90 &&
    place.lat <= 90 &&
    typeof place.lng === "number" &&
    Number.isFinite(place.lng) &&
    place.lng >= -180 &&
    place.lng <= 180
  );
}

function isAtUri(v) {
  return typeof v === "string" && /^at:\/\/did:[a-z0-9:.%-]+\/[a-zA-Z0-9.]+\/[a-zA-Z0-9._:~-]+$/.test(v);
}
function isIsoDate(v) {
  if (typeof v !== "string") return false;
  const ms = Date.parse(v);
  return Number.isFinite(ms);
}

export function validateRecord(collection, value) {
  if (!value || typeof value !== "object") return { ok: false, reason: "invalid-schema" };
  if (!isIsoDate(value.createdAt)) return { ok: false, reason: "invalid-schema" };

  switch (collection) {
    case COLLECTIONS.shout: {
      if (typeof value.text !== "string" || value.text.trim().length === 0) {
        return { ok: false, reason: "invalid-schema" };
      }
      if (graphemeLength(value.text) > SHOUT_MAX_GRAPHEMES) return { ok: false, reason: "invalid-schema" };
      if (!isValidPlace(value.place)) return { ok: false, reason: "invalid-place" };
      if (value.sourcePostUri !== undefined && !isAtUri(value.sourcePostUri)) {
        return { ok: false, reason: "invalid-schema" };
      }
      return { ok: true };
    }
    case COLLECTIONS.echo: {
      if (!isAtUri(value.rootUri) || !isAtUri(value.parentUri)) return { ok: false, reason: "invalid-schema" };
      if (!isValidPlace(value.place)) return { ok: false, reason: "invalid-place" };
      return { ok: true };
    }
    case COLLECTIONS.murmur: {
      if (!isAtUri(value.rootUri) || !isAtUri(value.parentUri)) return { ok: false, reason: "invalid-schema" };
      if (!isValidPlace(value.place)) return { ok: false, reason: "invalid-place" };
      if (typeof value.text !== "string" || value.text.trim().length === 0) {
        return { ok: false, reason: "invalid-schema" };
      }
      if (graphemeLength(value.text) > MURMUR_MAX_GRAPHEMES) return { ok: false, reason: "invalid-schema" };
      return { ok: true };
    }
    case COLLECTIONS.vote: {
      if (!isAtUri(value.subjectUri)) return { ok: false, reason: "invalid-schema" };
      if (value.value !== 1 && value.value !== -1) return { ok: false, reason: "invalid-schema" };
      return { ok: true };
    }
    case COLLECTIONS.participation: {
      if (!isValidPlace(value.defaultPlace)) return { ok: false, reason: "invalid-place" };
      return { ok: true };
    }
    default:
      return { ok: false, reason: "invalid-schema" };
  }
}

// ---- deterministic rkeys (no-duplicate-post-on-retry) -----------------------
// A network retry of the exact same createRecord call should be a no-op, not
// a second post. Rather than track "was this submitted already" in mutable
// UI state (which a page reload throws away), the rkey itself is a hash of
// the content — so retrying within the same minute always recomputes the
// SAME rkey, the PDS returns "already exists" for the second attempt, and
// the client treats that as success (see compose flow in public/compose/).
// Minute-bucketed rather than content-only so a deliberate identical repost
// an hour later is allowed to be a new post.

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function minuteBucket(atMs) {
  return Math.floor(atMs / 60_000);
}

export async function rkeyForShout(authorDid, text, placeId, atMs) {
  const hex = await sha256Hex(`shout|${authorDid}|${text}|${placeId}|${minuteBucket(atMs)}`);
  return "v" + hex.slice(0, 24);
}

export async function rkeyForCarry(collection, authorDid, parentUri, placeId, atMs) {
  const hex = await sha256Hex(`${collection}|${authorDid}|${parentUri}|${placeId}|${minuteBucket(atMs)}`);
  return "v" + hex.slice(0, 24);
}

// A voter's rkey for a vote is derived from the subject alone (within their
// OWN repo, so it's already scoped to that voter) — a second vote on the
// same subject reuses the same rkey, so putRecord overwrites it instead of
// creating a duplicate. One vote per voter per subject, enforced by
// construction rather than by a check.
export async function rkeyForVote(subjectUri) {
  const hex = await sha256Hex(`vote|${subjectUri}`);
  return "v" + hex.slice(0, 24);
}

// ---- Home: a stable, DID-derived identity that needs no record at all -----
// Same DID -> same emoji + word, forever, even across a handle change —
// computed straight from the DID string, nothing stored, nothing to go
// stale. This is the "generated Home explanation" profiles show.

const HOME_EMOJI = [
  "🪐","🌙","👻","🛸","🦉","🕯️","🐚","🌵","🦑","🌾","🪞","🧿","🫧","🐌","🦋","🪸",
  "🍄","🕸️","🪨","🌊","🔮","🧵","🪵","🌫️","🦴","🪹","🪺","🧊","🎈","🪁","🧭","🗝️",
];
const HOME_WORD = [
  "Hollow","Cinder","Drift","Static","Hush","Tide","Ember","Fold","Marrow","Glass",
  "Echo","Wick","Loam","Rime","Vane","Husk","Gale","Moss","Salt","Din",
  "Fen","Ash","Bramble","Quartz","Vesper","Furrow","Thicket","Hearth","Undertow","Slate",
];

async function stableHashInts(seed, count) {
  const hex = await sha256Hex("home|" + seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(parseInt(hex.slice(i * 4, i * 4 + 4), 16));
  }
  return out;
}

/** @returns {Promise<{emoji: string, word: string, name: string, explanation: string}>} */
export async function homeFor(did) {
  const [a, b] = await stableHashInts(did, 2);
  const emoji = HOME_EMOJI[a % HOME_EMOJI.length];
  const word = HOME_WORD[b % HOME_WORD.length];
  return {
    emoji,
    word,
    name: `${emoji} ${word}`,
    explanation:
      `Your Home, ${emoji} ${word}, is generated by hashing your DID (not your handle) against a fixed ` +
      `emoji/word table. The same DID always lands on the same Home — it survives a handle change, ` +
      `a client change, everything except getting a new DID.`,
  };
}

/** A short, stable, non-secret prefix code shown next to a Home name — same DID-derived hash, different slice. */
export async function prefixFor(did) {
  const hex = await sha256Hex("prefix|" + did);
  return hex.slice(0, 4).toUpperCase();
}

// ---- scoring, hide/restore, subtree pruning ---------------------------------
// All derived, all rebuildable from the raw vote records — nothing here is
// ever the source of truth, just a live fold over whatever ingest.js has
// validated so far.

/** @param {VoteRecord[]} votes */
export function scoreFromVotes(votes) {
  return votes.reduce((sum, v) => sum + (v.value === 1 || v.value === -1 ? v.value : 0), 0);
}

export function isHidden(score) {
  return score <= HIDE_THRESHOLD;
}

/**
 * Given a tree node's own hidden state and its parent chain, decide whether
 * it should render in an ACTIVE feed. A node is pruned once any ancestor
 * (or itself) is hidden — the whole branch below a hidden node drops out of
 * feeds/map/tree together, even if a child's own score is fine. Nothing is
 * deleted: restoring the ancestor's score un-prunes the whole branch, since
 * this is computed fresh every render.
 */
export function isPruned(node, scoreByUri) {
  let cur = node;
  const seen = new Set();
  while (cur) {
    if (seen.has(cur.uri)) break; // guard against a malformed cycle
    seen.add(cur.uri);
    if (isHidden(scoreByUri.get(cur.uri) ?? 0)) return true;
    cur = cur.parent;
  }
  return false;
}

// ---- echo-cooldown & duplicate-root (cross-record ingest rules) -------------
// Pure predicates; ingest.js supplies the "what happened before" state so
// these stay testable without IndexedDB or a socket.

/** @param {number|undefined} lastCarryAtMs previous echo/murmur by this author on this root, or undefined */
export function cooldownOk(lastCarryAtMs, nowMs) {
  if (lastCarryAtMs === undefined) return true;
  return nowMs - lastCarryAtMs >= ECHO_COOLDOWN_MS;
}

function normalizeForDup(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * True if `candidate` duplicates a shout this same author already posted
 * within the window — the audit reason "duplicate-root". `priorShouts` is
 * this author's other valid shouts (excluding the candidate itself).
 * @param {{text: string, createdAtMs: number}[]} priorShouts
 */
export function isDuplicateRoot(priorShouts, candidateText, candidateAtMs) {
  const needle = normalizeForDup(candidateText);
  return priorShouts.some(
    (s) =>
      normalizeForDup(s.text) === needle &&
      Math.abs(candidateAtMs - s.createdAtMs) <= DUPLICATE_ROOT_WINDOW_MS,
  );
}

// ---- CAR import filters ------------------------------------------------------
// Applied to app.bsky.feed.post records pulled out of a repo CAR (see
// public/lib/car.js). Pure so the filter rules are unit-testable without a
// real CAR file.

/**
 * @param {Array<{uri: string, text: string, reply?: unknown, embed?: {$type?: string}}>} posts
 * @param {Set<string>} alreadyImportedUris sourcePostUri values already used in this repo's shouts
 * @param {{excludeReplies?: boolean, excludeReposts?: boolean, minChars?: number}} opts
 */
export function carFilterCandidates(posts, alreadyImportedUris, opts = {}) {
  const excludeReplies = opts.excludeReplies !== false;
  const minChars = opts.minChars ?? 3;
  return posts.filter((p) => {
    if (alreadyImportedUris.has(p.uri)) return false;
    if (excludeReplies && p.reply) return false;
    if (typeof p.text !== "string" || p.text.trim().length < minChars) return false;
    return true;
  });
}
