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

const PUB = "https://api.bsky.app/xrpc"; // works anonymously incl. searchPosts
const PLC_DIR = "https://plc.directory";

const MAX_POST_PAGES = 40; // ≤ ~4000 most-recent posts
const SCAN_CAP = 2500; // cap candidate list (top-scored first)
const SEARCH_CONC = 5; // parallel search fan-out
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
// spends its budget on the phrases most likely to be distinctive.
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

// ── scan: harvest exactly-once bigrams/trigrams from the user's own repo ───────
// onPage(pagesDone, posts) is called after each page so the UI can show progress.
export async function scan(actor, { mode = "trigram", onPage } = {}) {
  const want2 = mode !== "trigram";
  const want3 = mode !== "bigram";
  const { did, pdsUrl } = actor;

  const c2 = new Map();
  const c3 = new Map();
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
    if (onPage) onPage(pages + 1, posts);
    cursor = d.cursor;
    if (!cursor || recs.length === 0) {
      pages++;
      break;
    }
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
    scannedAll: !cursor,
    total: cands.length,
    candidates: cands.slice(0, SCAN_CAP),
  };
}

// ── verify one candidate against platform-wide full-text search ────────────────
async function searchPhrase(actor, g) {
  const u = new URL(`${PUB}/app.bsky.feed.searchPosts`); // api.bsky.app, anonymous
  u.searchParams.set("q", `"${g}"`); // quoted => exact-phrase intent
  u.searchParams.set("limit", String(SEARCH_LIMIT));

  const n = g.split(" ").length;
  let d;
  try {
    d = await jget(u.toString());
  } catch (e) {
    if (e.status === 429) return { g, n, status: "rate" };
    return { g, n, status: "error" };
  }

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
  if (hits.length === 0) return { g, n, status: "none" };
  if (hits.length === 1) {
    const h = hits[0];
    return { g, n, status: "unique", mine: h.did === actor.did, post: h };
  }
  return {
    g,
    n,
    status: "common",
    count: hits.length >= SEARCH_LIMIT ? `${SEARCH_LIMIT}+` : hits.length,
  };
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
