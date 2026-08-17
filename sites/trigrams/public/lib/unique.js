// unique.js — find the n-grams you've used exactly once that are ALSO unique on
// the whole network (hapax legomena). Two phases:
//   scan()   — harvest your own repo, keep grams you used exactly once (a phrase
//              you repeated is already ≥2 uses network-wide, so can't be unique).
//   verify() — check each survivor against Bluesky full-text search.
//
// Algorithm copied from mino.mobi's b/unique/unique.js (minormobius/agent01),
// thank you. Theirs runs in a Worker and searches with a shared service-account
// token because it thought the anonymous AppView 403s search. It turns out
// `api.bsky.app` serves searchPosts UNAUTHENTICATED (200, CORS *) — only
// `public.api.bsky.app` 403s. So this whole module runs CLIENT-SIDE with no auth,
// no worker, for ANY handle. (See notes/70 "HAMMERED".)

import { fetchRepoRecords } from "./car.js";

const PUB = "https://api.bsky.app/xrpc"; // anonymous reads (listRecords, resolve)
const PLC_DIR = "https://plc.directory";

// Search goes through OUR worker's authenticated proxy — anonymous searchPosts is
// administratively blocked at volume (403). The proxy holds a bot app-password and
// returns app.bsky.feed.searchPosts JSON. Same-origin path on trigrams.bisks.net.
// (In dev/other origins, fall back to the deployed proxy.)
const SEARCH_PROXY =
  typeof location !== "undefined" && location.origin.includes("bisks.net")
    ? "/api/search"
    : "https://trigrams.bisks.net/api/search";

const MAX_POST_PAGES = 40; // ≤ ~4000 most-recent posts
const SCAN_CAP = 8000; // cap candidate list (top-scored first) — high; filter cuts more
const SEARCH_CONC = 6; // parallel fan-out (authed proxy has proper rate limits)
const SEARCH_LIMIT = 15; // posts fetched per phrase

// Grams made only of stopwords carry no signal and are ~never unique.
const STOP = new Set(
  (
    "a an and are as at be been but by for from had has have he her his i in " +
    "is it its me my no not of on or our so that the their them then they this to up us was we were " +
    "what when who will with you your just like get got out about into over more all can do if im dont " +
    "youre they re ve ll s t m d re"
  ).split(/\s+/),
);

// ── verdict cache ────────────────────────────────────────────────────────────
// Verdicts are near-monotonic: a phrase's network-wide hit count can only stay
// the same or grow (new posts, no notion of a post un-happening), never shrink.
// So "common" (hitsTotal >= 2) is permanently safe to trust — it can never
// become "unique" or "none" again. "unique"/"none" can flip to "common" as new
// posts land, so those are cached with a TTL instead of forever. Keyed on the
// gram text alone (not the actor) since network-wide uniqueness doesn't depend
// on who's asking — a repeat scan, a second handle checking the same phrase,
// even a different page (launcher/quiver/waluigi all share this origin's
// localStorage) all hit the same cache. Shaves the "big saving on repeat runs"
// promised in notes/ideas/store-ours-rederive-theirs.md.
const CACHE_KEY = "trigrams:verdict-cache:v1";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // unique/none entries go stale after this
const CACHE_MAX_ENTRIES = 6000; // localStorage is a few MB; prune well before that

let _cache = null; // { verdicts: { gram: {status,count?,post?,ts} }, hits: { phrase: {n,ts} } }

function loadCache() {
  if (_cache) return _cache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    _cache = raw ? JSON.parse(raw) : { verdicts: {}, hits: {} };
  } catch {
    _cache = { verdicts: {}, hits: {} };
  }
  if (!_cache.verdicts) _cache.verdicts = {};
  if (!_cache.hits) _cache.hits = {};
  return _cache;
}

function pruneAndSave() {
  const c = loadCache();
  for (const bucket of [c.verdicts, c.hits]) {
    const keys = Object.keys(bucket);
    if (keys.length <= CACHE_MAX_ENTRIES) continue;
    keys.sort((a, b) => (bucket[a].ts || 0) - (bucket[b].ts || 0));
    for (const k of keys.slice(0, keys.length - CACHE_MAX_ENTRIES)) delete bucket[k];
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // quota exceeded or unavailable (private browsing) — cache just won't persist
  }
}

function freshEnough(entry) {
  if (!entry) return false;
  if (entry.status === "common") return true; // permanently valid, see above
  return Date.now() - (entry.ts || 0) < CACHE_TTL_MS;
}

function getCachedVerdict(gram) {
  const e = loadCache().verdicts[gram];
  return freshEnough(e) ? e : null;
}

function setCachedVerdict(gram, entry) {
  if (entry.status === "error") return; // don't cache failures
  loadCache().verdicts[gram] = { ...entry, ts: Date.now() };
  pruneAndSave();
}

function getCachedHits(phrase) {
  const e = loadCache().hits[phrase];
  return e && Date.now() - (e.ts || 0) < CACHE_TTL_MS ? e.n : null;
}

function setCachedHits(phrase, n) {
  loadCache().hits[phrase] = { n, ts: Date.now() };
  pruneAndSave();
}

async function jget(url, headers) {
  const r = await fetch(url, headers ? { headers } : undefined);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Resolve a handle / URL / @mention / DID to a DID. Copied from mino's
// resolveActor — it's forgiving about paste formats.
async function resolveActor(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

async function resolvePds(did) {
  let doc;
  if (did.startsWith("did:plc:")) doc = await jget(`${PLC_DIR}/${did}`);
  else if (did.startsWith("did:web:"))
    doc = await jget(`https://${did.slice(8).replace(/:/g, "/")}/.well-known/did.json`);
  else throw new Error("unsupported DID method");
  const svc = (doc.service || []).find(
    (s) => s.type === "AtprotoPersonalDataServer" || s.id === "#atproto_pds",
  );
  if (!svc) throw new Error("no PDS in DID doc");
  return svc.serviceEndpoint;
}

// Resolve any handle/DID to { did, pdsUrl, handle } — the input scan/verify need.
export async function resolveActorFull(actor) {
  const did = await resolveActor(actor);
  const pdsUrl = await resolvePds(did);
  let handle = actor.replace(/^@/, "");
  try {
    const doc = did.startsWith("did:plc:") ? await jget(`${PLC_DIR}/${did}`) : null;
    const aka = (doc?.alsoKnownAs || []).find((x) => x.startsWith("at://"));
    if (aka) handle = aka.slice("at://".length);
  } catch {}
  return { did, pdsUrl, handle };
}

// Lowercase, drop URLs / @handles / #-marks, split on any non-letter/number run.
// Mirrors how Bluesky search tokenizes, so a gram we build matches the text we
// later verify inside a returned post.
export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[\w.-]+/g, " ")
    .replace(/[#]/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// A gram's "interest" score: prefer content words + length, so a capped search
// spends its budget on the phrases most likely to be distinctive. Used only to
// ORDER the search — not to rank the final results (that's richness()).
export function score(toks) {
  let s = 0,
    content = 0;
  for (const t of toks) {
    if (STOP.has(t)) s += 0.15;
    else {
      content++;
      s += Math.min(t.length, 12) / 4 + 1;
    }
  }
  return content === 0 ? -1 : s + content; // all-stopword => -1 (dropped)
}

// NARROW stopword set for richness filtering — ONLY true function words. Rob's
// 128 curated trigrams include "after/some/such/very/only", so a broad stoplist
// wrongly rejects his favorites (e.g. "meaning after scarcity"). Calibrated
// against that curated set: with this list, 0/128 are rejected.
const FUNC = new Set(
  ("a an and are as at be been but by for from had has have he her his i in is it its me my no not " +
    "of on or our so that the their them then they this to up us was we were with you your").split(/\s+/),
);

// Peak word length ~8 chars; taper for very short and very long words. This
// undoes mino score()'s "longer is always better" bias — the dry academic
// trigrams Rob rejects are exactly the longest-word ones.
function lenBump(len) {
  if (len <= 2) return 0.1;
  if (len <= 9) return (len - 2) / 7; // 0.14 .. 1.0
  return Math.max(0.15, 1 - (len - 9) * 0.12); // decay past 9
}

// richness(gram): a taste-calibrated score for the FINAL ranking of verified
// unique trigrams. Returns -1 for hard-rejects (any function word, or a repeated
// word — both absent from every one of Rob's curated examples). Otherwise a
// 0..~1 score. NOTE: heuristics filter junk well but rank taste only weakly — the
// surprise/juxtaposition that defines "good" isn't captured here. See
// notes/71-rich-taste.md; a taste pass (LLM) is the likely next step.
export function richness(gram) {
  const w = String(gram).split(" ").filter(Boolean);
  if (w.length < 2) return -1;
  if (new Set(w).size < w.length) return -1; // repeated word
  if (w.some((x) => FUNC.has(x))) return -1; // any function word
  let s = 0;
  for (const x of w) s += lenBump(x.length);
  return s / w.length;
}

// ── surprise: the real ranking signal ─────────────────────────────────────────
// A UNIQUE trigram is surprising when its component parts are COMMON — "training
// data development" is a shock because "training data" is everywhere, whereas
// "hockeypsychology suckerpinch sheaffification" being unique is no shock at all.
// Rob's insight; validated (good ones cluster ~3.3–5.3, bad ones ~0.4–2.3).
//
// We measure "how common are the parts" with searchPosts' hitsTotal for each
// component bigram. Only run this on VERIFIED-unique survivors (a handful), not
// the thousands of candidates.

const SEARCH_CAP_HITS = 10000; // hitsTotal saturates here; treat as "very common"

// Network-wide count of exact-phrase posts, via hitsTotal. Goes through the
// authenticated search proxy (same as verify). Returns null (not 0) if it truly
// can't tell, so callers can distinguish "no data" from "genuinely zero".
async function phraseHits(phrase) {
  const cached = getCachedHits(phrase);
  if (cached != null) return cached;
  const u = new URL(SEARCH_PROXY, location.href);
  u.searchParams.set("q", `"${phrase}"`);
  u.searchParams.set("limit", "1");
  const d = await searchGet(u.toString());
  if (!d) return null;
  const n = typeof d.hitsTotal === "number" ? d.hitsTotal : (d.posts || []).length;
  setCachedHits(phrase, n);
  return n;
}

// surprise(gram): log-scaled score from component-bigram frequencies. Rewards a
// high MAX freq (one very common part is enough to make uniqueness surprising)
// plus a nudge from the MIN (both parts real, not two coinages). Higher = more
// surprising that this is globally unique. Returns { score, bigrams, freqs }.
// The bigram lookups run concurrently (a trigram only has two) rather than
// serially with a pacing sleep between them — see surpriseAll() below for why
// serial-per-gram used to be the real bottleneck.
export async function surprise(gram) {
  const w = String(gram).split(" ").filter(Boolean);
  const bigrams = [];
  for (let i = 0; i + 1 < w.length; i++) bigrams.push(w[i] + " " + w[i + 1]);

  const freqs = await Promise.all(bigrams.map((b) => phraseHits(b)));
  const valid = freqs.filter((x) => x != null).map((x) => Math.min(x, SEARCH_CAP_HITS));
  if (valid.length === 0) return { score: 0, bigrams, freqs };
  const maxF = Math.max(...valid);
  const minF = Math.min(...valid);
  const score = Math.log10(maxF + 1) + 0.5 * Math.log10(minF + 1);
  return { score, bigrams, freqs };
}

const SURPRISE_CONC = 6; // same fan-out budget as verify()'s SEARCH_CONC

// surpriseAll(grams): score a whole list of grams with a worker pool instead
// of one gram at a time. Callers used to `for (const v of list) await
// surprise(v.g)` — fully serial, and each surprise() call cost two round
// trips plus a 120ms pacing sleep, so ranking ~120 candidates could take over
// a minute. searchGet() already retries 429/403 with backoff, same as
// verify(), so fanning this out is exactly as safe as the verify pass already
// is. Calls onScore(gram, result) as each resolves; returns a gram -> result
// Map (gram order matches whichever call wins the race, use the map to look
// up by gram string rather than relying on array order).
export async function surpriseAll(grams, { onScore, shouldStop } = {}) {
  const list = grams.slice();
  const results = new Map();
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      if (shouldStop && shouldStop()) return;
      const g = list[idx++];
      let res;
      try {
        res = await surprise(g);
      } catch {
        res = { score: 0, bigrams: [], freqs: [] };
      }
      results.set(g, res);
      if (onScore) onScore(g, res);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SURPRISE_CONC, list.length || 1) }, worker),
  );
  return results;
}

// Tokenize one post's text into bigrams/trigrams, tallying into c2/c3.
function ingestGrams(text, c2, c3, want2, want3) {
  const t = tokenize(text);
  if (want2)
    for (let i = 0; i + 1 < t.length; i++) {
      const g = t[i] + " " + t[i + 1];
      c2.set(g, (c2.get(g) || 0) + 1);
    }
  if (want3)
    for (let i = 0; i + 2 < t.length; i++) {
      const g = t[i] + " " + t[i + 1] + " " + t[i + 2];
      c3.set(g, (c3.get(g) || 0) + 1);
    }
}

// Fallback: page through listRecords, capped at MAX_POST_PAGES (~4000 most
// recent posts) — used only when the CAR download in scan() below fails
// (parse error, oversized repo, a PDS that blocks sync.getRepo).
async function scanViaRepo(did, pdsUrl, c2, c3, want2, want3, onPage) {
  let cursor = "";
  let pages = 0;
  let posts = 0;

  for (; pages < MAX_POST_PAGES; pages++) {
    const u = new URL(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set("repo", did);
    u.searchParams.set("collection", "app.bsky.feed.post");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);

    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    const recs = d.records || [];
    for (const rec of recs) {
      const text = rec.value && rec.value.text;
      if (!text) continue;
      posts++;
      ingestGrams(text, c2, c3, want2, want3);
    }
    if (onPage) onPage(pages + 1, posts);
    cursor = d.cursor;
    if (!cursor || recs.length === 0) {
      pages++;
      break;
    }
  }
  return { pages, posts, scannedAll: !cursor };
}

// ── scan: harvest exactly-once bigrams/trigrams from the user's own repo ───────
// Tries one com.atproto.sync.getRepo CAR download first — the account's
// *entire* history in one request, so a prolific poster's older bigrams
// aren't invisible just because MAX_POST_PAGES's ~4000-post window doesn't
// reach them — falling back to the paginated listRecords walk (scanViaRepo)
// if the CAR path fails. onPage(pagesDone, posts) is called after each page
// so the UI can show progress (the CAR path only gets one call, since it's
// one request rather than a page-by-page walk).
export async function scan(actor, { mode = "trigram", onPage } = {}) {
  const want2 = mode !== "trigram";
  const want3 = mode !== "bigram";
  const { did, pdsUrl } = actor;

  const c2 = new Map();
  const c3 = new Map();
  let pages = 0;
  let posts = 0;
  let scannedAll = true;

  try {
    const { records } = await fetchRepoRecords(pdsUrl, did, "app.bsky.feed.post");
    for (const rec of records) {
      if (!rec.text) continue;
      posts++;
      ingestGrams(rec.text, c2, c3, want2, want3);
    }
    pages = 1;
    if (onPage) onPage(pages, posts);
  } catch {
    ({ pages, posts, scannedAll } = await scanViaRepo(did, pdsUrl, c2, c3, want2, want3, onPage));
  }

  const cands = [];
  const collect = (map, n) => {
    for (const [g, cnt] of map) {
      if (cnt !== 1) continue; // the free pre-filter
      const sc = score(g.split(" "));
      if (sc < 0) continue; // all-stopword
      cands.push({ g, n, s: sc });
    }
  };
  if (want2) collect(c2, 2);
  if (want3) collect(c3, 3);
  cands.sort((a, b) => b.s - a.s);

  return {
    did,
    posts,
    pages,
    scannedAll,
    total: cands.length,
    candidates: cands.slice(0, SCAN_CAP),
  };
}

const MAX_MENTION_PAGES = 40; // ≤ ~4000 most-recent posts tagging the actor

// scanMentions: harvest posts that TAG/mention an actor (not posts they wrote)
// via searchPosts' `mentions` filter, and keep trigrams that occur EXACTLY ONCE
// across that whole harvested set. Unlike scan() (which only sees the actor's
// own repo and needs a later network-wide verify() pass), the corpus here
// already spans every author who tagged them — so a local count of 1 already
// means "only one tagger, ever, used this exact phrase." No verify phase needed.
// onPage(pagesDone, posts) is called after each page so the UI can show progress.
export async function scanMentions(actor, { onPage } = {}) {
  const { did } = actor;
  const counts = new Map(); // gram -> { count, post }
  let cursor = "";
  let pages = 0;
  let posts = 0;

  for (; pages < MAX_MENTION_PAGES; pages++) {
    const u = new URL(SEARCH_PROXY, location.href);
    u.searchParams.set("q", "*");
    u.searchParams.set("mentions", did);
    u.searchParams.set("sort", "latest");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);

    const d = await searchGet(u.toString());
    if (!d) break;
    const recs = d.posts || [];
    for (const p of recs) {
      const text = p.record && p.record.text;
      if (!text) continue;
      posts++;
      const t = tokenize(text);
      for (let i = 0; i + 2 < t.length; i++) {
        const g = t[i] + " " + t[i + 1] + " " + t[i + 2];
        const sc = score(g.split(" "));
        if (sc < 0) continue; // all-stopword
        let e = counts.get(g);
        if (!e) {
          e = {
            count: 0,
            post: {
              uri: p.uri,
              did: p.author && p.author.did,
              handle: p.author && p.author.handle,
              text,
            },
          };
          counts.set(g, e);
        }
        e.count++;
      }
    }
    if (onPage) onPage(pages + 1, posts);
    cursor = d.cursor;
    if (!cursor || recs.length === 0) {
      pages++;
      break;
    }
  }

  const uniques = [];
  for (const [g, e] of counts) {
    if (e.count !== 1) continue;
    uniques.push({ g, n: 3, post: e.post });
  }

  return { posts, pages, scannedAll: !cursor, uniques };
}

// searchPosts with retry/backoff on throttle. api.bsky.app rate-limits bursts;
// without retry, a throttled candidate is silently lost (this was undercounting
// uniques ~10x vs mino, which searches with an authed token). Returns parsed JSON
// or null after exhausting tries.
// IMPORTANT: under burst load, api.bsky.app returns 403 "forbidden by
// administrative rules" — a soft rate-limit, NOT a permanent denial. So 403 and
// 429 must both be RETRIED with backoff. Treating 403 as a hard error was
// dropping ~half of candidates and undercounting uniques ~8x vs mino (which uses
// an authed token with far higher limits). Only 4xx≠{403,429} is a real error.
async function searchGet(url, tries = 7) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return await r.json();
      const soft = r.status === 429 || r.status === 403 || r.status >= 500;
      if (!soft) return null; // genuine error, don't retry
      const ra = parseInt(r.headers.get("retry-after") || "", 10);
      await new Promise((res) =>
        setTimeout(res, ra ? ra * 1000 : 700 * (i + 1) + 400 * i * i),
      );
    } catch {
      await new Promise((res) => setTimeout(res, 700 * (i + 1)));
    }
  }
  return null;
}

// ── verify one candidate against platform-wide full-text search ────────────────
async function searchPhrase(actor, g) {
  const n = g.split(" ").length;

  const cached = getCachedVerdict(g);
  if (cached) {
    if (cached.status === "unique")
      return { g, n, status: "unique", mine: cached.post?.did === actor.did, post: cached.post };
    if (cached.status === "common") return { g, n, status: "common", count: cached.count };
    if (cached.status === "none") return { g, n, status: "none" };
  }

  const u = new URL(SEARCH_PROXY, location.href);
  u.searchParams.set("q", `"${g}"`); // quoted => exact-phrase intent
  u.searchParams.set("limit", String(SEARCH_LIMIT));

  const d = await searchGet(u.toString());
  if (!d) return { g, n, status: "error" }; // exhausted retries

  // Search is fuzzy — keep only posts whose text actually contains the phrase.
  const pad = (t) => " " + tokenize(t).join(" ") + " ";
  const needle = " " + g + " ";
  const seen = new Set();
  const hits = [];
  for (const p of d.posts || []) {
    const text = p.record && p.record.text;
    if (!text || !pad(text).includes(needle)) continue;
    if (seen.has(p.uri)) continue;
    seen.add(p.uri);
    hits.push({
      uri: p.uri,
      did: p.author && p.author.did,
      handle: p.author && p.author.handle,
      text: String(text).slice(0, 240),
    });
  }
  if (hits.length === 0) {
    setCachedVerdict(g, { status: "none" });
    return { g, n, status: "none" };
  }
  if (hits.length === 1) {
    const h = hits[0];
    setCachedVerdict(g, { status: "unique", post: h });
    return { g, n, status: "unique", mine: h.did === actor.did, post: h };
  }
  const count = hits.length >= SEARCH_LIMIT ? `${SEARCH_LIMIT}+` : hits.length;
  setCachedVerdict(g, { status: "common", count });
  return { g, n, status: "common", count };
}

// Verify a list of candidates, fanned out SEARCH_CONC-wide. Calls onVerdict(res)
// as each resolves. Returns when all are done or `shouldStop()` goes true.
export async function verify(actor, candidates, { onVerdict, shouldStop } = {}) {
  const list = candidates
    .map((x) => (typeof x === "string" ? x : x && x.g))
    .filter((g) => typeof g === "string" && g.trim());

  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      if (shouldStop && shouldStop()) return;
      const g = list[idx++];
      let res;
      try {
        res = await searchPhrase(actor, g);
      } catch {
        res = { g, n: g.split(" ").length, status: "error" };
      }
      if (onVerdict) onVerdict(res);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SEARCH_CONC, list.length || 1) }, worker),
  );
}
